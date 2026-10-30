# Ferramentas locais

Os executaveis nao sao incluidos no plugin. Para instalar Node.js v24.22.1 e tunnel-client v0.0.18 no perfil do usuario, execute `Install.cmd` ou use a instalacao sob demanda dos inicializadores.

O instalador baixa apenas arquivos oficiais, valida o SHA-256 antes da extracao e grava os caminhos em `%LOCALAPPDATA%\CodexBridge\tools\current.json`. Nao exige administrador e nao solicita nem guarda chaves de API.

Se preferir, voce ainda pode fornecer seus proprios executaveis em `tools/node.exe` e `tools/tunnel-client.exe`, configurar caminhos em `config/settings.local.json` ou usar instalacoes no `PATH`. `allowAutomaticToolInstall: false` desativa a instalacao automatica nos inicializadores.

Codex CLI e Hermes CLI sao instalacoes externas e nao devem ter suas credenciais copiadas para esta pasta.
