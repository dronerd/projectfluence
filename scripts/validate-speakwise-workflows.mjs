/** Actual Next + Python HTTP services backed by speakwise-fixture-server.mjs.
 * Real SQL/PDF extraction/application logic. Auth, PostgREST HTTP adapter and model output are synthetic.
 * Nothing in this script accesses hosted accounts or proves live model quality.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { learningPdf } from './speakwise-pdf-fixture.mjs';
const next=process.env.FLUENCE_BASE_URL || 'http://127.0.0.1:3102';
const python=process.env.FLUENCE_PYTHON_URL || 'http://127.0.0.1:8100';
for(const url of [next,python])if(new URL(url).hostname!=='127.0.0.1')throw new Error('Only isolated loopback services are permitted.');
const timings=[];let checks=0;
async function call(base,path,body,method=body===undefined?'GET':'POST',token='fixture-valid',extra={}) {
 const start=performance.now();
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra.headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const data=await response.json();timings.push({path,status:response.status,ms:Number((performance.now()-start).toFixed(1))});
 return {status:response.status,data};
}
async function ok(base,path,body,method,token,extra){const result=await call(base,path,body,method,token,extra);assert.equal(result.status,200,`${path}: ${JSON.stringify(result.data)}`);return result.data;}
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
const sessionId=randomUUID();let documentId,scriptId,card,attemptId;
await check('settings force English even when an old client sends another target',async()=>{
 await ok(next,'/api/speakwise/lesson-settings',{settings:{targetLanguage:'de',level:'B1'}},'PUT');
 const result=await ok(next,'/api/speakwise/lesson-settings');assert.equal(result.settings.targetLanguage,'en');
});
await check('authenticated session creation is durable and ignores spoofed identity',async()=>{
 const a=await ok(next,'/api/speakwise/lesson-sessions',{sessionId,level:'B1',lessonMode:'pdf_reading',durationMinutes:15,user_id:'00000000-0000-4000-8000-000000000002'});
 assert.equal(a.session.user_id,'00000000-0000-4000-8000-000000000001');
 const b=await ok(next,'/api/speakwise/lesson-sessions',{sessionId,level:'B1',lessonMode:'pdf_reading',durationMinutes:30});assert.equal(b.session.planned_duration_minutes,15);
});
await check('canonical vocabulary lesson preview, owned selection and idempotent retries',async()=>{
 const preview=await ok(next,'/api/speakwise/learning',{action:'get_vocabulary_lesson',sessionId,category:'word-beginner',lessonNumber:1});
 assert.equal(preview.lesson.words[0].word,'apple');assert.ok(preview.lesson.words[0].definition.includes('fruit'));
 const selection={action:'select_vocabulary_lesson',sessionId,category:'word-beginner',lessonNumber:1,requestId:randomUUID()};
 const saved=await ok(next,'/api/speakwise/learning',selection);
 const retry=await ok(next,'/api/speakwise/learning',selection);assert.equal(saved.script.id,retry.script.id);
 assert.ok(saved.script.body.includes('I eat an apple after lunch.'));
 assert.equal((await call(next,'/api/speakwise/learning',{...selection,lessonNumber:2})).status,409);
 assert.equal((await call(next,'/api/speakwise/learning',{...selection,category:'../../etc'})).status,400);
 assert.equal((await call(python,`/api/learning/scripts/${saved.script.id}`,undefined,'GET','fixture-other')).status,404);
 const state=await ok(next,`/api/speakwise/lesson-sessions?sessionId=${sessionId}`);assert.ok(!state.session.state.scriptId,'Preview/artifact creation does not commit selection');
});
await check('native multi-page PDF upload/retrieval finds the final page with true references',async()=>{
 const data=await ok(python,'/api/documents',learningPdf(),'POST',undefined,{headers:{'Content-Type':'application/pdf','X-Filename':'synthetic-garden.pdf'}});
 documentId=data.document.id;assert.equal(data.document.pageCount,3);assert.equal(data.document.status,'ready');
 const found=await ok(python,`/api/documents/${documentId}/retrieve`,{query:'forty liters final page',scope:'focused'});
 assert.ok(JSON.stringify(found).includes('forty liters'));assert.ok(found.passages.some(p=>p.page===3));
 assert.equal((await call(python,`/api/documents/${documentId}`,undefined,'GET','fixture-other')).status,404);
});
await check('malformed and image-only PDFs return honest bounded outcomes',async()=>{
 assert.equal((await call(python,'/api/documents',Buffer.from('not a pdf'),'POST',undefined,{headers:{'Content-Type':'application/pdf','X-Filename':'bad.pdf'}})).status,422);
 const blank=await ok(python,'/api/documents',learningPdf(['']),'POST',undefined,{headers:{'Content-Type':'application/pdf','X-Filename':'image-only-fixture.pdf'}});
 assert.equal(blank.document.status,'unreadable');assert.ok(blank.document.warnings.length);
});
await check('whole-source request explicitly covers all readable pages',async()=>{
 const data=await ok(python,`/api/documents/${documentId}/retrieve`,{query:'Summarize the whole document',scope:'whole'});
 assert.deepEqual([...new Set(data.passages.map(p=>p.page))],[1,2,3]);
});
await check('conversation is grounded in selected document and persisted for reconnect',async()=>{
 const id=randomUUID(),message='What does page 3 say about forty liters?';
 await ok(next,'/api/speakwise/lesson-sessions',{sessionId,messages:[{id,role:'user',content:message}],state:{documentId},elapsedSeconds:15},'PATCH');
 const response=await ok(python,'/api/learning/chat',{sessionId,requestId:id,message,documentId,level:'B1',targetLanguage:'English'});
 assert.ok(response.citations.some(c=>c.page===3));
 const again=await ok(python,'/api/learning/chat',{sessionId,requestId:id,message,documentId,level:'B1',targetLanguage:'English'});assert.equal(again.messageId,response.messageId);
 const restored=await ok(next,`/api/speakwise/lesson-sessions?sessionId=${sessionId}`);assert.equal(restored.messages.length,2);
 assert.ok([403,404].includes((await call(next,`/api/speakwise/lesson-sessions?sessionId=${sessionId}`,undefined,'GET','fixture-other')).status));
});
await check('reading script is saved once with source/settings and can be reopened',async()=>{
 const request={requestId:randomUUID(),sessionId,documentId,topic:'city garden',level:'B1',targetLanguage:'English',kind:'adaptation',lengthWords:200,vocabulary:['garden']};
 const created=await ok(python,'/api/learning/script',request);scriptId=created.script.id;assert.ok(created.script.sourceReferences.length);assert.equal(created.script.settings.level,'B1');
 assert.equal((await ok(python,'/api/learning/script',request)).script.id,scriptId);
 const reopened=await ok(python,`/api/learning/scripts/${scriptId}`);assert.equal(reopened.script.body,created.script.body);assert.equal(reopened.script.questions.length,2);
 assert.equal((await call(python,`/api/learning/scripts/${scriptId}`,undefined,'GET','fixture-other')).status,404);
});
await check('actual catalog returns video/text cards and respects missing transcripts',async()=>{
 const result=await ok(next,'/api/speakwise/learning',{action:'search_content',sessionId,query:'garden'});
 assert.ok(result.cards.some(c=>c.contentType==='video'));assert.ok(result.cards.some(c=>c.contentType==='article'));
 const video=result.cards.find(c=>c.contentType==='video');const selected=await ok(next,'/api/speakwise/learning',{action:'select_content',sessionId,contentId:video.id,contentType:'video',eventId:randomUUID()});assert.equal(selected.resource.availability,'metadata_only');assert.deepEqual(selected.resource.passages,[]);
 const article=result.cards.find(c=>c.contentType==='article');const text=await ok(next,'/api/speakwise/learning',{action:'select_content',sessionId,contentId:article.id,contentType:'article',eventId:randomUUID()});assert.ok(text.resource.passages[0].text.includes('rainwater'));
 const empty=await ok(next,'/api/speakwise/learning',{action:'search_content',sessionId,query:'qzxunfindable'});assert.deepEqual(empty.cards,[]);
});
await check('canonical in-lesson vocabulary writes shared evidence idempotently',async()=>{
 const result=await ok(next,'/api/speakwise/learning',{action:'practice_word',sessionId,word:'water'});card=result.card;assert.ok(card?.id);assert.ok(card.choices.length>=2);
 attemptId=randomUUID();const answer={action:'answer_vocabulary',sessionId,cardId:card.id,attemptId,answer:card.choices.find(c=>c!==card.answer),hintUsed:false};
 const first=await ok(next,'/api/speakwise/learning',answer);assert.equal(first.reviewSaved,true);assert.equal(first.correct,false);
 const retry=await ok(next,'/api/speakwise/learning',answer);assert.equal(retry.duplicate,true);
 const memory=await ok(next,'/api/speakwise/learner-memory?query=water');assert.ok(JSON.stringify(memory).includes('water'));
 const state=await ok(next,`/api/speakwise/lesson-sessions?sessionId=${sessionId}`);assert.equal(state.events.filter(e=>e.event_type==='vocabulary_attempt').length,1);
});
await check('completion reads authoritative saved evidence and retries without duplicates',async()=>{
 const finish=await ok(next,'/api/speakwise/lesson-sessions',{action:'complete',sessionId});assert.equal(finish.summary.status,'finalized');assert.ok(finish.summary.evidence.eventIds.includes(attemptId));
 const retry=await ok(next,'/api/speakwise/lesson-sessions',{action:'complete',sessionId});assert.deepEqual(retry.summary,finish.summary);
 assert.equal((await call(next,'/api/speakwise/learner-memory',{sessionId,summary:{strengths:['invented improvement']}})).status,409);
});
console.log(JSON.stringify({label:'local production-build integration timings; synthetic Auth/model; real SQL/PDF',sampleSize:timings.length,requests:timings},null,2));
console.log(`SPEAKWISE_WORKFLOWS_OK ${checks}; actual Next/Python; real PDF extraction and SQL; synthetic external adapters; no hosted data.`);
