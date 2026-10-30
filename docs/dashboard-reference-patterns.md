# Padrões de experiência para dashboards

Este documento reúne padrões descritos em documentação pública de produtos e os relaciona à página **Economia de tokens** do CodexBridge (`/dashboard/impact`). As fontes documentam funcionalidades e convenções de produto; não são apresentadas como estudos de usabilidade, validações experimentais ou evidência de que uma solução seja universalmente melhor.

## Estado atual do dashboard

A página apresenta estimativas de economia de tokens, esclarecendo que não representam cobrança ou faturamento. O seletor oferece três granularidades: **Diário**, **Semanal** e **Mensal**. A tela contém:

- **Gráfico de linha** para evolução estimada no tempo, agrupada na granularidade selecionada.
- **Gráfico de rosca** para distribuição acumulada por origem.
- **Barras horizontais** para comparar valores importados e manuais em cada origem.

O período selecionado afeta a janela e o agrupamento temporal do gráfico de linha; a rosca e as barras contextualizam totais por origem. Quando não há dados, a tela oferece estado vazio com orientação para importar ou registrar dados. As referências abaixo documentam decisões de interface, sem afirmar que foram validadas em estudo de usabilidade.

O filtro de projeto separa registros associados a cada projeto. Comparações manuais já permitem indicar projeto, e a importação RTK/Headroom agora oferece atribuição explícita pelo usuário; os relatórios agregados não identificam pasta automaticamente. Sem associação, os eventos permanecem em dados gerais.

## Padrões e relação com a tela existente

### 1. Um controle de período deve ter efeito legível

Google Analytics documenta tanto intervalos predefinidos e personalizados quanto a comparação entre intervalos, além da troca de granularidade diária, semanal e mensal em gráficos de linha. Cloudflare também documenta controles para ajustar o intervalo e os dados exibidos. No CodexBridge, o seletor Diário/Semanal/Mensal já oferece uma mudança explícita de granularidade e janela para a série temporal. É importante interpretar esses rótulos como agregação temporal oferecida pela página, sem supor que representem períodos personalizados ou comparação com período anterior.

Fontes: [Google Analytics — alterar e comparar intervalos de datas](https://support.google.com/analytics/answer/13412290?hl=en-EN); [Cloudflare — Zone Analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/); [Supabase — Reports](https://supabase.com/docs/guides/observability/reports).

### 2. Escolher a forma de visualização conforme a pergunta

As documentações do CloudWatch enumeram linhas, áreas empilhadas, números, barras e pizza como tipos de widget; a página de Insights da Linear ilustra barras segmentadas para examinar uma contagem por categoria e estado. Relacionando essas convenções à tela atual, a linha responde “como a estimativa mudou ao longo do tempo?”, a rosca “como o total se distribui por origem?” e as barras “como importado e manual se comparam dentro de cada origem?”. A distinção entre perguntas reduz a chance de atribuir a uma visualização uma leitura que pertence a outra.

Fontes: [AWS CloudWatch — widgets de dashboard](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-and-work-with-widgets.html); [Linear — Insights](https://linear.app/docs/insights); [Google Analytics — dashboards](https://support.google.com/analytics/answer/17217303?hl=en-40).

### 3. Manter unidade, escopo e significado próximos dos dados

Grafana descreve exploração do dashboard por intervalo de tempo, variáveis e links; Datadog descreve dashboards com widgets configuráveis e sincronização de contexto entre widgets. Para economia de tokens, isso reforça uma convenção útil: rótulos como “tokens estimados”, o escopo “por período” ou “por origem” e a ressalva sobre estimativas devem acompanhar a leitura das visualizações. O dashboard já nomeia a linha como evolução por período, apresenta a unidade em tokens e declara que os valores não representam cobrança ou faturamento. A rosca distingue origens e as barras identificam importado e manual.

Fontes: [Grafana — usar dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/); [Datadog — dashboards](https://docs.datadoghq.com/getting_started/dashboards/); [Datadog — configuração de widgets e sincronização](https://docs.datadoghq.com/dashboards/widgets/configuration/).

### 4. Usar o dashboard para reunir sinais relacionados e manter contexto

Google Analytics caracteriza dashboards como uma página consolidada de visualizações; PostHog documenta dashboards que reúnem insights. GitHub apresenta métricas de tráfego de repositório, enquanto Vercel organiza projetos e deployments como unidades distintas de contexto operacional. Aplicado com cautela ao CodexBridge, manter linha, rosca e barras na página de impacto ajuda a relacionar evolução, origem e modo de registro sem confundir esses recortes. As origens RTK e Headroom e os registros manuais continuam identificados no contexto dessa página; referências de projetos e deployments não significam que o dashboard tenha filtros equivalentes.

Fontes: [Google Analytics — dashboards](https://support.google.com/analytics/answer/17217303?hl=en-40); [PostHog — dashboards](https://posthog.com/docs/product-analytics/dashboards); [GitHub — tráfego de um repositório](https://docs.github.com/en/enterprise-cloud%40latest/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository); [Vercel — projetos](https://vercel.com/docs/projects); [Vercel — deployments](https://vercel.com/docs/deployments/overview).

### 5. Permitir que painéis sirvam a leituras operacionais específicas

Supabase apresenta relatórios de observabilidade por subsistema e permite filtrar por intervalo temporal. Sentry documenta dashboards personalizados com widgets, consultas e tipos de exibição editáveis. Essas referências mostram que produtos podem oferecer recortes adequados a diferentes perguntas operacionais. Na tela do CodexBridge, a seleção temporal e a identificação de origens já fornecem dois recortes simples. Não se deve inferir, a partir dessas fontes, que o dashboard atual suporte filtros por projeto, widgets configuráveis, compartilhamento ou edição de consultas.

Fontes: [Supabase — Reports](https://supabase.com/docs/guides/observability/reports); [Sentry — edição de dashboard personalizado](https://docs.sentry.io/api/dashboards/edit-an-organizations-custom-dashboard/); [PostHog — dashboards](https://posthog.com/docs/product-analytics/dashboards).

## Catálogo de referências consultadas

1. [Grafana — Use dashboards](https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/)
2. [Datadog — Dashboards](https://docs.datadoghq.com/getting_started/dashboards/)
3. [Datadog — Widget configuration and synchronization](https://docs.datadoghq.com/dashboards/widgets/configuration/)
4. [PostHog — Dashboards](https://posthog.com/docs/product-analytics/dashboards)
5. [Linear — Insights](https://linear.app/docs/insights)
6. [Vercel — Projects](https://vercel.com/docs/projects)
7. [Vercel — Deployments](https://vercel.com/docs/deployments/overview)
8. [Supabase — Reports](https://supabase.com/docs/guides/observability/reports)
9. [Google Analytics — Change and compare date ranges](https://support.google.com/analytics/answer/13412290?hl=en-EN)
10. [Google Analytics — About dashboards](https://support.google.com/analytics/answer/17217303?hl=en-40)
11. [GitHub — Viewing traffic to a repository](https://docs.github.com/en/enterprise-cloud%40latest/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)
12. [Cloudflare — Zone Analytics](https://developers.cloudflare.com/analytics/account-and-zone-analytics/zone-analytics/)
13. [AWS CloudWatch — Dashboard widgets](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-and-work-with-widgets.html)
14. [Sentry — Edit an organization's custom dashboard](https://docs.sentry.io/api/dashboards/edit-an-organizations-custom-dashboard/)
15. [Amplitude — Create and manage dashboards](https://www.amplitude.com/docs/analytics/dashboard-create)
16. [Railway — Product and dashboard basics](https://docs.railway.com/overview/the-basics)
17. [Salesforce CRM Analytics — Dashboard design tips](https://help.salesforce.com/s/articleView?id=sf.bi_dashboard_build_tips.htm&language=en_US&type=5)
18. [Google Cloud Monitoring — Dashboards overview](https://docs.cloud.google.com/monitoring/dashboards)
19. [Google Cloud Monitoring — Chart visualizations](https://docs.cloud.google.com/monitoring/charts)
20. [Shopify — Analytics overview dashboard](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard)
21. [Shopify — Using the overview dashboard](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard)
22. [Stripe — Dashboard charts for business insights](https://support.stripe.com/questions/dashboard-home-page-charts-for-business-insights)
23. [Firebase — Google Analytics dashboard](https://firebase.google.com/docs/analytics)
24. [Microsoft Power BI — View and interact with dashboards](https://learn.microsoft.com/en-us/power-bi/consumer/end-user-dashboard-open)
25. [Microsoft Power BI — Dashboard design tips](https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips)
26. [Looker — Dashboards](https://docs.cloud.google.com/looker/docs/dashboards?hl=en)
27. [New Relic — Manage dashboards](https://docs.newrelic.com/docs/query-your-data/explore-query-data/dashboards/manage-your-dashboard/)
28. [Splunk — Create a Dashboard Studio dashboard](https://docs.splunk.com/Documentation/Splunk/latest/DashStudio/CreateDash)
29. [Metabase — Introduction to dashboards](https://www.metabase.com/docs/latest/dashboards/introduction)
30. [Kibana — Dashboards](https://www.elastic.co/guide/en/kibana/current/dashboard.html)
31. [Snowflake Snowsight — Visualizing data with dashboards](https://docs.snowflake.com/en/user-guide/ui-snowsight-dashboards)
32. [Azure Monitor — Workbook visualizations](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-visualizations)
33. [Langfuse — Token and cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
34. [Honeycomb — Create a board](https://docs.honeycomb.io/api/boards/create-a-board)
35. [GitLab — Value Streams Dashboard](https://docs.gitlab.com/user/analytics/value_streams_dashboard/)
36. [Tableau — Create a dashboard](https://help.tableau.com/current/pro/desktop/en-gb/dashboards_create.htm)

## Decisões de design para a próxima fase

As referências acima documentam produtos e padrões; não são um ranking nem uma validação com usuários do CodexBridge. Para a implementação, elas apontam para estas decisões concretas:

- Colocar primeiro o resumo que responde “quanto economizei neste período?” e manter a unidade e o caráter estimado visíveis junto ao valor.
- Manter um único seletor de período para os três gráficos, mostrando claramente qual intervalo está selecionado e quando os dados foram atualizados.
- Dar a cada gráfico uma pergunta própria: tendência no tempo (linha), participação por origem (rosca) e comparação por origem (colunas). Evitar repetir o mesmo total sem contexto.
- Usar legenda, rótulos e texto além da cor para distinguir RTK, Headroom e registros manuais; preservar contraste nos temas claro e escuro.
- Fazer os cartões e títulos levarem a detalhes relacionados quando houver destino útil; mostrar estados vazios com uma ação para configurar a coleta ou registrar dados.
- No celular, empilhar os gráficos e preservar os controles principais sem exigir interação de hover para entender os valores.
- Manter a renderização leve: limitar séries, evitar consultas ou cálculos repetidos e não adicionar animação que atrase a leitura.

As referências que sustentam esses critérios incluem as orientações de hierarquia e clareza do Power BI, o filtro temporal compartilhado e as visualizações de linha/barra/rosca do Cloud Monitoring, os cartões reordenáveis e comparações temporais da Shopify, a navegação por painéis e controles no Kibana, as seções e estados vazios do Metabase, e os indicadores específicos de tokens/custo do Langfuse. As fontes estão ligadas individualmente no catálogo acima.

