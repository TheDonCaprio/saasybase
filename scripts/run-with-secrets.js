#!/usr/bin/env node

const { spawn } = require('child_process');
const { loadRuntimeEnv } = require('./load-runtime-env');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/run-with-secrets.js <command> [...args]');
    process.exit(1);
  }

  const secretLoadResult = await loadRuntimeEnv();
  if (secretLoadResult.enabled && secretLoadResult.failed.length > 0) {
    const failures = secretLoadResult.failed
      .map((entry) => `${entry.envName} <= ${entry.secretId}: ${entry.message}`)
      .join('\n');
    console.error(`Failed to load one or more Google Secret Manager values:\n${failures}`);
    process.exit(1);
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