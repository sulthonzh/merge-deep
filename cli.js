#!/usr/bin/env node
'use strict';

import { mergeDeep, merge, mergeAll } from './index.js';

function usage() {
  console.log(`merge-deep CLI — Deep merge JSON files or stdin

Usage:
  mergedeep <file1> <file2> [...files] [options]
  cat base.json | mergedeep --overlay overlay.json

Options:
  --array <strategy>   Array merge: replace|concat|merge|unique (default: replace)
  --mutable            Don't clone (mutate first object)
  --stdin              Read base from stdin
  --pretty             Pretty-print output (default: compact)
  --help, -h           Show this help

Examples:
  mergedeep base.json overlay.json --array concat
  mergedeep defaults.json prod.json --pretty
  cat config.json | mergedeep --overlay patch.json --array merge

Strategies:
  replace  — Source array wins (default)
  concat   — target ++ source
  merge    — Index-by-index deep merge
  unique   — Concat with dedup (by JSON equality)
`);
}

function readJSON(filepath) {
  const fs = await import('node:fs');
  const content = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(content);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const arrayStrategyIdx = args.indexOf('--array');
  const arrayStrategy = arrayStrategyIdx >= 0 ? args[arrayStrategyIdx + 1] : 'replace';
  const mutable = args.includes('--mutable');
  const useStdin = args.includes('--stdin');
  const pretty = args.includes('--pretty');
  const overlayIdx = args.indexOf('--overlay');
  const overlayFile = overlayIdx >= 0 ? args[overlayIdx + 1] : null;

  const validStrategies = ['replace', 'concat', 'merge', 'unique'];
  if (!validStrategies.includes(arrayStrategy)) {
    console.error(`Invalid array strategy: ${arrayStrategy}. Use: ${validStrategies.join(', ')}`);
    process.exit(1);
  }

  const files = args.filter(
    (a, i) =>
      a &&
      !a.startsWith('--') &&
      (i === 0 || args[i - 1] !== '--array') &&
      args[i - 1] !== '--overlay'
  );

  let sources = [];

  if (useStdin) {
    sources.push(await readStdin());
  }

  if (overlayFile) {
    sources.push(await readJSON(overlayFile));
  }

  for (const f of files) {
    sources.push(await readJSON(f));
  }

  if (sources.length < 2) {
    console.error('Need at least 2 JSON objects to merge');
    process.exit(1);
  }

  const result = mergeAll(sources, {
    arrayStrategy,
    clone: !mutable,
  });

  const output = pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
  console.log(output);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
