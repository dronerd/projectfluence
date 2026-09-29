/** Isolated PostgreSQL/WASM validation. Never connects to a hosted database.
 * npm install --prefix /tmp/projectfluence-sql-validation --no-save @electric-sql/pglite@0.3.14
 * PGLITE_MODULE=/tmp/projectfluence-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node scripts/validate-database.mjs
 * Models Supabase roles/auth.uid. Does not replace `supabase db reset` against the full local stack.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const query = (sql, params = []) => db.query(sql, params);
const scalar = async (sql, params) => Object.values((await query(sql, params)).rows[0])[0];
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
try {
  const bootstrap = `create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`;
  await db.exec(bootstrap);
  const paths = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort();
  for (const name of paths) {
    const sql = (await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
      // WASM has core gen_random_uuid() but does not package the unused pgcrypto extension.
      .replaceAll(/create extension if not exists pgcrypto;/gi, '');
    await check(`migration ${name}`, async () => { await db.exec(sql); });
    if (name.includes('baseline') || name.includes('transcript_foundation')) {
      await check(`adopt an existing ${name}`, async () => { await db.exec(sql); });
    }
  }
  const alice = randomUUID(), bob = randomUUID();
  await query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'a@example.test','{"username":"same"}'),($2,'b@example.test','{"username":"same"}')`, [alice,bob]);
  await check('duplicate username does not prevent signup', async () => assert.equal(await scalar('select count(*)::int from public.profiles'), 2));
  const attempt = randomUUID();
  const payload = {
    lesson_id:'word-beginner-lesson-1', genre:'word-beginner', lesson_number:1, lesson_title:'Lesson 1', word_count:2,
    meaning_score:0, meaning_total:1, quiz_score:0, quiz_total:0, replay_completed:false, replay_correct:0, replay_total:0,
    question_attempts:[{question_type:'meaning',word:'hello',prompt:'Greeting',correct_answer:'hello',selected_answer:'bye',is_correct:false,is_replay:false,attempt_order:1,choices:['hello','bye'],answered_at:'2026-09-29T00:00:00Z'}]
  };
  const save = (id, data=payload, user=alice) => query('select * from public.save_vocabstream_progress($1,$2,$3)',[user,id,data]);
  await check('atomic VocabStream save and retry without duplicates', async () => {
    await save(attempt); await save(attempt);
    for (const table of ['vocabstream_lesson_attempts','vocabstream_question_attempts','vocabstream_user_lesson_progress','vocabstream_user_mistakes']) {
      assert.equal(await scalar(`select count(*)::int from public.${table}`),1);
    }
    assert.equal(await scalar('select mistake_count from public.vocabstream_user_mistakes'),1);
  });
  await check('same id cannot alter answers or cross owners', async () => {
    await assert.rejects(save(attempt,{...payload,lesson_title:'changed'}),e=>e.code==='22023');
    await assert.rejects(save(attempt,payload,bob),e=>e.code==='42501');
  });
  await check('late invalid question rolls back attempt, progress, and mistakes', async () => {
    const invalid = {...payload,question_attempts:[...payload.question_attempts,{...payload.question_attempts[0],question_type:'invalid',attempt_order:2}]};
    await assert.rejects(save(randomUUID(),invalid),e=>e.code==='23514');
    assert.equal(await scalar('select count(*)::int from public.vocabstream_lesson_attempts'),1);
    assert.equal(await scalar('select latest_lesson_attempt_id from public.vocabstream_user_lesson_progress'),attempt);
    assert.equal(await scalar('select mistake_count from public.vocabstream_user_mistakes'),1);
  });
  await check('subsequent batches increment existing mistake counts', async () => {
    await Promise.all(Array.from({length:5},()=>save(randomUUID())));
    assert.equal(await scalar('select mistake_count from public.vocabstream_user_mistakes'),6);
  });
  const session = randomUUID();
  await query("insert into public.speakwise_lesson_sessions(id,user_id,mode,level,planned_duration_minutes) values($1,$2,'speaking','B1',20)",[session,alice]);
  const summary = {lesson_mode:'natural_conversation',level:'B1',topics:['travel'],duration_minutes:20,elapsed_seconds:90,
    summary:{strengths:['fluency']},mistakes:[{type:'grammar',pattern:'tense',original:'go',correction:'went'}],recommendations:[],useful_vocabulary:[]};
  const saveSummary = (user=alice, data=summary) => query('select * from public.save_speakwise_lesson_summary($1,$2,$3)',[user,session,data]);
  await check('SpeakWise summary rejects a different session owner', async () => {
    await assert.rejects(saveSummary(bob),e=>e.code==='42501');
    assert.equal(await scalar('select count(*)::int from public.speakwise_lesson_summaries'),0);
  });
  await check('SpeakWise summary and mistake counts are idempotent', async () => {
    await saveSummary(); await saveSummary();
    assert.equal(await scalar('select count(*)::int from public.speakwise_lesson_summaries'),1);
    assert.equal(await scalar('select count from public.speakwise_mistake_patterns'),1);
  });
  await query("insert into public.vidmatch_videos(video_id,title,channel_name,youtube_url,level) values('abcdefghijk','Catalog title','Catalog channel','https://www.youtube.com/watch?v=abcdefghijk','B1')");
  await check('VidMatch history is catalog-backed with atomic click counts', async () => {
    const view = () => query("select * from public.record_vidmatch_video_view($1,'abcdefghijk')",[alice]);
    await Promise.all([view(),view(),view()]);
    const row=(await query('select * from public.vidmatch_video_view_history')).rows[0];
    assert.equal(row.click_count,3); assert.equal(row.title,'Catalog title');
    await assert.rejects(query("select * from public.record_vidmatch_video_view($1,'missing')",[alice]),e=>e.code==='22023');
  });
  await check('transcript snapshots remain atomic and preserve usable chunks after provider failure', async () => {
    const snapshot = (hash, status, chunks) => query(`select * from public.upsert_vidmatch_transcript_snapshot(
      'abcdefghijk','fixture','en',false,null,$1,$2,'v1',1,null,null,false,$3)`,[status,hash,chunks]);
    const chunk={chunk_id:'fixture-chunk',chunk_index:0,text:'Hello world',start_ms:0,end_ms:1000,word_count:2,char_count:11,content_sha256:'a'.repeat(64),source_segment_start:0,source_segment_end:0};
    await snapshot('a'.repeat(64),'available',[chunk]);
    await snapshot('a'.repeat(64),'available',[chunk]);
    assert.equal(await scalar('select content_version from public.vidmatch_transcripts'),1);
    assert.equal(await scalar('select count(*)::int from public.vidmatch_transcript_chunks'),1);
    await snapshot(null,'failed',[]);
    assert.equal(await scalar('select count(*)::int from public.vidmatch_transcript_chunks'),1);
    await snapshot('b'.repeat(64),'available',[{...chunk,chunk_id:'replacement-chunk',content_sha256:'b'.repeat(64)}]);
    assert.equal(await scalar('select content_version from public.vidmatch_transcripts'),2);
    assert.equal(await scalar('select chunk_id from public.vidmatch_transcript_chunks'),'replacement-chunk');
  });
  await check('analytics returns the application contract for owned data', async () => {
    const a = await scalar('select public.get_learning_analytics($1)',[alice]);
    const b = await scalar('select public.get_learning_analytics($1)',[bob]);
    assert.equal(a.vocabstream.completedLessons,1); assert.equal(a.vidmatch.totalClicks,3); assert.equal(a.speakwise.totalMinutes,20);
    assert.equal(b.vocabstream.completedLessons+b.vidmatch.savedVideos+b.speakwise.lessonSessions,0);
  });
  await check('analytics counts beyond the REST 1000 row ceiling', async () => {
    await query("insert into public.speakwise_lesson_sessions(user_id,mode,level,planned_duration_minutes) select $1,'writing','A2',1 from generate_series(1,1001)",[alice]);
    const result=await scalar('select public.get_learning_analytics($1)',[alice]);
    assert.equal(result.speakwise.lessonSessions,1002); assert.equal(result.speakwise.totalMinutes,1021);
  });
  const privateTables=['profiles','vocabstream_lesson_attempts','vocabstream_question_attempts','vocabstream_user_lesson_progress','vocabstream_user_mistakes','speakwise_lesson_sessions','speakwise_lesson_summaries','speakwise_mistake_patterns','vidmatch_video_view_history','vidmatch_user_settings','speakwise_lesson_settings'];
  await check('authenticated RLS hides all other learners private rows', async () => {
    await query("select set_config('request.jwt.claim.sub',$1,false)",[bob]); await db.exec('set role authenticated');
    for (const table of privateTables) assert.equal(await scalar(`select count(*)::int from public.${table}`),table==='profiles'?1:0,table);
    await db.exec('reset role');
  });
  await check('authenticated users can read their own question history', async () => {
    await query("select set_config('request.jwt.claim.sub',$1,false)",[alice]); await db.exec('set role authenticated');
    assert.equal(await scalar('select count(*)::int from public.vocabstream_question_attempts'),6);
    await db.exec('reset role');
  });
  await check('browser roles cannot execute privileged RPCs or mutate other data', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(save(randomUUID()),e=>e.code==='42501');
      await assert.rejects(saveSummary(),e=>e.code==='42501');
      await assert.rejects(query('select public.get_learning_analytics($1)',[alice]),e=>e.code==='42501');
      await assert.rejects(query("select public.record_vidmatch_video_view($1,'abcdefghijk')",[alice]),e=>e.code==='42501');
      await assert.rejects(query('delete from public.vocabstream_user_lesson_progress'),e=>e.code==='42501');
      await assert.rejects(query("update public.profiles set email='forged@example.test'"),e=>e.code==='42501');
      await db.exec('reset role');
    }
  });
  await check('database owner-reference trigger protects direct service writes', async () => {
    await assert.rejects(query("insert into public.speakwise_lesson_summaries(user_id,session_id,level) values($1,$2,'B1')",[bob,session]),e=>e.code==='42501');
    await assert.rejects(query("insert into public.vocabstream_user_lesson_progress(user_id,lesson_id,genre,latest_lesson_attempt_id) values($1,'word-beginner-lesson-1','word-beginner',$2)",[bob,attempt]),e=>e.code==='42501');
  });
  await check('service role can execute RPC after grants', async () => {
    await db.exec('set role service_role'); await save(attempt); await saveSummary(); await db.exec('reset role');
  });
  await check('hardening adopts legacy inconsistent scores and duplicate summaries without data deletion', async () => {
    const upgrade = new PGlite();
    try {
      await upgrade.exec(bootstrap);
      for (const name of paths.slice(0,2)) await upgrade.exec((await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url),'utf8')).replaceAll(/create extension if not exists pgcrypto;/gi,''));
      const legacyUser=randomUUID(), legacySession=randomUUID(), legacyAttempt=randomUUID();
      await upgrade.query("insert into auth.users(id,email) values($1,'legacy@example.test')",[legacyUser]);
      await upgrade.query("insert into public.vocabstream_lesson_attempts(id,user_id,lesson_id,genre,meaning_score,meaning_total) values($1,$2,'legacy','legacy',2,1)",[legacyAttempt,legacyUser]);
      await upgrade.query("insert into public.speakwise_lesson_sessions(id,user_id,mode,level) values($1,$2,'speaking','B1')",[legacySession,legacyUser]);
      await upgrade.query("insert into public.speakwise_lesson_summaries(user_id,session_id,level) select $1,$2,'B1' from generate_series(1,2)",[legacyUser,legacySession]);
      await upgrade.exec(await readFile(new URL(`../supabase/migrations/${paths[2]}`, import.meta.url),'utf8'));
      assert.equal((await upgrade.query('select count(*)::int n from public.speakwise_lesson_summaries')).rows[0].n,2);
      assert.equal((await upgrade.query('select meaning_score from public.vocabstream_lesson_attempts')).rows[0].meaning_score,2);
      await assert.rejects(upgrade.query("insert into public.vocabstream_lesson_attempts(user_id,lesson_id,genre,meaning_score,meaning_total) values($1,'new','new',2,1)",[legacyUser]),e=>e.code==='23514');
      await upgrade.query('select public.save_speakwise_lesson_summary($1,$2,$3)',[legacyUser,legacySession,summary]);
      assert.equal((await upgrade.query('select count(*)::int n from public.speakwise_lesson_summaries')).rows[0].n,2);
      assert.equal((await upgrade.query('select count(*)::int n from public.speakwise_mistake_patterns')).rows[0].n,0);
    } finally { await upgrade.close(); }
  });
  console.log(`DATABASE_CHECKS_OK ${checks}; isolated PostgreSQL/WASM; no hosted Supabase calls`);
} finally { await db.close(); }
