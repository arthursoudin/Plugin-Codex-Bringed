// Curated, offline catalog. Entries are informational and never trigger installation or execution.
export const PROJECT_CATALOG_CHECKED_AT = '2026-10-29';

export const projectCatalog = [
  {
    id: 'openreel', name: 'OpenReel', url: 'https://github.com/Augani/openreel-video',
    summary: 'Editor de vídeo para navegador e desktop, com linha do tempo, legendas, áudio e exportação.',
    category: 'aplicativo independente', use: 'Pode ajudar a preparar vídeos de demonstração de um projeto.',
    compatibility: 'O README informa builds para macOS, Windows e Linux; os builds desktop estão em alpha. O editor web não requer instalação. Compatibilidade do CodexBridge: não é uma integração direta.',
    permissions: 'Para editar, o usuário importa arquivos de mídia. Requisitos de permissões do app: não verificado.',
    risks: 'Processa arquivos de vídeo e áudio selecionados. O projeto declara que o editor web não envia arquivos para a nuvem; conexões MCP/provedores da edição desktop não foram verificadas.',
    care: 'Use cópias dos arquivos e confira o destino de exportação. Revise conexões externas antes de habilitar recursos de IA.',
    license: 'MIT', lastPush: '2026-10-17', confidence: 'alta para descrição e sistemas declarados; média para riscos operacionais', tags: ['video', 'edição', 'mídia', 'demonstração']
  },
  {
    id: 'agent-browser', name: 'Agent Browser', url: 'https://github.com/vercel-labs/agent-browser',
    summary: 'CLI de automação de navegador para agentes, com comandos para controlar páginas e interagir com sites.',
    category: 'integração MCP/skill', use: 'Pode apoiar tarefas de navegação e QA, mas não está conectado ao CodexBridge por esta atualização.',
    compatibility: 'README menciona suporte a Claude Code ou Codex, além de Cursor e outros agentes. Documenta Windows, macOS e Linux; há limitações de captura de WebGPU no Windows/Linux headless. Não é uma integração do CodexBridge.',
    permissions: 'Acesso ao navegador e às páginas abertas pelo processo; a instalação documentada baixa Chrome for Testing.',
    risks: 'Automação pode clicar, preencher e enviar conteúdo em sites usando a sessão disponibilizada ao navegador.',
    care: 'Use perfil isolado sem sessões pessoais e revise cada ação de envio ou alteração antes de executá-la.',
    license: 'Apache-2.0', lastPush: '2026-10-29', confidence: 'alta', tags: ['navegador', 'browser', 'automação', 'web', 'qa']
  },
  {
    id: 'deskcommcrm', name: 'DeskcommCRM', url: 'https://github.com/melgarafael/DeskcommCRM',
    summary: 'CRM self-hosted para vendas por chat, com agentes de IA e integração descrita com WhatsApp/WAHA.',
    category: 'aplicativo independente', use: 'Pode organizar atendimento e contatos; não integra diretamente o CodexBridge.',
    compatibility: 'README descreve implantação self-hosted com serviços Docker; suporte nativo no Windows: não verificado.',
    permissions: 'Implantação e integrações podem exigir acesso a banco de dados, serviços de mensageria e credenciais de provedores. Escopo exato: depende da configuração e não foi verificado.',
    risks: 'Trata mensagens, contatos e dados de clientes; agentes e integrações podem enviar mensagens ou acionar fluxos configurados.',
    care: 'Use dados fictícios para avaliar, restrinja credenciais e confirme consentimento e regras de retenção antes de importar contatos.',
    license: 'MIT', lastPush: '2026-10-29', confidence: 'alta para descrição e licença; média para permissões específicas', tags: ['crm', 'vendas', 'whatsapp', 'mensagens', 'clientes']
  },
  {
    id: 'textream', name: 'Textream', url: 'https://github.com/f/textream',
    summary: 'Teleprompter para macOS com acompanhamento de fala, sobreposição e recursos de apresentação.',
    category: 'aplicativo independente', use: 'Pode ajudar a preparar apresentações ou gravações sobre um projeto.',
    compatibility: 'README requer macOS 15+ e Xcode 16+ para desenvolvimento; Windows não é suportado pelo app macOS. Há companion iOS documentado.',
    permissions: 'O README menciona microfone/câmera para recursos iOS; permissões do app macOS não verificadas em detalhe.',
    risks: 'Recursos de voz/câmera podem processar áudio ou vídeo. O README documenta um servidor HTTP/WebSocket local em Director Mode.',
    care: 'Não habilite Director Mode em redes não confiáveis; revise permissões de microfone e câmera no sistema.',
    license: 'MIT', lastPush: '2026-09-06', confidence: 'alta', tags: ['teleprompter', 'apresentação', 'voz', 'macos', 'gravação']
  },
  {
    id: 'gods-eye-view', name: "God's Eye View", url: 'https://github.com/bilawalsidhu/gods-eye-view',
    summary: 'Globo 3D de inteligência geoespacial que reúne fontes abertas e dados espaciais.',
    category: 'aplicativo independente', use: 'Pode servir como referência visual para explorar dados geográficos públicos.',
    compatibility: 'README documenta implantação web/Docker e launcher Pinokio; compatibilidade específica com Windows não verificada.',
    permissions: 'Pode precisar de rede para carregar fontes de dados documentadas; requisitos locais dependem da implantação.',
    risks: 'Agrega dados geoespaciais públicos e pode induzir conclusões erradas se fontes, cobertura ou atualidade forem interpretadas sem contexto.',
    care: 'Confira fontes, data e precisão dos dados; não use a visualização como confirmação independente de eventos ou localização.',
    license: 'Não verificado (API marca NOASSERTION)', lastPush: '2026-10-29', confidence: 'média; detalhes de dados e licença requerem leitura adicional', tags: ['mapa', 'geoespacial', 'globo', 'dados', 'osint']
  },
  {
    id: 'ffmpeg-skill', name: 'FFmpeg Skill', url: 'https://github.com/kajisho5/ffmpeg-skill',
    summary: 'Skill/MCP que oferece ferramentas locais de edição e análise de mídia usando FFmpeg.',
    category: 'integração MCP/skill', use: 'Pode orientar o Codex em cortes, legendas, áudio e exportação de vídeo.',
    compatibility: 'README menciona Claude Code ou Codex. Documenta testes em Linux, macOS e Windows, mas informa que o corpus completo e instalação independente ainda não foram reproduzidos no Windows.',
    permissions: 'Acesso de leitura e escrita aos arquivos de mídia escolhidos; requer FFmpeg e Python conforme a instalação documentada.',
    risks: 'Ferramentas podem transformar, sobrescrever ou exportar mídia local; comandos FFmpeg processam arquivos fornecidos.',
    care: 'Trabalhe em cópias, confirme caminhos de entrada/saída e revise comandos antes de permitir escrita.',
    license: 'MIT', lastPush: '2026-10-29', confidence: 'alta', tags: ['ffmpeg', 'vídeo', 'áudio', 'mídia', 'skill', 'mcp']
  },
  {
    id: 'excalidraw-mcp', name: 'Excalidraw MCP', url: 'https://github.com/excalidraw/excalidraw-mcp',
    summary: 'Aplicativo MCP para criar e editar diagramas no Excalidraw.',
    category: 'integração MCP/skill', use: 'Pode ajudar a transformar explicações e arquitetura em diagramas.',
    compatibility: 'README descreve MCP App para clientes que suportam MCP Apps, incluindo ChatGPT; compatibilidade específica com Windows e conexão ao CodexBridge não verificada.',
    permissions: 'Acesso ao conteúdo de diagramas enviado pelo cliente MCP; requisitos de conexão/armazenamento dependem do modo configurado.',
    risks: 'Diagramas podem conter nomes, arquitetura ou informações internas; publicação/deploy é uma etapa distinta descrita para mantenedores.',
    care: 'Não inclua dados privados em diagramas compartilhados; confira o destino antes de exportar ou publicar.',
    license: 'MIT', lastPush: '2026-03-24', confidence: 'alta', tags: ['diagrama', 'excalidraw', 'mcp', 'arquitetura', 'desenho']
  },
  {
    id: 'open-archiver', name: 'Open Archiver', url: 'https://github.com/LogicLabs-OU/OpenArchiver',
    summary: 'Plataforma self-hosted para arquivamento e pesquisa de e-mails.',
    category: 'aplicativo independente', use: 'Pode ser útil para retenção e consulta de e-mail em uma instalação própria.',
    compatibility: 'README documenta Docker e Docker Compose; suporte específico a Windows não verificado. Pré-requisito informado: pelo menos 4 GB de RAM (2 GB com Postgres, Redis/Valkey e Meilisearch externos).',
    permissions: 'Configurar .env com senha de administrador, chaves secretas e outros valores; conectar Google Workspace, Microsoft 365 ou IMAP para importar mensagens.',
    risks: 'Lê e conserva e-mails, anexos e dados pessoais; uma configuração inadequada pode expor conteúdo arquivado.',
    care: 'Avalie política de retenção, criptografia, controle de acesso e regras legais antes de conectar contas reais.',
    license: 'AGPL-3.0', lastPush: '2026-10-24', confidence: 'média', tags: ['email', 'e-mail', 'arquivamento', 'busca', 'privacidade']
  },
  {
    id: 'open-seo', name: 'Open SEO', url: 'https://github.com/every-app/open-seo',
    summary: 'Aplicativo open source voltado a análise e ferramentas de SEO.',
    category: 'aplicativo independente', use: 'Pode apoiar pesquisas de SEO e análise de sites; integração com o CodexBridge não verificada.',
    compatibility: 'Requisitos e suporte a Windows: não verificado nesta revisão.',
    permissions: 'Pode consultar URLs e serviços externos conforme os recursos configurados; escopo exato: não verificado.',
    risks: 'A coleta/análise pode transmitir URLs ou consultas a serviços externos; termos e limites de provedores não foram verificados.',
    care: 'Confira a documentação de fontes de dados, limites, credenciais e políticas de uso antes de analisar sites privados.',
    license: 'MIT', lastPush: '2026-10-29', confidence: 'baixa a média; resumo baseado na descrição oficial', tags: ['seo', 'busca', 'site', 'marketing', 'análise']
  },
  {
    id: 'pasteguard', name: 'PasteGuard', url: 'https://github.com/sgasser/pasteguard',
    summary: 'Proxy local-first que busca reduzir exposição de dados ao usar chats de IA, APIs e agentes de código.',
    category: 'aplicativo independente', use: 'Pode ser estudado como camada local de filtragem; não é integrado ao CodexBridge.',
    compatibility: 'README documenta Docker e uso com Codex CLI, OpenAI e Anthropic; requisitos locais detalhados e suporte Windows não verificados.',
    permissions: 'Intermedeia prompts e respostas do cliente de IA; quick start publica uma porta local do container.',
    risks: 'O projeto declara mascarar PII e segredos, mas isso não garante remoção de todos os dados. O modo de rota pode enviar conteúdo ao modelo local configurado; o proxy também processa o tráfego.',
    care: 'Não trate como garantia de anonimização. Teste políticas com dados fictícios e evite inserir segredos.',
    license: 'Apache-2.0', lastPush: '2026-10-13', confidence: 'média', tags: ['privacidade', 'redação', 'proxy', 'segredos', 'ia']
  },
  {
    id: 'emdash', name: 'Emdash', url: 'https://github.com/generalaction/emdash',
    summary: 'Ambiente open source para desenvolvimento com agentes de código em paralelo.',
    category: 'aplicativo independente', use: 'Pode ser pesquisado para comparação de ambientes de desenvolvimento com múltiplos agentes.',
    compatibility: 'README menciona Claude Code ou Codex entre os CLIs compatíveis e lista builds para macOS, Windows e Linux. A disponibilidade de cada agente/provedor e build pode variar.',
    permissions: 'Acesso a projetos locais, CLIs de agentes e, opcionalmente, máquinas remotas via SSH/SFTP e integrações de tickets/repositórios.',
    risks: 'Pode executar agentes em paralelo, operar sobre worktrees e revisar/criar/mesclar pull requests. SSH e ferramentas externas ampliam o acesso; agentes podem enviar código aos próprios provedores.',
    care: 'Use repositório descartável, revise permissões e mudanças de cada agente e mantenha aprovação humana para ações externas.',
    license: 'Apache-2.0', lastPush: '2026-10-26', confidence: 'alta para finalidade; média para requisitos e riscos de configuração', tags: ['agentes', 'paralelo', 'coding', 'desenvolvimento', 'terminal']
  },
  {
    id: 'openwork', name: 'OpenWork', url: 'https://github.com/different-ai/openwork',
    summary: 'Aplicativo open source inspirado em ambientes de trabalho com agentes, baseado em OpenCode.',
    category: 'aplicativo independente', use: 'Pode ser avaliado como ambiente desktop separado para tarefas com arquivos e agentes.',
    compatibility: 'Branch padrão atual `dev`; sistemas e instalação: não verificado nesta revisão.',
    permissions: 'Pode precisar de acesso a arquivos e ferramentas configuradas para o agente; escopo exato depende da instalação.',
    risks: 'Agentes podem atuar sobre arquivos ou ferramentas disponíveis ao processo. Licença SPDX não identificada pela API.',
    care: 'Leia instruções e permissões da branch/releases antes de experimentar; prefira uma cópia do projeto.',
    license: 'Não verificado (API marca NOASSERTION)', lastPush: '2026-10-29', confidence: 'média', tags: ['agente', 'desktop', 'arquivos', 'opencode', 'desenvolvimento']
  },
  {
    id: 'bridgeclip', name: 'BridgeClip', url: 'https://github.com/bridge-mind/bridgeclip',
    summary: 'Aplicativo desktop para recortar vídeos com recursos de IA.',
    category: 'aplicativo independente', use: 'Pode acelerar a criação de clipes de demonstração a partir de vídeos longos.',
    compatibility: 'README lista instaladores para macOS, Windows x64 e Linux x64. Desenvolvimento requer Node.js 22, Python 3.12 e FFmpeg com filtro ass.',
    permissions: 'Processa vídeos escolhidos pelo usuário; dependências de IA/rede: não verificadas.',
    risks: 'Trata arquivos de vídeo e pode produzir clipes derivados; destino de processamento e eventuais serviços remotos não verificados.',
    care: 'Use mídia que você possa processar e confirme se o fluxo escolhido é local antes de carregar conteúdo privado.',
    license: 'MIT', lastPush: '2026-10-01', confidence: 'média', tags: ['vídeo', 'clipes', 'edição', 'desktop', 'ia']
  },
  {
    id: 'cc-safety-net', name: 'CC Safety Net', url: 'https://github.com/kenryu42/cc-safety-net',
    summary: 'Guardião pré-execução que tenta bloquear comandos destrutivos e acessos comuns a arquivos sensíveis em agentes de código.',
    category: 'referência', use: 'Pode servir como referência de guardrails; não substitui as aprovações ou sandbox do CodexBridge.',
    compatibility: 'README declara suporte a Claude Code ou Codex em Windows, macOS e Linux; requer Node.js 22 ou superior.',
    permissions: 'Integra-se antes da execução de ferramentas/comandos do agente para inspecionar ações.',
    risks: 'O próprio README diz que não é sandbox: não contém processos, não define permissões de filesystem e não observa tráfego de saída da rede. Regras podem deixar passar variantes ou bloquear comandos válidos.',
    care: 'Não trate como garantia de segurança. Revise configuração, cobertura de comandos e bloqueios com exemplos não destrutivos.',
    license: 'MIT', lastPush: '2026-10-29', confidence: 'alta para finalidade; média para cobertura efetiva', tags: ['segurança', 'guardrails', 'comandos', 'shell', 'arquivos']
  },
  {
    id: 'cogsend', name: 'Cogsend', url: 'https://github.com/cogsend/cogsend',
    summary: 'Agendador self-hosted para escrever e publicar conteúdo em redes sociais, implantado em uma conta Cloudflare.',
    category: 'aplicativo independente', use: 'Pode organizar rascunhos e publicações sociais, separado do CodexBridge.',
    compatibility: 'README descreve execução em Cloudflare; Windows como host: não verificado.',
    permissions: 'Conta Cloudflare e tokens das redes sociais conectadas, conforme destino escolhido.',
    risks: 'Pode publicar conteúdo em contas conectadas; credenciais de publicação são sensíveis.',
    care: 'Comece com ambiente de teste, limite tokens e revise texto, conta e horário antes de publicar.',
    license: 'MIT', lastPush: '2026-10-22', confidence: 'alta para descrição e implantação; média para escopo de tokens', tags: ['redes sociais', 'publicação', 'agendamento', 'cloudflare', 'marketing']
  },
  {
    id: 'handy', name: 'Handy', url: 'https://github.com/cjpais/Handy',
    summary: 'Aplicativo de ditado e conversão de fala em texto que declara funcionar offline.',
    category: 'aplicativo independente', use: 'Pode transformar fala em texto para rascunhos e notas.',
    compatibility: 'README declara suporte a Windows, macOS e Linux e oferece release/winget. O README informa que o winget é mantido por terceiros.',
    permissions: 'Microfone e acessibilidade são permissões necessárias mencionadas no README; modelos de transcrição são escolhidos para processamento local.',
    risks: 'Áudio pode conter informação privada. O projeto declara processamento inteiramente local; essa alegação não foi auditada independentemente.',
    care: 'Confira permissões do microfone e confirme modo offline antes de ditar conteúdo sensível.',
    license: 'MIT', lastPush: '2026-10-27', confidence: 'média', tags: ['voz', 'ditado', 'transcrição', 'offline', 'microfone']
  },
  {
    id: 'mailflare', name: 'Mailflare', url: 'https://github.com/hieunc229/mailflare',
    summary: 'Aplicativo de e-mail para uso pessoal e em equipes.',
    category: 'aplicativo independente', use: 'Pode apoiar gestão de e-mail em implantação separada.',
    compatibility: 'Requisitos, implantação e suporte Windows: não verificado nesta revisão.',
    permissions: 'Uso de e-mail normalmente exige contas, tokens ou credenciais; detalhes deste projeto não verificados.',
    risks: 'E-mail contém dados pessoais e anexos; envio pode alcançar destinatários externos.',
    care: 'Não conecte caixa real sem revisar armazenamento, autenticação, política de privacidade e mecanismo de envio.',
    license: 'AGPL-3.0', lastPush: '2026-10-29', confidence: 'baixa a média; baseada na descrição oficial', tags: ['email', 'e-mail', 'mensagens', 'comunicação']
  },
  {
    id: 'webssh', name: 'WebSSH', url: 'https://github.com/bifrost0x/webssh',
    summary: 'Workspace self-hosted para SSH e SFTP, com gestão multiusuário e recursos de autenticação descritos pelo projeto.',
    category: 'aplicativo independente', use: 'Pode fornecer acesso remoto administrativo a servidores; não é necessário para o CodexBridge.',
    compatibility: 'README descreve serviço self-hosted; suporte Windows como host não verificado. O README remete a wiki para instalação, operação e segurança.',
    permissions: 'Acesso SSH/SFTP a hosts configurados e gestão de chaves/identidade conforme a instalação.',
    risks: 'SSH executa comandos remotos e SFTP lê/escreve arquivos em servidores; credenciais ou chaves concedem acesso elevado.',
    care: 'Não exponha o serviço à internet sem revisar autenticação, rede e atualizações. Use contas restritas e chaves específicas.',
    license: 'Apache-2.0', lastPush: '2026-10-29', confidence: 'alta para finalidade; permissões finas dependem da configuração', tags: ['ssh', 'sftp', 'servidor', 'terminal', 'remoto']
  },
  {
    id: 'logdeck', name: 'LogDeck', url: 'https://github.com/AmoabaKelvin/logdeck',
    summary: 'Aplicativo self-hosted para logs persistentes, alertas e administração de containers Docker/Podman; também oferece CLI e MCP.',
    category: 'integração MCP/skill', use: 'Pode permitir que um cliente MCP leia logs e opere containers. O serviço LogDeck é independente e não foi conectado ao CodexBridge.',
    compatibility: 'Requisitos e suporte a Windows: não verificado nesta revisão.',
    permissions: 'Quick start monta docker.sock, /proc somente leitura e volume persistente. Pode conectar hosts via socket, TCP ou SSH.',
    risks: 'README informa que inicia/para/remove containers e stacks, edita variáveis de ambiente e abre terminal. Começa sem login e recomenda habilitar autenticação antes de expor fora da máquina. Logs ficam persistidos em disco.',
    care: 'Habilite autenticação antes de expor a interface; restrinja socket/API e SSH, proteja o volume persistente e remova segredos dos logs.',
    license: 'GPL-3.0', lastPush: '2026-10-17', confidence: 'média', tags: ['logs', 'docker', 'containers', 'observabilidade']
  },
  {
    id: 'breakscale', name: 'Breakscale', url: 'https://github.com/workersio/breakscale',
    summary: 'Simulador visual para aprender desenho e carga de sistemas distribuídos.',
    category: 'integração MCP/skill', use: 'Pode ajudar a aprender arquitetura distribuída com exemplos e expor um servidor MCP hospedado que integra com clientes compatíveis. Não está conectado ao CodexBridge.',
    compatibility: 'README lista extensão VS Code e servidor MCP compatível com Codex e outros clientes; sistema operacional e requisitos: não verificados.',
    permissions: 'O MCP remoto descrito usa endpoint hospedado pelo projeto e recebe solicitações do cliente; uso local da extensão tem requisitos diferentes.',
    risks: 'Solicitações ao endpoint remoto deixam o ambiente local e são processadas pelo serviço do projeto. Resultados de simulação são didáticos e podem não representar produção.',
    care: 'Revise o conteúdo enviado ao MCP e a política do serviço antes de conectar. Para decisões de produção, valide com medições reais.',
    license: 'MIT', lastPush: '2026-10-28', confidence: 'alta para finalidade; média para requisitos', tags: ['sistemas distribuídos', 'simulação', 'arquitetura', 'aprendizado', 'carga']
  },
  {
    id: 'recordly', name: 'Recordly', url: 'https://github.com/webadderallorg/Recordly',
    summary: 'Aplicativo para gravar demonstrações de produto e criar vídeos polidos.',
    category: 'aplicativo independente', use: 'Pode produzir vídeos para apresentar aplicações ou fluxos de trabalho.',
    compatibility: 'README lista macOS 14+, Windows 10 build 19041+ e distribuições Linux modernas. Em versões antigas do Windows, captura pode funcionar com limitações no cursor.',
    permissions: 'Captura tela/janela, microfone e áudio do sistema quando habilitados; projetos .recordly registram o caminho da mídia de origem.',
    risks: 'Gravação pode capturar informações pessoais exibidas na tela ou áudio. Linux geralmente requer PipeWire para áudio do sistema; cursor pode continuar visível em algumas plataformas.',
    care: 'Feche conteúdo privado, desative notificações e confira a gravação e o caminho da mídia antes de compartilhar arquivos .recordly.',
    license: 'AGPL-3.0 (badge declarado no README)', lastPush: '2026-10-24', confidence: 'alta para sistemas e licença declarados', tags: ['gravação', 'vídeo', 'demonstração', 'captura de tela']
  },
  {
    id: 'kept', name: 'Kept', url: 'https://github.com/ericerkz/kept',
    summary: 'Aplicativo self-hosted de notas no estilo Google Keep.',
    category: 'integração MCP/skill', use: 'Pode guardar notas pessoais e permitir acesso autenticado via MCP local ou remoto. O app é separado e não está conectado ao CodexBridge.',
    compatibility: 'Requisitos e suporte a Windows: não verificado nesta revisão.',
    permissions: 'Armazenamento de notas e contas locais; o README descreve MCP autenticado, OAuth 2.1 para integrações e OIDC opcional.',
    risks: 'Um cliente MCP autorizado pode ler notas dentro do escopo fornecido; configuração remota pode expor dados se autenticação ou escopo estiverem incorretos.',
    care: 'Não armazene segredos sem avaliar criptografia e controle de acesso; proteja backups e instância self-hosted.',
    license: 'Não verificado (API marca NOASSERTION)', lastPush: '2026-10-29', confidence: 'média', tags: ['notas', 'self-hosted', 'anotações', 'organização']
  },
  {
    id: 'sqlit', name: 'SQLit', url: 'https://github.com/Maxteabag/sqlit',
    summary: 'Interface de terminal para consultar bancos SQL, incluindo SQLite, PostgreSQL e MySQL.',
    category: 'aplicativo independente', use: 'Pode apoiar exploração e consulta manual de bancos de dados.',
    compatibility: 'README descreve ferramenta Python; sistemas exatos e suporte Windows não verificados nesta revisão.',
    permissions: 'Acesso de rede ou a arquivos de banco e credenciais conforme conexão selecionada.',
    risks: 'Consultas podem expor dados e, dependendo das permissões/conteúdo executado, alterar registros.',
    care: 'Use usuário somente leitura para inspeção, confirme o banco alvo e não cole credenciais no Codex.',
    license: 'MIT', lastPush: '2026-10-28', confidence: 'alta para finalidade; média para permissões exatas', tags: ['sql', 'banco de dados', 'postgresql', 'mysql', 'sqlite']
  },
  {
    id: 'ezbookkeeping', name: 'ezBookkeeping', url: 'https://github.com/mayswind/ezbookkeeping',
    summary: 'Aplicativo self-hosted para registrar transações e finanças pessoais, com importação e recurso MCP descritos no README.',
    category: 'integração MCP/skill', use: 'Pode organizar finanças pessoais; o README também descreve integração MCP para clientes de IA. O aplicativo é separado do CodexBridge.',
    compatibility: 'README declara Windows, macOS, Linux e FreeBSD; inclui comandos de build para Windows e imagem Docker.',
    permissions: 'Armazenamento de transações financeiras e importação de dados; o escopo da integração MCP não foi verificado.',
    risks: 'Trata informações financeiras pessoais. Se MCP for habilitado, o cliente autorizado poderá acessar dados conforme o escopo implementado, que não foi auditado.',
    care: 'Use autenticação forte, backups protegidos e dados fictícios durante a avaliação.',
    license: 'MIT', lastPush: '2026-10-29', confidence: 'alta para finalidade; média para recursos de integração', tags: ['finanças', 'despesas', 'contabilidade', 'self-hosted', 'privacidade']
  },
  {
    id: 'dockge', name: 'Dockge', url: 'https://github.com/louislam/dockge',
    summary: 'Painel self-hosted para administrar stacks Docker Compose.',
    category: 'aplicativo independente', use: 'Pode ajudar a gerenciar stacks de serviços; é separado do CodexBridge.',
    compatibility: 'README requer Docker 20+ ou Podman e lista distribuições Linux suportadas; declara Windows não suportado como host.',
    permissions: 'Acesso ao Docker Engine/socket e aos arquivos Compose conforme o setup; pode montar diretórios de stacks e credenciais Docker.',
    risks: 'Pode editar, iniciar, parar, reiniciar e atualizar stacks. O Compose documentado monta docker.sock e arquivos do host; o README alerta que caminhos de volume incorretos podem gravar no local errado. Windows não é suportado como host.',
    care: 'Não exponha o socket Docker nem painel sem autenticação/rede restrita; revise volumes e imagens antes de iniciar stacks.',
    license: 'MIT', lastPush: '2026-10-23', confidence: 'alta', tags: ['docker', 'compose', 'containers', 'deploy', 'servidor']
  },
  {
    id: 'openobserve', name: 'OpenObserve', url: 'https://github.com/openobserve/openobserve',
    summary: 'Plataforma de observabilidade para logs, métricas, traces e monitoramento de aplicações.',
    category: 'aplicativo independente', use: 'Pode centralizar telemetria de serviços; não é uma integração direta do CodexBridge.',
    compatibility: 'README documenta implantação de servidor/binário; suporte específico como host Windows não verificado.',
    permissions: 'Ingestão e armazenamento de telemetria; agentes/coletores e credenciais dependem da configuração.',
    risks: 'Logs e traces podem conter identificadores, tokens ou dados de usuários; ingestão aumenta o volume de dados guardados.',
    care: 'Redija dados sensíveis na origem, limite retenção e acesso e confira onde a telemetria é enviada.',
    license: 'AGPL-3.0', lastPush: '2026-10-29', confidence: 'alta para finalidade; média para integração específica', tags: ['observabilidade', 'logs', 'métricas', 'traces', 'monitoramento']
  },
  {
    id: 'dify', name: 'Dify', url: 'https://github.com/langgenius/dify',
    summary: 'Plataforma para criar fluxos de IA, aplicações RAG e integrações com modelos e ferramentas.',
    category: 'aplicativo independente', use: 'Pode servir para prototipar fluxos e aplicações de IA fora do CodexBridge.',
    compatibility: 'Quick start requer CPU de 2 cores, RAM de 4 GiB, Docker e Docker Compose v2.24.0+. Suporte Windows como host não verificado.',
    permissions: 'Pode guardar chaves de provedores, conectar fontes de dados e executar ferramentas selecionadas pelo fluxo.',
    risks: 'Fluxos podem enviar documentos a provedores, consultar dados conectados ou acionar ferramentas; licença do repositório reportada como NOASSERTION pela API.',
    care: 'Use dados de teste, limite credenciais, revise conectores e destinos de dados e confira a licença antes de uso/distribuição.',
    license: 'Não verificado (API marca NOASSERTION)', lastPush: '2026-10-29', confidence: 'alta para finalidade; média para detalhes de integração', tags: ['ia', 'rag', 'workflow', 'documentos', 'modelos', 'ferramentas']
  },
  {
    id: 'taskosaur', name: 'Taskosaur', url: 'https://github.com/Taskosaur/Taskosaur',
    summary: 'Gerenciador de projetos com fluxos conversacionais de IA e execução de tarefas descrita pelo projeto.',
    category: 'aplicativo independente', use: 'Pode organizar trabalho em equipe; não executa tarefas através do CodexBridge nesta atualização.',
    compatibility: 'README descreve implantação self-hosted; requisitos e Windows: não verificados.',
    permissions: 'Pode armazenar dados de equipe e conectar um provedor de IA; escopo de ferramentas não verificado.',
    risks: 'Conteúdo de projetos pode ser enviado ao provedor de IA configurado; automações dependem de integrações habilitadas.',
    care: 'Não inclua dados confidenciais sem revisar retenção, provedor, permissões e configuração de execução.',
    license: 'Business Source License (BSL; condições comerciais devem ser lidas no arquivo LICENSE)', lastPush: '2026-09-11', confidence: 'alta para licença declarada; média para permissões', tags: ['tarefas', 'projetos', 'equipe', 'ia', 'gestão']
  },
  {
    id: 'presenton', name: 'Presenton', url: 'https://github.com/presenton/presenton',
    summary: 'Gerador de apresentações por IA com interface, API e servidor MCP descritos pelo projeto.',
    category: 'aplicativo independente', use: 'Pode ajudar a criar apresentações a partir de um briefing ou material de projeto.',
    compatibility: 'README lista app desktop para macOS, Windows e Linux e implantação self-hosted por Docker; suporte de Docker Desktop como host Windows não verificado.',
    permissions: 'Pode processar briefings/documentos, conectar provedores de modelos e expor geração via MCP. A versão self-hosted documenta usuário/senha de administrador.',
    risks: 'Conteúdo pode ser enviado ao provedor escolhido; MCP/API podem gerar apresentações. Saída pode conter erros e exige revisão humana.',
    care: 'Use material que possa ser enviado ao provedor selecionado e revise fatos, imagens, citações e exportação.',
    license: 'Apache-2.0', lastPush: '2026-10-28', confidence: 'alta para finalidade; média para requisitos e destinos de dados', tags: ['apresentação', 'slides', 'ia', 'documentos', 'design']
  },
  {
    id: 'vibecraft', name: 'Vibecraft', url: 'https://github.com/Nearcyan/vibecraft',
    summary: 'Referencia visual de uma oficina; o original e voltado ao Claude Code em macOS/Linux.',
    category: 'Referencia visual',
    use: 'Inspiracao para a Oficina CodexBridge. Nao e integracao pronta nem recomendacao de instalacao no Windows.',
    compatibility: 'O README descreve Claude Code em macOS/Linux e declara Windows nao suportado. Compatibilidade Codex: nao verificada.',
    permissions: 'Nao verificado; o original lista hooks Bash, tmux e jq.',
    risks: 'A instalacao original depende de hooks Bash e processos auxiliares; executa-los pode iniciar comandos no ambiente do usuario. Esta entrada nao recomenda instalar o original no Windows.',
    care: 'Use somente como referencia visual. Nao instale o original no Windows esperando suporte Codex; revise README e licenca antes de reutilizar codigo ou assets.',
    license: 'MIT (conforme README oficial)', lastPush: 'Not verified', confidence: 'Alta para requisitos do README; compatibilidade Codex nao verificada', tags: ['vibecraft', 'referencia visual', 'workshop', 'claude code', 'macos', 'linux']
  }
];

const STOP_WORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'ao', 'aos', 'as', 'os', 'um', 'uma', 'e', 'ou', 'para', 'com', 'sem', 'como', 'quero', 'preciso', 'sobre', 'ajuda', 'projeto', 'codex', 'bridge', 'the', 'and', 'with', 'from', 'that', 'this']);

export function findCatalogProjects({ project_id, goal } = {}) {
  if (typeof project_id === 'string' && project_id.trim()) {
    const id = project_id.trim().toLowerCase();
    const found = projectCatalog.find(item => item.id === id || item.name.toLowerCase() === id || item.url.toLowerCase().endsWith(`/${id}`));
    return found ? [found] : [];
  }
  if (typeof goal !== 'string' || !goal.trim()) return [];
  const words = goal.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9+#.-]{2,}/g) || [];
  const terms = [...new Set(words.map(word => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')).filter(word => !STOP_WORDS.has(word)))];
  if (!terms.length) return [];
  return projectCatalog.map(item => {
    const haystack = [item.name, item.summary, item.category, item.use, ...item.tags].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const catalogWords = new Set(haystack.match(/[a-z0-9+#.-]{2,}/g) || []);
    const matches = terms.filter(term => catalogWords.has(term) || (term.length >= 4 && [...catalogWords].some(word => word.startsWith(term))));
    return { item, score: matches.length, matches };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, 8).map(result => result.item);
}
