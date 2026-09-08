import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit } from '@playwright/test';
import { hashPin, createSessionToken, verifySessionToken, migrateCredentials, verifyPin } from '../functions/api/_auth.js';
import { onRequest } from '../functions/api/state.js';
import { onRequestPost as login } from '../functions/api/auth/login.js';

const source = await readFile('campaign-state.json');
const originalHash = createHash('sha256').update(source).digest('hex');
const fixture = JSON.parse(source);
function embeddedImage(value) {
  if (typeof value === "string" && value.startsWith("data:image/")) return value;
  if (value && typeof value === "object") for (const child of Object.values(value)) { const found = embeddedImage(child); if (found) return found; }
}
const fixtureImage = embeddedImage(fixture);
const credential = await hashPin('test-only-pin');
fixture.users = ['admin', 'player'].map(role => ({ id: role, name: role, role, authVersion: 1, pinHash: credential.hash, pinSalt: credential.salt, pinIterations: credential.iterations }));
fixture.campfire.investigationBoard.notes.push({ id: 'test-note', title: 'Test', text: 'Original', color: 'gold', x: 20, y: 20, contentUpdatedAt: 1, positionUpdatedAt: 1, updatedAt: 1, createdByUserId: 'admin', journeyEntryId: 'retired-link' });
fixture.journey.entries[0].references = ['room:preserved', { type: 'npc', id: 'preserved', extra: 'opaque' }];
const originalUsers = JSON.parse(source).users;
const migratedUsers = (await migrateCredentials({ users: originalUsers })).state.users;
for (let index = 0; index < originalUsers.length; index++) {
  const pin = originalUsers[index].pin || originalUsers[index].localPin;
  if (pin) assert.equal(await verifyPin(pin, migratedUsers[index]), true);
}
let saved = structuredClone(fixture);
const env = { SESSION_SECRET: 'isolated-tests-only-'.repeat(4), LOCAL_STORE: {
  read: async () => ({ state_json: structuredClone(saved), revision: Number(saved.revision) || 0 }),
  write: async (state, expected) => {
    if (expected !== (Number(saved.revision) || 0)) throw Object.assign(new Error('Conflict'), { status: 409 });
    saved = structuredClone(state);
    return [{ revision: state.revision }];
  }
} };
const admin = await createSessionToken(env, fixture.users[0]);
const player = await createSessionToken(env, fixture.users[1], false);
const thirty = await verifySessionToken(env, admin.token);
const eight = await verifySessionToken(env, player.token);
assert.equal(thirty.exp - thirty.iat, 30 * 24 * 3600);
assert.equal(eight.exp - eight.iat, 8 * 3600);
const send = (token, body, id = crypto.randomUUID(), headers = {}) => onRequest({ env, request: new Request('http://test/api/state', { method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Mutation-Id': id, 'X-Base-Revision': String(saved.revision || 0), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }) });
const note = structuredClone(saved.campfire.investigationBoard.notes.find(n => n.id === 'test-note'));
const delta = (entry, fields) => ({ _changedFields: [], _changedRecords: { investigationNotes: [entry.id], investigationNoteFields: { [entry.id]: fields } }, campfire: { investigationBoard: { notes: [entry] } } });
assert.equal((await send('', null)).status, 401);
assert.equal((await send(admin.token, delta({ ...note, x: 820, y: 950 }, ['x', 'y']))).status, 200);
assert.equal((await send(player.token, delta({ ...note, text: 'Concurrent text' }, ['text']), 'same-mutation')).status, 200);
let merged = saved.campfire.investigationBoard.notes.find(n => n.id === note.id);
assert.equal(merged.x, 820); assert.equal(merged.y, 950); assert.equal(merged.text, 'Concurrent text'); assert.equal(merged.journeyEntryId, 'retired-link');
await send(player.token, delta({ ...note, text: 'Must not replay' }, ['text']), 'same-mutation');
assert.equal(saved.campfire.investigationBoard.notes.find(n => n.id === note.id).text, 'Concurrent text');
const entry = structuredClone(saved.journey.entries[0]);
await send(admin.token, { _changedFields: [], _changedRecords: { journeyEntryContent: [entry.id], journeyComments: {} }, journey: { entries: [{ ...entry, title: 'Edited title', references: [] }] } });
assert.deepEqual(saved.journey.entries[0].references, entry.references);
await send(player.token, { _changedFields: [], _changedRecords: {}, deletedRecords: [{ type: 'investigationNote', id: note.id, deletedAt: Date.now() }] });
await send(admin.token, delta({ ...note, x: 999 }, ['x']));
assert.ok(!saved.campfire.investigationBoard.notes.some(n => n.id === note.id));
const publicState = await (await send(admin.token)).json();
assert.ok(!('pinHash' in publicState.users[0])); assert.ok(!('mutationReceipts' in publicState));
assert.equal((await send(admin.token, null, '', { 'If-None-Match': `"state-${saved.revision}"` })).status, 304);
const results = [];
await mkdir('screenshots/stability', { recursive: true });
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 768, 1440, 1920]) {
      saved = structuredClone(fixture);
      let failWrites = false;
      let failReads = false;
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const sample = fixtureImage;
      await page.route('https://**/*', async route => {
        if (!sample) { await route.abort(); return; }
        await new Promise(resolve => setTimeout(resolve, 180));
        const [header, data] = sample.split(",");
        await route.fulfill({ contentType: header.slice(5).split(";")[0], body: Buffer.from(data, "base64") });
      });
      await page.route('**/api/**', async route => {
        const req = route.request();
        if ((failReads && req.method() === 'GET') || (failWrites && req.method() === 'PUT')) { await route.fulfill({ status: 503, body: '{}' }); return; }
        const request = new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.postData() ? { body: req.postData() } : {}) });
        const response = req.url().endsWith('/auth/login') ? await login({ request, env }) : await onRequest({ request, env });
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      await page.goto('http://127.0.0.1:4180/');
      await page.locator('#accessName').fill('admin');
      await page.locator('#accessPin').fill('test-only-pin');
      await page.locator('#authForm').evaluate(f => f.requestSubmit());
      await page.waitForFunction(() => document.body.classList.contains('authenticated'));
      await page.evaluate(() => showView('journey'));
      await page.waitForTimeout(150);
      const before = await page.locator('[data-journey-id]').evaluateAll(nodes => nodes.map(n => [n.dataset.journeyId, n.offsetLeft, n.offsetTop]));
      await page.evaluate(() => {
        window.testImages = [...document.querySelectorAll('#journeyGallery img')];
        window.frames = []; window.longTasks = [];
        window.longTaskSupported = PerformanceObserver.supportedEntryTypes?.includes('longtask') || false;
        if (longTaskSupported) new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask' });
        let previous = performance.now(); window.sampleFrames = true;
        const tick = now => { frames.push(now - previous); previous = now; if (sampleFrames) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      for (let index = 0; index < 8; index++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(85); }
      const after = await page.locator('[data-journey-id]').evaluateAll(nodes => nodes.map(n => [n.dataset.journeyId, n.offsetLeft, n.offsetTop]));
      assert.deepEqual(after, before, `${engine.name()}/${width}: gallery moved while scrolling`);
      assert.equal(await page.locator('[id$="References"],.reference-picker,.reference-chip-row').count(), 0);
      await page.evaluate(() => { state.journey.entries[0].comments.push({ id: 'new-comment', text: 'Hello', createdAt: Date.now(), userId: 'admin' }); state.revision++; renderJourney(); });
      assert.equal(await page.evaluate(() => testImages.every((img, index) => img === document.querySelectorAll('#journeyGallery img')[index])), true);
      const metrics = await page.evaluate(() => { sampleFrames = false; const sorted = frames.slice().sort((a, b) => a - b); return { frameP95: sorted[Math.floor(sorted.length * .95)], longTaskSupported, longTasks, overflow: document.documentElement.scrollWidth > innerWidth }; });
      assert.equal(metrics.overflow, false);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `screenshots/stability/journey-${engine.name()}-${width}.png` });
      if (width === 1440) {
        failWrites = true;
        const masks = await page.evaluate(async () => {
          const note = state.campfire.investigationBoard.notes.find(n => n.id === 'test-note');
          note.x += 100; note.positionUpdatedAt = Date.now();
          saveState(state);
          note.text = 'Local content after movement'; note.contentUpdatedAt = Date.now();
          saveState(state);
          await mutationWrites;
          return mutationQueue.slice(-2).map(item => JSON.parse(item.body)._changedRecords.investigationNoteFields['test-note']);
        });
        assert.deepEqual(masks[0], ['x']);
        assert.deepEqual(masks[1], ['text']);
        await page.evaluate(() => saveLocalState(state));
        await page.waitForTimeout(300);
        failReads = true;
        await page.reload();
        await page.waitForFunction(() => sessionUserId === 'admin' && state.journey.entries.length > 0);
        failReads = false;
        await page.evaluate(() => syncStateFromServer());
        await page.evaluate(() => { state.missions.push({ id: 'pending-mission', type: 'mission', title: 'Pending test', updatedAt: Date.now() }); saveState(state, { immediate: true }); });
        await page.waitForTimeout(300);
        await page.reload();
        await page.waitForFunction(() => document.body.classList.contains('authenticated'));
        await page.waitForFunction(() => state.missions.some(m => m.id === 'pending-mission'));
        failWrites = false;
        await page.evaluate(() => flushStateSave());
        await page.waitForFunction(() => !pendingPayload && !saveInFlight);
        assert.ok(saved.missions.some(m => m.id === 'pending-mission'));
        failWrites = true;
        await page.evaluate(() => { state.missions.push({ id: 'admin-pending', type: 'mission', title: 'Account isolation', updatedAt: Date.now() }); saveState(state, { immediate: true }); });
        await page.waitForTimeout(250);
        await page.evaluate(() => { clearSession(); applyAuthState(); });
        failWrites = false;
        await page.locator('#accessName').fill('player');
        await page.locator('#accessPin').fill('test-only-pin');
        await page.locator('#authForm').evaluate(f => f.requestSubmit());
        await page.waitForFunction(() => sessionUserId === 'player' && document.body.classList.contains('authenticated'));
        await page.waitForTimeout(250);
        assert.ok(!saved.missions.some(m => m.id === 'admin-pending'));
        await page.evaluate(() => { clearSession(); applyAuthState(); });
        await page.locator('#accessName').fill('admin');
        await page.locator('#accessPin').fill('test-only-pin');
        await page.locator('#authForm').evaluate(f => f.requestSubmit());
        await page.waitForFunction(() => sessionUserId === 'admin' && !pendingPayload && !saveInFlight && state.missions.some(m => m.id === 'admin-pending'));
        assert.ok(saved.missions.some(m => m.id === 'admin-pending'));
        await page.evaluate(() => {
          const session = JSON.parse(localStorage.getItem(SESSION_KEY));
          session.expiresAt = Date.now() - 1;
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        });
        await page.reload();
        await page.waitForFunction(() => !sessionUserId && !document.body.classList.contains('authenticated'));
        assert.equal(await page.locator('link[rel="icon"]').count(), 1);
      }
      assert.deepEqual(errors, []);
      results.push({ engine: engine.name(), width, ...metrics });
      await context.close();
    }
  } finally { await browser.close(); }
}
assert.equal(createHash('sha256').update(await readFile('campaign-state.json')).digest('hex'), originalHash);
await writeFile('screenshots/stability/results.json', JSON.stringify({ originalHash, results }, null, 2));
console.log(JSON.stringify({ backend: 'passed', browserScenarios: results.length, originalStateUnchanged: true, results }, null, 2));
