/** Actual Next.js routes + packaged lesson files, with a local HTTP Supabase fixture only.
 * Next runtime: SUPABASE_URL=http://127.0.0.1:3137 SUPABASE_ANON_KEY=fixture-anon
 * SUPABASE_SERVICE_ROLE_KEY=fixture-service. Never supply hosted credentials to this server.
 * FLUENCE_BASE_URL=http://127.0.0.1:3136 node scripts/validate-vocabstream-api.mjs
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createAttempt} from '../apps/vocabstream/src/lib/learning.ts';
const base=new URL(process.env.FLUENCE_BASE_URL||'http://127.0.0.1:3136');
const port=Number(process.env.FLUENCE_FIXTURE_PORT||3137);
if(base.hostname!=='127.0.0.1'||base.protocol!=='http:')throw new Error('Use only an isolated local fixture server.');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const root=new URL('../public/vocabstream/data/',import.meta.url);
const lesson=async(category,number)=>JSON.parse(await readFile(new URL(`${category}/Lesson${number}.json`,root),'utf8'));
const imageLesson=await lesson('word-beginner',1),imageWord=imageLesson.words.find(word=>word.image);
const idiomLesson=await lesson('idioms-beginner',51),idiomWord=idiomLesson.words.find(word=>word.sentencePractice);
const specialistLesson=await lesson('specialized-it',1),specialistWord=specialistLesson.words[0];
assert.ok(imageWord&&idiomWord&&specialistWord);
const addedImage=(await lesson('word-beginner',8)).words.find(word=>word.image);
const addedIdiom=(await lesson('idioms-beginner',60)).words.find(word=>word.sentencePractice);
const addedSpecialist=(await lesson('specialized-it',10)).words.find(word=>word.sentencePractice);
assert.ok(addedImage&&addedIdiom&&addedSpecialist,'expanded curriculum must be present');
const manifest=JSON.parse(await readFile(new URL('../public/vocabstream/images/manifest.json',import.meta.url),'utf8'));
const supportingRef=manifest.images.find(item=>item.category==='word-intermediate'&&item.role==='supporting');
assert.ok(supportingRef);
const supportingWord=(await lesson(supportingRef.category,supportingRef.lessonNumber)).words.find(word=>word.word===supportingRef.word);
const licensedRef=manifest.images.find(item=>item.image.license==='CC-BY-4.0'&&item.role==='meaning');
assert.ok(licensedRef);
const licensedWord=(await lesson(licensedRef.category,licensedRef.lessonNumber)).words.find(word=>word.word===licensedRef.word);
const repeated=new Map();
for(const file of (await readdir(new URL('word-beginner/',root))).filter(name=>/^Lesson\d+\.json$/.test(name)).sort()){
  const data=JSON.parse(await readFile(new URL(`word-beginner/${file}`,root),'utf8'));
  for(const word of data.words){const key=word.word.toLowerCase();repeated.set(key,[...(repeated.get(key)||[]),{...word,number:Number(file.match(/\d+/)[0])}]);}
}
const repeatedEntries=[...repeated.values()].find(words=>words.length>1&&new Set(words.map(word=>JSON.stringify([word.meaning,word.example,word.japaneseMeaning]))).size>1);
assert.ok(repeatedEntries,'fixture requires a real repeated headword with differing content');
const repeatedWord=repeatedEntries[0];
const row=(word,category,number,id)=>({id,word:word.word,definition:'Outdated stored definition',example:'Outdated stored example',explanation:'Outdated stored explanation',source_category:category,source_lesson_id:`${category}-lesson-${number}`,source_lesson_number:number,mistake_count:7,last_mistaken_at:'2026-09-29T00:00:00Z'});
const rows=[row(imageWord,'word-beginner',1,'image-row'),row(idiomWord,'idioms-beginner',51,'new-idiom-row'),row(specialistWord,'specialized-it',1,'specialist-row'),row(repeatedWord,'word-beginner',repeatedWord.number,'repeated-word-row'),
  row(addedImage,'word-beginner',8,'added-image-row'),row(addedIdiom,'idioms-beginner',60,'added-idiom-row'),row(addedSpecialist,'specialized-it',10,'added-specialist-row'),
  {...row({word:'historical-fixture-word'},'word-beginner',999,'historical-row'),definition:'Historical saved meaning',example:'Historical saved study example'}];
rows.push(row(supportingWord,supportingRef.category,supportingRef.lessonNumber,'supporting-image-row'),row(licensedWord,licensedRef.category,licensedRef.lessonNumber,'licensed-image-row'));
const requests=[],writes=[];
let fixtureError;
const fixture=createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  try{
    const url=new URL(req.url,`http://127.0.0.1:${port}`);let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):null;requests.push({path:url.pathname,params:url.searchParams,body});
    if(url.pathname==='/auth/v1/user'){
      assert.equal(req.headers.apikey,'fixture-anon');
      if(req.headers.authorization==='Bearer fixture-valid')return send(200,{id:owner,email:'owner@example.test',user_metadata:{}});
      if(req.headers.authorization==='Bearer fixture-other')return send(200,{id:other,email:'other@example.test',user_metadata:{}});
      return send(401,{message:'Expired fixture session'});
    }
    assert.equal(req.headers.apikey,'fixture-service');
    if(url.pathname==='/rest/v1/vocabstream_user_mistakes'){
      assert.equal(req.method,'GET');assert.equal(url.searchParams.get('limit'),'500');
      const user=url.searchParams.get('user_id');assert.ok([`eq.${owner}`,`eq.${other}`].includes(user));
      return send(200,user===`eq.${owner}`?rows:[]);
    }
    if(url.pathname==='/rest/v1/rpc/save_vocabstream_progress'){
      assert.equal(req.method,'POST');assert.equal(body.p_user_id,owner);writes.push(body);return send(200,{id:body.p_attempt_id});
    }
    throw new Error(`Unexpected fixture path ${url.pathname}`);
  }catch(error){fixtureError=error;send(500,{message:'Fixture assertion failed'});}
});
await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(port,'127.0.0.1',resolve);});
let checks=0;
async function check(name,fn){await fn();if(fixtureError)throw fixtureError;checks++;console.log(`PASS ${name}`);}
async function call(path,{token='fixture-valid',body}={}){
  const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
}
try{
  await check('review requires a valid session before reading private mistake rows',async()=>{
    assert.equal((await call('/api/vocabstream/review',{token:null})).status,401);assert.equal(requests.length,0);
    assert.equal((await call('/api/vocabstream/review',{token:'fixture-expired'})).status,401);
    assert.equal(requests.filter(request=>request.path.includes('/rest/')).length,0);
  });
  let review;
  await check('actual review route hydrates exact packaged sources and preserves historical fallback',async()=>{
    const response=await call('/api/vocabstream/review');assert.equal(response.status,200,JSON.stringify(response.body));review=response.body;
    for(const [id,current]of [['image-row',imageWord],['new-idiom-row',idiomWord],['specialist-row',specialistWord],['repeated-word-row',repeatedWord],['added-image-row',addedImage],['added-idiom-row',addedIdiom],['added-specialist-row',addedSpecialist],['supporting-image-row',supportingWord],['licensed-image-row',licensedWord]]){
      const stored=review.weakWords.find(word=>word.id===id);assert.ok(stored,id);assert.equal(stored.definition,current.meaning);assert.equal(stored.example,current.example);assert.equal(stored.mistakeCount,7);assert.equal(stored.historical,false);
    }
    const imageQuestion=review.questions.find(question=>question.word===imageWord.word&&question.questionType==='meaning');
    assert.equal(imageQuestion.promptMode,'image');assert.equal(imageQuestion.image.src,imageWord.image.src);
    assert.ok(review.questions.some(question=>question.word===idiomWord.word&&question.promptMode==='sentence'));
    assert.ok(review.questions.some(question=>question.word===addedImage.word&&question.promptMode==='image'));
    assert.ok(review.questions.some(question=>question.word===addedIdiom.word&&question.promptMode==='sentence'&&question.sourceLessonNumber===60));
    assert.ok(review.questions.some(question=>question.word===addedSpecialist.word&&question.promptMode==='sentence'&&question.sourceLessonNumber===10));
    const supportingQuestion=review.questions.find(question=>question.word===supportingWord.word&&question.sourceCategory===supportingRef.category&&question.questionType==='meaning');
    assert.equal(supportingQuestion.promptMode,'text');assert.equal(supportingQuestion.image.src,supportingWord.image.src);assert.equal(supportingQuestion.imageRole,'supporting');
    const licensedQuestion=review.questions.find(question=>question.word===licensedWord.word&&question.sourceCategory===licensedRef.category&&question.questionType==='meaning');
    assert.equal(licensedQuestion.promptMode,'image');assert.equal(licensedQuestion.image.license,'CC-BY-4.0');assert.ok(licensedQuestion.image.credit);
    const historical=review.questions.filter(question=>question.word==='historical-fixture-word');
    assert.equal(historical.length,1);assert.equal(historical[0].prompt,'Historical saved meaning');assert.equal(historical[0].questionType,'meaning');assert.equal(historical[0].image,undefined);
  });
  await check('another authenticated owner receives no private review words',async()=>{
    const response=await call('/api/vocabstream/review',{token:'fixture-other'});assert.equal(response.status,200);assert.deepEqual(response.body,{weakWords:[],questions:[]});
  });
  await check('image-question progress keeps original RPC identity and duplicate choices fail before writes',async()=>{
    const question=review.questions.find(question=>question.promptMode==='image');
    const answer=createAttempt(question,question.answerIndex,1);
    const body={attemptId:randomUUID(),lessonId:question.sourceLessonId,genre:question.sourceCategory,lessonNumber:question.sourceLessonNumber,wordCount:1,meaningScore:1,meaningTotal:1,quizScore:0,quizTotal:0,userId:other,questionAttempts:[{...answer,image:question.image,promptMode:'image'}]};
    for(let i=0;i<2;i++){const result=await call('/api/vocabstream/progress',{body});assert.equal(result.status,200);assert.equal(result.body.lessonAttemptId,body.attemptId);}
    assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].p_payload.lesson_id,question.sourceLessonId);
    const saved=writes[0].p_payload.question_attempts[0];assert.equal(saved.word,question.word);assert.equal(saved.prompt,question.prompt);assert.equal('image'in saved,false);assert.equal('promptMode'in saved,false);
    const invalid=await call('/api/vocabstream/progress',{body:{...body,attemptId:randomUUID(),questionAttempts:[{...answer,choices:[...answer.choices,answer.choices[0].toUpperCase()]}]}});
    assert.equal(invalid.status,400);assert.equal(writes.length,2);
  });
  console.log(`VOCABSTREAM_API_OK ${checks}; local HTTP fixture and packaged content only.`);
}finally{await new Promise(resolve=>fixture.close(resolve));}
