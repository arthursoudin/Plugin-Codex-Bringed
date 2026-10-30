import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCodexWithinCap, buildExecutorArgv, createRoutingSnapshot, evaluateCodexTask, selectPreExecutionFallback, validateRoutingPreferences, validateSessionModelPolicy } from './routing.mjs';

test('política de sessão aceita escalada explícita e valida limites', () => {
  const policy = validateSessionModelPolicy({ floor_model: 'gpt-6-luna', max_model: 'gpt-6-astra', max_effort: 'max' });
  const config = preferences();
  config.executors.codex = { model: policy.max_model, effort: policy.max_effort };
  assert.equal(evaluateCodexTask(config, 'Mude a cor do botão', null, policy.floor_model).model, 'gpt-6-luna');
  assert.equal(evaluateCodexTask(config, 'Revise a arquitetura e segurança de vários módulos', null, policy.floor_model).model, 'gpt-6-astra');
  const critical = evaluateCodexTask(config, 'Revise a arquitetura e segurança de todo o projeto', null, policy.floor_model);
  assert.equal(critical.task_band, 'critical');
  assert.equal(critical.effort, 'max');
  assert.throws(() => validateSessionModelPolicy({ floor_model: 'gpt-6-astra', max_model: 'gpt-6-luna', max_effort: 'high' }), /ordem crescente/);
});

const preferences = () => ({
  enabled: ['hermes', 'codex'], primary: 'hermes', complex: 'codex', fallback: ['codex'],
  executors: { hermes: { provider: 'openrouter', model: 'provider/model', effort: 'medium' }, codex: { model: 'gpt-6.1-sol', effort: 'xhigh' } },
});

test('valida preferências e rejeita modelos/rotas inválidos', () => {
  assert.equal(validateRoutingPreferences(preferences()).primary, 'hermes');
  assert.throws(() => validateRoutingPreferences({ ...preferences(), complex: 'missing' }), /ativados/);
  assert.throws(() => validateRoutingPreferences({ ...preferences(), executors: { ...preferences().executors, codex: { model: 'bad model', effort: 'xhigh' } } }), /inválido/);
});

test('snapshot fica congelado e captura executor, modelo e esforço', () => {
  const prefs = preferences(); const snapshot = createRoutingSnapshot(prefs, 'complex');
  prefs.executors.codex.model = 'changed';
  assert.equal(snapshot.model, 'gpt-6.1-sol');
  assert.equal(snapshot.effort, 'xhigh');
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => createRoutingSnapshot(preferences(), 'automatic'), /simple ou complex/);
});

test('monta argv sem interpolação de shell para Codex e Hermes', () => {
  assert.deepEqual(buildExecutorArgv(createRoutingSnapshot(preferences(), 'complex'), 'echo $(not-a-shell)'), ['exec', '--model', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=xhigh', 'echo $(not-a-shell)']);
  assert.deepEqual(buildExecutorArgv(createRoutingSnapshot(preferences(), 'simple'), 'task'), ['--provider', 'openrouter', '--model', 'provider/model', '--reasoning', 'medium', '-z', 'task']);
});

test('fallback é permitido somente para falha antes do início', () => {
  const config = preferences(); const snapshot = createRoutingSnapshot(config, 'simple');
  assert.equal(selectPreExecutionFallback(snapshot, config, 'started'), null);
  const fallback = selectPreExecutionFallback(snapshot, config, 'before_start');
  assert.equal(fallback.executor, 'codex');
  assert.match(fallback.routing_reason, /antes do início/);
});

test('avaliador reduz modelo e esforço sem ultrapassar o mestre', () => {
  const sol = preferences(); sol.executors.codex = { model: 'gpt-6.1-sol', effort: 'medium' };
  const button = evaluateCodexTask(sol, 'Mude a cor do botão');
  assert.equal(button.model, 'gpt-6-luna'); assert.equal(button.effort, 'low');
  assert.equal(button.change_summary, 'Mude a cor do botão');
  const architecture = evaluateCodexTask(sol, 'Revise a arquitetura e a segurança da integração');
  assert.equal(architecture.model, 'gpt-6.1-sol'); assert.equal(architecture.effort, 'medium');
  assert.equal(assertCodexWithinCap(architecture, sol), true);
  const lower = preferences(); lower.executors.codex = { model: 'gpt-6-luna', effort: 'low' };
  assert.throws(() => assertCodexWithinCap(architecture, lower), /teto Codex/);
  assert.throws(() => assertCodexWithinCap({ ...button, effort: 'high' }, sol), /Esforço acima/);
});

test('avaliador combina Luna e Sol com pensamentos diferentes dentro dos dois tetos', () => {
  const config = preferences(); config.executors.codex = { model: 'gpt-6.1-sol', effort: 'high' };
  const cases = [
    ['Mude a cor do botão', 'gpt-6-luna', 'low'],
    ['Corrija a validação de um formulário', 'gpt-6-luna', 'medium'],
    ['Investigar bug intermitente em uma função', 'gpt-6-luna', 'high'],
    ['Renomear em todo o projeto, em vários arquivos', 'gpt-6.1-sol', 'low'],
    ['Refatorar a integração com o servidor', 'gpt-6.1-sol', 'medium'],
  ];
  for (const [task, model, effort] of cases) {
    const evaluated = evaluateCodexTask(config, task);
    assert.equal(evaluated.model, model, task);
    assert.equal(evaluated.effort, effort, task);
    assertCodexWithinCap(evaluated, config);
  }
  config.executors.codex = { model: 'gpt-6.1-sol', effort: 'medium' };
  assert.equal(evaluateCodexTask(config, 'Investigar bug intermitente em uma função').effort, 'medium');
});
