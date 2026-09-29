import assert from 'node:assert/strict';
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let state='results';
  const video={ video_id:'test1',title:'Build confidence in everyday English — a useful conversation for your next trip',channel_name:'English Practice',youtube_url:'https://www.youtube.com/watch?v=test1',thumbnail_url:null,duration:'PT12M30S',level:'B1',skills:['listening','conversation'],topics:['travel'],accent:'American',transcript_available:true,description:'Listen to a friendly conversation and practice useful phrases for everyday situations. '.repeat(4),tags:[],quality_score:80};
  await page.route('**/api/vidmatch/recommend?**',route=>route.fulfill({status:state==='error'?500:200,contentType:'application/json',body:JSON.stringify(state==='error'?{error:'test'}:{videos:state==='empty'?[]:[video,{...video,video_id:'test2'}]})}));
  await page.goto(baseUrl + '/vidmatch');
  await page.getByRole('button',{name:'動画を探す',exact:true}).click();
  await page.getByRole('status').filter({hasText:'2件'}).waitFor();
  const overflow=[];
  for (const width of [320,375,430,768,1024,1440,1920]) {
    await page.setViewportSize({width,height:900}); await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(300);
    overflow.push({width,...await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}))});
    if(width===375||width===1440) await page.screenshot({path:screenshotPath(`vidmatch-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:375,height:812});
  const axe=await new AxeBuilder({page}).analyze();
  state='empty'; await page.getByRole('button',{name:'動画を探す',exact:true}).click(); await page.getByRole('heading',{name:'条件に合う動画が見つかりませんでした'}).waitFor();
  state='error'; await page.getByRole('button',{name:'動画を探す',exact:true}).click(); await page.getByRole('button',{name:'もう一度試す'}).waitFor();
  state='results'; await page.getByRole('button',{name:'もう一度試す'}).click(); await page.getByRole('status').filter({hasText:'2件'}).waitFor();
  await page.getByText('トピック・アクセントなど',{exact:false}).click(); await page.getByLabel('その他のトピック',{exact:true}).fill(Array.from({length:11},(_,i)=>`topic${i}`).join(','));
  if(!await page.getByRole('button',{name:'動画を探す',exact:true}).isDisabled()) throw new Error('Topic limit not enforced');
  await page.goto(baseUrl + '/vidmatch/history'); await page.getByRole('heading',{name:'気になる動画を、また見返そう'}).waitFor();
  await page.goto(baseUrl + '/analytics'); await page.getByRole('heading',{name:'あなたの学びを、ひとつの記録に。'}).waitFor();
  const analyticsAxe=await new AxeBuilder({page}).analyze();
  console.log(JSON.stringify({overflow,videoAxe:axe.violations.map(x=>({id:x.id,description:x.description,nodes:x.nodes.map(n=>n.target)})),analyticsAxe:analyticsAxe.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),functional:'Results, no matches, request failure, retry, topic limits, history sign-in, analytics sign-in passed'},null,2));
  assert.equal(overflow.every(item=>item.scroll===item.client), true, "Horizontal overflow");
  assert.equal(axe.violations.length + analyticsAxe.violations.length, 0, "Accessibility violation");
  await browser.close();
})();
