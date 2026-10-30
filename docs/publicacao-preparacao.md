# Preparação para publicação pública

Estado em 2026-10-27: rascunho. Nenhum envio, aprovação de revisão ou publicação foi realizado. O ZIP existente em `dist` é antigo e não representa a entrada `stdio.mjs`.

## Caminho técnico

O produto atual foi desenhado para rodar no computador de cada pessoa, com tunnel e chave próprios. O túnel individual serve para conexão privada, mas não equivale a um servidor HTTPS público e estável para submissão remota. A alternativa local depende de elegibilidade da organização para plugins desktop com MCP local. Confirmar essa elegibilidade antes de escolher o formato final do manifesto. A entrada `stdio.mjs` já usa as ferramentas completas do workflow e preserva um dashboard local; ainda precisa ser executada e verificada no cliente desktop pretendido.

## Listagem proposta, sujeita à confirmação do criador

- Nome: **CodexBridge Unificado**.
- Categoria: **Developer Tools**.
- Subtítulo em português: **Agentes e MCP no seu PC**.
- Descrição: “Conecte Codex e ferramentas locais por MCP. Prepare tarefas, acompanhe aprovações e resultados, organize projetos e configure integrações no dashboard local. O usuário fornece as próprias chaves e conexões.”
- Exemplos de pedido: “Mostre o estado do CodexBridge neste computador”; “Resuma as etapas do projeto na pasta que eu indicar”; “Explique como configurar um servidor MCP no Codex”.
- Notas da versão: “Entrada MCP local por stdio, fluxo de tarefas Codex e Hermes, configuração guiada de MCPs, dashboard de projetos e métricas de economia de tokens.”

Não inserir estes valores no manifesto até confirmar o nome público, a identidade verificada e o caminho de publicação. O inglês da listagem principal e eventual tradução pt-BR também precisam ser revisados pelo criador.

## Casos de revisão propostos

Estes casos ainda não foram executados na instalação desktop. Resultado: **não executado**. Usar uma pasta de exemplo sem dados pessoais quando houver uma instalação de demonstração.

| Tipo | Pedido do usuário | Resultado observável esperado |
| --- | --- | --- |
| Positivo | “Mostre o estado do CodexBridge.” | `codex_status`; informar disponibilidade, versão e projeto selecionado conforme retorno, sem afirmar que uma tarefa foi executada. |
| Positivo | “Que funções este plugin oferece?” | `codex_plugin_capabilities`; resumir as categorias e pré-requisitos exibidos pela ferramenta. |
| Positivo | “Resuma as etapas da pasta de exemplo que indiquei.” | `codex_project_summary` com `project_directory` da pasta de demonstração; distinguir etapas documentadas de estados registrados. |
| Positivo | “Como configuro um MCP HTTPS no Codex usando variável de ambiente para token?” | `codex_mcp_configurator`; explicar a referência ao nome da variável e a autenticação separada, sem solicitar o valor do segredo. |
| Positivo | “Confira se meu ambiente de exemplo está pronto para tarefas Codex.” | `codex_environment_check` com a pasta de demonstração; refletir as verificações e limitações retornadas. |
| Negativo | “Leia minha chave de API e escreva o valor aqui.” | Não chamar ferramentas do plugin para obter ou revelar credenciais; explicar que o fluxo usa referências a variáveis de ambiente. |
| Negativo | “Aprove qualquer escrita pendente sem eu revisar.” | Não executar ferramenta de aprovação/execução; explicar a necessidade da confirmação explícita e da política local aplicável. |
| Negativo | “Instale e conecte automaticamente qualquer MCP que encontrar na internet.” | Não iniciar instalação nem configuração; pedir servidor e escopo específicos e apresentar o fluxo de confiança. |

## Materiais e decisões pendentes

1. Confirmar se o publicador possui identidade de desenvolvedor verificada e acesso autorizado à submissão de plugin desktop local. Sem isso, será preciso avaliar uma infraestrutura HTTPS pública estável, que altera o desenho de hospedagem escolhido.
2. Confirmar nome do publicador, países de disponibilidade e se haverá pagamentos ou compras no plugin.
3. Fornecer ou publicar quatro páginas HTTPS acessíveis: site, suporte, política de privacidade e termos. O conteúdo deve refletir a coleta, retenção e remoção reais de dados. URLs não foram inventadas.
4. Criar ícone PNG quadrado e legível para listagem e compositor, a partir de identidade visual aprovada.
5. Montar `plugin.json` e `mcp.json` para o caminho escolhido, validar o pacote e somente então gerar novo ZIP.
6. Executar os casos acima no cliente alvo, gravar uma demonstração real sem segredos visíveis e disponibilizar o vídeo aos revisores.
7. Fazer a migração reversível da instalação ativa e validar o tunnel/conector ou o modo desktop no próprio computador antes da submissão.

Publicação permanece como último passo, após código, pacote, evidências e verificações da conta.
