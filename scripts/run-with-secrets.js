#!/usr/bin/env node

const { spawn } = require('child_process');
const { formatSecretLoadFailures, formatSecretLoadSummary, loadRuntimeEnv } = require('./load-runtime-env');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/run-with-secrets.js <command> [...args]');
    process.exit(1);
  }

  const secretLoadResult = await loadRuntimeEnv();
  if (secretLoadResult.enabled && secretLoadResult.failed.length > 0) {
    console.warn(`Warning: one or more secrets-provider values could not be loaded. Continuing with the merged environment from local env files plus any provider values that were resolved:\n${formatSecretLoadFailures(secretLoadResult)}`);
  } else if (secretLoadResult.enabled) {
    console.log(formatSecretLoadSummary(secretLoadResult, 'Secrets runtime env'));
  }

  const child = spawn(args[0], args.slice(1), {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

void main();