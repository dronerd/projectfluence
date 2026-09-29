// Start Next with dummy Supabase3113, CRON_SECRET=fixture-cron,
// VIDMATCH_INGEST_TOKEN=fixture-ingest and YOUTUBE_API_KEY=fixture-youtube.
// FLUENCE_BASE_URL=http://127.0.0.1:3112 node --test apps/vidmatch/src/services/curation/routeAuth.test.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
const base=process.env.FLUENCE_BASE_URL||'http://127.0.0.1:3112';
const port=Number(process.env.FLUENCE_API_FIXTURE_PORT||3113);
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use an isolated local Next server with fixture credentials.');

test('privileged discovery routes reject unauthorized/invalid requests before upstream work and deduplicate completed runs',async()=>{
  const calls=[];
  const fixture=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    calls.push({path:req.url,body:raw?JSON.parse(raw):null});
    res.setHeader('Content-Type','application/json');
    if(req.url!=='/rest/v1/rpc/begin_vidmatch_ingestion_run'){res.writeHead(500);res.end('{"error":"unexpected upstream work"}');return;}
    res.end(JSON.stringify({run_id:'11111111-1111-4111-8111-111111111111',lease_token:null,status:'completed',claimed:false}));
  });
  await new Promise((resolve,reject)=>{fixture.once('error',reject);fixture.listen(port,'127.0.0.1',resolve);});
  const request=async(path,init={})=>{const response=await fetch(`${base}${path}`,init);return {status:response.status,body:await response.json()};};
  const cron='/api/vidmatch/cron/daily-youtube',ingest='/api/vidmatch/ingest-youtube';
  const auth={Authorization:'Bearer fixture-ingest','Content-Type':'application/json'};
  try{
    for(const authorization of [undefined,'Bearer invalid','Basic fixture-cron','Bearer fixture-cron-extra']){
      assert.equal((await request(cron,{headers:authorization?{Authorization:authorization}:{}})).status,401);
    }
    assert.equal((await request(ingest,{method:'POST',body:'{}'})).status,401);
    for(const body of ['{',JSON.stringify({query:'English lesson',level:'C2'}),JSON.stringify({query:'English lesson',runKey:'daily-overwrite'}),JSON.stringify({query:'x'.repeat(5000)})]){
      const result=await request(ingest,{method:'POST',headers:auth,body});assert.ok([400,413].includes(result.status),JSON.stringify(result));
    }
    assert.equal(calls.length,0,'authorization and input validation precede all database requests');
    const scheduled=await request(cron,{headers:{Authorization:'Bearer fixture-cron'}});
    assert.equal(scheduled.status,200);assert.equal(scheduled.body.health.claimed,false);assert.equal(scheduled.body.discovery.claimed,false);
    assert.equal(calls.length,2);assert.ok(calls[0].body.p_run_key.startsWith('health-'));assert.ok(calls[1].body.p_run_key.startsWith('daily-'));
    const manual=await request(ingest,{method:'POST',headers:auth,body:JSON.stringify({query:'Independent English lessons',runKey:'manual-fixture001'})});
    assert.equal(manual.status,200);assert.equal(manual.body.result.claimed,false);assert.equal(calls.length,3);
    assert.equal(calls[2].body.p_run_key,'manual-fixture001');
    assert.deepEqual(calls[2].body.p_config.queries,['Independent English lessons']);
    assert.ok(calls.every(call=>call.path==='/rest/v1/rpc/begin_vidmatch_ingestion_run'),'completed runs trigger no catalog/provider work');
  }finally{await new Promise(resolve=>fixture.close(resolve));}
});
