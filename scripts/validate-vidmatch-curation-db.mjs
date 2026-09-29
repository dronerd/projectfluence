/** Local PostgreSQL/WASM only. PGLITE_MODULE may point to an isolated /tmp installation.
 * PGLITE_MODULE=/tmp/projectfluence-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node scripts/validate-vidmatch-curation-db.mjs
 * Tests real SQL, but PGlite serializes connections: SKIP LOCKED contention still needs a multi-connection staging check.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { runWorker, EVALUATOR_VERSION } from '../apps/vidmatch/src/services/curation/worker.ts';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const query=(sql,args=[])=>db.query(sql,args);
const scalar=async(sql,args)=>Object.values((await query(sql,args)).rows[0])[0];
const now=()=>new Date().toISOString();
const stamp=(hours)=>new Date(Date.now()+hours*3600000).toISOString();
let count=0;
async function check(name,fn){await fn();count++;console.log(`PASS ${name}`);}
const metadata={title:'Provider title',channel_name:'Provider channel',channel_id:'UCfixture',thumbnail_url:'https://i.ytimg.com/vi/curated0001/hqdefault.jpg',duration:'PT5M',description:'Provider description',tags:['English'],captions_available:true,privacy_status:'public',upload_status:'processed',age_restricted:false,embeddable:true,region_restricted:false,live:false};
const editorial={level:'B1',level_min:'A2',level_max:'B1',skills:['listening'],topics:['Education & Learning'],accent:'American',quality_score:85,content_format:'lesson',classification_confidence:0.7,editorial_reviewed_at:now()};
const candidate=(id,patch={})=>({video_id:id,discovery_source:'manual',discovery_context:{query:'English lessons'},provider_metadata:{...metadata},metadata_checked_at:now(),input_sha256:'a'.repeat(64),...patch});
const result=(id,decision='approved',patch={})=>({video_id:id,evaluation_id:randomUUID(),input_sha256:'a'.repeat(64),decision,reason_codes:[decision==='approved'?'editorial_review':'insufficient_evidence'],evidence:{review_method:'manual',reason:'Own review rationale'},editorial:decision==='approved'?{...editorial}:{},...(decision==='deferred'?{retry_after:stamp(1)}:{}),...patch});
const begin=(key='test',version='editorial-v1',config={})=>scalar('select public.begin_vidmatch_ingestion_run($1,$2,$3,900)',[key,version,config]);
const stage=(run,items)=>scalar('select public.stage_vidmatch_candidates($1,$2,$3)',[run.run_id,run.lease_token,items]);
const claim=(run,limit=50)=>scalar('select public.claim_vidmatch_candidates($1,$2,$3)',[run.run_id,run.lease_token,limit]);
const commit=(run,items)=>scalar('select public.commit_vidmatch_evaluations($1,$2,$3)',[run.run_id,run.lease_token,items]);
const refresh=(items)=>scalar('select public.refresh_vidmatch_provider_metadata($1)',[items]);
const finish=(run,status='completed')=>scalar("select public.finish_vidmatch_ingestion_run($1,$2,$3,'{}',null)",[run.run_id,run.lease_token,status]);
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
  const files=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
  for(const name of files){
    if(name.includes('vidmatch_curation')) await query("insert into public.vidmatch_videos(video_id,title,channel_name,youtube_url,level,skills,topics,accent,quality_score) values('legacy00001','Original legacy title','Legacy channel','https://www.youtube.com/watch?v=legacy00001','B1','{vocabulary}','{Legacy}','British',91),('legacy00002','Conflicting legacy title','Legacy channel','https://www.youtube.com/watch?v=legacy00002','B2','{}','{}',null,82)");
    await db.exec((await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8')).replaceAll(/create extension if not exists pgcrypto;/gi,''));
  }
  await check('migration preserves existing catalog rows with bounded retention and unknown availability',async()=>{
    const row=(await query("select * from public.vidmatch_videos where video_id='legacy00001'")).rows[0];
    assert.equal(row.title,'Original legacy title');assert.equal(row.level,'B1');assert.equal(row.quality_score,'91.00');
    assert.equal(row.availability_status,'unknown');assert.equal(row.editorial_reviewed_at,null);assert.ok(row.provider_metadata_expires_at);
  });
  let run;
  await check('duplicate scheduler runs do not acquire an active lease or change configuration',async()=>{
    run=await begin();const duplicate=await begin();
    assert.equal(run.claimed,true);assert.equal(duplicate.claimed,false);assert.equal(duplicate.lease_token,null);assert.equal(duplicate.run_id,run.run_id);
    await assert.rejects(begin('test','editorial-v2'),e=>e.code==='22023');
  });
  const accepted=result('curated0001'),rejected=result('rejected001','rejected'),deferred=result('deferred001','deferred');
  await check('staging and claiming are separate from publication and exclude already leased candidates',async()=>{
    await stage(run,[candidate('curated0001'),candidate('rejected001'),candidate('deferred001')]);
    assert.equal(await scalar("select count(*)::int from public.vidmatch_videos where video_id='curated0001'"),0);
    assert.equal((await claim(run)).candidates.length,3);assert.equal((await claim(run)).candidates.length,0);
  });
  await check('atomic approvals publish only reviewed videos while rejection/defer remain durable',async()=>{
    const report=await commit(run,[accepted,rejected,deferred]);assert.equal(report.inserted,1);assert.equal(report.rejected,1);assert.equal(report.deferred,1);
    assert.equal(await scalar("select count(*)::int from public.vidmatch_videos where video_id in ('rejected001','deferred001')"),0);
    const row=(await query("select * from public.vidmatch_videos where video_id='curated0001'")).rows[0];
    assert.equal(row.availability_status,'active');assert.equal(row.level,'B1');assert.equal(row.latest_evaluation_id,accepted.evaluation_id);
    assert.equal((await claim(run)).candidates.length,0);
  });
  await check('same evaluation retries are idempotent and changed retries fail',async()=>{
    assert.equal((await commit(run,[accepted])).inserted,1);
    assert.equal(await scalar("select count(*)::int from public.vidmatch_evaluations where video_id='curated0001'"),1);
    await assert.rejects(commit(run,[{...accepted,reason_codes:['changed']}]),e=>e.code==='22023');
  });
  await check('matching legacy seeds gain provenance without replacing editorial labels; conflicting levels do not activate',async()=>{
    await stage(run,[candidate('legacy00001'),candidate('legacy00002')]);await claim(run);
    const report=await commit(run,[result('legacy00001'),result('legacy00002')]);assert.equal(report.existing,1);assert.equal(report.activation_conflicts,1);
    const matched=(await query("select * from public.vidmatch_videos where video_id='legacy00001'")).rows[0];
    assert.equal(matched.title,'Provider title');assert.equal(matched.quality_score,'91.00');assert.equal(matched.accent,'British');assert.deepEqual(matched.skills,['vocabulary']);assert.deepEqual(matched.topics,['Legacy']);assert.equal(matched.availability_status,'active');assert.ok(matched.editorial_reviewed_at);
    const conflicting=(await query("select * from public.vidmatch_videos where video_id='legacy00002'")).rows[0];
    assert.equal(conflicting.level,'B2');assert.equal(conflicting.title,'Conflicting legacy title');assert.equal(conflicting.availability_status,'unknown');assert.equal(conflicting.editorial_reviewed_at,null);
  });
  await check('late invalid approval rolls back earlier publication in the same batch',async()=>{
    await stage(run,[candidate('rollback001'),candidate('rollback002',{provider_metadata:{...metadata,embeddable:false}})]);await claim(run);
    await assert.rejects(commit(run,[result('rollback001'),result('rollback002')]),e=>e.code==='22023');
    assert.equal(await scalar("select count(*)::int from public.vidmatch_videos where video_id like 'rollback%'"),0);
    assert.equal(await scalar("select count(*)::int from public.vidmatch_evaluations where video_id like 'rollback%'"),0);
  });
  await check('bounded inputs and stale claim tokens are rejected',async()=>{
    await assert.rejects(stage(run,Array.from({length:51},()=>candidate('curated0001'))),e=>e.code==='22023');
    await assert.rejects(claim(run,51),e=>e.code==='22023');
    await assert.rejects(commit(run,[accepted,accepted]),e=>e.code==='22023');
    await assert.rejects(stage({...run,lease_token:randomUUID()},[]),e=>e.code==='42501');
  });
  await check('expired run leases are recoverable but old workers cannot commit',async()=>{
    const abandoned=await begin('abandoned');await stage(abandoned,[candidate('abandoned01')]);await claim(abandoned);
    await query("update public.vidmatch_ingestion_runs set lease_until=now()-interval '1 second' where id=$1",[abandoned.run_id]);
    await query("update public.vidmatch_candidates set lease_until=now()-interval '1 second' where claimed_run_id=$1",[abandoned.run_id]);
    const recovered=await begin('abandoned');assert.equal(recovered.run_id,abandoned.run_id);assert.notEqual(recovered.lease_token,abandoned.lease_token);
    await assert.rejects(commit(abandoned,[result('abandoned01')]),e=>e.code==='42501');
    assert.ok((await claim(recovered)).candidates.some(c=>c.video_id==='abandoned01'));
    await finish(recovered,'failed');
  });
  await check('first missing marks suspect, early/duplicate checks do not escalate, and transient errors add no strike',async()=>{
    await query("update public.vidmatch_videos set availability_checked_at=null where video_id='curated0001'");
    const first={video_id:'curated0001',status:'missing',checked_at:stamp(-26)};
    await refresh([first]);assert.equal(await scalar("select availability_status from public.vidmatch_videos where video_id='curated0001'"),'suspect');
    await refresh([first,{...first,checked_at:stamp(-25)},{...first,status:'transient_error',checked_at:now()}]);
    assert.equal(await scalar("select unavailable_count from public.vidmatch_videos where video_id='curated0001'"),1);
    await refresh([{...first,checked_at:stamp(-1)}]);assert.equal(await scalar("select availability_status from public.vidmatch_videos where video_id='curated0001'"),'inactive');
  });
  await check('successful provider refresh resets strikes and changes no editorial annotation',async()=>{
    const before=(await query("select level,skills,topics,accent,quality_score,content_format,classification_confidence,editorial_reviewed_at,latest_evaluation_id from public.vidmatch_videos where video_id='curated0001'")).rows[0];
    await refresh([{video_id:'curated0001',status:'available',checked_at:now(),provider_metadata:{...metadata,title:'Refreshed provider title',level:'C2',quality_score:1}}]);
    assert.deepEqual((await query("select level,skills,topics,accent,quality_score,content_format,classification_confidence,editorial_reviewed_at,latest_evaluation_id from public.vidmatch_videos where video_id='curated0001'")).rows[0],before);
    assert.equal(await scalar("select availability_status from public.vidmatch_videos where video_id='curated0001'"),'active');
    assert.equal(await scalar("select unavailable_count from public.vidmatch_videos where video_id='curated0001'"),0);
    await assert.rejects(refresh([{video_id:'curated0001',status:'available',checked_at:stamp(0.01),provider_metadata:{...metadata,region_restricted:true}}]),e=>e.code==='22023');
  });
  await check('completion is idempotent, repeated commits still return previous result, and completed keys do not rerun',async()=>{
    await finish(run);await finish(run);assert.equal((await begin()).claimed,false);assert.equal((await commit(run,[accepted])).inserted,1);
    await assert.rejects(stage(run,[]),e=>e.code==='42501');
  });
  await check('history copies carry provider expiry and purge preserves catalog/editorial/user history identities',async()=>{
    const user=randomUUID();await query('insert into auth.users(id) values($1)',[user]);await query("select public.record_vidmatch_video_view($1,'curated0001')",[user]);
    const history=(await query("select * from public.vidmatch_video_view_history where video_id='curated0001'")).rows[0];assert.ok(history.provider_metadata_expires_at);
    await query("update public.vidmatch_videos set provider_metadata_expires_at=now()-interval '1 second' where video_id='curated0001'");
    await query("update public.vidmatch_video_view_history set provider_metadata_expires_at=now()-interval '1 second' where video_id='curated0001'");
    await query("update public.vidmatch_candidates set metadata_expires_at=now()-interval '1 second' where video_id='curated0001'");
    await query("update public.vidmatch_evaluations set provider_metadata_expires_at=now()-interval '1 second' where video_id='curated0001'");
    let report=await scalar('select public.purge_expired_vidmatch_provider_data(2)');assert.equal(report.purged,2);assert.equal(report.remaining,true);
    report=await scalar('select public.purge_expired_vidmatch_provider_data(2)');assert.equal(report.purged,2);assert.equal(report.remaining,false);
    const video=(await query("select * from public.vidmatch_videos where video_id='curated0001'")).rows[0];
    assert.equal(video.title,'Video details unavailable');assert.equal(video.channel_name,'');assert.equal(video.description,null);assert.equal(video.availability_status,'inactive');assert.equal(video.level,'B1');assert.equal(video.latest_evaluation_id,accepted.evaluation_id);assert.deepEqual(video.topics,editorial.topics);
    const after=(await query("select * from public.vidmatch_video_view_history where video_id='curated0001'")).rows[0];
    for(const field of ['id','user_id','video_id','click_count','last_clicked_at','created_at','level']) assert.deepEqual(after[field],history[field],field);
    assert.equal(after.title,'Video details unavailable');assert.equal(after.thumbnail_url,null);
    assert.equal(await scalar("select stage from public.vidmatch_candidates where video_id='curated0001'"),'stale');
    const evaluation=(await query('select * from public.vidmatch_evaluations where id=$1',[accepted.evaluation_id])).rows[0];
    assert.deepEqual(evaluation.provider_metadata,{});assert.deepEqual(evaluation.editorial,editorial);assert.equal(evaluation.evidence.reason,'Own review rationale');
    assert.equal((await scalar('select public.purge_expired_vidmatch_provider_data(50)')).purged,0);
  });
  await check('stale provider snapshots can be rediscovered for a fresh evaluation',async()=>{
    const next=await begin('refresh-after-purge');await stage(next,[candidate('curated0001')]);
    assert.ok((await claim(next)).candidates.some(c=>c.video_id==='curated0001'));
  });
  await check('browser roles cannot inspect private pipeline state or invoke any pipeline command',async()=>{
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`);
      for(const table of ['vidmatch_ingestion_runs','vidmatch_candidates','vidmatch_evaluations']) await assert.rejects(query(`select * from public.${table}`),e=>e.code==='42501');
      await assert.rejects(begin('unauthorized'),e=>e.code==='42501');await assert.rejects(stage(run,[]),e=>e.code==='42501');
      await assert.rejects(claim(run),e=>e.code==='42501');await assert.rejects(commit(run,[]),e=>e.code==='42501');
      await assert.rejects(finish(run),e=>e.code==='42501');await assert.rejects(refresh([]),e=>e.code==='42501');
      await assert.rejects(scalar('select public.purge_expired_vidmatch_provider_data(50)'),e=>e.code==='42501');await db.exec('reset role');
    }
    await db.exec('set role service_role');assert.equal((await begin('service-role')).claimed,true);await db.exec('reset role');
  });
  await check('a live owner may rebind a claim, another run cannot; old snapshot hashes cannot commit',async()=>{
    const owner=await begin('rebind-owner'),other=await begin('rebind-other');
    await stage(owner,[candidate('rebound0001')]);await claim(owner);
    const newer=candidate('rebound0001',{provider_metadata:{...metadata,title:'Fresh rebound title'},input_sha256:'b'.repeat(64)});
    assert.equal((await stage(other,[newer])).staged,0);
    assert.equal((await stage(owner,[newer])).staged,1);
    await assert.rejects(commit(owner,[result('rebound0001')]),e=>e.code==='42501');
    await commit(owner,[result('rebound0001','approved',{input_sha256:'b'.repeat(64)})]);
    assert.equal(await scalar("select title from public.vidmatch_videos where video_id='rebound0001'"),'Fresh rebound title');
  });
  await check('partial run keys stay terminal while a later run can continue released pending work',async()=>{
    const partial=await begin('partial-original');await stage(partial,[candidate('partial0001')]);
    assert.ok((await claim(partial)).candidates.some(item=>item.video_id==='partial0001'));
    await finish(partial,'partial');assert.equal((await begin('partial-original')).claimed,false);
    const next=await begin('partial-continue');
    assert.ok((await claim(next)).candidates.some(item=>item.video_id==='partial0001'));
    await finish(next,'partial');
  });
  await check('real worker RPC sequencing publishes fresh metadata and current review with matching hashes',async()=>{
    // Isolate this fixture's queue without touching any hosted state.
    await query("update public.vidmatch_candidates set stage='rejected',next_attempt_at=now()+interval '7 days' where stage='pending'");
    const id='worker00001',review={videoId:id,level:'B1',levelMin:'B1',levelMax:'B2',topics:['environment'],format:'explainer',evidence:{kind:'publisher_cefr',sourceUrl:'https://learnenglish.britishcouncil.org/fixture',checkedAt:now(),statement:'Independent exact video review.',englishConfirmed:true,exactVideoMatch:true,coverage:'whole_video'},reviewer:'Fixture editor',reviewedAt:now(),learningValue:'strong',contentValue:'adequate',confidence:'high'};
    const providerVideo={...metadata,video_id:id,title:'Initial provider snapshot',audio_language:'en'};
    const provider={usage:{searchCalls:0,metadataCalls:0},async search(){return {ids:[]};},async videos(ids){this.usage.metadataCalls++;return new Map(ids.filter(value=>value===id).map(value=>[value,{...providerVideo,title:this.usage.metadataCalls===1?'Initial provider snapshot':'Fresh worker provider title'}]));}};
    const store={
      async rpc(name,args){
        assert.match(name,/^[a-z_]+$/);const keys=Object.keys(args);keys.forEach(key=>assert.match(key,/^p_[a-z_]+$/));
        return scalar(`select public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(args));
      },
      async catalog(){return (await query('select video_id,level,channel_name,channel_id,topics,content_format,quality_score,classification_confidence from public.vidmatch_videos')).rows;},
      async dueDiscoveryIds(ids){return ids;},async healthBatch(){return [];},
    };
    const completed=await runWorker(store,provider,{version:1,reviews:[review]},{runKey:'worker-integration'});
    assert.equal(completed.status,'completed');assert.equal(completed.inserted,1);
    const saved=(await query('select title,availability_status,latest_evaluation_id from public.vidmatch_videos where video_id=$1',[id])).rows[0];
    assert.equal(saved.title,'Fresh worker provider title');assert.equal(saved.availability_status,'active');
    const evaluation=(await query('select * from public.vidmatch_evaluations where id=$1',[saved.latest_evaluation_id])).rows[0];
    const fresh={...providerVideo,title:'Fresh worker provider title'};
    assert.deepEqual(evaluation.provider_metadata,fresh);
    assert.equal(evaluation.input_sha256,createHash('sha256').update(JSON.stringify({provider:fresh,review,version:EVALUATOR_VERSION})).digest('hex'));
    assert.equal(evaluation.evidence.englishConfirmed,true);assert.equal(evaluation.evidence.reviewer,'Fixture editor');
    const calls=provider.usage.metadataCalls;
    assert.equal((await runWorker(store,provider,{version:1,reviews:[review]},{runKey:'worker-integration'})).claimed,false);
    assert.equal(provider.usage.metadataCalls,calls);
  });
  console.log(`VIDMATCH_CURATION_DB_OK ${count}; no hosted database calls.`);
}finally{await db.close();}
