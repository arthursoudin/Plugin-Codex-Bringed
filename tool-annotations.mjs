const READ_ONLY = new Set([
  'codex_status',
  'public_page_open',
  'public_page_read',
  'codex_model_evaluate',
  'codex_run_readonly',
  'codex_task_result',
  'hermes_status',
  'hermes_environment_check',
  'hermes_approval_status',
  'hermes_task_progress',
  'hermes_task_logs',
  'hermes_validation_result',
  'hermes_execution_health',
  'hermes_list_tasks',
  'codex_plugin_setup',
  'codex_mcp_configurator',
  'codex_tunnel_setup_prompt',
  'codex_plugin_instructions',
  'codex_plugin_capabilities',
  'codex_bridge_guide',
  'codex_project_readme',
  'codex_project_summary',
  'codexbridge_project_advisor',
  'codex_approval_status',
  'codex_validation_result',
  'codex_list_tasks',
  'codex_task_progress',
  'codex_task_logs',
  'codex_test_report',
  'codex_environment_check',
  'codex_execution_health',
]);

const STATE_CHANGING = new Set([
  'codex_prepare_task',
  'codex_model_session',
  'codex_route_prepare_task',
  'codex_route_execute_approved',
  'codex_execute_approved',
  'codex_cancel_task',
  'hermes_ask',
  'hermes_prepare_task',
  'hermes_execute_approved',
  'codex_configure_project',
  'codex_project_note',
  'codex_execute_and_validate',
  'codex_run_typecheck',
  'codex_build_project',
]);

const OPEN_WORLD = new Set([
  'hermes_ask',
  'hermes_execute_approved',
  'codex_execute_approved',
  'codex_route_execute_approved',
  'codex_execute_and_validate',
  'codex_run_typecheck',
  'codex_build_project',
]);

const DESTRUCTIVE = new Set([
  'codex_execute_approved',
  'codex_cancel_task',
  'codex_route_execute_approved',
  'hermes_ask',
  'hermes_execute_approved',
  'codex_execute_and_validate',
  'codex_run_typecheck',
  'codex_build_project',
]);

export function annotateTools(tools) {
  const seen = new Set();
  return tools.map(tool => {
    if (seen.has(tool.name)) throw new Error(`Ferramenta MCP duplicada: ${tool.name}`);
    seen.add(tool.name);
    if (!READ_ONLY.has(tool.name) && !STATE_CHANGING.has(tool.name)) {
      throw new Error(`Ferramenta MCP sem classificação de segurança: ${tool.name}`);
    }
    return {
      ...tool,
      annotations: {
        readOnlyHint: READ_ONLY.has(tool.name),
        openWorldHint: OPEN_WORLD.has(tool.name),
        destructiveHint: DESTRUCTIVE.has(tool.name),
      },
    };
  });
}
