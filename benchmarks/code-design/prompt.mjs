import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [arm, stage = 'base', priorPath] = args;
if (!['direct', 'checklist', 'pattern'].includes(arm) || !['base', 'change'].includes(stage) ||
    (stage === 'change' && !priorPath) || args.length > (stage === 'change' ? 3 : 2)) {
  console.error('Usage: node prompt.mjs direct|checklist|pattern [base|change [PRIOR.mjs]]');
  process.exit(2);
}
const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').trim();
const sections = [
  'Solve the task below. Use only the supplied prompt. Do not use tools, browse, or inspect repository files. Return one complete ES module with no Markdown fences.',
  read(`./prompts/${arm}.md`),
  read('./tasks/base.md'),
];
if (stage === 'change') sections.push(read('./tasks/change.md'), 'Prior implementation:\n' + readFileSync(priorPath, 'utf8'));
console.log(sections.join('\n\n'));
