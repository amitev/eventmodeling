export const copilot = {
  label: 'Copilot',
  command: 'copilot',
  args: (model, prompt) => [
    '-p', prompt, '--model', model, '--output-format', 'json',
    '--available-tools=view,create,edit,apply_patch,grep,glob', '--allow-tool=read,write',
  ],
};
