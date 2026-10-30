export const MCP_CLIENTS = Object.freeze({
  codex_cli: 'Codex CLI',
  hermes_cli: 'Hermes CLI',
  gemini_cli: 'Gemini CLI',
  opencode_cli: 'OpenCode CLI',
});

const powerShellQuote = value => {
  const text = String(value);
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error('Comandos e argumentos não podem conter caracteres de controle ou quebras de linha.');
  return `'${text.replace(/'/g, "''")}'`;
};

export function prepareMcpSetup(args = {}) {
  const serverName = typeof args.server_name === 'string' ? args.server_name.trim() : '';
  const connectionType = args.connection_type;
  const authMethod = args.auth_method;
  const authEnvVar = typeof args.auth_env_var === 'string' ? args.auth_env_var.trim() : '';
  const authHeaderName = typeof args.auth_header_name === 'string' && args.auth_header_name.trim() ? args.auth_header_name.trim() : 'Authorization';
  const resemblesSecret = value => /^(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,}|Bearer\s+)/i.test(value) || /^[A-Z0-9]{32,}$/.test(value);
  if (!serverName || serverName.length > 80) throw new Error('Informe o nome do MCP (até 80 caracteres).');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(serverName)) throw new Error('Use no nome apenas letras sem acento, números, ponto, hífen ou sublinhado; o primeiro caractere deve ser letra ou número.');
  if (!['openai_tunnel', 'remote_url', 'local_dev', 'local_stdio', 'not_sure'].includes(connectionType)) throw new Error('Escolha o tipo de conexão indicado pelo responsável do MCP.');
  if (!['oauth', 'api_key', 'none', 'not_sure'].includes(authMethod)) throw new Error('Escolha o tipo de autenticação indicado pelo responsável do MCP.');
  if (authMethod === 'api_key' && (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(authEnvVar) || resemblesSecret(authEnvVar))) throw new Error('Informe apenas o nome da variável (por exemplo, MINHA_MCP_TOKEN), nunca o valor da chave.');
  if (authMethod !== 'api_key' && (authEnvVar || (typeof args.auth_header_name === 'string' && args.auth_header_name.trim()))) throw new Error('Nome de variável e cabeçalho só podem ser informados para autenticação por chave de API.');
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(authHeaderName) || resemblesSecret(authHeaderName)) throw new Error('Informe um nome de cabeçalho HTTP válido, não o valor de uma chave.');

  let safeUrl = null;
  if (connectionType === 'local_stdio' && args.server_url) throw new Error('Não informe URL para um servidor local stdio.');
  if (args.server_url !== undefined && args.server_url !== '') {
    if (typeof args.server_url !== 'string' || args.server_url.length > 2048) throw new Error('A URL é inválida ou muito longa.');
    if (/[?#]/.test(args.server_url)) throw new Error('Remova parâmetros e fragmento da URL. Nunca coloque segredo no endereço.');
    let parsed;
    try { parsed = new URL(args.server_url); } catch { throw new Error('Informe uma URL válida, sem credenciais.'); }
    const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) throw new Error('Para um servidor remoto, use HTTPS. HTTP só é aceito para localhost durante desenvolvimento.');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Remova usuário, senha, parâmetros e fragmento da URL. Nunca coloque segredo no endereço.');
    safeUrl = parsed.toString();
  }

  let stdioCommand = null;
  let stdioArgs = [];
  if (connectionType === 'local_stdio') {
    stdioCommand = typeof args.stdio_command === 'string' ? args.stdio_command.trim() : '';
    if (!stdioCommand || stdioCommand.length > 512) throw new Error('Informe o executável do servidor stdio (até 512 caracteres).');
    powerShellQuote(stdioCommand);
    if (args.stdio_args !== undefined && (!Array.isArray(args.stdio_args) || args.stdio_args.length > 32 || args.stdio_args.some(value => typeof value !== 'string' || value.length > 512))) throw new Error('Informe os argumentos stdio como uma lista de até 32 textos, cada um com até 512 caracteres.');
    stdioArgs = (args.stdio_args || []).map(value => { powerShellQuote(value); return value; });
    if (stdioArgs.some(value => /^--?(?:api[-_]?key|access[-_]?token|token|password|client[-_]?secret|authorization)(?:=|$)/i.test(value) || /^Bearer\s+/i.test(value) || /^(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})$/.test(value))) throw new Error('Não passe chaves, tokens, senhas ou cabeçalhos de autenticação nos argumentos stdio. Use a configuração segura indicada pelo cliente.');
  } else if ((args.stdio_command !== undefined && args.stdio_command !== null && args.stdio_command !== '') || (args.stdio_args !== undefined && (!Array.isArray(args.stdio_args) || args.stdio_args.length > 0))) {
    throw new Error('Comando e argumentos stdio só podem ser usados com o tipo de conexão local stdio.');
  }

  const isStdio = connectionType === 'local_stdio';
  const validRemote = connectionType === 'remote_url' && safeUrl?.startsWith('https://');
  const canConfigureCli = isStdio ? authMethod === 'none' : validRemote && ['oauth', 'none'].includes(authMethod);
  const commandUnavailableReason = isStdio
    ? 'Este servidor stdio exige autenticação ou variáveis de ambiente específicas. Configure-as no cliente sem colar segredos neste painel; nenhum comando automático é gerado.'
    : 'Comandos de CLI exigem uma URL remota HTTPS validada e OAuth ou nenhuma autenticação. Não informe credenciais aqui; autentique-se separadamente em cada CLI.';
  const command = (...parts) => parts.map(powerShellQuote).join(' ');
  const connectionSteps = isStdio
    ? ['Este servidor roda localmente como um subprocesso e usa stdin/stdout.', 'Instale o executável e os pacotes necessários seguindo as instruções do próprio servidor antes de configurar a CLI.', 'Revise o comando e cada argumento: a CLI iniciará esse programa local quando carregar o MCP.']
    : connectionType === 'openai_tunnel'
      ? ['No computador da pessoa, seguir as instruções do servidor para instalar e iniciar o tunnel próprio.', 'Na configuração de conectores do ChatGPT, escolher a opção de tunnel e informar o ID fornecido para aquela instalação.', 'Não reutilizar o ID nem a chave de runtime de outra pessoa.']
      : connectionType === 'remote_url'
        ? ['Abrir Configurações do ChatGPT > Apps/Conectores e adicionar um servidor MCP remoto.', 'Usar a URL HTTPS fornecida pelo responsável do servidor.', 'Concluir a autenticação e conferir as permissões pedidas.']
        : connectionType === 'local_dev'
          ? ['Iniciar o servidor MCP local seguindo o README do projeto.', 'Usar o fluxo de desenvolvimento local/tunnel indicado pelo ChatGPT; localhost sozinho não fica acessível ao serviço remoto.', 'Não publicar o servidor de desenvolvimento sem HTTPS e autenticação apropriados.']
          : ['Perguntar ao responsável do MCP se a conexão usa tunnel, URL remota HTTPS, stdio local ou fluxo de desenvolvimento local.', 'Depois seguir as instruções específicas dessa opção nas Configurações do ChatGPT > Apps/Conectores.'];

  const remoteCommands = canConfigureCli && !isStdio && safeUrl;
  const stdioInvocation = [stdioCommand, ...stdioArgs];
  const localSnippet = JSON.stringify({ type: 'local', command: stdioInvocation }, null, 2);
  const remoteSnippet = JSON.stringify({ type: 'remote', url: safeUrl }, null, 2);
  const apiKeyRequested = authMethod === 'api_key';
  const apiKeyAuthValue = authHeaderName.toLowerCase() === 'authorization' ? `Bearer {env:${authEnvVar}}` : `{env:${authEnvVar}}`;
  const opencodeConfig = apiKeyRequested
    ? { type: isStdio ? 'local' : 'remote', ...(isStdio ? { command: stdioInvocation, environment: { [authEnvVar]: `{env:${authEnvVar}}` } } : { url: safeUrl, oauth: false, headers: { [authHeaderName]: apiKeyAuthValue } }) }
    : isStdio ? JSON.parse(localSnippet) : JSON.parse(remoteSnippet);
  const opencodeSnippet = (canConfigureCli || apiKeyRequested && (isStdio || validRemote)) ? JSON.stringify({ mcp: { servers: { [serverName]: opencodeConfig } } }, null, 2) : null;
  const hermesSnippet = apiKeyRequested && (isStdio || validRemote)
    ? JSON.stringify({ mcp_servers: { [serverName]: isStdio ? { command: stdioCommand, args: stdioArgs, env: { [authEnvVar]: `\u0024{env:${authEnvVar}}` } } : { url: safeUrl, headers: { [authHeaderName]: authHeaderName.toLowerCase() === 'authorization' ? `Bearer \u0024{env:${authEnvVar}}` : `\u0024{env:${authEnvVar}}` } } } }, null, 2)
    : null;
  const geminiSnippet = apiKeyRequested && isStdio
    ? JSON.stringify({ mcpServers: { [serverName]: { command: stdioCommand, args: stdioArgs, env: { [authEnvVar]: `\u0024{${authEnvVar}}` } } } }, null, 2)
    : null;
  const unsupportedApiKeyReason = isStdio
    ? 'Este destino não tem um formato seguro de variável de ambiente documentado para este tipo de autenticação. Configure o segredo no cliente e não o cole aqui.'
    : 'A documentação deste cliente não confirma referência segura de variável de ambiente para cabeçalhos HTTP. Não use --header com o token literal; configure a autenticação pelo método oficial do cliente.';
  const destinations = {
    codex_cli: {
      command: apiKeyRequested ? (validRemote && authHeaderName.toLowerCase() === 'authorization' ? `codex mcp add ${command(serverName)} --url ${command(safeUrl)} --bearer-token-env-var ${command(authEnvVar)}` : null) : isStdio && canConfigureCli ? `codex mcp add ${powerShellQuote(serverName)} -- ${stdioInvocation.map(powerShellQuote).join(' ')}` : remoteCommands ? `codex mcp add ${command(serverName)} --url ${command(safeUrl)}` : null,
      config_snippet: null,
      config_format: null,
      steps: isStdio
        ? ['No terminal PowerShell, adicione o servidor stdio usando o comando, quando fornecido.', 'Execute codex mcp list e confira se o servidor aparece; abra uma sessão Codex e teste as ferramentas.']
        : ['No terminal PowerShell, adicione o servidor Codex usando o comando, quando fornecido.', 'Execute codex mcp list; para OAuth, use codex mcp login com o nome do MCP.', 'Abra uma sessão do Codex e confira as ferramentas disponíveis.'],
      command_unavailable_reason: apiKeyRequested && !(validRemote && authHeaderName.toLowerCase() === 'authorization') ? unsupportedApiKeyReason : canConfigureCli ? null : commandUnavailableReason,
    },
    hermes_cli: {
      command: apiKeyRequested ? null : isStdio && canConfigureCli ? `hermes mcp add ${powerShellQuote(serverName)} --command ${powerShellQuote(stdioCommand)}${stdioArgs.length ? ` --args ${stdioArgs.map(powerShellQuote).join(' ')}` : ''}` : remoteCommands ? `hermes mcp add ${command(serverName)} --url ${command(safeUrl)}${authMethod === 'oauth' ? ' --auth oauth' : ''}` : null,
      config_snippet: hermesSnippet,
      config_format: hermesSnippet ? 'JSON compatível com YAML' : null,
      steps: isStdio
        ? ['No terminal PowerShell, adicione o servidor stdio usando o comando, quando fornecido.', 'Execute hermes mcp list e depois hermes mcp test com o nome do MCP.']
        : ['No terminal PowerShell, adicione o servidor ao Hermes usando o comando, quando fornecido.', 'Execute hermes mcp list para confirmar; para OAuth, conclua o login solicitado pelo Hermes.', 'Teste a conexão com hermes mcp test e confira as ferramentas encontradas.'],
      command_unavailable_reason: apiKeyRequested && !hermesSnippet ? unsupportedApiKeyReason : canConfigureCli ? null : commandUnavailableReason,
    },
    gemini_cli: {
      command: apiKeyRequested ? null : isStdio && canConfigureCli ? `gemini mcp add --scope user --transport stdio ${command(serverName, stdioCommand)}${stdioArgs.length ? ` ${stdioArgs.map(powerShellQuote).join(' ')}` : ''}` : remoteCommands ? `gemini mcp add --scope user --transport http ${command(serverName, safeUrl)}` : null,
      config_snippet: geminiSnippet,
      config_format: geminiSnippet ? 'JSON' : null,
      steps: isStdio
        ? ['No terminal PowerShell, adicione o servidor stdio usando o comando, quando fornecido.', 'Execute gemini mcp list; se a pasta atual não for confiável, revise as instruções de confiança do Gemini CLI.']
        : ['No terminal PowerShell, adicione o servidor ao Gemini CLI usando o comando, quando fornecido.', 'Execute gemini mcp list e confirme que o servidor aparece; autentique-se no próprio Gemini CLI se necessário.'],
      command_unavailable_reason: apiKeyRequested && !geminiSnippet ? unsupportedApiKeyReason : canConfigureCli ? null : commandUnavailableReason,
    },
    opencode_cli: {
      command: null,
      config_snippet: opencodeSnippet,
      config_format: opencodeSnippet ? 'JSON/JSONC' : null,
      steps: ['No OpenCode, acrescente o trecho JSON/JSONC à propriedade mcp do arquivo opencode.json ou opencode.jsonc, preservando as outras configurações.', 'Reinicie ou recarregue o OpenCode e confirme que as ferramentas do MCP aparecem. Para OAuth remoto, autentique com opencode mcp auth e verifique com opencode mcp list.'],
      command_unavailable_reason: apiKeyRequested && !opencodeSnippet ? unsupportedApiKeyReason : canConfigureCli ? null : commandUnavailableReason,
    },
  };
  if (apiKeyRequested) {
    destinations.codex_cli.steps.unshift(`Configure a variável ${authEnvVar} no ambiente do usuário que inicia o Codex; o comando gerado recebe apenas o nome da variável.`);
    destinations.hermes_cli.steps.unshift(`Configure ${authEnvVar} no ambiente do Hermes ou no arquivo local ~/.hermes/.env; não coloque o valor no CodexBridge.`);
    destinations.gemini_cli.steps.unshift(`Configure ${authEnvVar} no ambiente do Gemini CLI ou em %USERPROFILE%\\.gemini\\.env. O trecho stdio usa expansão de variável documentada pelo Gemini.`);
    destinations.opencode_cli.steps.unshift(`Defina ${authEnvVar} no ambiente do OpenCode antes de iniciá-lo; o trecho referencia a variável sem incluir o valor.`);
  }
  const requestedClients = Array.isArray(args.target_clients) ? [...new Set(args.target_clients)] : Object.keys(destinations);
  if (!requestedClients.length || requestedClients.some(client => !Object.hasOwn(destinations, client))) throw new Error('Selecione ao menos uma CLI válida: Codex, Hermes, Gemini ou OpenCode.');
  return {
    state: 'instructions_prepared',
    server_name: serverName,
    connection_type: connectionType,
    server_url: safeUrl,
    stdio_command: stdioCommand,
    stdio_args: stdioArgs,
    authentication: authMethod,
    ...(apiKeyRequested ? { auth_env_var: authEnvVar, auth_header_name: isStdio ? null : authHeaderName } : {}),
    connection_steps: connectionSteps,
    chatgpt_steps: isStdio
      ? ['Este MCP usa stdio local e não pode ser conectado diretamente ao ChatGPT.', 'Para usar as mesmas ferramentas no ChatGPT, o responsável precisa oferecer uma URL MCP remota HTTPS ou um tunnel próprio; configure essa conexão separadamente.']
      : [...connectionSteps, 'No ChatGPT, abra Configurações > Apps > Avançado > Criar app e configure o servidor MCP personalizado com a URL HTTPS.', 'Conclua a autenticação, revise as permissões e teste uma ferramenta na tela de configuração do ChatGPT.'],
    selected_cli_destinations: requestedClients,
    ...Object.fromEntries(requestedClients.map(client => [client, destinations[client]])),
    permissions_checklist: ['Leia a lista de ferramentas que o servidor oferece.', 'Permita apenas as funções necessárias para o uso pretendido.', 'Se usar OAuth ou chave, conclua a autenticação somente na tela oficial do cliente, nunca nesta conversa.'],
    after_connecting: isStdio ? 'Este servidor fica disponível no cliente local configurado; o ChatGPT requer uma conexão MCP remota ou tunnel separado.' : 'Depois que a pessoa concluir a conexão, o ChatGPT poderá chamar as ferramentas que esse MCP expuser, conforme as permissões aprovadas. Elas continuam separadas das ferramentas do CodexBridge.',
    limitations: ['ChatGPT, Codex CLI, Hermes CLI, Gemini CLI e OpenCode CLI são destinos separados; cada CLI mantém sua própria configuração e autenticação, e adicionar em um destino não conecta nos demais.', 'OpenCode recebe um trecho para configuração manual, não um comando CLI para adicionar MCP.', 'Este configurador não consegue confirmar nem conectar o servidor dentro do ChatGPT; a pessoa precisa concluir e verificar a conexão nas Configurações do ChatGPT.', 'Este configurador não altera configurações externas, não executa comandos, não instala servidores, não conclui OAuth nem concede permissões.', 'Nunca cole o valor de uma chave ou token neste painel. Ele salva somente o nome da variável e gera referências de ambiente apenas nos clientes que documentam esse recurso; configure o valor localmente no cliente ou sistema operacional.'],
  };
}
