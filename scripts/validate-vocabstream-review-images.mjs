/** Local browser fixtures exercise image hydration, review, feedback and result review.
 * Uses repository content and the production question builder; no hosted writes.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import { hydrateReviewWords } from '../apps/vocabstream/src/lib/reviewPolicy.ts';
import { buildWordQuestions } from '../apps/vocabstream/src/lib/questionPolicy.ts';

const supabaseUrl = process.env.FLUENCE_SUPABASE_URL || 'http://127.0.0.1:3137';
for (const address of [baseUrl, supabaseUrl]) assert(['127.0.0.1', 'localhost'].includes(new URL(address).hostname), 'Local dummy servers only.');
const root = new URL('../public/vocabstream/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('images/manifest.json', root), 'utf8'));
const chosen = [
  manifest.images.find(item => item.image.license === 'CC-BY-4.0' && item.role === 'meaning'),
  manifest.images.find(item => item.category === 'word-intermediate' && item.role === 'supporting'),
  manifest.images.find(item => item.word === 'apple'),
];
assert(chosen.every(Boolean));
const catalog = [];
for (const item of chosen) {
  const lesson = JSON.parse(await readFile(new URL(`data/${item.category}/Lesson${item.lessonNumber}.json`, root), 'utf8'));
  catalog.push(...lesson.words.map(word => ({ ...word, sourceCategory: item.category, sourceLessonId: `${item.category}-lesson-${item.lessonNumber}`, sourceLessonNumber: item.lessonNumber })));
}
const weakWords = hydrateReviewWords(chosen.map((item, i) => ({ id: `historical-fixture-${i}`, word: item.word, definition: 'Old saved meaning', example: null, explanation: null, source_category: item.category, source_lesson_id: `${item.category}-lesson-${item.lessonNumber}`, source_lesson_number: item.lessonNumber, mistake_count: 5, last_mistaken_at: '2026-01-01T00:00:00Z' })), catalog);
const questions = weakWords.map((word, i) => buildWordQuestions(word, catalog, { category: word.sourceCategory, lessonId: word.sourceLessonId, lessonNumber: word.sourceLessonNumber }, String(i)).find(question => question.questionType === (i === 2 ? 'quiz' : 'meaning')));
assert(questions.every(Boolean));
assert.deepEqual(questions.map(question => question.promptMode), ['image', 'text', 'sentence']);
const expires = Math.floor(Date.now()/1000) + 3600;
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'review@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:expires,aud:'authenticated'})).toString('base64url')}.fixture`;
const session = { access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600, user };
const results = [], errors = [], unexpected = [];
const browser = await chromium.launch({channel:'chrome',headless:true});
const imageLoaded = async locator => { await locator.scrollIntoViewIfNeeded(); await locator.evaluate(image => image.decode()); assert(await locator.evaluate(image => image.naturalWidth > 0)); };
async function check(page, label, width) {
  // App Router can commit the new view before its streamed head metadata.
  await page.waitForFunction(() => document.title.trim().length > 0, undefined, {timeout:5000});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);
  const axe = await new AxeBuilder({page}).analyze();
  assert.deepEqual(axe.violations.map(({id,impact})=>({id,impact})), [], label);
  await page.screenshot({path:screenshotPath(`${label}-${width}.png`),fullPage:true});
  results.push({label,width,pass:true});
}
try {
  for (const width of [320,768,1440]) {
    const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    await context.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key:`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`,session});
    const writes = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.origin === new URL(supabaseUrl).origin && url.pathname.startsWith('/auth/v1/')) {
        const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
        return method === 'OPTIONS' ? route.fulfill({status:204,headers}) : route.fulfill({status:200,headers,json:url.pathname.endsWith('/token')?session:user});
      }
      if (url.origin === new URL(baseUrl).origin && url.pathname === '/api/vocabstream/review' && method === 'GET') return route.fulfill({status:200,json:{weakWords,questions}});
      if (url.origin === new URL(baseUrl).origin && url.pathname === '/api/vocabstream/progress' && method === 'POST') {
        assert.equal(request.headers().authorization,`Bearer ${token}`); writes.push(request.postDataJSON()); return route.fulfill({status:200,json:{ok:true}});
      }
      if (url.origin !== new URL(baseUrl).origin || /\/(?:api|auth)\//.test(url.pathname) || !['GET','HEAD'].includes(method)) {
        unexpected.push(`${method} ${url.origin}${url.pathname}`); return route.fulfill({status:503,json:{error:'No fixture'}});
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error=>errors.push(error.message));
    for (const word of weakWords.slice(0,2)) {
      await page.goto(`${baseUrl}/vocabstream/lesson/${word.sourceLessonId}`);
      await page.getByRole('button',{name:'単語を学び始める'}).click();
      const position=catalog.filter(item=>item.sourceLessonId===word.sourceLessonId).findIndex(item=>item.word===word.word);
      assert(position>=0);
      for(let index=0;index<position;index++)await page.getByRole('button',{name:/次の単語へ/}).click();
      await imageLoaded(page.locator('.vs-vocabulary-image img'));
      assert.equal(await page.locator('.vs-word-title').innerText(),word.word);
      assert.equal(await page.locator('.vs-vocabulary-image img').getAttribute('src'),word.image.src);
      await check(page,`expanded-study-card-${word.sourceCategory}`,width);
    }
    await page.goto(`${baseUrl}/vocabstream/weak-words`);
    await page.locator('.vs-weak-card').first().waitFor();
    assert.equal(await page.locator('.vs-weak-card').count(),3);
    for (const [index, word] of weakWords.entries()) {
      const card = page.locator('.vs-weak-card').nth(index);
      assert.equal(await card.locator('img').getAttribute('src'),word.image.src);
      assert.equal(await card.locator('img').getAttribute('loading'),'lazy');
      await imageLoaded(card.locator('img'));
    }
    await check(page,'review-saved-word-images',width);
    await page.getByRole('link',{name:/^復習を始める/}).click();
    await page.getByRole('button',{name:/^復習を始める/}).click();
    for (const [index, question] of questions.entries()) {
      await page.locator('.vs-question-title').waitFor();
      assert.equal(await page.locator('.vs-vocabulary-image img').count(),index===0?1:0,'Supporting images must not reveal answers before text/sentence assessment.');
      if(index===0) {
        await imageLoaded(page.locator('.vs-vocabulary-image img'));
        assert.equal(await page.locator('.vs-image-credit a').last().getAttribute('href'),'https://creativecommons.org/licenses/by/4.0/');
        await check(page,'review-image-question-and-credit',width);
      }
      await page.locator('.vs-choice').getByText(question.correctAnswer,{exact:true}).click();
      await imageLoaded(page.locator('.vs-vocabulary-image img'));
      assert.equal(await page.locator('.vs-vocabulary-image img').getAttribute('src'),question.image.src);
      await check(page,`review-image-feedback-${question.promptMode}`,width);
      await page.getByRole('button',{name:/^(次の問題へ|復習の結果を見る)/}).click();
    }
    await page.getByText('学習記録を保存しました。',{exact:true}).waitFor();
    assert.equal(writes.length,1); assert.equal(writes[0].lessonId,'vocabstream-review');
    assert.equal(writes[0].questionAttempts.length,3);
    for(const [index,attempt] of writes[0].questionAttempts.entries()) {
      assert.equal(attempt.sourceLessonId,questions[index].sourceLessonId);
      assert.equal(attempt.word,questions[index].word);
      assert(!('image' in attempt) && !('imageRole' in attempt));
    }
    await page.getByText('今回の回答を振り返る（3 問）',{exact:true}).click();
    assert.equal(await page.locator('.vs-result-attempt img').count(),3);
    for(const image of await page.locator('.vs-result-attempt img').all()) await imageLoaded(image);
    await check(page,'review-result-images',width);
    await context.close();
  }
  assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
  const report = {results,pageErrors:errors,unexpectedRequests:unexpected,limitations:'Local Chromium; synthetic signed-in session, exact catalog hydration, intercepted API saves. No hosted persistence or physical-device certification.'};
  await writeFile(screenshotPath('vocabstream-review-images-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
