#!/usr/bin/env node

const {
  formatSecretLoadFailures,
  getDefaultSecretEnvNames,
  loadDotenvFiles,
  loadRuntimeEnv,
  parseSecretList,
  parseSecretsProviderOutput,
  runSecretsProviderCommand,
} = require('./load-runtime-env');

function printHelp() {
  console.log(`Secrets provider doctor

Usage:
  npm run secrets:doctor
  SECRETS_PROVIDER=infisical npm run secrets:doctor
  SECRETS_PROVIDER=doppler npm run secrets:doctor

What it checks:
  - whether a provider is enabled
  - the exact provider command that would run before boot
  - whether the command executes successfully
  - the detected output shape
  - whether expected secret keys are present in the provider output
`);
}

function summarizeList(items) {
  return items.length > 0 ? items.join(', ') : 'none';
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  loadDotenvFiles();

  const commandResult = runSecretsProviderCommand(process.env);

  console.log('Secrets doctor');
  console.log(`Provider: ${commandResult.provider || 'platform-env-only'}`);

  if (!commandResult.enabled) {
    console.log('Status: no secrets provider enabled');
    console.log('Set SECRETS_PROVIDER=infisical or SECRETS_PROVIDER=doppler to diagnose provider bootstrap.');
    process.exit(0);
  }

  console.log(`Command: ${commandResult.command || 'none'}`);
  console.log(`Detected output shape: ${commandResult.outputShape}`);

  if (commandResult.failed.length > 0) {
    console.error(`Status: provider command failed\n${formatSecretLoadFailures(commandResult)}`);
    process.exit(1);
  }

  let providerEnvMap;
  try {
    providerEnvMap = parseSecretsProviderOutput(commandResult.stdout || '');
  } catch (error) {
    console.error(`Status: provider command ran, but output could not be parsed\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const expectedEnvNames = parseSecretList(process.env.SECRETS_PROVIDER_SECRETS);
  const providerKeys = Object.keys(providerEnvMap);
  const presentExpectedKeys = expectedEnvNames.filter((name) => Object.prototype.hasOwnProperty.call(providerEnvMap, name));
  const missingExpectedKeys = expectedEnvNames.filter((name) => !Object.prototype.hasOwnProperty.call(providerEnvMap, name));

  console.log(`Provider key count: ${providerKeys.length}`);
  console.log(`Expected keys found: ${summarizeList(presentExpectedKeys)}`);
  console.log(`Expected keys missing: ${summarizeList(missingExpectedKeys)}`);

  const loadResult = await loadRuntimeEnv();
  if (loadResult.failed.length > 0) {
    console.error(`Status: provider command ran, but bootstrap load still failed\n${formatSecretLoadFailures(loadResult)}`);
    process.exit(1);
  }

  const expectedResolvedKeys = getDefaultSecretEnvNames(process.env)
    .filter((name) => typeof process.env[name] === 'string' && process.env[name].trim().length > 0);

  console.log(`Resolved after merge: ${summarizeList(expectedResolvedKeys)}`);
  console.log(`Loaded from provider during merge: ${summarizeList(loadResult.loaded)}`);
  console.log(`Already present before merge: ${summarizeList(loadResult.skipped)}`);
  console.log('Status: OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});