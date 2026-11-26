function responseText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(responseText).join('');
  if (!value || typeof value !== 'object') return '';
  for (const key of ['content', 'text', 'result', 'message', 'deltaContent']) {
    if (key in value) {
      const text = responseText(value[key]);
      if (text) return text;
    }
  }
  return '';
}

function parseResponse(stdout) {
  const records = stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error('Copilot output is not valid JSONL');
    }
  });
  const messages = [];
  const deltas = [];
  let cost = null;
  let currency = 'USD';
  for (const record of records) {
    if (record?.type === 'usage') {
      cost = record.data?.total_cost_usd ?? null;
      currency = 'USD';
    }
    if (typeof record?.type !== 'string' || !record.type.startsWith('assistant.')) continue;
    const text = responseText(record.data);
    if (record.type === 'assistant.message_delta' && text) deltas.push(text);
    else if (['assistant.message', 'assistant.turn_end'].includes(record.type) && text) messages.push(text);
  }
  const result = messages.length ? messages[messages.length - 1] : (deltas.length ? deltas.join('') : null);
  if (!result) throw new Error('Copilot output did not contain an assistant response');
  return { result, cost, currency, durationMs: null };
}

export const copilot = {
  label: 'Copilot',
  command: 'copilot',
  parseResponse,
  args: (model, prompt) => [
    '-p', prompt, '--model', model, '--output-format', 'json',
    `--available-tools=view,create,edit,apply_patch,grep,glob,bash${process.platform === 'win32' ? ',powershell' : ''}`,
    `--allow-tool=read,write,shell(curl)${process.platform === 'win32' ? ',shell(curl.exe)' : ''}`,
    '--allow-url=localhost,127.0.0.1',
  ],
};
