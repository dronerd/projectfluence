import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const routes = [
  ['home', '/'], ['vocabulary', '/vocabstream'],
  ['lessons', '/vocabstream/learn/word-beginner'],
  ['lesson', '/vocabstream/lesson/word-beginner-lesson-1'],
  ['review', '/vocabstream/review'], ['words', '/vocabstream/weak-words'],
  ['speaking', '/speakwise'], ['video', '/vidmatch'], ['history', '/vidmatch/history'],
  ['similar', '/vidmatch/similar/fixture1234'], ['progress', '/analytics'],
  ['password', '/auth/reset-password'], ['privacy', '/privacy'], ['not-found', '/page-does-not-exist'],
];
const widths = [320, 375, 390, 430, 600, 768, 1024, 1180, 1440, 1920];
const problems = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => problems.push({ type: 'runtime', message: error.message }));
  // No live recommendations or learner-data writes in this smoke check.
  await context.route('**/api/vidmatch/recommend**', (route) => route.fulfill({ json: { videos: [] } }));
  for (const [name, route] of routes) {
    await page.goto(baseUrl + route);
    await page.locator("main:not([aria-busy='true'])").waitFor();
    await page.waitForTimeout(300);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 760 ? 812 : 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(60);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > width) problems.push({ name, width, scrollWidth, type: 'overflow' });
    }
    // Fresh navigation avoids Chromium's full-page sticky-element resize artifact.
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 760 ? 812 : 1000 });
      await page.goto(baseUrl + route);
      await page.locator("main:not([aria-busy='true'])").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: screenshotPath(`${name}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const result = await new AxeBuilder({ page }).analyze();
    problems.push(...result.violations.map(({ id, impact, nodes }) => ({ name, type: 'accessibility', id, impact, targets: nodes.map((node) => node.target) })));
    console.log(`Checked ${name}: ${widths.length} widths and accessibility`);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(baseUrl);
  await page.locator("main:not([aria-busy='true'])").waitFor();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  for (let count = 0; count < 12; count++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement === document.body || document.querySelector('dialog').contains(document.activeElement)), true, 'No background page control may receive focus while the dialog is open');
  }
  await dialog.getByRole('button', { name: '新規登録', exact: true }).click();
  await dialog.getByLabel('メールアドレス', { exact: true }).fill('learner@example.com');
  await dialog.getByLabel(/パスワードを作成/).fill('example-password');
  await dialog.getByLabel('パスワードを再入力してください', { exact: true }).fill('another-password');
  await dialog.getByRole('button', { name: '登録', exact: true }).click();
  await dialog.getByText('確認用パスワードが一致しません。', { exact: true }).waitFor();
  const authAxe = await new AxeBuilder({ page }).analyze();
  problems.push(...authAxe.violations.map(({ id, impact }) => ({ name: 'authentication', id, impact })));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: screenshotPath('auth-320.png') });
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'ログイン');
  await page.goto(baseUrl + '/auth/reset-password?type=recovery');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Dedicated recovery page must not open a second recovery dialog');
  await page.goto(baseUrl);
  await page.locator("main:not([aria-busy='true'])").waitFor();
  await page.waitForTimeout(300);
  await page.getByText('AIプロンプト集を使う', { exact: false }).first().click();
  assert.equal(await page.locator('#prompts details').getAttribute('open'), '');
  assert.equal(await page.locator('#prompts pre').count(), 7, 'All original prompt tools remain available');
  console.log('Passed dialog focus, Escape, sign-up validation, recovery-page and resource checks');
} finally {
  await browser.close();
  writeFileSync(screenshotPath('results.json'), JSON.stringify({ routes: routes.length, widths, problems }, null, 2));
}
assert.equal(problems.length, 0, JSON.stringify(problems, null, 2));
