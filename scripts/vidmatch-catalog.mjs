#!/usr/bin/env node
/** Node22+. No dotenv dependency, external scraping, audiovisual downloads, or automatic deployment. */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {YoutubeProvider, ServiceFailure} from '../apps/vidmatch/src/services/curation/provider.ts';
import {CatalogStore} from '../apps/vidmatch/src/services/curation/store.ts';
import {parseManifest, prepareManifest, legacyRow, runWorker, checkCatalogHealth} from '../apps/vidmatch/src/services/curation/worker.ts';
const {values,positionals}=parseArgs({allowPositionals:true,options:{'env-file':{type:'string'},manifest:{type:'string',default:'apps/vidmatch/catalog/reviews.json'},write:{type:'boolean',default:false},'legacy-schema':{type:'boolean',default:false},report:{type:'string'},'target-per-level':{type:'string',default:'30'},'run-key':{type:'string'},help:{type:'boolean'}}});
const command=positionals[0]??'inspect';
if(values.help){console.log('vidmatch-catalog.mjs inspect|import|discover|health [--env-file PATH] [--manifest PATH] [--write] [--legacy-schema] [--report /tmp/report.json] [--target-per-level 30]');process.exit(0);}
try {
  if(values['env-file'])process.loadEnvFile(values['env-file']);
  if(!['inspect','import','discover','health'].includes(command))throw new ServiceFailure('INVALID_COMMAND',400);
  const target=Number(values['target-per-level']);
  // Catalog capacity only; editorial gates and the five-per-channel limit still apply.
  if(!Number.isInteger(target)||target<1||target>200)throw new ServiceFailure('INVALID_TARGET',400);
  if(values['legacy-schema']&&!['inspect','import'].includes(command))throw new ServiceFailure('LEGACY_MODE_ONLY_FOR_IMPORT',400);
  if(['discover','health'].includes(command)&&!values.write)throw new ServiceFailure('USE_WRITE_FOR_MAINTENANCE_RUN',400);
  const store=new CatalogStore(process.env.SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'');
  const provider=new YoutubeProvider(process.env.YOUTUBE_API_KEY??'',{maxSearchCalls:4});
  const manifest=parseManifest(JSON.parse(await readFile(values.manifest,'utf8')));
  let report;
  if(command==='health')report=await checkCatalogHealth(store,provider);
  else if(command==='discover'||(command==='import'&&values.write&&!values['legacy-schema'])){
    const digest=createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0,20);
    report=await runWorker(store,provider,manifest,{runKey:values['run-key']??(command==='discover'?`daily-${new Date().toISOString().slice(0,10)}`:`import-${digest}`),discover:command==='discover',targetPerLevel:target,...(command==='import'?{maxBatches:40,deadlineMs:600000}:{})});
  } else {
    const before=await store.catalog(values['legacy-schema']);
    const prepared=await prepareManifest(provider,manifest,before,target);
    const thumbnailFailures=[];
    // Validate every selected thumbnail before initial publication; four bounded concurrent requests.
    for(let start=0;start<prepared.selected.length;start+=4){
      await Promise.all(prepared.selected.slice(start,start+4).map(async candidate=>{
        try{const response=await fetch(candidate.provider.thumbnail_url,{method:'HEAD',signal:AbortSignal.timeout(10000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))thumbnailFailures.push(candidate.videoId);}
        catch{thumbnailFailures.push(candidate.videoId);}
      }));
    }
    const selected=prepared.selected.filter(candidate=>!thumbnailFailures.includes(candidate.videoId));
    const saved=command==='import'&&values.write?await store.insertLegacy(selected.map(legacyRow)):[];
    const after=values.write?await store.catalog(values['legacy-schema']):before;
    const receiptIds=saved.map(row=>row.video_id);
    const beforeIds=new Set(before.map(row=>row.video_id));
    const addedIds=values.write?selected.filter(candidate=>!beforeIds.has(candidate.videoId)&&after.some(row=>row.video_id===candidate.videoId&&row.level===candidate.level)).map(candidate=>candidate.videoId):[];
    if(values.write&&selected.some(candidate=>!after.some(row=>row.video_id===candidate.videoId&&row.level===candidate.level)))throw new ServiceFailure('INSERT_VERIFICATION_FAILED');
    const count=rows=>rows.reduce((counts,row)=>{counts[row.level]=(counts[row.level]??0)+1;return counts;},{});
    report={mode:values.write?'insert-only-legacy':'dry-run',checkedAt:new Date().toISOString(),before:count(before),after:count(after),added:count(selected.filter(row=>addedIds.includes(row.videoId))),insertedIds:addedIds,insertReceiptIds:receiptIds,selected:selected.map(row=>({videoId:row.videoId,level:row.level,topics:row.topics,format:row.format,evidence:row.review.evidence})),rejectedOrDeferred:prepared.evaluated.filter(row=>row.decision!=='approved').map(row=>({videoId:row.videoId,decision:row.decision,reasons:row.reasons})),diversityDeferred:prepared.evaluated.filter(row=>row.candidate&&!prepared.selected.some(selected=>selected.videoId===row.videoId)).map(row=>row.videoId),thumbnailFailures,...provider.usage};
  }
  if(values.report)await writeFile(values.report,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({event:'vidmatch_catalog_failed',code:error instanceof ServiceFailure?error.code:'INVALID_CONFIG_OR_WORKER_FAILURE',status:error instanceof ServiceFailure?error.status:503}));process.exitCode=1;}
