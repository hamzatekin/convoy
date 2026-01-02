#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const isBun = Boolean(process.versions?.bun);
const args = process.argv.slice(2);

function resolveTsxArgs() {
  const [major, minor] = process.versions.node.split('.').map((part) => Number(part));
  const useImport = major > 18 || (major === 18 && minor >= 19);
  return useImport ? ['--import', 'tsx'] : ['--loader', 'tsx'];
}

if (isBun) {
  const { runCli } = await import('../scripts/convoy-dev.ts');
  await runCli(args);
} else {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(here, '..', 'scripts', 'convoy-dev.ts');
  const child = spawn(process.execPath, [...resolveTsxArgs(), scriptPath, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
