import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { checkCatalogHealth, chooseCandidates, evaluateCandidate, EVALUATOR_VERSION, runWorker, type ReviewManifest, type WorkerProvider, type WorkerStore } from './worker.ts';
import { CatalogStore, type CatalogRow, type Candidate, type Run } from './store.ts';
import { ServiceFailure, type ProviderVideo } from './provider.ts';

const id='worker00001';
const now=()=>new Date().toISOString();
function video(title='Fresh provider title'): ProviderVideo {
  return {video_id:id,title,channel_name:'Fixture channel',channel_id:'UCfixture',thumbnail_url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,duration:'PT5M',description:null,tags:[],captions_available:true,privacy_status:'public',upload_status:'processed',embeddable:true,region_restricted:false,age_restricted:false,live:false,audio_language:'en'};
}
function manifest(englishConfirmed=true): ReviewManifest {
  return {version:1,reviews:[{videoId:id,level:'B1',levelMin:'B1',levelMax:'B2',topics:['environment'],format:'explainer',evidence:{kind:'publisher_cefr',sourceUrl:'https://learnenglish.britishcouncil.org/fixture',checkedAt:now(),statement:'Independent exact video review.',englishConfirmed,exactVideoMatch:true,coverage:'whole_video'},reviewer:'Fixture editor',reviewedAt:now(),learningValue:'strong',contentValue:'adequate',confidence:'high'}]};
}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Call={name:string;args:Record<string,unknown>};
class FakeStore implements WorkerStore {
  calls:Call[]=[];
  run:Run={run_id:'fixture-run',lease_token:'fixture-token',claimed:true,status:'running'};
  batches:Candidate[][]=[];
  eligible:string[][]=[];
  purges:{purged:number;remaining:boolean}[]=[{purged:0,remaining:false}];
  catalogCalls=0;
  rows:CatalogRow[]=[];
  async rpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
    this.calls.push({name,args});
    const response=name==='begin_vidmatch_ingestion_run'?this.run
      :name==='claim_vidmatch_candidates'?{candidates:this.batches.shift()??[]}
      :name==='stage_vidmatch_candidates'?{staged:(args.p_candidates as unknown[]).length}
      :name==='purge_expired_vidmatch_provider_data'?this.purges.shift()??{purged:0,remaining:false}
      :{};
    return response as T;
  }
  async catalog(){this.catalogCalls++;return this.rows;}
  async dueDiscoveryIds(ids:string[]){this.eligible.push(ids);return ids;}
  async healthBatch(){return [{video_id:id}];}
}
class FakeProvider implements WorkerProvider {
  usage={searchCalls:0,metadataCalls:0};
  requests:string[][]=[];
  failure:Error|undefined;
  searchIds:string[]=[];
  async videos(ids:readonly string[]):Promise<Map<string,ProviderVideo>> {
    this.requests.push([...ids]);this.usage.metadataCalls++;
    if(this.failure) throw this.failure;
    return new Map(ids.filter(value=>value===id).map(value=>[value,video()]));
  }
  async search(){this.usage.searchCalls++;return {ids:this.searchIds};}
}
const claim=():Candidate=>({video_id:id,input_sha256:'a'.repeat(64),provider_metadata:video('Old snapshot'),metadata_checked_at:'2026-01-01T00:00:00Z'});

test('completed run keys consume no provider quota and perform no catalog reads',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();store.run={...store.run,claimed:false,status:'completed'};
  assert.deepEqual(await runWorker(store,provider,manifest(),{runKey:'duplicate',discover:true}),{status:'completed',claimed:false});
  assert.equal(provider.requests.length,0);assert.equal(provider.usage.searchCalls,0);assert.equal(store.catalogCalls,0);assert.equal(store.calls.length,1);
});

test('claimed snapshots rebind fresh provider and current independent review before commit',async()=>{
  const store=new FakeStore(),provider=new FakeProvider(),review=manifest();store.batches=[[claim()],[]];
  const result=await runWorker(store,provider,review,{runKey:'fresh'});assert.equal(result.status,'completed');
  const commits=store.calls.filter(call=>call.name==='commit_vidmatch_evaluations');assert.equal(commits.length,1);
  const commitIndex=store.calls.indexOf(commits[0]);
  const stages=store.calls.slice(0,commitIndex).filter(call=>call.name==='stage_vidmatch_candidates');assert.equal(stages.length,2);
  const rebound=(stages[1].args.p_candidates as Record<string,unknown>[])[0];
  const evaluated=(commits[0].args.p_results as Record<string,unknown>[])[0];
  const expected=sha({provider:video(),review:review.reviews[0],version:EVALUATOR_VERSION});
  assert.equal(rebound.input_sha256,expected);assert.equal(evaluated.input_sha256,expected);
  assert.equal((rebound.provider_metadata as ProviderVideo).title,'Fresh provider title');assert.equal(evaluated.decision,'approved');
});

test('an old claim cannot supply missing English evidence from the current manifest',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();store.batches=[[claim()],[]];
  await runWorker(store,provider,manifest(false),{runKey:'changed-review'});
  const item=(store.calls.find(call=>call.name==='commit_vidmatch_evaluations')!.args.p_results as Record<string,unknown>[])[0];
  assert.equal(item.decision,'deferred');assert.ok((item.reason_codes as string[]).includes('english_unconfirmed'));assert.deepEqual(item.editorial,{});
});

test('batch exhaustion is partial and future discovery does not seed the whole review manifest',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();store.batches=[[claim()],[claim()]];
  const result=await runWorker(store,provider,manifest(),{runKey:'bounded',discover:true,maxBatches:1});
  assert.equal(result.status,'partial');assert.equal(store.eligible.length,0);
  const finished=store.calls.find(call=>call.name==='finish_vidmatch_ingestion_run')!;
  assert.equal(finished.args.p_status,'partial');assert.equal(finished.args.p_error_code,'BATCH_OR_TIME_BUDGET_REACHED');
  assert.equal(store.calls.filter(call=>call.name==='claim_vidmatch_candidates').length,1);
});

test('deadline exhaustion finishes a partial run before spending external quota',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();store.run.lease_until=new Date(Date.now()+65_000).toISOString();
  const result=await runWorker(store,provider,manifest(),{runKey:'deadline'});
  assert.equal(result.status,'partial');assert.equal(provider.requests.length,0);assert.equal(store.catalogCalls,0);
  assert.equal(store.calls.at(-1)?.args.p_error_code,'RUN_BUDGET_REACHED');
});

test('shared request deadline includes run reservation time and does not alter stable run configuration',async()=>{
  const first=new FakeStore(),second=new FakeStore(),provider=new FakeProvider();
  const started=Date.now();
  const result=await runWorker(first,provider,manifest(),{runKey:'shared-deadline',deadlineAt:started+30_000});
  assert.equal(result.status,'partial');assert.equal(provider.requests.length,0);assert.equal(first.catalogCalls,0);
  const config=first.calls[0].args.p_config as Record<string,unknown>;
  assert.equal('deadlineAt' in config,false);
  second.run={...second.run,claimed:false,status:'partial'};
  await runWorker(second,provider,manifest(),{runKey:'shared-deadline',deadlineAt:started+240_000});
  assert.equal((second.calls[0].args.p_config as Record<string,unknown>).deadlineMs,config.deadlineMs);
});

test('provider failure adds no missing strike and still purges expired provider data',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();provider.failure=new ServiceFailure('PROVIDER_FORBIDDEN_OR_QUOTA',403);
  store.purges=[{purged:50,remaining:true}];
  await assert.rejects(checkCatalogHealth(store,provider,{maxPurgeBatches:1}),error=>error===provider.failure);
  const checks=store.calls.find(call=>call.name==='refresh_vidmatch_provider_metadata')!.args.p_checks as {status:string}[];
  assert.equal(checks[0].status,'transient_error');assert.equal(store.calls.filter(call=>call.name==='purge_expired_vidmatch_provider_data').length,1);
});

test('default health retention drains an import-sized expiry burst and stops when empty',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();
  store.purges=[...Array.from({length:17},()=>({purged:50,remaining:true})),{purged:20,remaining:false}];
  const result=await checkCatalogHealth(store,provider);
  assert.deepEqual(result.purge,{purged:870,remaining:false,batches:18});
  const calls=store.calls.filter(call=>call.name==='purge_expired_vidmatch_provider_data');
  assert.equal(calls.length,18);assert.ok(calls.every(call=>call.args.p_limit===50));
});

test('default health retention caps a larger backlog at twenty bounded batches',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();
  store.purges=Array.from({length:25},()=>({purged:50,remaining:true}));
  const result=await checkCatalogHealth(store,provider);
  assert.deepEqual(result.purge,{purged:1000,remaining:true,batches:20});
  assert.equal(store.calls.filter(call=>call.name==='purge_expired_vidmatch_provider_data').length,20);
  assert.equal(store.purges.length,5);
});

test('a lost claim response is never retried as a second reservation',async()=>{
  const original=globalThis.fetch;let attempts=0;
  try {
    globalThis.fetch=async()=>{attempts++;throw new Error('Lost response after successful claim');};
    const store=new CatalogStore('http://127.0.0.1:9999','fixture-service');
    await assert.rejects(store.rpc('claim_vidmatch_candidates',{}),/UPSTREAM_NETWORK_OR_TIMEOUT/);assert.equal(attempts,1);
    await assert.rejects(store.rpc('finish_vidmatch_ingestion_run',{}, {retry:false}),/UPSTREAM_NETWORK_OR_TIMEOUT/);assert.equal(attempts,2);
  } finally {globalThis.fetch=original;}
});

test('unchanged rejected and deferred reviews respect cooldown before metadata is fetched',async()=>{
  const original=globalThis.fetch;
  const hashes=new Map([[id,'current-review']]);
  try {
    globalThis.fetch=async()=>Response.json([{video_id:id,stage:'rejected',last_evaluator_version:EVALUATOR_VERSION,next_attempt_at:new Date(Date.now()+86400000).toISOString(),metadata_expires_at:new Date(Date.now()+86400000).toISOString(),discovery_context:{review_sha256:'current-review'}}]);
    const store=new CatalogStore('http://127.0.0.1:9999','fixture-service');
    assert.deepEqual(await store.dueDiscoveryIds([id],EVALUATOR_VERSION,hashes),[]);
    assert.deepEqual(await store.dueDiscoveryIds([id],EVALUATOR_VERSION,new Map([[id,'changed-review']])),[id]);
    globalThis.fetch=async()=>Response.json({unexpected:'shape'});
    await assert.rejects(store.dueDiscoveryIds([id],EVALUATOR_VERSION,hashes),/INVALID_CANDIDATE_RESPONSE/);
  } finally {globalThis.fetch=original;}
});

test('legacy rows without topic annotations still count toward level and channel limits',()=>{
  const candidate=evaluateCandidate(id,video(),manifest().reviews[0]).candidate!;
  const legacy=Array.from({length:5},(_,index)=>({video_id:`legacy0000${index}`,level:'B1',channel_name:'Fixture channel',topics:[],quality_score:80}));
  const metadata=new Map(legacy.map(row=>[row.video_id,{...video(),video_id:row.video_id}]));
  assert.deepEqual(chooseCandidates([candidate],legacy,metadata,30),[]);
  const otherChannel={...candidate,channelId:'UCanother'};
  assert.deepEqual(chooseCandidates([otherChannel],legacy,metadata,5),[]);
});

test('worker resolves old channel names to provider IDs before applying diversity caps',async()=>{
  const store=new FakeStore(),provider=new FakeProvider();store.batches=[[claim()],[]];
  store.rows=Array.from({length:5},(_,index)=>({video_id:`legacy0000${index}`,level:'B1',channel_name:'Fixture channel',topics:[],quality_score:80}));
  provider.videos=async(ids)=>{provider.requests.push([...ids]);return new Map(ids.map(value=>[value,{...video(),video_id:value}]));};
  await runWorker(store,provider,manifest(),{runKey:'legacy-channel'});
  assert.ok(provider.requests.some(ids=>ids.includes('legacy00000')&&ids.includes('legacy00004')));
  const item=(store.calls.find(call=>call.name==='commit_vidmatch_evaluations')!.args.p_results as Record<string,unknown>[])[0];
  assert.equal(item.decision,'deferred');assert.deepEqual(item.reason_codes,['diversity_limit']);
});
