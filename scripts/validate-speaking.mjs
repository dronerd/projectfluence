import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async()=>{
 const env=fs.existsSync(new URL('../.env.local',import.meta.url))?fs.readFileSync(new URL('../.env.local',import.meta.url),'utf8'):'';
 const publicUrl=process.env.FLUENCE_TEST_SUPABASE_URL||env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
 assert.ok(publicUrl,'Set FLUENCE_TEST_SUPABASE_URL to the frontend build Supabase URL');
 const storageKey=`sb-${new URL(publicUrl).hostname.split('.')[0]}-auth-token`;
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:'00000000-0000-4000-8000-000000000001',exp:expires,aud:'authenticated'})).toString('base64url')}.fixture`;
 const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:expires,expires_in:3600,user:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',email:'learner@example.com',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}};
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext();
 await context.addInitScript(({key,session})=>{if(!sessionStorage.getItem('fluence-guest'))localStorage.setItem(key,JSON.stringify(session));},{key:storageKey,session});
 await context.route('**/auth/v1/**',r=>r.fulfill({status:200,json:{}}));
 const page=await context.newPage();
 let sessionId=null, memoryWrites=0, settingsWrites=0, settingsFail=true;
 await page.route('**/api/speakwise/lesson-settings',r=>{
  if(r.request().method()==='PUT'){settingsWrites++;return r.fulfill({status:200,json:{ok:true}});}
  return r.fulfill({status:settingsFail?503:200,json:settingsFail?{error:'fixture'}:{settings:null}});
 });
 await page.route('**/api/speakwise/learner-memory',r=>{
  if(r.request().method()==='POST'){const body=r.request().postDataJSON();assert.equal(body.sessionId,sessionId);memoryWrites++;return r.fulfill({status:200,json:{ok:true,memory:{}}});}
  return r.fulfill({status:200,json:{}});
 });
 await page.route('**/api/speakwise/lesson-sessions',async r=>{
  sessionId=r.request().postDataJSON().sessionId;assert.match(sessionId,/^[a-f0-9-]{36}$/);
  await new Promise(resolve=>setTimeout(resolve,150));
  return r.fulfill({status:200,json:{session:{id:sessionId}}});
 });
 let audioPlayingAt=0,audioFinishedAt=0;
 page.on("console",async message=>{if(message.text().startsWith("speakwise_timing")){const detail=await message.args()[1]?.jsonValue().catch(()=>null);if(detail?.stage==="audio_playing")audioPlayingAt=Date.now();}});
 page.on("requestfinished",request=>{if(request.url().endsWith("/api/voice"))audioFinishedAt=Date.now();});
 const requests=[]; const errors=[]; let startFails=true,sendFails=true,summaryFails=true;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:8000/**',async route=>{
  const req=route.request(); if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type,authorization'}});
  assert.equal(req.headers().authorization,`Bearer ${token}`);
  const body=req.postDataJSON(); requests.push({url:req.url(),body});
  const headers={'access-control-allow-origin':'*'};
  if(req.url().endsWith('/api/chat')){
   const fail=body.phase==='start'?startFails:sendFails;
   if(body.phase==='start')startFails=false; else sendFails=false;
   return route.fulfill({status:fail?503:200,headers,json:fail?{error:'Fixture offline'}:{reply:body.phase==='start'?'How are you today? Tell me about something you enjoyed this week.':'Thanks for sharing. Try saying: “I spent time with my friends.” What did you do together?'}});
  }
  if(req.url().endsWith('/api/lesson-summary')){
   const fail=summaryFails;summaryFails=false;
   return route.fulfill({status:fail?503:200,headers,json:fail?{error:'Fixture summary unavailable'}:{summary:{title:'Talking about your week',covered:['Sharing a recent experience'],strengths:['You explained your ideas clearly.'],weaknesses:['Practice past-tense verbs.'],recommendations:['Tell a short story about your weekend.'],usefulVocabulary:['spend time with friends']},farewell:'I saved your lesson.'}});
  }
  if(req.url().endsWith('/api/voice')&&process.env.FLUENCE_AUDIO_FIXTURE_URL)return route.continue({url:process.env.FLUENCE_AUDIO_FIXTURE_URL+'/api/voice'});
  return route.fulfill({status:503,headers,json:{error:'Fixture audio unavailable'}});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto(baseUrl + '/speakwise');
 await page.getByLabel('練習内容',{exact:true}).selectOption('writing_feedback');
 await page.waitForTimeout(800);
 assert.equal(settingsWrites,0,'Failed settings load must not overwrite saved preferences');
 console.log('PASS failed preference read never writes fallback settings.');
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).click();
 await page.getByRole('alert').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'終了する',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'レッスンを始める',exact:true}).isEnabled(),true);
 assert.equal(requests.at(-1).body.lessonMode,'writing_feedback');
 assert.deepEqual(requests.at(-1).body.history,[]);
 console.log('PASS failed start restores setup and timer; selected mode sent correctly.');
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).click();
 await page.getByText('How are you today? Tell me about something you enjoyed this week.').waitFor();
 await page.getByRole('button',{name:'設定',exact:true}).click();
 assert.equal(await page.locator('.sw-chat').isVisible(),false);
 assert.equal(await page.getByRole('heading',{name:'今日の英語レッスン'}).isVisible(),true);
 assert.equal(await page.getByLabel('練習内容',{exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'会話に戻る',exact:true}).click();
 assert.equal(await page.locator('.sw-panel').isVisible(),false);
 await page.waitForFunction(()=>document.activeElement?.textContent==='設定');
 console.log('PASS mobile settings switch, frozen lesson settings, focus restoration.');
 const input=page.getByRole('textbox',{name:'英語の回答',exact:true});
 await input.fill('I spend time with friends yesterday.');
 const before=requests.length;
 await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
 await page.waitForTimeout(100);
 assert.equal(requests.length,before);
 assert.equal(await input.inputValue(),'I spend time with friends yesterday.');
 console.log('PASS composing Enter does not submit.');
 await page.getByRole('button',{name:'送信',exact:true}).click();
 await page.getByRole('button',{name:'もう一度送信',exact:true}).waitFor();
 await page.getByRole('button',{name:'もう一度送信',exact:true}).click();
 await page.getByText(/Thanks for sharing/).waitFor();
 assert.equal(await page.locator('.sw-msg.user').count(),1);
 assert.equal(requests.at(-1).body.history.length,1);
 console.log('PASS send failure/retry preserves one answer and clean request history.');
 if(process.env.FLUENCE_AUDIO_FIXTURE_URL){
  await page.getByRole('button',{name:'AIの1番目のメッセージを音声で再生',exact:true}).click();
  const deadline=Date.now()+15000;
  while((!audioPlayingAt||!audioFinishedAt)&&Date.now()<deadline)await page.waitForTimeout(50);
  assert.ok(audioPlayingAt,'The browser must emit the playing event for real MP3 bytes');
  assert.ok(audioFinishedAt,'The audio stream must finish');
  assert.ok(audioPlayingAt<audioFinishedAt,'Playback should start before the audio download finishes');
  console.log('PASS real MP3 progressive browser playback; playback began',audioFinishedAt-audioPlayingAt,'ms before download completed.');
 }

 for(const width of [320,390,600,768,1024,1440,1920]){
  await page.setViewportSize({width,height:900});
  await page.waitForTimeout(120);
  const geometry=await page.evaluate(()=>{
   const r=document.querySelector('.sw-composer').getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth,composerVisible:r.top>=0&&r.bottom<=innerHeight, headers:document.querySelectorAll('.pf-header').length, scrollY,docHeight:document.documentElement.scrollHeight};
  });
  assert.equal(geometry.overflow,false);assert.equal(geometry.composerVisible,true);
  await page.screenshot({path:screenshotPath(`speak-chat-${width}.png`),fullPage:true});
  console.log('PASS chat viewport',width,geometry);
 }
 await page.setViewportSize({width:390,height:844});
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 assert.equal(results.violations.length, 0, 'Accessibility violation');
 console.log('AXE',results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
 await page.getByRole('button',{name:'終了する',exact:true}).click();
 await page.getByRole('button',{name:'振り返りを再作成',exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'英語の回答',exact:true}).count(),0);
 await page.getByRole('button',{name:'振り返りを再作成',exact:true}).click();
 await page.getByRole('heading',{name:'Talking about your week'}).waitFor();
 await page.getByText('学習履歴に保存しました。',{exact:true}).waitFor();
 assert.equal(memoryWrites,1,'Recap is saved once, using the created session');
 assert.equal(await page.getByText('I saved your lesson.').count(),0);
 await page.screenshot({path:screenshotPath('speak-summary-390.png'),fullPage:true});
 await page.getByRole('button',{name:'次のレッスンを準備',exact:true}).last().click();
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).waitFor();
 assert.equal(await page.getByLabel('練習内容',{exact:true}).inputValue(),'writing_feedback');
 console.log('PASS summary failure/retry, authenticated persistence, next lesson continuation.');
 await page.evaluate(key=>{sessionStorage.setItem('fluence-guest','1');localStorage.removeItem(key);},storageKey);
 settingsFail=false;
 await page.reload();
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'ログイン'}).waitFor();
 console.log('PASS guest cannot start paid AI requests; sign-in guidance is visible.');
 assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
