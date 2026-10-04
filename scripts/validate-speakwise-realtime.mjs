/** Local browser + real lesson persistence. WebRTC/provider events are deterministic fixtures. */
import assert from 'node:assert/strict';
import { chromium, AxeBuilder, baseUrl, screenshotPath } from './browser-tools.mjs';
if (new URL(baseUrl).hostname !== '127.0.0.1') throw new Error('Use the isolated localhost fixture.');
const owner = '00000000-0000-4000-8000-000000000001';
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, aud: 'authenticated' })).toString('base64url')}.fixture`;
const session = { access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: expires, expires_in: 3600, user: { id: owner, aud: 'authenticated', email: 'learner@example.test', app_metadata: { provider: 'email' }, user_metadata: {} } };
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
console.log('CHECK reset fixture');
const reset = await fetch(baseUrl + '/api/speakwise/learner-memory', { method: 'DELETE', headers, body: JSON.stringify({ scope: 'all' }) });
assert.equal(reset.status, 200);
console.log('CHECK browser launch');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(session => {
  localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  const rtc = window.__rtc = { tracks: [], sent: [], peer: null, denied: false };
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => {
    if (rtc.denied) throw new DOMException('Denied', 'NotAllowedError');
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    rtc.tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  } } });
  window.RTCPeerConnection = class {
    constructor() { rtc.peer = this; this.connectionState = 'new'; }
    addTrack() {}
    createDataChannel() {
      this.channel = { readyState: 'connecting', send: data => rtc.sent.push(JSON.parse(data)), close() { this.readyState = 'closed'; this.onclose?.(); } };
      return this.channel;
    }
    async createOffer() { return { type: 'offer', sdp: 'v=0 fixture offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.connectionState = 'connected'; this.channel.readyState = 'open'; this.channel.onopen?.(); }
    close() { this.connectionState = 'closed'; }
  };
  rtc.emit = event => rtc.peer.channel.onmessage?.({ data: JSON.stringify(event) });
}, session);
await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const page = await context.newPage(); page.setDefaultTimeout(15000);
console.log('CHECK browser ready');
const errors = [], signals = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('http://127.0.0.1:8100/api/realtime/calls**', route => {
  const request = route.request();
  const cors = { 'access-control-allow-origin': baseUrl, 'access-control-allow-methods': 'POST,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' };
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  assert.equal(request.headers().authorization, `Bearer ${token}`);
  signals.push(request.method());
  return route.fulfill({ status: 200, headers: cors, json: request.method() === 'DELETE' ? { ok: true } : { sdp: 'v=0 fixture answer', callId: 'rtc_fixture', expiresIn: 300 } });
});
const emit = event => page.evaluate(event => window.__rtc.emit(event), event);
const saved = async () => (await (await fetch(baseUrl + '/api/speakwise/lesson-sessions', { headers })).json()).messages || [];
const waitSaved = async text => {
  for (let i = 0; i < 80; i++) { const messages = await saved(); if (messages.some(m => m.content === text)) return messages; await page.waitForTimeout(100); }
  assert.fail(`Transcript was not persisted: ${text}`);
};
try {
  console.log('CHECK page load');
  await page.goto(baseUrl + '/speakwise');
  console.log('CHECK start lesson');
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent === 'レッスンを始める');
    return button && !button.disabled;
  });
  await page.locator('#sw-mode').selectOption('natural_conversation');
  await page.locator('#sw-target-language').selectOption('en');
  await page.getByRole('button', { name: 'レッスンを始める', exact: true }).click();
  await page.getByRole('button', { name: '音声で会話する', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__rtc.tracks.length), 0, 'No microphone request before explicit click');
  await page.getByRole('button', { name: '音声で会話する', exact: true }).click();
  await page.getByText('聞いています', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__rtc.tracks.length), 1);
  await page.getByRole('button', { name: 'マイクをミュート', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__rtc.tracks[0].enabled), false);
  await page.getByRole('button', { name: 'マイクをオン', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__rtc.tracks[0].enabled), true);
  console.log('PASS explicit microphone activation and mute/unmute');

  for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1440, 900], [1920, 1080], [852, 393]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120); // Let responsive/sticky layers finish painting before screenshots.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const box = await page.locator('.sw-composer').boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= height + 1, 'Composer visible');
    if ([390, 1440].includes(width)) await page.screenshot({ path: screenshotPath(`speakwise-realtime-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map(v => v.id), []);
  console.log('PASS live voice controls: six responsive viewports, visible composer, Axe clear');

  await emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' });
  await emit({ type: 'response.created' });
  await emit({ type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'What did you enjoy?' });
  await emit({ type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'What did you enjoy?' });
  assert.equal((await saved()).some(m => m.content === 'What did you enjoy?'), false, 'Wait for preceding speech transcription');
  await emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'I visited a garden.' });
  await emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'I visited a garden.' });
  await emit({ type: 'response.done', response: { status: 'completed' } });
  let messages = await waitSaved('What did you enjoy?');
  assert.equal(messages.filter(m => m.content === 'I visited a garden.').length, 1);
  assert.ok(messages.findIndex(m => m.content === 'I visited a garden.') < messages.findIndex(m => m.content === 'What did you enjoy?'));
  assert.equal(messages.find(m => m.content === 'I visited a garden.').metadata.inputMethod, 'speech');
  console.log('PASS late speech transcription retains turn order and deduplicates durable messages');

  await page.getByRole('textbox', { name: '英語の回答', exact: true }).fill('The flowers were beautiful.');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await page.waitForFunction(() => window.__rtc.sent.some(event => event.type === 'response.create'));
  const sent = await page.evaluate(() => window.__rtc.sent);
  assert.equal(sent.find(event => event.type === 'conversation.item.create').item.content[0].text, 'The flowers were beautiful.');
  await emit({ type: 'response.output_audio_transcript.done', item_id: 'a2', transcript: 'Which flowers did you see?' });
  await emit({ type: 'response.done', response: { status: 'completed' } });
  await waitSaved('Which flowers did you see?');
  console.log('PASS typed input shares the active voice conversation');

  // A failed transcript save remains retryable; unrelated autosave cannot erase it.
  let failWrite = true;
  await page.route('**/api/speakwise/lesson-sessions', route => {
    const request = route.request();
    if (request.method() === 'PATCH' && request.postDataJSON().messages?.some(m => m.content === 'Keep this reply.') && failWrite) {
      failWrite = false; return route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } });
    }
    return route.continue();
  });
  await emit({ type: 'response.output_audio_transcript.done', item_id: 'a3', transcript: 'Keep this reply.' });
  await page.getByRole('button', { name: '保存を再試行', exact: true }).waitFor();
  await page.getByRole('button', { name: '保存を再試行', exact: true }).click();
  await waitSaved('Keep this reply.');
  assert.equal(await page.evaluate(() => window.__rtc.tracks.every(track => track.stopped)), true);
  console.log('PASS failed transcript save stops capture and retries the same message');

  await page.reload();
  await page.getByText('Keep this reply.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__rtc.tracks.length), 0);
  await page.evaluate(() => { window.__rtc.denied = true; });
  await page.getByRole('button', { name: '音声で会話する', exact: true }).click();
  await page.getByText('マイクの使用が許可されていません。ブラウザの設定で許可するか、文字で入力してください。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '英語の回答', exact: true }).isEnabled(), true);
  await page.evaluate(() => { window.__rtc.denied = false; });
  await page.getByRole('button', { name: '音声で会話する', exact: true }).click();
  await page.getByText('聞いています', { exact: true }).waitFor();
  await page.getByRole('button', { name: '音声会話を終了', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__rtc.tracks.every(track => track.stopped)), true);
  await page.getByRole('button', { name: '終了する', exact: true }).click();
  await page.getByRole('heading', { name: 'Your lesson review', exact: true }).waitFor();
  assert.equal(signals.filter(method => method === 'POST').length, 2);
  assert.ok(signals.includes('DELETE'));
  assert.deepEqual(errors, []);
  console.log('PASS reload keeps transcripts, denied microphone preserves typing, ending lesson closes capture');
  console.log('SPEAKWISE_REALTIME_BROWSER_OK');
} catch (error) { await page.screenshot({path:screenshotPath('speakwise-realtime-failure.png'),fullPage:true}); console.error('VISIBLE_STATE', await page.locator('body').innerText()); console.error('BROWSER_ERRORS', errors); throw error; } finally { await browser.close(); }
