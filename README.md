# CodexBridge Unificado

## Comece aqui

Este projeto roda **no seu computador** e oferece ferramentas MCP para trabalhar em uma pasta escolhida por tarefa. O dashboard local ajuda a acompanhar tarefas e aprovações. Publicar o código no GitHub não publica o seu servidor nem conecta automaticamente o ChatGPT.

### Instalação para qualquer pessoa

1. Quando o repositório estiver acessível, baixe o ZIP pelo botão **Code > Download ZIP** ou clone com `git clone https://github.com/arthursoudin/Plugin-Codex-Bringed.git`. Se o repositório estiver privado, solicite acesso ao proprietário.
2. No Windows, execute `Install.cmd` na pasta extraída. Ele prepara somente o Node.js necessário para o uso local. O `npm install` é necessário para desenvolvimento/testes e para a leitura opcional de páginas públicas; esse recurso também requer `npx playwright install chromium`.
3. Execute `Start.cmd`. Abra `http://127.0.0.1:18473/dashboard` no mesmo computador. Para trabalhar em arquivos, informe uma pasta existente em `project_directory` em cada tarefa ou inicie `scripts\Start-Adapter.ps1 -Project 'C:\caminho\do\projeto'` para definir um padrão.
4. Para um cliente MCP local, configure um servidor **stdio** com o executável `node` e o caminho absoluto para `stdio.mjs` como argumento. Para acesso remoto pelo ChatGPT, siga a seção de túnel abaixo; ela exige configuração separada e credenciais próprias.

Não coloque chaves, relatórios, aprovações ou histórico local no Git. Esses arquivos são ignorados pelo `.gitignore`. Revise `git status` antes de publicar.

### Retencao local de tarefas

O historico ativo mantem ate 100 tarefas concluidas e relatorios, por no maximo 180 dias. Antes de sair do historico ativo, cada registro e copiado e conferido em history/retention-archive; aprovacoes ainda validas nunca sao arquivadas. A pagina Retencao do dashboard permite revisar e restaurar esses dados por 30 dias. A abertura da pagina Retencao e cada nova gravacao fazem a varredura; arquivos arquivados que ultrapassaram os 30 dias sao removidos nessa varredura. A restauracao nao sobrescreve arquivos existentes e concede 30 dias antes de nova elegibilidade, mesmo para relatorios sem registro de historico. Esses dados continuam locais e nao entram no Git.

### Instalação assistida pelo Codex

Abra o Codex na pasta onde deseja baixar o projeto e peça:

> Clone o repositório `https://github.com/arthursoudin/Plugin-Codex-Bringed.git` em uma pasta nova. Leia o README e `config/settings.example.json`. No Windows, prepare o Node.js com `Install.cmd` e explique como iniciar `Start.cmd` ou configurar `stdio.mjs` no meu cliente MCP. Instale dependências de desenvolvimento com `npm install` somente se eu pedir testes ou desenvolvimento. Não copie configurações locais, credenciais, histórico ou aprovações de outra instalação. Antes de alterar uma instalação existente, compare as pastas e apresente os passos de migração.

O endereço acima aponta para o repositório oficial deste projeto; a disponibilidade depende das permissões do GitHub. O Codex CLI deve estar instalado e autenticado separadamente para executar tarefas Codex. `tunnel-client` só é necessário para a conexão remota.

Para tarefas Codex, instale o CLI com `npm install -g @openai/codex` e faça login com `codex login`. O bridge procura o CLI na instalação npm global padrão do Windows e em `~/npm-global`; se ele estiver em outro lugar, defina `CODEXBRIDGE_CODEX_JS` com o caminho absoluto do arquivo `@openai/codex/bin/codex.js` antes de iniciar o adapter. Confira o resultado pela ferramenta `codex_status`.

O diretório `account-plugin/skills/` documenta o fluxo do plugin pessoal CodexBringed. O manifesto e a conexão desse plugin pertencem à conta de quem o criou; clonar este repositório não instala essa conexão em outra conta. Cada pessoa configura seu próprio cliente MCP com `stdio.mjs` ou seu próprio túnel.

Adapter MCP HTTP e stdio, dashboard, núcleo CodexBridge, scripts de inicialização e documentação reunidos numa pasta.

## Pastas

- `server.mjs`, `stdio.mjs`, `workflow.mjs`, `dashboard.mjs`: transports HTTP e stdio, ferramentas MCP e interface web.
- `bridge/`: núcleo CodexBridge, aprovações locais, relatórios e testes do núcleo.
- `history/`: histórico do dashboard e identidade de projetos cadastrados.
- `config/tunnels/`: perfis locais do tunnel. `example.yaml` é apenas um modelo.
- `scripts/`: inicialização segura do adapter e do tunnel no Windows.
- `tools/`: opcional para guardar executáveis portáteis Node e tunnel-client.

O módulo MCP de leitura pública usa Playwright. Para habilitá-lo nesta instalação, execute `npm install` e `npx playwright install chromium` na pasta do projeto. O navegador é iniciado sem perfil persistente e sem porta de depuração; JavaScript fica desativado.
- `docs/`: READMEs das versões de origem para consulta de proveniência.
- `account-plugin/`: fonte da skill do plugin pessoal no ChatGPT; a conexão do App é preservada em uma atualização separada do servidor MCP.

## Projetos recomendados e recursos planejados

O dashboard inclui **Projetos**, um catálogo local e pesquisável de 30 projetos/repositórios recomendados e opcionais, e **Em breve**, que descreve coordenação de revisores especializados como uma ideia futura. A página Em breve não significa que múltiplos agentes já estejam disponíveis.

A **Oficina Codex** é uma visualização local, opcional e de agente único. Abra **Oficina Codex** no menu do dashboard para escolher uma tarefa e ver a cena 2.5D, o estado e um feed compacto. O estado vem das tarefas e aprovações do CodexBridge; a atividade vem dos eventos JSONL emitidos pelo processo `codex exec --json` que o Bridge já inicia. Ela não acompanha sessões independentes do Codex CLI.

O feed mapeia somente eventos conhecidos do JSONL: início/fim de turno, alterações de arquivo, execução de comandos, chamadas MCP, pesquisa web, lista de tarefas, mensagens de resposta e erros. Leitura de arquivo e busca no código não têm um tipo separado confirmado nesta integração; quando o evento não identifica a estação, a cena usa a área geral. O feed conserva até 80 eventos sanitizados por tarefa no relatório local e exibe os 20 mais recentes. Com execução ativa, marque **Acompanhar atividade automaticamente** para consultar a página local a cada 4 segundos enquanto a aba estiver visível; sem isso, use **Atualizar agora**. A preferência e a opção de animações ficam no armazenamento local do navegador. `prefers-reduced-motion` desativa movimentos mesmo com a opção ligada.

A Oficina não exibe prompts, comandos, argumentos, caminhos, conteúdo de arquivos, saída bruta, segredos nem raciocínio do modelo. Ela mostra “Sem atividade conectada” quando a execução não emite eventos reconhecidos. Se necessário, ainda mostra o estado geral registrado. Não existe modo de demonstração. A aprovação abre a página de aprovação já existente; cancelar, quando o processo ainda está ativo, chama a ferramenta MCP existente `codex_cancel_task`. A Oficina não inicia nem modifica tarefas por outros meios.

No Windows, a cena usa HTML/CSS e JavaScript do próprio dashboard, sem hooks, tmux, jq, WSL, serviços externos ou dependências adicionais. As formas da cena foram feitas para este plugin; nenhum código ou asset do Vibecraft foi copiado. O README do [Vibecraft](https://github.com/Nearcyan/vibecraft) declara licença MIT, mas também limita o suporte a macOS/Linux por depender de hooks Bash, além de listar `tmux` e `jq`; sua licença não altera esses requisitos.

O catálogo foi conferido em 2026-10-29 usando README/páginas oficiais e metadados públicos da API do GitHub (licença SPDX quando presente, branch padrão e data de último push). Compatibilidade Windows, permissões detalhadas, requisitos e riscos não explícitos nos materiais consultados aparecem como “não verificado”. Quando o README/API não confirma uma licença, ela não é presumida como open source. A data de último push é uma referência de atividade, não uma garantia de manutenção ou qualidade. A confiança indica o quanto o resumo e os metadados foram confirmados; não é uma certificação de segurança.

Vibecraft consta como referencia visual. O original e voltado ao Claude Code em macOS/Linux e declara Windows nao suportado; esta entrada nao recomenda sua instalacao no Windows. Compatibilidade com Codex nao verificada. A Oficina Codex e uma visualizacao nativa do historico do Bridge, sem integracao ou dependencia do Vibecraft.

Cada item é apenas uma recomendação com link para o repositório oficial. O CodexBridge não baixa, instala, conecta, inicia nem executa esses projetos. Alguns são integrações MCP/skill; os demais são aplicativos independentes ou referências. Os riscos descritos são limites documentados ou inferências operacionais das funções descritas, não resultados de auditoria de código. Revise requisitos e licença no repositório antes de usar. Projetos com navegador, SSH/SFTP, shell, Docker, bancos de dados, e-mail ou publicação podem acessar ou alterar recursos concedidos pela configuração escolhida.

A ferramenta MCP somente de leitura `codexbridge_project_advisor` consulta o mesmo catálogo local. Informe exatamente um campo: `project_id` para detalhes de um item ou `goal` para buscar por termos relacionados. A busca usa apenas nomes, descrições e tags locais; não acessa a rede nem aceita URLs. Se não encontrar itens correspondentes, retorna essa informação explicitamente. Ela não instala nem executa recomendações.

O adapter importa `bridge/server.mjs` dentro da mesma pasta. Não depende de `Desktop\CodexBridge`.
O comando `npm run build` gera `dist/codexbridge-plugin-update.zip` com o servidor e os scripts locais. Se o destino já existir, o build falha e preserva o ZIP; escolha outro caminho com `npm run build -- -OutputPath dist/codexbridge-plugin-update-2.zip`. ZIPs em `dist/` são artefatos locais e não entram no Git. Atualizar o pacote não reinicia o adapter, troca a porta ou reconecta o App. Se duas conexões CodexBridge aparecerem, compare a instância antes de desativar qualquer uma; uma conexão antiga pode guardar histórico ou tarefas pendentes.

## Requisitos

- Windows PowerShell. Node.js 22 ou superior será instalado pelo `Install.cmd` se ainda não estiver disponível. O `tunnel-client` é opcional e só será instalado quando você iniciar o tunnel remoto.
- Codex CLI instalado e autenticado para executar tarefas Codex.
- `tunnel-client` instalado ou colocado em `tools/` para abrir a conexão MCP remota.
- Hermes CLI é opcional.

Os executáveis podem continuar instalados fora da pasta. `config/settings.local.json` pode apontar seus caminhos e não deve conter chaves. Comece por copiar `config/settings.example.json` para `config/settings.local.json` se quiser definir caminhos fixos. Por padrão, os inicializadores instalam as versões oficiais verificadas quando necessário; defina `autoInstallTools` como `false` para desativar isso.

## Instalação automática de ferramentas

Execute `Install.cmd` para preparar Node.js v24.22.1 em `%LOCALAPPDATA%\CodexBridge\tools`, sem privilégios de administrador. O download vem do site oficial, é conferido por SHA-256 antes de ser extraído e registrado em `current.json`. O `tunnel-client` v0.0.18 só é instalado quando você inicia o tunnel remoto com `Tunnel.cmd`. Nenhuma chave de API é lida ou armazenada pelo instalador.

Na página **Tunnels**, o painel mostra o estado das ferramentas instaladas pelo CodexBridge e oferece ação explícita para instalá-las ou atualizá-las. A instalação só começa depois de marcar a permissão e clicar no botão.

## Iniciar o dashboard e o MCP local

No PowerShell, a partir de qualquer pasta:

```powershell
& 'CAMINHO\CodexBridge-Unificado\Start.cmd'
```

Ou:

```powershell
& 'CAMINHO\CodexBridge-Unificado\scripts\Start-Adapter.ps1'
```

`-Project` é opcional. Sem ele, o adapter inicia sem projeto padrão, para conexão, guias e diagnósticos. Para cada tarefa que trabalhe com arquivos, informe explicitamente em `project_directory` uma pasta existente. O launcher nunca escolhe Jarvis, uma variável de ambiente ou um projeto salvo automaticamente. O cadastro no dashboard serve para organização e políticas; não substitui a seleção da pasta na tarefa nem concede acesso de execução.

O script não encerra processos quando a porta 18473 está ocupada. Identifique o processo manualmente antes de qualquer troca. Dashboard: `http://127.0.0.1:18473/dashboard`. No primeiro acesso, o navegador pedirá HTTP Basic: usuário `codexbridge` e senha igual ao token local; consulte a seção Segurança para localizar o arquivo.

Para um cliente MCP local com suporte a stdio, configure o comando `node` com o argumento absoluto `CAMINHO\CodexBridge-Unificado\stdio.mjs`. Essa entrada expõe as mesmas ferramentas do workflow HTTP. Ela também inicia o dashboard em `127.0.0.1`: tenta a porta 18473 e, se estiver ocupada, procura até nove portas seguintes. A porta escolhida aparece em `stderr` e nas URLs retornadas pelas ferramentas. `stdout` fica reservado às mensagens JSON-RPC do MCP. O processo encerra seu próprio servidor local quando a entrada stdio é fechada. Esse modo ainda não foi validado numa instalação desktop real; o teste atual cobre o transporte em memória, sem iniciar um segundo adapter.

Para obter o contexto de um projeto em um único texto, use a ferramenta MCP `codex_project_summary` e informe uma pasta existente em `project_directory` se não houver pasta padrão. Ela reúne etapas/orientações do README, notas locais e estados das até 30 tarefas recentes. Funciona sem cadastro no dashboard, não marca etapas como concluídas por inferência e limita a resposta para evitar contexto excessivo.

## Avaliador de modelo Codex

Em **Roteamento**, ative Codex e defina **Modelo mestre (teto)** e **Pensamento máximo**. O teto é o valor salvo nesse painel; não é lido automaticamente da sessão do ChatGPT. Antes de preparar uma tarefa Codex, o plugin avalia o texto localmente e retorna um resumo do pedido, modelo, esforço e motivo. A ferramenta MCP `codex_model_evaluate` permite ver essa sugestão sem executar nada. O avaliador usa sinais simples do texto, por isso a pessoa deve revisar a escolha antes de aprovar. Não há chamada extra a uma IA para fazer a classificação.

Para todas as conversas conectadas a este adapter, você também pode pedir: “Use Luna nas tarefas pequenas, mas permita até Astra/max nas tarefas grandes até reiniciar o Bridge.” O agente registra essa escolha com `codex_model_session`. A política fica em memória e vale automaticamente em novas avaliações e tarefas Codex de todas as conversas até reiniciar o adapter ou usar `action=clear`. Ela substitui o teto global enquanto estiver ativa; o modelo da conversa não limita o processo Codex filho. Alterar ou encerrar a política invalida tarefas pendentes preparadas sob a revisão antiga. Cada tarefa mostra modelo e pensamento antes da aprovação e mantém o snapshot aprovado durante a execução. Use `action=get` para conferir.

Para modelos conhecidos, a ordem usada pelo plugin é Luna, Terra, Sol e Astra. Modelo e pensamento são avaliados separadamente. Com teto Sol/high, uma alteração visual pequena pode usar Luna/low, lógica localizada Luna/medium, investigação localizada Luna/high, mudança mecânica em vários arquivos Sol/low e refatoração Sol/medium. O avaliador não escolhe uma combinação acima de nenhum dos dois tetos; com teto Sol/medium, por exemplo, Luna/high é reduzido a Luna/medium. Modelos fora da lista ficam restritos ao próprio nome configurado. Se o teto mudar após a preparação, a execução é conferida novamente e pode exigir novo preparo. As mesmas regras são aplicadas a tarefas Codex diretas, roteadas e de leitura quando o roteamento está ativo; Hermes mantém sua configuração separada. A classificação não comprova disponibilidade do modelo na conta ou no Codex CLI.

## Opções de economia de tokens
RTK reduz a saída dos comandos que a IA precisa ler. Headroom otimiza contexto em requisições encaminhadas por clientes de API compatíveis. Graphify pesquisa o código com um grafo local. RTK e Headroom acompanham estimativas; Graphify não mede tokens diretamente. As três opções são opcionais.


Na página **Economia de tokens**, selecione e salve o RTK para habilitar **Atualizar dados do RTK**. O botão executa localmente `rtk gain --all --format json` somente quando solicitado, exige que `rtk.exe` esteja no `PATH` e importa apenas registros diários válidos. Não abre o banco do RTK nem envia o relatório pela rede. A coleta é estimativa de saída de shell (bytes divididos por quatro), não medição de tokens faturados.

Selecione e salve Headroom para habilitar **Atualizar dados do Headroom**. O botão importa os eventos do ledger local `~/.headroom/savings_events.jsonl`; se `HEADROOM_SAVINGS_EVENTS_PATH` estiver configurada no processo do adapter, usa esse caminho. A leitura é limitada a 1 MB, ignora somente uma eventual linha final incompleta e deduplica eventos já importados. Nenhum dado é enviado pela rede. No Impacto, você pode associar manualmente uma importação RTK/Headroom a um projeto; os relatórios não identificam projeto por conta própria.

Graphify ajuda a pesquisar funções, arquivos e relações do código com um grafo local e não mede economia diretamente. Selecione Graphify e salve as preferências para mostrar a ação guiada. Ela instala o CLI oficial `graphifyy` com `uv tool install graphifyy` se necessário e registra a integração no perfil Codex do usuário após confirmação explícita. O grafo do repositório é criado depois, quando você pede a pesquisa. [Documentação Graphify](https://github.com/Graphify-Labs/graphify). As três opções são opcionais e o CodexBridge funciona sem instalá-las.

Na mesma página, você pode selecionar **skills.sh** para permitir que o Codex procure skills úteis à tarefa no [diretório público](https://skills.sh/). Essa escolha autoriza a busca, não a instalação. O agente deve indicar a origem e explicar por que a skill ajuda; instalar ou executar uma skill encontrada exige autorização separada. Sem a seleção, a busca só ocorre se você pedir explicitamente.

Durante tarefas, o bridge envia orientação apenas para as opções selecionadas: RTK para saídas de terminal compatíveis, Headroom MCP para compressão sob demanda de contexto longo e Graphify para pesquisa entre arquivos quando instalado. Selecionar uma opção não instala a ferramenta nem comprova economia de tokens.

Em **Economia de tokens**, os atalhos abrem o grafo local de projetos cadastrados (`graphify-out/graph.html`) e o dashboard do proxy Headroom na porta padrão `8787`. O grafo mostra relações do código, não tokens economizados. O Headroom só mostra dados ao vivo quando seu proxy está ativo; outra porta exige abrir o endereço configurado manualmente. O botão opcional **Token Monitor** leva aos [releases oficiais do aplicativo](https://github.com/Javis603/token-monitor/releases) para acompanhar uso e custos estimados do Codex. O CodexBridge não instala esse aplicativo nem lê seus dados.

RTK e Headroom também têm instalação guiada depois que você seleciona e salva a opção no painel. RTK usa o pacote oficial `rtk-ai.rtk` do winget; a instalação do CLI não altera as configurações do Codex nem ativa hooks. Headroom usa `uv tool install --python 3.13 "headroom-ai[all]"` em um ambiente isolado. No Windows, dependências podem exigir ferramentas de compilação. Cada ação pede confirmação antes de instalar e não solicita nem armazena chaves de provedor. RTK fornece estimativas locais; Headroom só otimiza solicitações quando o cliente compatível está configurado para usar seu proxy ou SDK.
Depois de instalar e selecionar Headroom, a página Economia de tokens permite adicionar o MCP oficial ao Codex com consentimento explícito. Ela usa o executável local e `codex mcp add headroom -- <executável> mcp serve`; se já houver um MCP com esse nome, não sobrescreve. Isso habilita `headroom_compress`, `headroom_retrieve` e `headroom_stats` para sessões futuras. A compressão via MCP ocorre quando o agente chama a ferramenta; compressão automática do tráfego exige configurar o proxy separadamente. Para gerar o primeiro evento, use o MCP em uma sessão do Codex e peça para comprimir uma saída apropriada; depois sincronize os dados no painel. O ledger também registra eventos do proxy. [MCP Headroom](https://docs.headroomlabs.ai/docs/mcp) | [Rastreamento de economia](https://github.com/headroomlabs-ai/headroom/blob/main/docs/content/docs/savings.mdx).

## Configurar outros servidores MCP

Use `codex_mcp_configurator` para preparar os passos de conexão no ChatGPT e, quando quiser, nas CLIs Codex, Hermes, Gemini e OpenCode. O assistente deve perguntar quais destinos você usa; `target_clients` permite selecionar só alguns. Há suporte a URL remota HTTPS e a servidores locais stdio. No modo stdio, informe o executável e uma lista de argumentos separados; nunca inclua credenciais nos argumentos. OAuth é concluído no próprio cliente. Para chave de API, informe somente o nome da variável de ambiente e, se necessário, o nome do cabeçalho; nunca cole o valor. O roteiro gera referências de ambiente só nos clientes que documentam esse recurso e não executa comandos nem altera configurações externas. Codex aceita bearer por variável no endpoint remoto; Hermes e OpenCode recebem trechos com referência de ambiente; Gemini recebe trecho protegido para stdio, enquanto cabeçalhos HTTP com chave ficam para configuração manual porque a expansão documentada do Gemini se limita ao bloco `env`.

As configurações de cada cliente são independentes. No Hermes, o roteiro usa `hermes mcp add`, `hermes mcp list` e `hermes mcp test`; no Codex, usa `codex mcp add`, `codex mcp list` e `codex mcp login` quando há OAuth. A pessoa revisa os comandos e executa no PowerShell. O OpenCode recebe um trecho JSON/JSONC para mesclar manualmente em `opencode.json` ou `opencode.jsonc`; a CLI oficial documenta configuração por arquivo, então o painel não inventa um comando `opencode mcp add`.

O painel **MCPs** também prepara e guarda roteiros localmente, mostra os comandos ou trechos de configuração por CLI e permite marcar cada destino como pendente, configurado ou ignorado. O progresso é uma anotação manual, não um teste de conexão. O arquivo `history/mcp-setups.json` guarda nomes, URLs informadas, executável/argumentos stdio, método de autenticação e estados; não guarda chaves. Não inclua tokens em nenhuma parte da URL ou dos argumentos. Remover um roteiro apaga só essa anotação local e não desinstala nem altera servidores nos clientes. Stdio local não conecta diretamente ao ChatGPT; para isso, o servidor precisa oferecer também um endpoint remoto HTTPS ou tunnel.

Na mesma página, **Adicionar servidor ao Codex** usa `codex mcp add` para registrar um endpoint MCP HTTPS no `config.toml` global do usuário, sem exigir projeto. O formulário exige aceite do aviso de confiança, não recebe valores de tokens e oferece OAuth (login separado com `codex mcp login`) ou variável de ambiente para bearer token. Nome e URL entram na configuração do Codex; a descrição fica apenas no histórico local do painel, pois o Codex CLI não tem um campo de descrição do servidor. Para Tunnel, informe a URL HTTPS do endpoint MCP; um Tunnel ID isolado não configura o Codex CLI.

Após a criação, o painel consulta `codex mcp list` e registra se encontrou o nome. **Conferir registro local** repete essa consulta. Esse estado confirma somente que o servidor aparece na configuração lida pelo Codex CLI; não confirma conectividade HTTPS/tunnel nem login OAuth. A documentação oficial também usa `codex mcp list` para verificar se um MCP está configurado: [Docs MCP](https://developers.openai.com/learn/docs-mcp).

Nos roteiros salvos, **Conferir registro local** verifica Codex e Hermes com `mcp list` e lê o `~/.gemini/settings.json` do usuário para Gemini, sem conectar ao servidor nem mostrar valores de configuração. O estado confirma apenas o cadastro local. OpenCode fica com conferência manual: a configuração pode ser JSONC global ou de projeto, e `opencode mcp list` também apresenta estado de conexão; o painel não executa esse comando automaticamente.

## Testar uma cópia em paralelo

Para testar um ZIP sem substituir uma instalação existente, extraia-o para uma pasta nova e escolha uma porta livre. O exemplo usa `18478` e inicia somente o adapter, sem alterar a configuração MCP do Codex:

```powershell
$zipPath = 'CAMINHO\codexbridge-private-test-0.2.6.zip'
$testRoot = Join-Path $env:TEMP 'CodexBridge-PrivateTest-0.2.6'
if (Test-Path -LiteralPath $testRoot) { throw "A pasta já existe; escolha outro nome: $testRoot" }
Expand-Archive -LiteralPath $zipPath -DestinationPath $testRoot
& (Join-Path $testRoot 'scripts\Start-Adapter.ps1') -Port 18478
```

Em outro PowerShell, confira o handshake MCP local sem iniciar Codex CLI ou tunnel:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"private-test","version":"1"}}}'
$tokenPath = Join-Path $env:LOCALAPPDATA 'CodexBridge\auth\mcp-token'
$token = (Get-Content -LiteralPath $tokenPath -Raw).Trim()
Invoke-RestMethod -Uri 'http://127.0.0.1:18478/mcp' -Method Post -ContentType 'application/json' -Headers @{ 'X-CodexBridge-Token' = $token } -Body $body
```

O resultado esperado informa `serverInfo.version` igual à versão do `package.json`. Esse teste local não conecta ChatGPT, não valida o tunnel e não executa tarefa Codex. Encerre o adapter de teste com Ctrl+C no terminal em que ele foi iniciado.

## Conectar o tunnel

1. Inicie o adapter e aguarde até o endpoint MCP local ficar pronto. O dashboard está em `http://127.0.0.1:18473/dashboard`.
2. No dashboard, abra **Tunnels** e crie ou encontre seu tunnel individual. Adicione um perfil com o Tunnel ID e o nome desejado. O perfil salva somente a referência à variável `CONTROL_PLANE_API_KEY`, nunca o valor da chave.
   Se quiser um projeto padrão, selecione um projeto cadastrado para gerar o comando do adapter. Isso é opcional: cada tarefa pode receber sua própria pasta em `project_directory`. Cada tunnel salvo também mostra seu comando e informa quando a runtime key será solicitada.
3. No PowerShell interativo, inicie o tunnel:

```powershell
& 'CAMINHO\CodexBridge-Unificado\Tunnel.cmd' -ProfileName 'nome-do-perfil'
```

4. Depois que o tunnel estiver iniciado, conecte-o no ChatGPT.

Antes de solicitar a chave ou executar `doctor`, o script verifica o endpoint MCP local e confere se o perfil inclui o cabecalho de autenticacao. Perfis antigos precisam ser salvos novamente em Dashboard > Tunnels. O launcher carrega o token local apenas no ambiente do processo; o YAML armazena a referencia `env:CODEXBRIDGE_MCP_TOKEN`, nunca o valor. Remova `MCP_EXTRA_HEADERS` do ambiente antes de iniciar, pois ele substitui os cabecalhos do perfil. Cada perfil deve apontar somente para o CodexBridge, pois os cabecalhos estaticos se aplicam a todos os destinos MCP configurados naquele perfil. A conexao real ao servico de tunnel e a disponibilidade no ChatGPT dependem de validacao manual.

## Segurança e dados locais

**Modelo de ameaça:** o CodexBridge inicia CLIs e scripts locais com as permissões da sua conta do Windows. A aprovação do Bridge confirma uma tarefa específica, mas não cria um sandbox de sistema operacional para Hermes, npm, instaladores ou ferramentas externas. Use somente projetos e ferramentas confiáveis.

- Tarefas de escrita do Codex sempre exigem aprovação local de uso único. Uma política antiga `project_auto` e tratada como Manual; não dispensa essa confirmação.
- Hermes pode usar ferramentas configuradas na instalacao dele e nao fica confinado a pasta selecionada. A execucao de tarefas Hermes fica desativada por padrao e o onboarding nao recomenda habilita-la. Se o operador decidir habilita-la, revise as ferramentas e permissoes do Hermes, defina `$env:CODEXBRIDGE_ENABLE_HERMES_EXECUTION = '1'` no PowerShell antes de iniciar `Start.cmd`, e reinicie o adapter. Cada tarefa continua exigindo aprovacao no chat e no painel. A flag nao cria sandbox do sistema operacional.
- `codex_execute_and_validate` e as tarefas Hermes nao iniciam scripts npm automaticamente. `codex_run_typecheck` e `codex_build_project` sao fluxos separados: exibem o script, o hash de `package.json`, o caminho do projeto e o aviso; o usuario precisa marcar um aceite explicito antes da aprovacao local. npm pode executar o script escolhido, scripts pre/post e codigo de dependencias com as permissoes da conta, sem sandbox separado. Revise `package.json` e o lockfile e use somente projetos confiaveis.
- Processos filhos recebem apenas variáveis básicas de sistema e caminhos locais necessários; tokens e variáveis arbitrárias do processo pai não são copiados deliberadamente. CLIs devem usar seus mecanismos locais de autenticação (por exemplo, o perfil do Codex). Integrações que dependam de uma chave somente em variável de ambiente podem não funcionar no processo filho.
- O endpoint HTTP MCP fica em `127.0.0.1` e exige `X-CodexBridge-Token` em pedidos POST/DELETE. Um token aleatorio de 256 bits fica em `%LOCALAPPDATA%\CodexBridge\auth\mcp-token` no Windows ou `~/.codexbridge/auth/mcp-token` nos demais sistemas; `CODEXBRIDGE_MCP_TOKEN_FILE` permite escolher outro arquivo local. `Tunnel.cmd` carrega o token no ambiente do processo e o tunnel-client envia o cabecalho declarado no perfil YAML, sem gravar o valor no perfil. Use `stdio.mjs` para clientes MCP locais; clientes HTTP diretos precisam enviar o cabecalho. Os perfis tunnel gerados devem conter somente o endpoint CodexBridge, pois os cabecalhos estaticos se aplicam a todos os destinos MCP daquele perfil. A autenticacao reduz acesso por clientes sem o token, mas nao protege contra malware da mesma conta, que pode ler dados do usuario. Dashboard, aprovacao e validacao tambem exigem HTTP Basic com usuario codexbridge e o token MCP como senha. Ainda nao ha isolamento contra processos da mesma conta, que podem ler o token; nao exponha essas rotas por proxy.
- Para rotacionar o token, encerre o adapter e o tunnel, remova somente `mcp-token` do caminho acima e reinicie ambos. O adapter cria um novo valor; atualize clientes HTTP diretos antes de reconectar. Perfis Tunnel gerados usam referência de ambiente e não precisam ser salvos novamente. Não remova a pasta `auth` inteira nem compartilhe o valor do token. A página **MCPs** explica o login Basic: usuário `codexbridge`, senha igual ao token MCP. No Windows, consulte-o com `Get-Content -Raw "$env:LOCALAPPDATA\CodexBridge\auth\mcp-token"`; em outros sistemas, leia `~/.codexbridge/auth/mcp-token`. Rotação invalida imediatamente clientes e túneis que ainda usam o token anterior.
- Requisições de navegador com `Origin` precisam corresponder à origem HTTP local exata (host e porta), inclusive nas rotas do dashboard, aprovação e validação. Isso reduz ataques iniciados por páginas externas; não protege contra um processo malicioso executado na mesma conta, que pode chamar o serviço diretamente. Para esse nível de isolamento é necessário executar o Bridge sob outra conta ou em sandbox do sistema operacional.

- Antes de chamar uma ferramenta que inicia escrita, apresente no chat um resumo curto em português com executor, pasta, ação/modelo e validação, e aguarde aprovação explícita do usuário. Respeite também qualquer diálogo nativo de confirmação do ChatGPT. A página local continua sendo uma aprovação adicional, específica e de uso único: o servidor não recebe prova verificável da confirmação dada no chat ou no diálogo do ChatGPT.
- A pasta informada ao iniciar o adapter é apenas um padrão. Cada tarefa pode selecionar outra pasta existente em `project_directory`; o Codex recebe `read-only` para análise ou `workspace-write` após a aprovação aplicável. Confira o caminho e as permissões locais antes de executar.
- Não coloque runtime keys, admin keys, OAuth tokens ou segredos em arquivos de configuração, prompts ou logs.
- A filtragem `safeText` remove alguns formatos conhecidos e limita o tamanho das saídas; ela é uma redução parcial de risco, não uma garantia de detecção ou remoção de todos os segredos. Não envie credenciais ao CodexBridge e revise saídas antes de compartilhá-las.
- hermes_ask prepara o pedido, mas nao o envia. Mostre o texto completo e avise que o Hermes pode usar ferramentas disponiveis; a pasta selecionada nao limita esse alcance. Aguarde aprovacao explicita no chat e na pagina local de aprovacao antes de chamar hermes_execute_approved. O Bridge nao garante leitura somente.
- O dashboard escuta apenas em `127.0.0.1`. O tunnel estabelece conexão de saída.
- Dados locais incluem `history/`, `bridge/approvals/`, `bridge/reports/`, `bridge/jarvis-active.lock` e perfis em `config/tunnels/`. Faça backup antes de migração.
- A memória do adapter mantém no máximo 100 tarefas terminadas e 50 tarefas pendentes. Ao preparar uma 51ª tarefa pendente, aguarde, aprove ou recuse uma das existentes; as pendentes expiram após cinco minutos e entradas expiradas são removidas da memória na próxima chamada. O histórico persistido em disco não é apagado automaticamente e pode crescer; arquive ou remova dados somente depois de fazer backup e decidir o que deve ser preservado.
- Não copie aprovações pendentes para um runtime novo como se ainda estivessem válidas. Tarefas em andamento devem ser reconciliadas manualmente.

## Testes

Para conferir os arquivos distributivos sem criar, substituir ou apagar um ZIP, execute `npm run package:check`. `npm run build` cria o ZIP dentro de `dist` e se recusa a substituir um destino existente. Use outro `-OutputPath` se precisar gerar uma nova cópia. Use `codex_plugin_setup` para comparar `installation_id` e `source_revision` entre a instância conectada e o pacote que está preparando; a presença de um arquivo ou de uma porta não prova que é a mesma versão.

```powershell
npm test
```

O comando executa os testes do adapter, dashboard, workflow e núcleo em sequência. Os testes do núcleo usam um executável Codex falso e uma pasta temporária; não iniciam o Codex instalado nem modificam um projeto real. A injeção do executor falso é uma dependência interna de teste e não é exposta como ferramenta MCP.
## Migração para uma pasta definitiva

Use [PROMPT-CODEX.md](PROMPT-CODEX.md) no Codex local. O prompt instrui o Codex a comparar as versões, preservar históricos e chaves fora do código, validar numa porta separada e manter as pastas antigas até a nova instalação ser comprovada. A pasta unificada neste pacote é uma preparação; ela ainda não substituiu a instalação ativa nem reiniciou o tunnel.

Antes de mesclar instalações, gere um inventário read-only: `npm run migration:compare -- -OldRoot 'CAMINHO\CodexBridge' -PreparedRoot 'CAMINHO\CodexBridge-Unificado'`. O relatório compara hashes de uma lista fixa de arquivos de código e conta arquivos em históricos, aprovações, relatórios e perfis de tunnel. Não mostra conteúdo, não copia arquivos e não altera processos. Revise aprovações e estados ambíguos manualmente.

## Registro desta consolidação

- Reunidos adapter, dashboard, workflow, núcleo CodexBridge, testes, scripts e exemplos de configuração numa única árvore.
- Alterada a importação do núcleo para `./bridge/server.mjs` por padrão.
- Mantido o limite de um projeto autorizado por processo, aprovação humana local, endpoint loopback e referências de segredo por variável de ambiente.
- Incluído fluxo local de diagnóstico do tunnel e orientação de migração reversível.
- A tela Tunnels agora orienta o usuário por etapas, explica a origem do Tunnel ID e da runtime API key e deixa a URL MCP opcional, usando o endpoint local como padrão.
- A implantação e a cópia de dados reais continuam pendentes para o Codex local, pois dependem dos diretórios e processos da máquina do usuário.

- Launcher exige escolha explícita do projeto; não seleciona Jarvis nem outro diretório salvo automaticamente.
- Executor Codex desativa o MCP node_repl e o plugin de computer use nomeado nos overrides desta execução, preservando o sandbox e a aprovação local.
- Testes cobrem aprovação de uso único, limites de projeto, isolamento de ferramentas, timeout e cancelamento usando fixtures locais.

Na seção Hermes de cada roteiro salvo, **Testar conexão do Hermes** aparece depois que a conferência local encontra o mesmo nome em `hermes mcp list`. Ao enviar, o painel repete a conferência e só então executa `hermes mcp test <nome>`, após o aceite explícito. O comando usa a configuração Hermes com esse nome (que pode não corresponder à URL resumida no roteiro), pode acessar a rede ou iniciar o processo stdio configurado e pode usar credenciais já disponíveis ao Hermes. O painel salva apenas `conectado`, `falhou`, `não encontrado`, `indisponível` e o horário; não guarda a saída do terminal. Uma falha não distingue, por si só, erro de rede, autenticação ou configuração. Consulte a [referência oficial de comandos Hermes](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) e o [guia de uso de MCP no Hermes](https://hermes-agent.nousresearch.com/docs/guides/use-mcp-with-hermes).
