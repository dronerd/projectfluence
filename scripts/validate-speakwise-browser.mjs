/** Browser -> actual Next/Python -> isolated SQL. External Auth/model adapters are fixtures.
 * Physical touch keyboards, microphones and live TTS are not exercised by this script.
 */
import assert from 'node:assert/strict';
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import { learningPdf } from './speakwise-pdf-fixture.mjs';
if(new URL(baseUrl).hostname!=='127.0.0.1')throw new Error('Use an isolated localhost server with dummy environment.');
const owner='00000000-0000-4000-8000-000000000001';
const expires=Math.floor(Date.now()/1000)+3600;
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp:expires,aud:'authenticated'})).toString('base64url')}.fixture`;
const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:expires,expires_in:3600,user:{id:owner,aud:'authenticated',email:'learner@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}};
const reset=await fetch(baseUrl+'/api/speakwise/learner-memory',{method:'DELETE',headers:{Authorization:'Bearer fixture-valid','Content-Type':'application/json'},body:JSON.stringify({scope:'all'})});
assert.equal(reset.status,200,'Fixture reset must succeed before browser test');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:'sb-127-auth-token',session});
await context.route('**/*',route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(url.hostname)||url.protocol==='data:')return route.continue();return route.abort();});
const page=await context.newPage();
const errors=[],checks=[],requests=[],failedRequests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.url().includes('/api/'))requests.push({url:request.url(),method:request.method()});});
page.on('response',async response=>{if(response.status()>=400&&response.url().includes('/api/'))failedRequests.push({url:response.url(),status:response.status(),body:await response.text().catch(()=>'<unavailable>')});});
const check=(name)=>{checks.push(name);console.log('PASS',name);};
async function geometry(label,reading=false){
 for(const [width,height] of [[320,700],[375,812],[390,844],[430,932],[600,900],[768,1024],[1024,768],[1180,820],[1440,900],[1920,1080],[852,393]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(90);
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,composer:(()=>{const e=document.querySelector('.sw-composer');if(!e||!e.checkVisibility())return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()}));
  assert.equal(metrics.overflow,false,`${label} horizontal overflow ${width}x${height}: ${JSON.stringify(metrics)}`);
  if(metrics.composer&&!reading)assert.ok(metrics.composer.top>=0&&metrics.composer.bottom<=height+1,`${label} composer outside viewport ${width}x${height}`);
  if(['conversation','reading','vocabulary'].includes(label)&&[768,1440].includes(width))await page.screenshot({path:screenshotPath(`speakwise-${label}-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 assert.deepEqual(axe.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),[],`${label} accessibility`);
 await page.screenshot({path:screenshotPath(`speakwise-${label}-390.png`),fullPage:true});
 check(`${label}: eleven viewports 320–1920px + landscape, zero horizontal overflow, Axe clear`);
}
async function openTools(){const close=page.getByRole('button',{name:'教材を閉じる',exact:true});if(!await close.isVisible()){const lessonButton=page.getByRole('button',{name:'教材',exact:true});if(await lessonButton.isVisible())await lessonButton.click();else await page.getByRole('button',{name:'PDF・読む教材・単語を準備',exact:true}).click();}}
async function closeTools(){await page.getByRole('button',{name:'教材を閉じる',exact:true}).click();}
async function send(text){await page.getByRole('textbox',{name:'英語の回答',exact:true}).fill(text);await page.getByRole('button',{name:'送信',exact:true}).click();}
try{
 await page.goto(baseUrl+'/speakwise');
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('#sw-mode')?.disabled);
 await page.locator('#sw-mode').selectOption('pdf_reading');
 await page.locator('#sw-level').selectOption('B1');
 await page.locator('#sw-target-language').selectOption('en');
 await page.getByRole('button',{name:'PDF・読む教材・単語を準備'}).click();
 await page.locator('#sw-pdf-upload').setInputFiles({name:'garden-fixture.pdf',mimeType:'application/pdf',buffer:learningPdf()});
 await page.getByRole('heading',{name:'garden-fixture.pdf'}).waitFor();
 await page.getByText('3ページ · 読み込み完了',{exact:true}).waitFor();
 await geometry('pdf',true);await closeTools();
 let dropWelcome=true;
 await page.route('http://127.0.0.1:8100/api/learning/chat',async route=>{
  if(dropWelcome){dropWelcome=false;const committed=await route.fetch();assert.equal(committed.status(),200);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Synthetic lost welcome response'})});}
  return route.continue();
 });
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).click();
 await page.getByText('Synthetic lost welcome response',{exact:true}).waitFor();
 await page.getByRole('button',{name:'レッスンを始める',exact:true}).click();
 await page.locator('.sw-msg.assistant').first().waitFor();
 assert.equal(await page.locator('.sw-msg.assistant').count(),1);check('lost welcome response retries the committed request without duplicate messages');
 await page.getByRole('button',{name:'終了する',exact:true}).waitFor();
 await send('What does page 3 say about forty liters?');
 await page.locator('.sw-msg.assistant').nth(1).waitFor();
 await page.getByText('出典 p. 3',{exact:true}).first().waitFor();
 await page.reload();await page.getByText('保存したレッスンを再開しました。休止中の時間は学習時間に含めていません。',{exact:true}).waitFor();
 assert.equal(await page.locator('.sw-msg.user').count(),1);check('PDF question uses page references and conversation survives refresh');
 await geometry('conversation');
 await send('create a reading script');
 await page.getByRole('heading',{name:'The city garden',exact:true}).waitFor();
 await page.getByText('読む教材を保存しました。保存済み教材から開き直せます。',{exact:true}).waitFor();
 await page.locator('#sw-answer-0').fill('They visit the city garden.');
 await page.getByRole('button',{name:'回答を保存・参考回答を見る',exact:true}).first().click();
 await page.getByRole('button',{name:'回答を保存済み',exact:true}).waitFor();
 await geometry('reading',true);
 await page.reload();await page.locator('.sw-msg.assistant').first().waitFor();await openTools();
 await page.getByRole('tab',{name:'読む・聞く',exact:true}).click();
 const reopen=page.getByRole('button',{name:'前回の教材を開く',exact:true});if(await reopen.isVisible())await reopen.click();
 await page.getByRole('heading',{name:'The city garden',exact:true}).waitFor();
 await page.getByRole('button',{name:'回答を保存済み',exact:true}).waitFor();check('saved script and comprehension response reopen after refresh');
 await page.getByRole('tab',{name:'VidMatch',exact:true}).click();
 await page.locator('#sw-content-query').fill('garden');await page.getByRole('button',{name:'検索',exact:true}).click();
 const article=page.locator('.sw-resource-card').filter({hasText:'City gardens and water'});await article.waitFor();
 await article.getByRole('button',{name:'レッスンで使う'}).click();await page.getByText('この教材をレッスンの資料に選びました。',{exact:true}).waitFor();
 await geometry('catalog',true);check('VidMatch article activity uses actual catalog body');
 await closeTools();await send('practice water');
 await page.locator('.sw-flashcard').waitFor();
 await page.getByRole('radio').filter({hasNotText:'water'}).first().check();
 await page.getByRole('button',{name:'答えを確認・保存',exact:true}).click();
 await page.getByText('VocabStreamの復習記録に保存しました。',{exact:false}).waitFor();
 await geometry('vocabulary',true);check('natural request opens real vocabulary card and saves shared progress');
 await closeTools();
 await page.setViewportSize({width:390,height:400});
 await page.getByRole('textbox',{name:'英語の回答',exact:true}).focus();
 const box=await page.locator('.sw-composer').boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=401,'composer visible with reduced keyboard-height viewport');
 await page.screenshot({path:screenshotPath('speakwise-keyboard-emulation-390.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});check('reduced viewport keyboard emulation keeps input visible');
 await page.getByRole('button',{name:'終了する',exact:true}).click();await page.getByRole('heading',{name:'Your lesson review',exact:true}).waitFor();
 await page.getByText('学習履歴に保存しました。',{exact:true}).waitFor();await geometry('summary');
 await page.getByRole('button',{name:'次のレッスンを準備',exact:true}).click();
 const preferenceSaved=page.waitForResponse(response=>response.url().endsWith('/api/speakwise/lesson-settings')&&response.request().method()==='PUT'&&response.request().postDataJSON()?.settings?.targetLanguage==='de');
 await page.locator('#sw-target-language').selectOption('de');assert.equal((await preferenceSaved).status(),200);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#sw-target-language')?.value==='de');
 check('confirmed target language persists after completed lesson and refresh');
 await openTools();await page.getByRole('tab',{name:'読む・聞く',exact:true}).click();
 await page.getByRole('button',{name:'保存済み教材を表示',exact:true}).click();
 await page.locator('#sw-saved-script').selectOption({label:'The city garden'});
 await page.getByRole('heading',{name:'The city garden',exact:true}).waitFor();
 await page.getByRole('tab',{name:'PDF',exact:true}).click();
 await page.getByRole('button',{name:'保存済みPDFを表示',exact:true}).click();
 await page.getByRole('button',{name:'PDFと関連教材を削除',exact:true}).click();
 await page.getByText('PDFと、そのPDFから作成した読む教材を削除しました。',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'読む・聞く',exact:true}).click();
 assert.equal(await page.getByRole('heading',{name:'The city garden',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'前回の教材を開く',exact:true}).count(),0);
 check('deleting PDF clears its selected derived script and cached library');
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log(JSON.stringify({environment:'Chrome desktop browser with viewport emulation; actual local services, synthetic external adapters',checks:checks.length,apiRequests:requests.length,browserErrors:errors},null,2));
 console.log('SPEAKWISE_BROWSER_OK');
}catch(error){await page.screenshot({path:screenshotPath('speakwise-failure.png'),fullPage:true});console.error('FAILED_REQUESTS',JSON.stringify(failedRequests));console.error('VISIBLE_FAILURE_STATE',await page.locator('body').innerText());throw error;}
finally{await browser.close();}
