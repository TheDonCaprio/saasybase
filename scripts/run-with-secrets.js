#!/usr/bin/env node

const { spawn } = require('child_process');
const { formatSecretLoadFailures, formatSecretLoadSummary, loadRuntimeEnv } = require('./load-runtime-env');
const { hasGeneratedPrismaClient, syncPrismaSchemaProvider } = require('./prisma-provider-utils');

function shouldAutoGenerateClient(commandArgs, providerChanged) {
  if (!providerChanged && hasGeneratedPrismaClient()) {
    return false;
  }

  const [command, ...args] = commandArgs;
  if (!command) return false;

  if (command === 'prisma' && args[0] === 'generate') {
    return false;
  }

  return true;
}

function spawnAndWait(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated with signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });

    child.on('error', reject);
  });
}

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

  const schemaSync = syncPrismaSchemaProvider(process.env.DATABASE_URL || '');
  if (schemaSync.provider && schemaSync.changed) {
    console.log(`Prisma datasource provider synchronized to ${schemaSync.provider}.`);
  }

  if (shouldAutoGenerateClient(args, Boolean(schemaSync.changed))) {
    const exitCode = await spawnAndWait('prisma', ['generate', '--config', 'prisma.config.ts'], process.env);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
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