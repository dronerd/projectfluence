import test from 'node:test';
import assert from 'node:assert/strict';
import {YoutubeProvider, requestJson, normalizeProviderVideo, playbackRejections, durationSeconds, ServiceFailure} from './provider.ts';
import {discoveryIntents} from './discovery.ts';
const fixture=()=>({id:'abcdefghijk',snippet:{title:'Title',channelTitle:'Channel',channelId:'UC123',defaultAudioLanguage:'en-GB',thumbnails:{high:{url:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}}},contentDetails:{duration:'PT3M15S',caption:'true'},status:{privacyStatus:'public',uploadStatus:'processed',embeddable:true}});
test('metadata gate distinguishes language, embedding and region from search hints',()=>{
  const input=fixture(); const video=normalizeProviderVideo(input)!;
  assert.deepEqual(playbackRejections(video),[]);
  assert.deepEqual(playbackRejections({...video,embeddable:false,region_restricted:true,audio_language:'es'}),['not_embeddable','region_restricted','non_english_audio']);
  assert.equal(video.captions_available,true); assert.equal('statistics' in video,false);
});
test('malformed IDs, thumbnails, duration and livestreams fail closed',()=>{
  assert.equal(normalizeProviderVideo({...fixture(),id:'bad'}),null);
  const video=normalizeProviderVideo({...fixture(),snippet:{...fixture().snippet,thumbnails:{high:{url:'https://evil.test/file.jpg'}},liveBroadcastContent:'upcoming'},contentDetails:{duration:'P0D'}})!;
  assert.deepEqual(playbackRejections(video),['live_or_upcoming','missing_thumbnail','invalid_duration']);
  assert.equal(durationSeconds('PT1H2M3S'),3723); assert.equal(durationSeconds('PT0S'),null); assert.equal(durationSeconds('3:00'),null);
});
test('transient HTTP errors retry boundedly and honor bounded retry-after',async()=>{
  let calls=0;const sleeps:number[]=[];
  const data=await requestJson('https://example.test',{},{fetcher:async()=>++calls<3?new Response('',{status:503,headers:{'retry-after':'999'}}):Response.json({ok:true}),sleep:async ms=>{sleeps.push(ms);}});
  assert.deepEqual(data,{ok:true});assert.equal(calls,3);assert.deepEqual(sleeps,[2500,2500]);
});
test('quota, authentication and invalid responses are not retried or leaked',async()=>{
  for(const status of [400,401,403,404]){
    let calls=0;
    await assert.rejects(requestJson('https://example.test?key=SECRET',{}, {fetcher:async()=>{calls++;return new Response('private provider error',{status});}}),error=>error instanceof ServiceFailure&&!error.message.includes('SECRET')&&!error.message.includes('private'));
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(requestJson('https://example.test',{}, {fetcher:async()=>{calls++;return new Response('not-json');}}),{message:'UPSTREAM_INVALID_JSON'});
  assert.equal(calls,1);
});
test('network failure never exposes credential-bearing URLs and stops after three attempts',async()=>{
  let calls=0;
  await assert.rejects(requestJson('https://example.test?key=SECRET',{}, {fetcher:async()=>{calls++;throw new Error('SECRET');},sleep:async()=>{}}),{message:'UPSTREAM_NETWORK_OR_TIMEOUT'});
  assert.equal(calls,3);
});
test('YouTube metadata deduplicates and batches50 IDs, without statistics',async()=>{
  const ids=Array.from({length:51},(_,index)=>String(index).padStart(11,'a'));
  const requests:URL[]=[];
  const provider=new YoutubeProvider('fixture',{fetcher:async input=>{const url=new URL(String(input));requests.push(url);return Response.json({items:(url.searchParams.get('id')??'').split(',').map(id=>({...fixture(),id}))});}});
  const found=await provider.videos([...ids,ids[0]]);
  assert.equal(found.size,51);assert.equal(requests.length,2);
  assert.equal(requests[0].searchParams.get('id')?.split(',').length,50);
  assert.equal(requests[0].searchParams.get('part'),'snippet,contentDetails,status');
});
test('search respects pagination and hard call budget',async()=>{
  const requests:URL[]=[];
  const provider=new YoutubeProvider('fixture',{maxSearchCalls:2,fetcher:async input=>{requests.push(new URL(String(input)));return Response.json({items:[{id:{videoId:'abcdefghijk'}},{id:{videoId:'abcdefghijk'}}],nextPageToken:'next'});}});
  assert.deepEqual(await provider.search('science'),{ids:['abcdefghijk'],nextPageToken:'next'});
  await provider.search('science','next');
  await assert.rejects(provider.search('science'),{message:'SEARCH_BUDGET_EXHAUSTED'});
  assert.equal(requests[1].searchParams.get('pageToken'),'next');assert.equal(requests[0].searchParams.get('safeSearch'),'strict');
});
test('search intent rotates topics and prioritizes gaps without assigning levels',()=>{
  const result=discoveryIntents(100,{A1:100,A2:1,B1:20,B2:20,C1:20,C2:20});
  assert.equal(result[0].level,'A2');assert.equal(new Set(result.map(row=>row.topic)).size,4);
  assert.notDeepEqual(result,discoveryIntents(101,{A1:100,A2:1}));
  assert.equal(result.some(row=>/English video intermediate/.test(row.query)),false);
});
