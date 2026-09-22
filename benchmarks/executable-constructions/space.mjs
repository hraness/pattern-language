import { fileURLToPath } from 'node:url';
import { CONTEXT_IDS, evaluate, loadContext } from './evaluate.mjs';

// Enumerate the public grammar independently of the compiler's own helper.
function constructions() {
  const result = [];
  for (const storage of ['append-journal', 'replace-snapshot']) {
    for (const commit of [
      { op: 'each' },
      ...[2, 4].flatMap(maxItems => [1, 3].map(maxTicks => ({ op: 'bounded-batch', maxItems, maxTicks }))),
    ]) result.push({ schema: 'pattern-language.construct.v1', storage: { op: storage }, commit });
  }
  return result;
}

export async function enumerateSpace(context) {
  const designs = [];
  for (const artifact of constructions()) designs.push(await evaluate(artifact, context));
  const feasible = designs.filter(design => design.feasible);
  if (feasible.length === 0) return { context: context.id, designs, optimum: null, feasibleCount: 0, paretoCount: 0 };
  const optimum = Math.min(...feasible.map(design => design.objective));
  const dimensions = context.paretoMetrics;
  for (const design of designs) {
    design.optimal = design.feasible && design.objective === optimum;
    design.regret = design.feasible ? design.objective - optimum : null;
    design.relativeRegret = design.feasible && optimum > 0 ? (design.objective - optimum) / optimum : null;
    design.efficiency = design.feasible && design.objective > 0 ? optimum / design.objective : 0;
    design.dominated = design.feasible ? feasible.some(other => dimensions.every(key => other.metrics[key] <= design.metrics[key]) && dimensions.some(key => other.metrics[key] < design.metrics[key])) : null;
  }
  return { context: context.id, designs, optimum, feasibleCount: feasible.length, paretoCount: feasible.filter(design => !design.dominated).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contexts = process.argv.slice(2).length ? process.argv.slice(2) : CONTEXT_IDS;
  const spaces = [];
  for (const id of contexts) spaces.push(await enumerateSpace(loadContext(id)));
  process.stdout.write(`${JSON.stringify({ schema: 'pattern-language.construction-space.v1', spaces }, null, 2)}\n`);
}
