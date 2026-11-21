export const claude = {
  label: 'Claude',
  command: 'claude',
  args: (model, prompt) => [
    '-p', prompt, '--model', model, '--output-format', 'json',
    '--allowedTools', 'Read', 'Write', 'Edit', 'Grep', 'Glob',
    // Keep the port colon literal; a trailing ":*" means a command-word prefix.
    'Bash(curl http://localhost:**)', 'Bash(curl http://127.0.0.1:**)',
  ],
};
