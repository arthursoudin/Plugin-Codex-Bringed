import fs from 'node:fs';
import path from 'node:path';

export const AGENT_PROFILES = Object.freeze([
  { id: 'programador', name: 'Programador', summary: 'Implementa mudanças pequenas, claras e verificáveis.', instructions: 'Entenda o pedido e a estrutura existente antes de editar. Preserve alterações locais, faça a menor mudança completa, explique arquivos e riscos, e execute apenas verificações seguras disponíveis. Não invente resultados nem contorne aprovações.' },
  { id: 'avaliador', name: 'Avaliador', summary: 'Revisa código com evidências e prioridades.', instructions: 'Faça revisão baseada em evidências. Liste arquivo/local, impacto e correção. Separe problemas confirmados, hipóteses e sugestões. Não altere arquivos nem alegue testes sem executá-los. Não exponha cadeia de pensamento privada.' },
  { id: 'github-committer', name: 'GitHub Committer', summary: 'Prepara commits e revisa o estado Git com cuidado.', instructions: 'Confira branch, estado e diff antes de recomendar um commit. Preserve trabalho local. Só execute git commit quando o usuário pedir isso explicitamente na conversa atual; nunca faça push, publicação ou crie PR sem pedido explícito separado. Não inclua segredos.' },
  { id: 'frontend', name: 'Front-end', summary: 'Trabalha em interface, acessibilidade e responsividade.', instructions: 'Siga os componentes e estilos existentes. Cuide de teclado, foco, contraste, mensagens de estado e telas estreitas. Não declare validação visual sem renderizar a interface.' },
  { id: 'design', name: 'Design', summary: 'Avalia hierarquia visual, linguagem e consistência.', instructions: 'Priorize clareza, consistência, legibilidade e acessibilidade. Relate evidências e proponha mudanças objetivas. Diferencie inspeção estática de validação visual em navegador.' },
  { id: 'criador-de-agentes', name: 'Criador de agentes', summary: 'Cria rascunhos de perfis de agente especializados.', instructions: 'Defina propósito, limites, ferramentas esperadas e critérios de conclusão para cada perfil. Trate perfis como instruções, não como isolamento ou permissões técnicas. Gere rascunhos para revisão; não instale nem publique sem pedido explícito.' },
]);

const MAX_NOTES_PER_PROFILE = 8;
const MAX_NOTE_CHARS = 500;
const STORE_VERSION = 1;

function defaultState() {
  return { version: STORE_VERSION, selected: null, autonomy: false, memories: Object.fromEntries(AGENT_PROFILES.map(profile => [profile.id, []])) };
}

function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.version !== STORE_VERSION) throw new Error('Versão de memória desconhecida; arquivo preservado.');
    return {
      version: STORE_VERSION,
      selected: AGENT_PROFILES.some(profile => profile.id === parsed.selected) ? parsed.selected : null,
      autonomy: parsed.autonomy === true,
      memories: Object.fromEntries(AGENT_PROFILES.map(profile => [profile.id, Array.isArray(parsed.memories?.[profile.id]) ? parsed.memories[profile.id].filter(note => typeof note === 'string').slice(-MAX_NOTES_PER_PROFILE).map(note => note.slice(0, MAX_NOTE_CHARS)) : []])),
    };
  } catch (error) {
    if (error.code === 'ENOENT') return defaultState();
    throw new Error(`Não foi possível ler a memória local; arquivo preservado: ${error.message}`);
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { flag: 'w', mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function manageAgentProfiles(file, args = {}) {
  const state = readState(file);
  const action = args.action || 'list';
  if (action === 'list' || action === 'status') {
    return { agents: AGENT_PROFILES.map(({ id, name, summary }) => ({ id, name, summary, memory_count: state.memories[id].length })), selected: state.selected, autonomy: state.autonomy, memory_location: file, note: 'Arquivo guardado localmente. Ao selecionar um perfil, suas notas são devolvidas ao cliente MCP e podem entrar no contexto da conversa conforme as políticas dele. Evite salvar informações privadas ou segredos.' };
  }
  if (action === 'set_autonomy') {
    if (typeof args.enabled !== 'boolean') throw new Error('Informe enabled como true ou false.');
    state.autonomy = args.enabled;
    writeState(file, state);
    return { autonomy: state.autonomy, scope: 'preferência conversacional local para reduzir confirmações de planejamento; não altera aprovações, sandbox, permissões do sistema nem autorização de ferramentas' };
  }
  if (!['select', 'remember', 'forget'].includes(action)) throw new Error('Ação inválida. Use list, status, select, remember, forget ou set_autonomy.');
  const profile = AGENT_PROFILES.find(item => item.id === args.profile_id);
  if (!profile) throw new Error('Perfil inválido. Consulte a lista de agentes e use um profile_id disponível.');
  if (action === 'select') {
    state.selected = profile.id;
    writeState(file, state);
    return { selected: profile.id, name: profile.name, instructions: profile.instructions, memories: state.memories[profile.id], autonomy: state.autonomy, autonomy_guidance: state.autonomy ? 'Por preferência explícita salva pelo usuário, avance etapas normais de planejamento e trabalho dentro do escopo já autorizado; pare para aprovação em comandos, mudanças de permissão, ações irreversíveis, publicação e qualquer confirmação que o cliente exigir.' : 'Peça confirmação quando uma decisão do usuário for necessária.' , note: 'O perfil foi salvo localmente. A seleção orienta esta conversa quando o cliente respeita instruções MCP; para troca nativa, use o seletor de agentes do cliente.' };
  }
  if (action === 'remember') {
    if (typeof args.note !== 'string' || !args.note.trim() || args.note.trim().length > MAX_NOTE_CHARS) throw new Error(`A nota precisa ter de 1 a ${MAX_NOTE_CHARS} caracteres.`);
    state.memories[profile.id].push(args.note.trim());
    state.memories[profile.id] = state.memories[profile.id].slice(-MAX_NOTES_PER_PROFILE);
    writeState(file, state);
    return { profile_id: profile.id, memory_count: state.memories[profile.id].length, max_memory_count: MAX_NOTES_PER_PROFILE, note: 'Nota salva somente no arquivo local de memória. O conteúdo não é filtrado de forma garantida; não salve segredos.' };
  }
  if (action === 'forget') {
    state.memories[profile.id] = [];
    writeState(file, state);
    return { profile_id: profile.id, forgotten: true };
  }
  throw new Error('Ação inválida. Use list, status, select, remember, forget ou set_autonomy.');
}

function tomlString(value) { return JSON.stringify(value); }

export function renderNativeAgent(profile, client) {
  if (!AGENT_PROFILES.includes(profile)) throw new Error('Perfil desconhecido.');
  if (client === 'codex') return `name = ${tomlString(profile.id)}\ndescription = ${tomlString(profile.summary)}\ndeveloper_instructions = ${tomlString(profile.instructions)}\n`;
  if (client === 'claude_code' || client === 'antigravity') return `---\nname: ${profile.id}\ndescription: ${profile.summary}\n---\n\n${profile.instructions}\n\nRespeite sempre as permissões e aprovações do cliente. Este perfil não concede permissões adicionais.\n`;
  throw new Error('Cliente não suportado.');
}

export function installNativeAgents(client, targetDirectory, { overwrite = false } = {}) {
  const target = path.resolve(targetDirectory);
  const extension = client === 'codex' ? '.toml' : '.md';
  const destinations = AGENT_PROFILES.map(profile => path.join(target, `codexbridge-${profile.id}${extension}`));
  const conflicts = destinations.filter(destination => fs.existsSync(destination));
  if (conflicts.length && !overwrite) throw new Error(`Arquivos já existentes foram preservados: ${conflicts.join(', ')}`);
  fs.mkdirSync(target, { recursive: true });
  const installed = [];
  for (const [index, profile] of AGENT_PROFILES.entries()) {
    const destination = destinations[index];
    const contents = renderNativeAgent(profile, client);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    try { fs.renameSync(temporary, destination); }
    catch (error) { try { fs.rmSync(temporary); } catch {} throw error; }
    installed.push(destination);
  }
  return installed;
}
