export const copilot = {
  label: 'Copilot',
  command: 'copilot',
  args: (model) => ['-p', 'What model are you', '--model', model, '--output-format', 'json'],
};
