/**
 * Local guest and signed-in fixture checks; no real authentication or database writes.
 * Start the app with dummy Supabase public configuration, then run:
 * FLUENCE_BROWSER_TOOLS=/tmp/fluence-browser FLUENCE_BASE_URL=http://127.0.0.1:3136 FLUENCE_SUPABASE_URL=http://127.0.0.1:3137 node scripts/validate-vocabstream-curriculum.mjs
 * FLUENCE_SUPABASE_URL must match the dummy URL in the frontend build (default: http://127.0.0.1:3103).
 * Every API/auth request is intercepted. Saved-progress readback is an in-memory fixture,
 * so this validates rendering, payloads, and client sequencing, not database persistence.
 */
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname), 'Use a local server with dummy public credentials.');
const supabaseUrl = process.env.FLUENCE_SUPABASE_URL || 'http://127.0.0.1:3103';
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(supabaseUrl).hostname), 'Use a dummy local Supabase URL.');
const expires = Math.floor(Date.now() / 1000) + 3600;
const fixtureUser = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', email: 'curriculum@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const fixtureToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: fixtureUser.id, exp: expires, aud: 'authenticated' })).toString('base64url')}.fixture`;
const fixtureSession = { access_token: fixtureToken, refresh_token: 'fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600, user: fixtureUser };
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const readLesson = async (category, number) => JSON.parse(await fs.readFile(new URL(`../public/vocabstream/data/${category}/Lesson${number}.json`, import.meta.url), 'utf8'));
const lessonUrl = (category, number) => `${baseUrl}/vocabstream/lesson/${category}-lesson-${number}`;
const widths = [320, 768, 1440];
const courses = [
  ['idioms-beginner', 51], ['idioms-intermediate', 51], ['idioms-advanced', 51], ['idioms-proficiency', 51],
  ['specialized-it', 1], ['specialized-engineering', 1], ['specialized-healthcare', 1],
  ['specialized-business', 1], ['specialized-environment', 1], ['specialized-academic', 1],
].flatMap(([category, number]) => [[category, number], [category, category.startsWith('idioms-') ? 60 : 10]]);
const results = [];
const errors = [];
const unexpectedSaves = [];
const unexpectedRequests = [];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function makeContext(width = 320, height = 900, signedIn = false) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const fixture = {
    writes: [], reads: [],
    progress: new Map([
      ['idioms-beginner-lesson-1', { lessonId: 'idioms-beginner-lesson-1', percentScore: 75, totalPossible: 20, updatedAt: '2026-01-01T00:00:00.000Z' }],
      ['word-beginner-lesson-1', { lessonId: 'word-beginner-lesson-1', percentScore: 80, totalPossible: 20, updatedAt: '2026-01-01T00:00:00.000Z' }],
    ]),
  };
  if (signedIn) await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: fixtureSession });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === new URL(supabaseUrl).origin && url.pathname.startsWith('/auth/v1/')) {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      return route.fulfill({ status: signedIn ? 200 : 401, headers, json: signedIn ? (url.pathname.endsWith('/token') ? fixtureSession : fixtureUser) : { error: 'No guest fixture session.' } });
    }
    if (url.origin === new URL(baseUrl).origin && url.pathname === '/api/vocabstream/progress' && method === 'POST') {
      const body = request.postDataJSON();
      if (!signedIn) {
        unexpectedSaves.push(body);
        return route.fulfill({ status: 503, json: { error: 'Guest validation does not write progress.' } });
      }
      assert.equal(request.headers().authorization, `Bearer ${fixtureToken}`);
      fixture.writes.push(body);
      const total = body.meaningTotal + body.quizTotal;
      fixture.progress.set(body.lessonId, { lessonId: body.lessonId, totalPossible: total, percentScore: total ? Math.round((body.meaningScore + body.quizScore) / total * 100) : 0, updatedAt: new Date().toISOString() });
      return route.fulfill({ status: 200, json: { ok: true, lessonAttemptId: body.attemptId } });
    }
    if (url.origin === new URL(baseUrl).origin && url.pathname === '/api/vocabstream/lesson-progress' && method === 'GET' && signedIn) {
      assert.equal(request.headers().authorization, `Bearer ${fixtureToken}`);
      const category = url.searchParams.get('genre');
      fixture.reads.push(category);
      return route.fulfill({ status: 200, json: { progress: [...fixture.progress.values()].filter(item => item.lessonId.startsWith(`${category}-lesson-`)) } });
    }
    if (url.origin === new URL(baseUrl).origin && url.pathname === '/api/vocabstream/review' && method === 'GET' && signedIn) {
      return route.fulfill({ status: 200, json: { questions: [], weakWords: [
        { word: 'get up', definition: 'to leave your bed after sleeping', sourceCategory: 'idioms-beginner', sourceLessonNumber: 51, sourceLessonId: 'idioms-beginner-lesson-51', mistakeCount: 2 },
        { word: 'apple', definition: 'a round fruit', sourceCategory: 'idioms-beginner', sourceLessonNumber: 1, sourceLessonId: 'idioms-beginner-lesson-1', mistakeCount: 1 },
      ] } });
    }
    // Never fall through to a real API, auth service, cross-origin host, or mutation.
    if (url.origin !== new URL(baseUrl).origin || /\/(?:api|auth)\//.test(url.pathname) || !['GET', 'HEAD'].includes(method)) {
      unexpectedRequests.push(`${method} ${url.origin}${url.pathname}`);
      return route.fulfill({ status: 503, json: { error: 'No network fixture is defined for this request.' } });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, fixture };
}

async function checkLayout(page, name, width) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow at ${width}`);
  const axe = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(axe.violations.map(({ id, impact }) => ({ id, impact })), [], `${name}: accessibility at ${width}`);
  await page.screenshot({ path: screenshotPath(`${name}-${width}.png`), fullPage: true });
  results.push({ page: name, width, axeViolations: 0, horizontalOverflow: false });
}

async function waitForImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('.vs-vocabulary-image img');
    return image?.complete && image.naturalWidth > 0;
  });
}

async function completeLesson(page, lesson, name, persistence = 'guest; no database write') {
  const total = Number(await page.locator('.vs-progress').getAttribute('max'));
  assert(total > 0, `${name}: no questions`);
  let images = 0, sentences = 0;
  for (let index = 0; index < total; index++) {
    const prompt = await page.locator('.vs-question-title').innerText();
    const image = page.locator('.vs-vocabulary-image img');
    let word, answerText;
    if (await image.count()) {
      const src = await image.getAttribute('src');
      word = lesson.words.find(item => item.image?.src === src);
      answerText = word?.word;
      images++;
    } else if (prompt.includes('____')) {
      word = lesson.words.find(item => item.sentencePractice?.prompt === prompt || item.exampleGap?.prompt === prompt);
      answerText = word?.sentencePractice ? word.word : word?.exampleGap?.answer;
      if (!word) {
        const options = await page.locator('.vs-choice span[lang="en"]').allTextContents();
        for (const option of options) {
          word = lesson.words.find(item => item.example === prompt.replace('____', option));
          if (word) { answerText = option; break; }
        }
      }
      sentences++;
    } else {
      word = lesson.words.find(item => item.meaning === prompt || item.japaneseMeaning === prompt);
      answerText = word?.word;
    }
    assert(word, `${name}: unknown question ${prompt}`);
    assert(answerText, `${name}: no answer for ${prompt}`);
    await page.locator('.vs-choice').getByText(answerText, { exact: true }).click();
    await page.getByRole('button', { name: /^(次の問題へ|次の練習へ|結果を見る)/ }).click();
  }
  await page.getByRole('heading', { name: 'すべて正解です！' }).waitFor();
  assert.equal(await page.locator('.vs-result-score strong').innerText(), '100%');
  assert(sentences > 0, `${name}: sentence gaps were not exercised`);
  results.push({ flow: name, total, imageQuestions: images, sentenceQuestions: sentences, score: '100%', persistence });
  return { total, images, sentences };
}

async function verifySignedInCurriculum() {
  const { context, page, fixture } = await makeContext(320, 900, true);
  const expectedPayloadKeys = ['attemptId', 'lessonId', 'genre', 'lessonNumber', 'lessonTitle', 'wordCount', 'meaningScore', 'meaningTotal', 'quizScore', 'quizTotal', 'replayCompleted', 'replayCorrect', 'replayTotal', 'questionAttempts'].sort();
  const savedLessons = [['idioms-beginner', 51], ['idioms-beginner', 60], ['specialized-it', 10]];
  for (const [category, number] of savedLessons) {
    const lesson = await readLesson(category, number), lessonId = `${category}-lesson-${number}`;
    const before = fixture.writes.length;
    await page.goto(lessonUrl(category, number));
    await page.getByRole('heading', { name: `Lesson ${category.startsWith('idioms-') ? number - 50 : number}`, exact: true, level: 1 }).waitFor();
    const completedCardNumber = category.startsWith('idioms-') ? number - 50 : number;
    await page.getByRole('button', { name: 'クイズから始める' }).click();
    const completed = await completeLesson(page, lesson, `${category} signed-in fixture completion`, 'mock API write and in-memory readback; no real database');
    await page.getByText('学習記録を保存しました。', { exact: true }).waitFor();
    assert.equal(fixture.writes.length, before + 1, 'Exactly one batch must be saved for the completed lesson.');
    const body = fixture.writes.at(-1);
    assert.deepEqual(Object.keys(body).sort(), expectedPayloadKeys);
    assert.match(body.attemptId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(body.lessonId, lessonId); assert.equal(body.genre, category); assert.equal(body.lessonNumber, number);
    assert.equal(body.lessonTitle, category.startsWith('idioms-') ? `Lesson ${number - 50}` : lesson.title); assert.equal(body.wordCount, lesson.words.length);
    assert.equal(body.meaningTotal, completed.total - completed.sentences); assert.equal(body.meaningScore, body.meaningTotal);
    assert.equal(body.quizTotal, completed.sentences); assert.equal(body.quizScore, body.quizTotal);
    assert.equal(body.replayCompleted, false); assert.equal(body.replayCorrect, 0); assert.equal(body.replayTotal, 0);
    assert.equal(body.questionAttempts.length, completed.total);
    assert.equal(new Set(body.questionAttempts.map(attempt => attempt.questionId)).size, completed.total);
    for (const [index, attempt] of body.questionAttempts.entries()) {
      assert.equal(attempt.sourceCategory, category); assert.equal(attempt.sourceLessonId, lessonId); assert.equal(attempt.sourceLessonNumber, number);
      assert.equal(attempt.attemptOrder, index + 1); assert.equal(attempt.isReplay, false); assert.equal(attempt.isCorrect, true);
      const sourceWord = lesson.words.find(word => word.word === attempt.word);
      assert(sourceWord);
      if (attempt.questionType === 'meaning' || sourceWord.sentencePractice) assert.equal(attempt.word, attempt.correctAnswer);
      else if (sourceWord.exampleGap) assert.equal(attempt.correctAnswer, sourceWord.exampleGap.answer);
      else assert.equal(attempt.prompt.replace('____', attempt.correctAnswer), sourceWord.example);
      assert.equal(attempt.selectedAnswer, attempt.correctAnswer);
      assert(attempt.choices.includes(attempt.correctAnswer)); assert(Number.isFinite(Date.parse(attempt.answeredAt)));
      assert(!('image' in attempt), 'Image metadata must not become persisted progress state.');
      if (attempt.questionType === 'quiz') assert.match(attempt.prompt, /____/);
    }
    await page.getByRole('link', { name: 'レッスン一覧へ', exact: true }).click();
    const card = page.locator(`.vs-lesson-card[href="/vocabstream/lesson/${lessonId}"]`);
    await card.getByText('学習済み · 正答率 100%', { exact: true }).waitFor();
    assert.equal(await card.locator('.vs-lesson-number').innerText(), `Lesson ${completedCardNumber}`);
    const reads = fixture.reads.length;
    await page.reload();
    await card.getByText('学習済み · 正答率 100%', { exact: true }).waitFor();
    assert(fixture.reads.length > reads, 'Reload must fetch the mocked saved progress.');
    assert.equal(fixture.writes.length, before + 1, 'Opening and reloading the course must not resubmit a lesson.');
    results.push({ flow: `${category} payload identity and completed-card reload`, lessonId, savedQuestions: completed.total, pass: true, persistence: 'intercepted API plus in-memory fixture only' });
  }
  await page.goto(`${baseUrl}/vocabstream/learn/idioms-beginner`);
  await page.locator('.vs-lesson-card').first().waitFor();
  assert.deepEqual(await page.locator('.vs-lesson-number').allTextContents(), Array.from({ length: 10 }, (_, i) => `Lesson ${i + 1}`));
  assert.equal(await page.locator('#vs-lesson-group option').innerText(), 'Lesson 1–10');
  assert.equal(await page.getByText('以前のレッスンと学習記録も確認できます。').count(), 0);
  assert.equal(await page.getByRole('button', { name: '以前のレッスン・学習記録を見る' }).count(), 0);
  assert.equal(await page.locator('.vs-lesson-card[href="/vocabstream/lesson/idioms-beginner-lesson-1"]').count(), 0);
  await page.locator('.vs-lesson-card[href="/vocabstream/lesson/idioms-beginner-lesson-51"]').getByText('学習済み · 正答率 100%', { exact: true }).waitFor();
  assert.equal(fixture.progress.get('idioms-beginner-lesson-1')?.percentScore, 75);
  // Follow the actual in-app course navigation after confirming that the list
  // exposes only the current expression curriculum.
  await page.getByRole('link', { name: '← レベルを選ぶ', exact: true }).click();
  await page.locator('.vs-course[href="/vocabstream/learn/word-beginner"]').click();
  await page.locator('.vs-lesson-card[href="/vocabstream/lesson/word-beginner-lesson-1"]').getByText('学習済み · 正答率 80%', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '新しい熟語レッスンを見る' }).count(), 0);
  assert.equal(await page.locator('.vs-lesson-card').count(), 20);
  assert.equal(fixture.writes.length, savedLessons.length);
  results.push({ flow: 'archived lesson hidden from the course list while saved progress is retained', oldLessonId: 'idioms-beginner-lesson-1', oldScore: 75, pass: true, persistence: 'preloaded historical fixture, not a live account' });
  await page.goto(`${baseUrl}/vocabstream/weak-words`);
  const currentWord = page.locator('.vs-weak-card').filter({ has: page.getByRole('heading', { name: 'get up', exact: true }) });
  await currentWord.waitFor();
  assert.match(await currentWord.locator('p').first().innerText(), / · Lesson 1$/);
  const previousWord = page.locator('.vs-weak-card').filter({ has: page.getByRole('heading', { name: 'apple', exact: true }) });
  assert.match(await previousWord.locator('p').first().innerText(), / · 以前の Lesson 1$/);
  results.push({ flow: 'review word labels distinguish current Lesson 1 from archived Lesson 1', pass: true });
  await context.close();
}

try {
  const beginner = await readLesson('word-beginner', 1);
  for (const width of widths) {
    const { context, page } = await makeContext(width);
    await page.goto(lessonUrl('word-beginner', 1));
    await page.getByRole('button', { name: '単語を学び始める' }).click();
    await waitForImage(page);
    assert.equal(await page.locator('.vs-word-title').innerText(), 'apple');
    assert.equal(await page.locator('.vs-vocabulary-image img').getAttribute('alt'), beginner.words[0].image.alt);
    await checkLayout(page, 'curriculum-image-card', width);
    await page.getByRole('button', { name: '2. 意味を選ぶ', exact: true }).click();
    await page.getByRole('heading', { name: '画像に合う英単語を選んでください。' }).waitFor();
    await waitForImage(page);
    assert.equal(await page.locator('.vs-choices .vs-choice').count(), 3);
    assert.equal(await page.locator('.vs-vocabulary-image details').getAttribute('open'), null);
    await checkLayout(page, 'curriculum-image-question', width);
    if (width === 320) await completeLesson(page, beginner, 'beginner image and sentence lesson');
    await context.close();
  }

  for (const [category, number] of courses) {
    const lesson = await readLesson(category, number);
    const { context, page } = await makeContext();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(lessonUrl(category, number));
      await page.getByRole('button', { name: '単語を学び始める' }).click();
      await page.getByRole('heading', { name: lesson.words[0].word, exact: true }).waitFor();
      await checkLayout(page, `${category}-lesson-${number}-card`, width);
      await page.getByRole('button', { name: '2. 意味を選ぶ', exact: true }).click();
      await page.locator('.vs-question-title').waitFor();
      await checkLayout(page, `${category}-lesson-${number}-question`, width);
    }
    if (['idioms-beginner', 'specialized-it'].includes(category)) await completeLesson(page, lesson, `${category} complete lesson`);
    await context.close();
    console.log(`Verified ${category} lesson ${number} cards and practice at ${widths.join('/')}.`);
  }

  // Decode every local illustration through the browser, then exercise additional
  // animal/household images in actual cards and image questions at each viewport.
  const manifest = JSON.parse(await fs.readFile(new URL('../public/vocabstream/images/manifest.json', import.meta.url), 'utf8'));
  const pictures = [...new Set(manifest.images.map(item => item.image.src))];
  assert(pictures.length > 370);
  const artwork = await makeContext();
  await artwork.page.goto(lessonUrl('word-beginner', 8));
  const decoded = await artwork.page.evaluate(async sources => Promise.all(sources.map(src => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ src, loaded: image.naturalWidth > 0 && image.naturalHeight > 0 });
    image.onerror = () => resolve({ src, loaded: false });
    image.src = src;
  }))), pictures);
  assert(decoded.every(item => item.loaded), JSON.stringify(decoded.filter(item => !item.loaded)));
  results.push({ flow: 'all local vocabulary illustrations load and decode', files: pictures.length, pass: true });
  for (const number of [8, 26, 70]) {
    const lesson = await readLesson('word-beginner', number);
    const pictureIndex = lesson.words.findIndex(word => word.image);
    assert(pictureIndex >= 0);
    for (const width of widths) {
      await artwork.page.setViewportSize({ width, height: 900 });
      await artwork.page.goto(lessonUrl('word-beginner', number));
      await artwork.page.getByRole('button', { name: '単語を学び始める' }).click();
      for (let index = 0; index < pictureIndex; index++) await artwork.page.getByRole('button', { name: /次の単語へ/ }).click();
      await waitForImage(artwork.page);
      await checkLayout(artwork.page, `expanded-image-lesson-${number}`, width);
    }
  }
  await artwork.page.goto(lessonUrl('word-beginner', 8));
  await artwork.page.getByRole('button', { name: 'クイズから始める' }).click();
  await waitForImage(artwork.page);
  const animalLesson = await readLesson('word-beginner', 8);
  // Match the rendered source to the entry, rather than relying on randomized order.
  const renderedSource = await artwork.page.locator('.vs-vocabulary-image img').getAttribute('src');
  const animalAnswer = animalLesson.words.find(word => word.image?.src === renderedSource);
  assert(animalAnswer);
  await artwork.page.locator('.vs-choice').getByText(animalAnswer.word, { exact: true }).click();
  assert.equal(await artwork.page.locator('.vs-answer-feedback').innerText(), '正解です！');
  results.push({ flow: 'expanded animal image question validates the correct answer', pass: true });
  await artwork.context.close();

  const { context, page } = await makeContext(320, 568);
  await page.route('**/vocabstream/images/apple.svg', route => route.fulfill({ status: 404, body: 'Intentional missing-image fixture.' }));
  await page.goto(lessonUrl('word-beginner', 1));
  await page.getByRole('button', { name: '単語を学び始める' }).click();
  await page.locator('.vs-image-fallback').waitFor();
  assert.equal(await page.locator('.vs-image-fallback strong').innerText(), beginner.words[0].image.alt);
  await page.getByRole('button', { name: /次の単語へ/ }).click();
  await waitForImage(page);
  assert.equal(await page.locator('.vs-image-fallback').count(), 0);
  results.push({ flow: 'missing card image and next-source recovery', pass: true });

  await page.route('**/vocabstream/images/*.svg', route => route.fulfill({ status: 404, body: 'Intentional missing-image fixture.' }));
  await page.goto(lessonUrl('word-beginner', 1));
  await page.getByRole('button', { name: 'クイズから始める' }).click();
  await page.locator('.vs-image-fallback').waitFor();
  const description = await page.locator('.vs-image-fallback strong').innerText();
  const answer = beginner.words.find(word => word.image?.alt === description);
  assert(answer);
  await page.locator('.vs-choice').getByText(answer.word, { exact: true }).click();
  assert.equal(await page.locator('.vs-answer-feedback').innerText(), '正解です！');
  results.push({ flow: 'missing quiz image remains answerable at 320x568', pass: true });

  await page.goto(lessonUrl('word-beginner', 6));
  await page.getByRole('button', { name: 'クイズから始める' }).waitFor();
  assert.equal(await page.getByText('例文は単語カードで確認できます。').count(), 0);
  assert.equal(await page.getByText('例文で確認', { exact: true }).count(), 1);
  results.push({ flow: 'all examples are checked with sentence gaps', pass: true });

  await page.goto(lessonUrl('idioms-beginner', 1));
  await page.getByRole('link', { name: '新しい熟語レッスンへ' }).waitFor();
  assert.equal(await page.getByRole('link', { name: '新しい熟語レッスンへ' }).getAttribute('href'), '/vocabstream/lesson/idioms-beginner-lesson-51');
  results.push({ flow: 'legacy lesson is still addressable and links to new curriculum', pass: true });

  await page.route('**/vocabstream/data/word-beginner/Lesson1.json', route => route.fulfill({
    status: 200,
    json: { title: 'No eligible questions fixture', words: [{ word: 'apple', meaning: 'a fruit', example: 'I ate an apple.' }] },
  }));
  await page.goto(lessonUrl('word-beginner', 1));
  await page.getByRole('button', { name: '単語を学び始める' }).click();
  await page.getByRole('button', { name: '学習を終える' }).click();
  await page.getByRole('heading', { name: '単語の確認が完了しました' }).waitFor();
  assert.equal(await page.locator('.vs-result-score').count(), 0);
  assert.equal(await page.locator('.vs-result-breakdown').count(), 0);
  assert((await page.locator('.vs-practice-panel').innerText()).includes('採点や学習記録の保存はありません。'));
  results.push({ flow: 'zero questions do not claim a score or saved progress', pass: true });
  await context.close();
  await verifySignedInCurriculum();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedSaves, []);
  assert.deepEqual(unexpectedRequests, []);
  const report = { results, pageErrors: errors, unexpectedWrites: unexpectedSaves.length, unexpectedRequests, limitations: 'Local Chromium with guest and synthetic signed-in sessions. All API/auth requests intercepted; save/readback is in-memory. No live authentication, Supabase persistence, or physical-device certification.' };
  await fs.writeFile(screenshotPath('vocabstream-curriculum-results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
