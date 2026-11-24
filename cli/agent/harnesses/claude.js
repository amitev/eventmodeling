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

function summarize(stdout) {
  const { result, cost, durationMs } = parseResponse(stdout);
  const seconds = durationMs === null ? 'n/a' : `${(durationMs / 1000).toFixed(1)} s`;
  const price = cost === null ? 'n/a' : `$${cost.toFixed(4)}`;
  return `duration: ${seconds}\nprice: ${price}\nresponse:\n${result.trimEnd()}`;
}

export const claude = {
  label: 'Claude',
  command: 'claude',
  parseResponse,
  summarize,
  args: (model, prompt) => ['-p', prompt, '--model', model, '--output-format', 'json'],
};
