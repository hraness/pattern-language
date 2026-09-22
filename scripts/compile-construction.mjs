#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile, parseArtifact } from '../benchmarks/executable-constructions/compiler.mjs';

const usage = 'Usage: node scripts/compile-construction.mjs DESIGN.json [--out MODULE.mjs]';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(`${usage}\n\nCompile a closed construction artifact into a synchronous ES module.\nThe output path must not already exist; omitted --out writes source to stdout.\n`);
  } else {
    if (!(args.length === 1 || (args.length === 3 && args[1] === '--out'))) throw new Error(usage);
    const parsed = parseArtifact(readFileSync(resolve(args[0]), 'utf8'));
    if (!parsed.valid) throw new Error(`Invalid construction: ${parsed.errors.join('; ')}`);
    const source = compile(parsed.artifact);
    if (args.length === 3) writeFileSync(resolve(args[2]), source, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(source);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
