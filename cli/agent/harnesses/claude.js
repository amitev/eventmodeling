function parseResponse(stdout) {
  let output;
  try {
    output = JSON.parse(stdout);
  } catch {
    throw new Error('Claude output is not valid JSON');
  }
  if (typeof output?.result !== 'string') throw new Error('Claude output did not include result text');
  return {
    result: output.result,
    cost: output.total_cost_usd ?? null,
    currency: 'USD',
    durationMs: output.duration_ms ?? null,
  };
}

export const claude = {
  label: 'Claude',
  command: 'claude',
  parseResponse,
  args: (model, prompt) => [
    '-p', prompt, '--model', model, '--output-format', 'json',
    '--allowedTools', 'Read', 'Write', 'Edit', 'Grep', 'Glob',
    // Keep the port colon literal; a trailing ":*" means a command-word prefix.
    'Bash(curl http://localhost:**)', 'Bash(curl http://127.0.0.1:**)',
  ],
};
