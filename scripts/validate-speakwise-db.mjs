/** Real migration/RPC SQL, isolated PostgreSQL/WASM. No hosted calls. */
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const q=(sql,args=[])=>db.query(sql,args);
const scalar=async(sql,args)=>Object.values((await q(sql,args)).rows[0])[0];
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS ${name}`);};
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 grant usage on schema public to anon,authenticated,service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) {
  await db.exec((await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')).replaceAll(/create extension if not exists pgcrypto;/gi,''));
 }
 const alice=randomUUID(),bob=randomUUID(),session=randomUUID(),otherSession=randomUUID(),document=randomUUID(),foreignDoc=randomUUID();
 await q("insert into auth.users(id,email) values($1,'alice@example.test'),($2,'bob@example.test')",[alice,bob]);
 await q("insert into public.speakwise_lesson_sessions(id,user_id,mode,lesson_mode,level,planned_duration_minutes) values($1,$2,'speaking','pdf_reading','B1',15),($3,$4,'speaking','natural_conversation','A2',10)",[session,alice,otherSession,bob]);
 await q("insert into public.speakwise_documents(id,user_id,filename,text_status,page_count,pages,sha256) values($1,$2,'Alice.pdf','ready',3,'[{\"page\":3,\"text\":\"Final page secret\"}]','abc'),($3,$4,'Bob.pdf','ready',1,'[]','def')",[document,alice,foreignDoc,bob]);
 const messages=[{id:randomUUID(),role:'user',content:'I went to the garden yesterday.'},{id:randomUUID(),role:'assistant',content:'What did you see?'}];
 const activity={id:randomUUID(),type:'source_opened',payload:{documentId:document}};
 const save=(user=alice,sid=session,ms=messages,events=[activity],state={documentId:document})=>scalar('select public.save_speakwise_session_state($1,$2,$3,$4,$5,$6)',[user,sid,ms,events,state,40]);
 await check('durable session saves and exact retries contain one message/event each',async()=>{
  await save();await save();assert.equal(await scalar('select count(*)::int from public.speakwise_lesson_messages'),2);assert.equal(await scalar('select count(*)::int from public.speakwise_learning_events'),1);
  assert.equal((await scalar('select state from public.speakwise_lesson_sessions where id=$1',[session])).documentId,document);
 });
 await check('foreign session/document and changed message IDs fail atomically',async()=>{
  await assert.rejects(save(bob),e=>e.code==='42501');
  await assert.rejects(save(alice,session,messages,[activity],{documentId:foreignDoc}),e=>e.code==='42501');
  await assert.rejects(save(alice,session,[{...messages[0],content:'Altered answer'}]),e=>e.code==='22023');
  assert.equal(await scalar('select count(*)::int from public.speakwise_lesson_messages'),2);
 });
 await check('client self-reports cannot create scored vocabulary evidence',async()=>{
  await assert.rejects(save(alice,session,[],[{id:randomUUID(),type:'vocabulary_attempt',payload:{correct:true}}]),e=>e.code==='22023');
 });
 const cardId=randomUUID();
 const card={word:'garden',definition:'A place where plants are grown.',example:'We planted flowers in our garden.',answer:'garden',choices:['garden','office','station'],question:'A place where plants are grown.',sourceCategory:'word-beginner',sourceLessonId:'word-beginner-lesson-1',sourceLessonNumber:1};
 await q('insert into public.speakwise_vocab_cards(id,user_id,session_id,card) values($1,$2,$3,$4)',[cardId,alice,session,card]);
 const answer=(id,value='office',hint=false,user=alice,sid=session)=>scalar('select public.answer_speakwise_vocabulary($1,$2,$3,$4,$5,$6)',[user,sid,cardId,id,value,hint]);
 const attempt=randomUUID();
 await check('vocabulary answer writes shared VocabStream evidence once across retry',async()=>{
  assert.equal((await answer(attempt)).correct,false);assert.equal((await answer(attempt)).duplicate,true);
  assert.equal(await scalar('select count(*)::int from public.vocabstream_question_attempts'),1);
  assert.equal(await scalar('select count(*)::int from public.vocabstream_user_mistakes where user_id=$1',[alice]),1);
  assert.equal(await scalar('select count(*)::int from public.vocabstream_user_lesson_progress'),0,'a single card must not complete a standalone lesson');
  await assert.rejects(answer(attempt,'garden'),e=>e.code==='22023');await assert.rejects(answer(randomUUID(),'garden',false,bob,otherSession),e=>e.code==='42501');
 });
 await check('reveals/hints do not clear difficulty; one success does not erase a recurring mistake',async()=>{
  await answer(randomUUID(),'garden',true);await answer(randomUUID(),'garden');
  assert.equal(await scalar('select count(*)::int from public.vocabstream_user_mistakes where user_id=$1',[alice]),1);
 });
 await check('several unaided recalls reduce old review priority while preserving question history',async()=>{
  await answer(randomUUID(),'garden');await answer(randomUUID(),'garden');
  assert.equal(await scalar('select count(*)::int from public.vocabstream_user_mistakes where user_id=$1',[alice]),0);
  assert.equal(await scalar('select count(*)::int from public.vocabstream_question_attempts'),5);
 });
 const summary=async()=>({schemaVersion:2,status:'finalized',title:'Garden practice',mistakes:[],recommendations:['Discuss another garden.'],usefulVocabulary:['garden'],evidence:{messageIds:(await q('select id from public.speakwise_lesson_messages where session_id=$1 order by created_at,id',[session])).rows.map(x=>x.id),eventIds:(await q('select id from public.speakwise_learning_events where session_id=$1 order by created_at,id',[session])).rows.map(x=>x.id)}});
 await check('completion verifies authoritative evidence and is idempotent',async()=>{
  await assert.rejects(scalar('select public.complete_speakwise_session($1,$2,$3)',[alice,session,{...(await summary()),evidence:{messageIds:[],eventIds:[]}}]),e=>e.code==='22023');
  const result=await scalar('select to_jsonb(public.complete_speakwise_session($1,$2,$3))',[alice,session,await summary()]);
  const again=await scalar('select to_jsonb(public.complete_speakwise_session($1,$2,$3))',[alice,session,await summary()]);
  assert.ok(result.id);
  assert.equal(result.id,again.id);assert.equal(await scalar('select status from public.speakwise_lesson_sessions where id=$1',[session]),'completed');
  await assert.rejects(save(),e=>e.code==='22023');assert.equal((await answer(attempt)).duplicate,true);
  await assert.rejects(q("insert into public.speakwise_lesson_messages(id,user_id,session_id,role,content) values($1,$2,$3,'assistant','Late reply')",[randomUUID(),alice,session]),e=>['22023','42501'].includes(e.code));
 });
 await check('historical lexical retrieval finds relevant evidence beyond 1,000 newer rows',async()=>{
  await q("insert into public.speakwise_lesson_summaries(user_id,level,summary,created_at) select $1,'B1','{\"weaknesses\":[\"Past tense narrative sequencing\"]}'::jsonb,now()-interval '120 days'",[alice]);
  await q("insert into public.speakwise_lesson_summaries(user_id,level,summary,created_at) select $1,'B1','{\"covered\":[\"Cooking recipes\"]}'::jsonb,now()-interval '1 day' from generate_series(1,1100)",[alice]);
  const memory=await scalar('select public.retrieve_speakwise_memory($1,$2)',[alice,'past tense']);
  assert.ok(memory.summaries.some(row=>JSON.stringify(row.summary).includes('narrative sequencing')));
 });
 await check('RLS and authenticated memory RPC deny another user, including direct access',async()=>{
  await q("select set_config('request.jwt.claim.sub',$1,false)",[bob]);await db.exec('set role authenticated');
  assert.equal(await scalar('select count(*)::int from public.speakwise_documents'),1);
  assert.equal(await scalar('select count(*)::int from public.speakwise_lesson_messages'),0);
  assert.equal(await scalar('select count(*)::int from public.speakwise_vocab_cards'),0);
  const hidden=await scalar('select public.retrieve_speakwise_memory($1,$2)',[alice,'past tense']);
  for(const values of Object.values(hidden))assert.deepEqual(values,[]);
  await assert.rejects(q("insert into public.speakwise_documents(user_id,filename,text_status,sha256) values($1,'fake','ready','xx')",[alice]),e=>e.code==='42501');
  await db.exec('reset role');
 });
 await check('privileged writes still reject foreign session references',async()=>{
  await assert.rejects(q("insert into public.speakwise_scripts(user_id,session_id,request_id,title,body,kind,prompt_version) values($1,$2,$3,'Foreign','Do not save','original','test')",[bob,session,randomUUID()]),e=>e.code==='42501');
 });
 await check('memory reset deletes derived evidence, preserves shared progress, and enforces retrieval boundary',async()=>{
  const interrupted=randomUUID();
  await q("insert into public.speakwise_lesson_sessions(id,user_id,mode,level) values($1,$2,'speaking','B1')",[interrupted,alice]);
  await q("insert into public.speakwise_learner_profiles(user_id,preferences) values($1,'{\"interests\":[\"gardens\"]}')",[alice]);
  await scalar('select public.reset_speakwise_memory($1,$2)',[alice,'derived']);
  assert.deepEqual((await scalar('select public.retrieve_speakwise_memory($1,$2)',[alice,'past tense'])).summaries,[]);
  assert.equal(await scalar('select count(*)::int from public.vocabstream_question_attempts'),5);
  assert.equal((await scalar('select preferences from public.speakwise_learner_profiles where user_id=$1',[alice])).interests[0],'gardens');
  assert.equal(await scalar('select count(*)::int from public.speakwise_documents where user_id=$1',[alice]),1);
  await assert.rejects(save(alice,interrupted,[],[],{}),e=>e.code==='22023');
 });
 await check('full SpeakWise deletion removes private artifacts without touching another learner',async()=>{
  await scalar('select public.reset_speakwise_memory($1,$2)',[alice,'all']);
  assert.equal(await scalar('select count(*)::int from public.speakwise_documents where user_id=$1',[alice]),0);
  assert.equal(await scalar('select count(*)::int from public.speakwise_documents where user_id=$1',[bob]),1);
  assert.deepEqual(await scalar('select preferences from public.speakwise_learner_profiles where user_id=$1',[alice]),{});
 });
 console.log(`SPEAKWISE_SQL_OK ${checks}; real SQL; synthetic users; no hosted data; single connection, concurrency not evaluated.`);
} finally {await db.close();}
