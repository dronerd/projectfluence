/** Full lesson/replay browser regression using local authentication and API fixtures only. */
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeLessonQuestions } from '../apps/vocabstream/src/lib/learning.ts';

const supabaseUrl = process.env.FLUENCE_SUPABASE_URL;
if (!supabaseUrl) throw new Error('Set FLUENCE_SUPABASE_URL to the dummy Supabase URL used for the frontend build.');
for (const value of [baseUrl, supabaseUrl]) {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) throw new Error('This validation only permits local fixture URLs.');
}
const lessonId = 'word-beginner-lesson-1';
const lesson = JSON.parse(fs.readFileSync(new URL('../public/vocabstream/data/word-beginner/Lesson1.json', import.meta.url)));
const questions = makeLessonQuestions(lesson, lessonId);
// This reviewed lesson intentionally retains the original 20-question / 95% regression.
assert.equal(questions.length, 20);
assert.equal(questions.filter(question => question.questionType === 'meaning').length, 10);
assert.equal(questions.filter(question => question.promptMode === 'image').length, 10);
assert.equal(questions.filter(question => question.promptMode === 'sentence').length, 10);
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const expires = Math.floor(Date.now() / 1000) + 3600;
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'learner@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, aud: 'authenticated' })).toString('base64url')}.fixture`;
const session = { access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600, user };
const errors = [];
const unexpectedRequests = [];
const saves = [];

async function installFixtures(context, signedIn) {
  if (signedIn) await context.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), { storageKey, session });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(supabaseUrl).origin) {
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return route.fulfill({ json: user });
      if (url.pathname === '/auth/v1/token' && request.method() === 'POST') return route.fulfill({ json: session });
      unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin !== new URL(baseUrl).origin) {
      unexpectedRequests.push(`Blocked external request: ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === '/api/vocabstream/progress' && request.method() === 'POST') {
      assert(signedIn, 'Guest lessons must not make durable progress writes');
      assert.equal(request.headers().authorization, `Bearer ${token}`);
      const payload = request.postDataJSON();
      saves.push(payload);
      return route.fulfill({ json: { ok: true, lessonAttemptId: payload.attemptId } });
    }
    if (url.pathname === '/api/vocabstream/review' && request.method() === 'GET') {
      assert(signedIn, 'Guest review must not request private data');
      assert.equal(request.headers().authorization, `Bearer ${token}`);
      return route.fulfill({ json: { questions: [], weakWords: [] } });
    }
    if (url.pathname.startsWith('/api/')) {
      unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
}

async function visibleQuestion(page) {
  const prompt = await page.locator('.vs-question-title').textContent();
  const image = page.locator('.vs-vocabulary-image img');
  const imageSource = await image.count() ? await image.getAttribute('src') : null;
  const matching = questions.filter(question => imageSource
    ? question.promptMode === 'image' && question.image.src === imageSource
    : question.promptMode !== 'image' && question.prompt === prompt);
  assert.equal(matching.length, 1, `Expected one curated question for ${imageSource || prompt}`);
  return matching[0];
}

async function answerLesson(page, makeFirstMistake = false, inspectLayout = false) {
  for (let index = 0; index < questions.length; index++) {
    const question = await visibleQuestion(page);
    if (index === 0 && makeFirstMistake) {
      const choices = await page.locator('.vs-choice span[lang="en"]').allTextContents();
      const wrong = choices.findIndex(choice => choice !== question.correctAnswer);
      assert(wrong >= 0);
      await page.locator('.vs-choice').nth(wrong).dblclick({ force: true });
    } else {
      await page.locator('.vs-choice').getByText(question.correctAnswer, { exact: true }).click();
    }
    if (index === 0 && inspectLayout) {
      await page.screenshot({ path: screenshotPath('vocab-answer-320.png'), fullPage: true });
      console.log('question axe', (await new AxeBuilder({ page }).analyze()).violations.map(violation => violation.id));
      await page.setViewportSize({ width: 320, height: 568 });
      await page.getByText('意味・例文を確認', { exact: true }).click();
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    }
    const last = index === questions.length - 1;
    await page.getByRole('button', { name: last ? '結果を見る' : index === 9 ? '次の練習へ' : '次の問題へ', exact: true }).click();
    if (!last && inspectLayout) {
      await page.waitForFunction(() => {
        const prompt = document.querySelector('.vs-question-title');
        const header = document.querySelector('.pf-header');
        if (!prompt || !header) return false;
        const rect = prompt.getBoundingClientRect();
        return document.activeElement === prompt && rect.top >= header.getBoundingClientRect().bottom && rect.bottom <= innerHeight;
      });
    }
  }
  await page.getByText('学習記録を保存しました。', { exact: true }).waitFor();
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  await installFixtures(context, true);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/vocabstream/lesson/${lessonId}`);
  await page.getByRole('button', { name: '単語を学び始める' }).click();
  await page.getByRole('heading', { name: 'apple', exact: true }).waitFor();
  await page.getByText('日本語訳・関連語を見る').click();
  assert(await page.getByText('りんご', { exact: true }).isVisible());
  await page.getByRole('button', { name: '音声を聞く', exact: true }).click();
  await page.getByRole('button', { name: '次の単語へ' }).click();
  await page.getByRole('heading', { name: 'banana', exact: true }).waitFor();
  await page.getByRole('button', { name: '前へ', exact: true }).click();
  await page.getByRole('heading', { name: 'apple', exact: true }).waitFor();
  await page.screenshot({ path: screenshotPath('vocab-slide-320.png'), fullPage: true });
  console.log('slide axe', (await new AxeBuilder({ page }).analyze()).violations.map(violation => violation.id));
  await page.getByRole('button', { name: '2. 意味を選ぶ' }).click();
  await answerLesson(page, false, true);
  await page.getByRole('heading', { name: 'すべて正解です！' }).waitFor();
  assert.equal(await page.locator('.vs-result-score strong').textContent(), '100%');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].quizScore, 10);
  assert.equal(saves[0].meaningScore, 10);
  assert.equal(saves[0].questionAttempts.length, 20);
  assert.equal(saves[0].questionAttempts.at(-1).isCorrect, true, 'The final answer must be included before saving');
  await page.screenshot({ path: screenshotPath('vocab-result-320.png'), fullPage: true });
  console.log('perfect result', saves[0].meaningScore, saves[0].quizScore, 'axe', (await new AxeBuilder({ page }).analyze()).violations.map(violation => violation.id));
  await page.getByRole('button', { name: '次のレッスンへ' }).click();
  await page.getByRole('heading', { name: 'Lesson 2', exact: true }).waitFor();
  await page.getByRole('button', { name: '単語を学び始める' }).waitFor();
  assert.equal(await page.locator('.vs-result-score').count(), 0);
  console.log('next lesson resets');

  await page.goto(`${baseUrl}/vocabstream/lesson/${lessonId}`);
  await page.getByRole('button', { name: 'クイズから始める' }).click();
  await answerLesson(page, true);
  await page.getByRole('heading', { name: '今回の結果', exact: true }).waitFor();
  assert.equal(await page.locator('.vs-result-score strong').textContent(), '95%');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].questionAttempts.length, 20);
  assert.equal(saves[1].questionAttempts.filter(attempt => !attempt.isCorrect).length, 1);
  assert.equal(new Set(saves[1].questionAttempts.map(attempt => attempt.attemptOrder)).size, 20, 'Double clicks must not add duplicate attempts');
  await page.getByRole('button', { name: '間違えた問題を復習する' }).click();
  const replay = await visibleQuestion(page);
  await page.locator('.vs-choice').getByText(replay.correctAnswer, { exact: true }).click();
  await page.getByRole('button', { name: '結果を見る', exact: true }).click();
  await page.getByText('復習も完了しました', { exact: true }).waitFor();
  await page.getByText('学習記録を保存しました。', { exact: true }).waitFor();
  assert.equal(await page.locator('.vs-result-score strong').textContent(), '95%');
  assert.equal(saves.length, 3);
  assert.equal(saves[2].questionAttempts.length, 1);
  assert.equal(saves[2].questionAttempts[0].isReplay, true);
  assert.equal(saves[2].replayCorrect, 1);
  assert.equal(saves[2].replayTotal, 1);
  assert.equal(saves[2].replayCompleted, true);
  assert.equal(new Set(saves.map(save => save.attemptId)).size, 3);
  assert.equal(await page.getByRole('button', { name: '間違えた問題を復習する' }).count(), 0);
  console.log('mistake replay preserves original 95%, records one replay attempt, and prevents double-click duplicates');
  for (const width of [320, 375, 430, 600, 768, 1024, 1180, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Result overflow ${width}`);
  }
  await page.goto(`${baseUrl}/vocabstream/review`);
  await page.getByRole('heading', { name: '次のレッスンから始めましょう' }).waitFor();
  const guest = await browser.newContext();
  await installFixtures(guest, false);
  const guestPage = await guest.newPage();
  guestPage.on('pageerror', error => errors.push(error.message));
  await guestPage.goto(`${baseUrl}/vocabstream/review`);
  await guestPage.getByRole('heading', { name: '自分に合った復習を始めましょう' }).waitFor();
  await page.goto(`${baseUrl}/vocabstream/lesson/word-beginner-lesson-999`);
  await page.getByRole('heading', { name: 'レッスンを読み込めませんでした' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '単語を学び始める' }).count(), 0);
  assert.deepEqual(unexpectedRequests, []);
  assert.deepEqual(errors, []);
  console.log('VOCABULARY_OK: image/curated sentence mapping; perfect/final-answer saves; 95% replay; double-click lock; focus; responsive layout; signed-in/guest review; missing lesson. No external requests or page errors.');
} finally {
  await browser.close();
}
