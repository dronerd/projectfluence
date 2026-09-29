/** Exercise actual Next handlers against an isolated local Supabase HTTP fixture.
 * Start a production build with SUPABASE_URL=http://127.0.0.1:3103,
 * SUPABASE_ANON_KEY=fixture-anon, SUPABASE_SERVICE_ROLE_KEY=fixture-service.
 * FLUENCE_BASE_URL=http://127.0.0.1:3102 node scripts/validate-api.mjs
 * This script never connects to real accounts, databases, or external providers.
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const base = new URL(process.env.FLUENCE_BASE_URL || 'http://127.0.0.1:3102');
const fixturePort = Number(process.env.FLUENCE_FIXTURE_PORT || 3103);
if (base.hostname !== '127.0.0.1' || base.protocol !== 'http:') throw new Error('Only an isolated localhost app is supported.');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000010';
const foreignSessionId = '00000000-0000-4000-8000-000000000011';
const attemptId = '00000000-0000-4000-8000-000000000012';
const sessions = new Map([[foreignSessionId, { id: foreignSessionId, user_id: other }]]);
const requests = [];
let failMemoryReads = false;
let saveCount = 0;
let fixtureFailure;
const privateDiagnostic = 'fixture-private-database-internal-details';
const analytics = {vocabstream:{completedLessons:1001,lowScoreLessons:2,averageAccuracy:80,byGenre:{test:1001},latestActivityAt:null},vidmatch:{savedVideos:1,totalClicks:3,byLevel:{B1:1},latestActivityAt:null},speakwise:{lessonSessions:1,totalMinutes:20,byMode:{speaking:1},byLevel:{B1:1},latestActivityAt:null}};
const server = http.createServer(async (request, response) => {
  const send = (status, body) => { response.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(JSON.stringify(body)); };
  try {
    const chunks=[];
    for await (const chunk of request) chunks.push(chunk);
    const raw=Buffer.concat(chunks).toString();
    const body=raw?JSON.parse(raw):null;
    const url = new URL(request.url,`http://127.0.0.1:${fixturePort}`);
    requests.push({path:url.pathname,search:url.searchParams,method:request.method,body,headers:request.headers});
    if (url.pathname === '/auth/v1/user') {
      assert.equal(request.headers.apikey,'fixture-anon');
      if (request.headers.authorization === 'Bearer fixture-expired') return send(401,{message:privateDiagnostic});
      if (request.headers.authorization === 'Bearer fixture-unavailable') return send(503,{message:privateDiagnostic});
      if (request.headers.authorization !== 'Bearer fixture-valid') return send(401,{message:privateDiagnostic});
      return send(200,{id:owner,email:'learner@example.test',user_metadata:{}});
    }
    assert.equal(request.headers.apikey,'fixture-service');
    assert.equal(request.headers.authorization,'Bearer fixture-service');
    if (url.pathname === '/rest/v1/rpc/save_vocabstream_progress') {
      assert.equal(body.p_user_id,owner);
      return send(200,{id:body.p_attempt_id});
    }
    if (url.pathname === '/rest/v1/rpc/get_learning_analytics') {
      assert.equal(body.p_user_id,owner);
      return send(200,analytics);
    }
    if (url.pathname === '/rest/v1/rpc/save_speakwise_lesson_summary') {
      assert.equal(body.p_user_id,owner);
      if (sessions.get(body.p_session_id)?.user_id !== owner) return send(403,{code:'42501',message:privateDiagnostic});
      saveCount++;
      return send(200,{id:sessionId,user_id:owner,session_id:body.p_session_id});
    }
    if (url.pathname === '/rest/v1/speakwise_lesson_sessions') {
      if (request.method === 'POST') {
        assert.equal(url.searchParams.get('on_conflict'),'id');
        assert.equal(request.headers.prefer,'resolution=ignore-duplicates,return=representation');
        assert.equal(body.user_id,owner);
        if (sessions.has(body.id)) return send(200,[]);
        sessions.set(body.id,body);
        return send(200,[{id:body.id}]);
      }
      assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
      const id=url.searchParams.get('id')?.replace(/^eq\./,'');
      return send(200,sessions.get(id)?.user_id===owner?[{id}]:[]);
    }
    if (request.method === 'GET' && /^\/rest\/v1\/(speakwise_lesson_summaries|speakwise_mistake_patterns|vocabstream_user_lesson_progress|vocabstream_question_attempts|vidmatch_video_view_history)$/.test(url.pathname)) {
      const filter=url.searchParams.get('user_id') || url.searchParams.get('vocabstream_lesson_attempts.user_id');
      assert.equal(filter,`eq.${owner}`);
      return failMemoryReads?send(503,{message:privateDiagnostic}):send(200,[]);
    }
    throw new Error(`Unexpected fixture request ${request.method} ${url.pathname}`);
  } catch (error) { fixtureFailure=error; send(500,{message:'fixture assertion failed'}); }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(fixturePort,'127.0.0.1',resolve);});
let checks=0;
async function check(name,fn) {
  requests.length=0;
  await fn();
  if (fixtureFailure) throw fixtureFailure;
  checks++; console.log(`PASS ${name}`);
}
async function call(path,{method='GET',body,token='fixture-valid',headers={},raw}={}) {
  const result=await fetch(new URL(path,base),{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined||raw!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw ?? (body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(10_000)});
  const text=await result.text();
  assert.equal(text.includes(privateDiagnostic),false,'Internal provider/database details leaked to a client');
  return {status:result.status,data:JSON.parse(text),headers:result.headers};
}
const lesson={sessionId,level:'B1',lessonMode:'natural_conversation',plannedDurationMinutes:20,selectedTopics:['travel'],user_id:other};
const summary={sessionId,level:'B1',lessonMode:'natural_conversation',durationMinutes:20,elapsedSeconds:90,summary:{title:'Practice',mistakes:[{type:'grammar',pattern:'tense',original:'go',correction:'went'}]},user_id:other};
try {
  await check('privileged writes and analytics reject missing authentication without database calls',async()=>{
    for (const [path,method] of [['/api/vocabstream/progress','POST'],['/api/speakwise/lesson-sessions','POST'],['/api/speakwise/learner-memory','POST'],['/api/vidmatch/history','POST'],['/api/analytics/summary','GET']]) {
      const response=await call(path,{method,token:null,...(method==='POST'?{body:{}}:{})});
      assert.equal(response.status,401,path);
    }
    assert.equal(requests.length,0);
  });
  await check('expired sessions are 401 while the authentication service outage is 503',async()=>{
    const expired=await call('/api/analytics/summary',{token:'fixture-expired'});
    const unavailable=await call('/api/analytics/summary',{token:'fixture-unavailable'});
    assert.equal(expired.status,401); assert.equal(expired.data.code,'INVALID_SESSION');
    assert.equal(unavailable.status,503); assert.equal(unavailable.data.code,'AUTH_UNAVAILABLE');
    assert.ok(unavailable.data.requestId); assert.match(unavailable.headers.get('cache-control'),/(^|,\s*)no-store(,|$)/);
    assert.ok(requests.every(r=>r.path==='/auth/v1/user'));
  });
  await check('malformed bearer, JSON, and oversized bodies fail before a write',async()=>{
    assert.equal((await call('/api/analytics/summary',{headers:{Authorization:'Basic bad'}})).status,401);
    assert.equal((await call('/api/speakwise/lesson-sessions',{method:'POST',raw:'{broken'})).status,400);
    assert.equal((await call('/api/speakwise/lesson-sessions',{method:'POST',body:{padding:'x'.repeat(12_001)}})).status,413);
    const encoder=new TextEncoder();
    const stream=new ReadableStream({start(controller){controller.enqueue(encoder.encode('{"padding":"'));controller.enqueue(encoder.encode('x'.repeat(12_001)));controller.enqueue(encoder.encode('"}'));controller.close();}});
    const response=await fetch(new URL('/api/speakwise/lesson-sessions',base),{method:'POST',headers:{Authorization:'Bearer fixture-valid','Content-Type':'application/json'},body:stream,duplex:'half',signal:AbortSignal.timeout(10_000)});
    assert.equal(response.status,413); await response.text();
    assert.ok(requests.every(r=>r.path==='/auth/v1/user'));
  });
  await check('VocabStream passes only the verified owner and one atomic RPC',async()=>{
    const response=await call('/api/vocabstream/progress',{method:'POST',body:{attemptId,lessonId:'word-beginner-lesson-1',genre:'word-beginner',wordCount:1,meaningScore:0,meaningTotal:1,quizScore:0,quizTotal:0,userId:other,userEmail:'spoof@example.test',questionAttempts:[{questionType:'meaning',word:'hello',correctAnswer:'hello',selectedAnswer:'bye',isCorrect:false,attemptOrder:1,choices:['hello','bye']} ]}});
    assert.equal(response.status,200); assert.equal(response.data.lessonAttemptId,attemptId);
    const db=requests.filter(r=>r.path.startsWith('/rest/'));
    assert.equal(db.length,1); assert.equal(db[0].path,'/rest/v1/rpc/save_vocabstream_progress');
    assert.equal(db[0].body.p_user_id,owner); assert.equal('userId' in db[0].body.p_payload,false);
  });
  await check('SpeakWise session retries ignore duplicate IDs and scope the fallback read to owner',async()=>{
    const first=await call('/api/speakwise/lesson-sessions',{method:'POST',body:lesson});
    const second=await call('/api/speakwise/lesson-sessions',{method:'POST',body:{...lesson,plannedDurationMinutes:90}});
    assert.equal(first.status,200); assert.deepEqual(second.data,first.data);
    assert.equal(sessions.get(sessionId).planned_duration_minutes,20,'Retry replaced original session');
    assert.ok(requests.some(r=>r.method==='GET'&&r.search.get('id')===`eq.${sessionId}`&&r.search.get('user_id')===`eq.${owner}`));
    const foreign=await call('/api/speakwise/lesson-sessions',{method:'POST',body:{...lesson,sessionId:foreignSessionId}});
    assert.equal(foreign.status,403); assert.equal(sessions.get(foreignSessionId).user_id,other);
  });
  await check('summary validation and database ownership rejection reach appropriate statuses',async()=>{
    assert.equal((await call('/api/speakwise/learner-memory',{method:'POST',body:{...summary,sessionId:'not-uuid'}})).status,400);
    assert.equal((await call('/api/speakwise/learner-memory',{method:'POST',body:{...summary,sessionId:foreignSessionId}})).status,403);
    assert.equal(saveCount,0);
    const response=await call('/api/speakwise/learner-memory',{method:'POST',body:summary});
    assert.equal(response.status,200); assert.equal(response.data.ok,true); assert.ok(response.data.memory);
    const write=requests.find(r=>r.path==='/rest/v1/rpc/save_speakwise_lesson_summary'&&r.body.p_session_id===sessionId);
    assert.equal(write.body.p_user_id,owner); assert.equal('user_id' in write.body.p_payload,false);
  });
  await check('a committed summary remains successful when learner-memory refresh fails',async()=>{
    failMemoryReads=true;
    const before=saveCount;
    const response=await call('/api/speakwise/learner-memory',{method:'POST',body:summary});
    failMemoryReads=false;
    assert.equal(saveCount,before+1); assert.equal(response.status,200);
    assert.deepEqual(response.data,{ok:true,memory:null,refreshRequired:true});
  });
  await check('analytics uses one owner-scoped aggregation RPC without row-list truncation',async()=>{
    const response=await call('/api/analytics/summary');
    assert.equal(response.status,200); assert.deepEqual(response.data,analytics);
    const database=requests.filter(r=>r.path.startsWith('/rest/'));
    assert.equal(database.length,1); assert.equal(database[0].path,'/rest/v1/rpc/get_learning_analytics');
    assert.deepEqual(database[0].body,{p_user_id:owner});
  });
  console.log(`API_CHECKS_OK ${checks}; actual Next production handlers; isolated Supabase HTTP fixture; no hosted calls.`);
} finally {
  server.closeAllConnections();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
