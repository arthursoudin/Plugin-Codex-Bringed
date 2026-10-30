import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

test('Workshop starts with motion disabled when the operating system requests reduced motion', () => {
  const classes = new Set();
  const element = () => ({ checked: true, disabled: false, dataset: {}, addEventListener() {}, replaceChildren() {}, append() {} });
  const follow = element(), motion = element(), liveStatus = element(), eventFeed = element();
  const root = {
    dataset: { state: 'completed', initialEvents: '[]' },
    querySelector(selector) { return ({ '[data-follow]': follow, '[data-motion]': motion, '[data-live-status]': liveStatus, '[data-event-feed]': eventFeed })[selector] || null; },
    querySelectorAll() { return []; },
  };
  const document = {
    body: { classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } } },
    visibilityState: 'visible',
    querySelector() { return root; },
    addEventListener() {},
    createElement() { return element(); },
    createTextNode(text) { return { textContent: text }; },
  };
  const context = {
    document,
    window: { matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') }) },
    localStorage: { getItem: () => 'true', setItem() {} },
  };
  vm.runInNewContext(fs.readFileSync(new URL('./dashboard-workshop.js', import.meta.url), 'utf8'), context);
  assert.equal(motion.checked, false);
  assert.equal(motion.disabled, true);
  assert.equal(classes.has('workshop-no-motion'), true);
  const dashboard = fs.readFileSync(new URL('./dashboard.mjs', import.meta.url), 'utf8');
  assert.match(dashboard, /prefers-reduced-motion:reduce\)\{\.workshop-tile,\.workshop-agent\{/);
});
