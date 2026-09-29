import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const lesson = JSON.parse(fs.readFileSync(new URL('../public/vocabstream/data/word-beginner/Lesson1.json', import.meta.url)));
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const context = await browser.newContext({viewport:{width:320,height:800}});
 const page = await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const saves=[];
 await page.route('**/api/vocabstream/progress',async route=>{saves.push(route.request().postDataJSON());await route.fulfill({json:{ok:true,lessonAttemptId:'fixture'}})});
 await page.goto(baseUrl + '/vocabstream/lesson/word-beginner-lesson-1');
 await page.getByRole('button',{name:'単語を学び始める'}).click();
 await page.getByRole('heading',{name:'apple',exact:true}).waitFor();
 await page.getByText('日本語訳・関連語を見る').click();
 assert(await page.getByText('りんご',{exact:true}).isVisible());
 await page.getByRole('button',{name:'音声を聞く',exact:true}).click();
 await page.getByRole('button',{name:'次の単語へ'}).click();
 await page.getByRole('heading',{name:'banana',exact:true}).waitFor();
 await page.getByRole('button',{name:'前へ',exact:true}).click();
 await page.getByRole('heading',{name:'apple',exact:true}).waitFor();
 await page.screenshot({path:screenshotPath('vocab-slide-320.png'),fullPage:true});
 console.log('slide axe', (await new AxeBuilder({page}).analyze()).violations.map(v=>v.id));
 await page.getByRole('button',{name:'2. 意味を選ぶ'}).click();
 for(let i=0;i<20;i++) {
  const prompt=await page.locator('.vs-question-title').textContent();
  const word=lesson.words.find(w=>w.meaning===prompt || w.example.replace(new RegExp(w.word,'i'),'____')===prompt);
  assert(word,`Unknown prompt ${prompt}`);
  await page.locator('.vs-choice').getByText(word.word,{exact:true}).click();
  if(i===0){await page.screenshot({path:screenshotPath('vocab-answer-320.png'),fullPage:true});console.log('question axe', (await new AxeBuilder({page}).analyze()).violations.map(v=>v.id));}
  await page.getByRole('button',{name:i===19?'結果を見る':i===9?'次の練習へ':'次の問題へ',exact:true}).click();
 }
 await page.getByRole('heading',{name:'すべて正解です！'}).waitFor();
 assert.equal(await page.locator('.vs-result-score strong').textContent(),'100%');
 assert.equal(saves[0].quizScore,10);assert.equal(saves[0].meaningScore,10);assert.equal(saves[0].questionAttempts.length,20);
 await page.screenshot({path:screenshotPath('vocab-result-320.png'),fullPage:true});
 console.log('perfect result',saves[0].meaningScore,saves[0].quizScore,'axe',(await new AxeBuilder({page}).analyze()).violations.map(v=>v.id));
 await page.getByRole('button',{name:'次のレッスンへ'}).click();
 await page.getByRole('heading',{name:'Lesson 2',exact:true}).waitFor();
 await page.getByRole('button',{name:'単語を学び始める'}).waitFor();
 assert.equal(await page.locator('.vs-result-score').count(),0);
 console.log('next lesson resets');
 await page.goto(baseUrl + '/vocabstream/lesson/word-beginner-lesson-1');
 await page.getByRole('button',{name:'クイズから始める'}).click();
 for(let i=0;i<20;i++) {
  const prompt=await page.locator('.vs-question-title').textContent();
  const word=lesson.words.find(w=>w.meaning===prompt || w.example.replace(new RegExp(w.word,'i'),'____')===prompt);
  if(i===0){await page.locator('.vs-choice').filter({hasNotText:word.word}).first().dblclick({force:true});}
  else await page.locator('.vs-choice').getByText(word.word,{exact:true}).click();
  await page.getByRole('button',{name:i===19?'結果を見る':i===9?'次の練習へ':'次の問題へ',exact:true}).click();
 }
 await page.getByRole('heading',{name:'レッスン完了',exact:true}).waitFor();
 assert.equal(await page.locator('.vs-result-score strong').textContent(),'95%');
 assert.equal(saves[1].questionAttempts.length,20);
 await page.getByRole('button',{name:'間違えた問題を復習する'}).click();
 const prompt=await page.locator('.vs-question-title').textContent();const correct=lesson.words.find(w=>w.meaning===prompt || w.example.replace(new RegExp(w.word,'i'),'____')===prompt);
 await page.locator('.vs-choice').getByText(correct.word,{exact:true}).click();await page.getByRole('button',{name:'結果を見る',exact:true}).click();
 await page.getByText('復習も完了しました',{exact:true}).waitFor();
 assert.equal(await page.locator('.vs-result-score strong').textContent(),'95%');
 await page.waitForTimeout(300);
 assert.equal(saves[2].questionAttempts.length,1);assert.equal(saves[2].replayCorrect,1);assert.equal(saves[2].replayTotal,1);assert.equal(saves[2].replayCompleted,true);
 assert.equal(await page.getByRole('button',{name:'間違えた問題を復習する'}).count(),0);
 console.log('mistake replay preserves original95%, records 1 replay attempt, no duplicates');
 for(const width of [320,375,430,600,768,1024,1180,1440,1920]) {await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Result overflow ${width}`);}
 await page.goto(baseUrl + '/vocabstream/review');await page.getByRole('heading',{name:'自分に合った復習を始めましょう'}).waitFor();
 await page.goto(baseUrl + '/vocabstream/lesson/word-beginner-lesson-999');await page.getByRole('heading',{name:'レッスンを読み込めませんでした'}).waitFor();assert.equal(await page.getByRole('button',{name:'単語を学び始める'}).count(),0);
 console.log('auth and missing lesson states pass; pageerrors',errors);assert.equal(errors.length,0);
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
