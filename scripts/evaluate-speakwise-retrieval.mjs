/** Synthetic frozen-time evaluation; real PostgreSQL candidate search and production memory ranker. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { rankEvidence } from '../app/api/speakwise/learningPolicy.ts';
const fixture=JSON.parse(await readFile(new URL('./fixtures/speakwise-retrieval.json',import.meta.url),'utf8'));
const now=new Date(fixture.asOf),k=3;
function metrics(ids,labels) {
 const relevant=Object.keys(labels).filter(id=>labels[id]>0);
 if(!relevant.length)return {recall:null,ndcg:null,emptyCorrect:ids.length===0};
 const gain=ids.slice(0,k).reduce((sum,id,index)=>sum+(2**(labels[id]||0)-1)/Math.log2(index+2),0);
 const ideal=Object.values(labels).sort((a,b)=>b-a).slice(0,k).reduce((sum,value,index)=>sum+(2**value-1)/Math.log2(index+2),0);
 return {recall:ids.slice(0,k).filter(id=>relevant.includes(id)).length/relevant.length,ndcg:gain/ideal};
}
function aggregate(cases){const score=(method,key)=>{const values=cases.map(item=>item[method][key]).filter(value=>typeof value==='number');return values.reduce((a,b)=>a+b,0)/values.length;};return {baseline:{recallAt3:score('baseline','recall'),nDCGAt3:score('baseline','ndcg')},implemented:{recallAt3:score('implemented','recall'),nDCGAt3:score('implemented','ndcg')}};}
const memory=fixture.memory.map(item=>{
 const allowed=item.records.filter(row=>new Date(row.at)<=now);
 const baseline=allowed.toSorted((a,b)=>b.at.localeCompare(a.at)).slice(0,k).map(row=>row.id);
 const selected=rankEvidence(allowed,item.query,now,k);
 return {name:item.name,baseline:metrics(baseline,item.relevance),implemented:metrics(selected.map(row=>row.id),item.relevance),baselineIds:baseline,selectedIds:selected.map(row=>row.id),contextChars:selected.reduce((sum,row)=>sum+Math.min(1800,row.text.length),0)};
});
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const latency=[];
let content;
try {
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;");
 for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort())await db.exec((await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')).replaceAll(/create extension if not exists pgcrypto;/gi,''));
 const owner=randomUUID();await db.query("insert into auth.users(id,email) values($1,'retrieval@example.test')",[owner]);
 const ids=new Map();
 for(const item of fixture.catalog.filter(item=>new Date(item.createdAt)<=now)) {
  const id=randomUUID();ids.set(id,item.id);
  await db.query("insert into public.vidmatch_text_content(id,title,content_type,source,url,body,level,created_at) values($1,$2,'article','Synthetic fixture',$3,$4,'B1',$5)",[id,item.title,`https://example.test/${item.id}`,item.body,item.createdAt]);
 }
 content=[];
 for(const item of fixture.content) {
  const result=await db.query('select public.search_speakwise_catalog($1,$2,$3) result',[owner,item.query,'B1']);
  const selected=result.rows[0].result.texts.map(row=>ids.get(row.id));
  const baseline=fixture.catalog.filter(row=>new Date(row.createdAt)<=now).toSorted((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,k).map(row=>row.id);
  content.push({name:item.name,baseline:metrics(baseline,item.relevance),implemented:metrics(selected,item.relevance),baselineIds:baseline,selectedIds:selected});
 }
 // Warm local microbenchmark; timing excludes model/provider and HTTP. Repeats do not add relevance samples.
 for(let round=0;round<25;round++)for(const item of fixture.content){const start=performance.now();await db.query('select public.search_speakwise_catalog($1,$2,$3)',[owner,item.query,'B1']);latency.push(performance.now()-start);}
}finally{await db.close();}
const memoryLatency=[];
for(let repeat=0;repeat<100;repeat++)for(const item of fixture.memory){const start=performance.now();rankEvidence(item.records,item.query,now,k);memoryLatency.push(performance.now()-start);}
function timing(values){const sorted=values.toSorted((a,b)=>a-b);return {sampleSize:values.length,medianMs:Number(sorted[Math.floor(sorted.length*.5)].toFixed(3)),p95Ms:Number(sorted[Math.floor(sorted.length*.95)].toFixed(3))};}
const report={label:fixture.label,asOf:fixture.asOf,environment:{node:process.version,platform:os.platform(),arch:os.arch(),database:'PGlite PostgreSQL/WASM, in-memory, isolated synthetic corpus'},method:'Recency-only baseline vs production full-corpus lexical content candidate RPC and production evidence-aware memory reranking. Content reranking and provider quality are outside this small fixture comparison.',memory:{queryCount:memory.length,...aggregate(memory),cases:memory},content:{queryCount:content.length,...aggregate(content),cases:content},latency:{contentSql:timing(latency),memoryReranker:timing(memoryLatency)},context:{memoryChars:memory.map(item=>item.contextChars),tokenEstimate:'Character counts only; provider tokenizer and conversational/first-audible latency are not measured.'},limitations:['Synthetic labels and tiny corpus cannot establish a learning benefit.','No future rows are loaded or ranked for historical prediction.','Microbenchmarks omit network, authentication, hosted Supabase, and provider latency.']};
const serialized=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])await writeFile(process.argv[2],serialized);
console.log(serialized);
if(report.memory.implemented.recallAt3<report.memory.baseline.recallAt3 || report.content.implemented.recallAt3<report.content.baseline.recallAt3)process.exitCode=1;
