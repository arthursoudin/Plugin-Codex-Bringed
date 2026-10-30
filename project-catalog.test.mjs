import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectCatalog } from './project-catalog.mjs';

test('catalog keeps the requested 30 items and marks Vibecraft as a visual reference only', () => {
  assert.equal(projectCatalog.length, 30);
  const vibecraft = projectCatalog.find(item => item.id === 'vibecraft');
  assert.ok(vibecraft);
  assert.equal(vibecraft.url, 'https://github.com/Nearcyan/vibecraft');
  assert.match(vibecraft.category, /referencia visual/i);
  assert.match(vibecraft.compatibility, /Claude Code.*macOS\/Linux.*Windows nao suportado/i);
  assert.match(vibecraft.use, /instalacao no Windows/i);
});
