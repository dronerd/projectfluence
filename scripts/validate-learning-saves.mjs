/** Browser fixtures: no live Supabase/API or account is used. Run against a dummy-env build. */
import assert from 'node:assert/strict';
import { chromium, baseUrl } from './browser-tools.mjs';
const supabaseUrl = process.env.FLUENCE_SUPABASE_URL;
if (!supabaseUrl) throw new Error('Set FLUENCE_SUPABASE_URL to the dummy Supabase URL used for the frontend build.');
const storageKey=`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const expires=Math.floor(Date.now()/1000)+3600;
const user={id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',email:'learner@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:expires,aud:'authenticated'})).toString('base64url')}.fixture`;
const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:expires,expires_in:3600,user};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext();
  await context.addInitScript(({storageKey,session})=>localStorage.setItem(storageKey,JSON.stringify(session)),{storageKey,session});
  await context.route(`${supabaseUrl}/**`,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)}));
  const page=await context.newPage();
  let reviews=0;
  const questions=[
    {id:'one',questionType:'meaning',word:'hello',prompt:'A greeting',choices:['hello','bye'],answerIndex:0,correctAnswer:'hello',definition:'A greeting',sourceCategory:'word-beginner'},
    {id:'two',questionType:'meaning',word:'travel',prompt:'Visit another place',choices:['hello','travel'],answerIndex:1,correctAnswer:'travel',definition:'Visit another place',sourceCategory:'word-beginner'},
  ];
  await context.route('**/api/vocabstream/review',r=>{reviews++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({questions,weakWords:[]})});});
  const writes=[];
  await context.route('**/api/vocabstream/progress',r=>{writes.push(r.request().postDataJSON());return writes.length===1?r.abort('failed'):r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,lessonAttemptId:writes.at(-1).attemptId})});});
  await page.goto(`${baseUrl}/vocabstream/review`);
  await page.getByRole('button',{name:'復習を始める'}).click();
  await page.locator('.vs-choice').first().click();
  await page.evaluate(({storageKey,session})=>{const channel=new BroadcastChannel(storageKey);channel.postMessage({event:'TOKEN_REFRESHED',session:{...session,access_token:`${session.access_token}-refreshed`}});channel.close();},{storageKey,session});
  await page.waitForTimeout(300);
  assert.equal(reviews,1,'A token refresh must not replace active review questions');
  await page.getByRole('button',{name:'次の問題へ'}).click();
  await page.locator('.vs-choice').last().click();
  await page.getByRole('button',{name:'復習の結果を見る'}).click();
  await page.getByRole('button',{name:'保存を再試行'}).click();
  await page.getByText('学習記録を保存しました。',{exact:true}).waitFor();
  assert.equal(writes.length,2);
  assert.deepEqual(writes[0],writes[1],'Lost response retry must carry exactly the same batch and UUID');
  assert.match(writes[0].attemptId,/^[0-9a-f-]{36}$/i);
  const guest=await browser.newContext();
  let guestWrites=0;
  await guest.route('**/api/vocabstream/progress',r=>{guestWrites++;return r.abort();});
  await guest.route('**/vocabstream/data/word-beginner/Lesson1.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({words:[{word:'hello',meaning:'A greeting'},{word:'bye',meaning:'A farewell'}]})}));
  const guestPage=await guest.newPage();
  await guestPage.goto(`${baseUrl}/vocabstream/lesson/word-beginner-lesson-1`);
  await guestPage.getByRole('button',{name:'クイズから始める'}).click();
  await guestPage.locator('.vs-choice').first().click();
  await guestPage.getByRole('button',{name:'次の問題へ'}).click();
  await guestPage.locator('.vs-choice').first().click();
  await guestPage.getByRole('button',{name:'結果を見る'}).click();
  await guestPage.getByRole('heading',{name:'レッスン完了'}).waitFor();
  await guestPage.waitForTimeout(200);
  assert.equal(guestWrites,0,'Guest lessons must not create anonymous durable writes');
  console.log('LEARNING_SAVES_OK: token refresh preserves review; failed-response retry reuses exact batch UUID; guest learning stays local.');
} finally { await browser.close(); }
