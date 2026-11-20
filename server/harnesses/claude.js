export const claude = {
  label: 'Claude',
  command: 'claude',
  args: (model) => ['-p', 'What model are you', '--model', model, '--output-format', 'json'],
};
