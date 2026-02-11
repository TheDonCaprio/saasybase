import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './logger';
import { toError } from './runtime-guards';

const CANDIDATE_ENV_FILES = [
  { name: '.env.local', createIfMissing: true },
  { name: '.env.development.local', createIfMissing: false },
  { name: '.env.development', createIfMissing: false },
  { name: '.env', createIfMissing: false },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type UpsertResult = {
  filePath: string;
  updated: boolean;
};

async function upsertEnvValue(filePath: string, key: string, value: string, createIfMissing: boolean): Promise<UpsertResult> {
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let original = '';

  try {
    original = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    const e = toError(err);
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!createIfMissing) {
        return { filePath, updated: false };
      }
      // we'll create a new file below
      original = '';
    } else {
      throw err;
    }
  }

  const normalized = original.replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  let mutated = false;

  const nextLines = lines.map(line => {
    if (!keyPattern.test(line)) {
      return line;
    }
    mutated = true;
    return `${key}=${value}`;
  });

  if (!mutated) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
      nextLines.push('');
    }
    nextLines.push(`${key}=${value}`);
    mutated = true;
  }

  if (!mutated) {
    return { filePath, updated: false };
  }

  const nextContent = `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  if (nextContent !== original) {
    await fs.writeFile(filePath, nextContent, 'utf8');
  }

  return { filePath, updated: true };
}

export async function persistEnvValue(key: string, value: string) {
  const cwd = process.cwd();
  const touchedFiles: string[] = [];

  for (const candidate of CANDIDATE_ENV_FILES) {
    const filePath = path.join(cwd, candidate.name);
    try {
      const result = await upsertEnvValue(filePath, key, value, candidate.createIfMissing);
      if (result.updated) {
        touchedFiles.push(candidate.name);
      }
    } catch (err: unknown) {
      const error = toError(err);
      Logger.warn('Failed to write env file for auto Stripe price', {
        envFile: candidate.name,
        key,
        error: error.message,
      });
    }
  }

  process.env[key] = value;

  if (touchedFiles.length > 0) {
    Logger.info('Persisted auto-created Stripe price into env', {
      key,
      files: touchedFiles,
    });
  }

  return { files: touchedFiles };
}
