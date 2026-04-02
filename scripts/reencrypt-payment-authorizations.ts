#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

import { createPrismaClient } from './create-prisma-client';
import dotenv from 'dotenv';

import {
  revealPaymentAuthorizationCode,
  sealPaymentAuthorizationCode,
} from '../lib/payment/payment-authorization-storage';

const prisma = createPrismaClient();
const ENCRYPTED_PREFIX = 'enc:v1:';

function loadEnvFiles() {
  const root = path.resolve(__dirname, '..');
  const candidates = ['.env.local', '.env.development', '.env'];

  for (const name of candidates) {
    const envPath = path.join(root, name);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
}

type ScriptOptions = {
  apply: boolean;
  batchSize: number;
};

function parseArgs(argv: string[]): ScriptOptions {
  const apply = argv.includes('--apply') || argv.includes('--execute');
  const batchArg = argv.find((arg) => arg.startsWith('--batch='));
  const batchSize = batchArg ? Number.parseInt(batchArg.slice('--batch='.length), 10) : 100;

  return {
    apply,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100,
  };
}

async function main() {
  loadEnvFiles();

  const options = parseArgs(process.argv.slice(2));

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SYNC_IN_PROD !== '1') {
    throw new Error('Refusing to run in production. Set ALLOW_SYNC_IN_PROD=1 to override.');
  }

  if (!process.env.ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET.length < 32) {
    throw new Error('ENCRYPTION_SECRET must be set to re-encrypt PaymentAuthorization rows');
  }

  console.log('Re-encrypt PaymentAuthorization rows');
  console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
  console.log(`Batch size: ${options.batchSize}`);

  const totalRows = await prisma.paymentAuthorization.count();
  console.log(`Total PaymentAuthorization rows: ${totalRows}`);

  let processed = 0;
  let alreadyEncrypted = 0;
  let migrated = 0;
  let invalid = 0;
  let lastId: string | undefined;

  while (true) {
    const rows = await prisma.paymentAuthorization.findMany({
      ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
      take: options.batchSize,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        provider: true,
        userId: true,
        authorizationCode: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      processed += 1;
      lastId = row.id;

      if (row.authorizationCode.startsWith(ENCRYPTED_PREFIX)) {
        try {
          revealPaymentAuthorizationCode(row.authorizationCode);
          alreadyEncrypted += 1;
        } catch (error) {
          invalid += 1;
          console.warn(`[INVALID] ${row.id} (${row.provider}/${row.userId}) encrypted value could not be decrypted: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }

      const encryptedCode = sealPaymentAuthorizationCode(row.authorizationCode);
      if (!encryptedCode.startsWith(ENCRYPTED_PREFIX)) {
        invalid += 1;
        console.warn(`[INVALID] ${row.id} (${row.provider}/${row.userId}) did not produce an encrypted value`);
        continue;
      }

      // Verify round-trip before writing.
      const roundTrip = revealPaymentAuthorizationCode(encryptedCode);
      if (roundTrip !== row.authorizationCode) {
        invalid += 1;
        console.warn(`[INVALID] ${row.id} (${row.provider}/${row.userId}) round-trip verification failed`);
        continue;
      }

      migrated += 1;
      if (options.apply) {
        await prisma.paymentAuthorization.update({
          where: { id: row.id },
          data: { authorizationCode: encryptedCode },
        });
      }

      console.log(`${options.apply ? '[UPDATED]' : '[DRY]'} ${row.id} (${row.provider}/${row.userId})`);
    }
  }

  console.log('Summary');
  console.log(JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    totalRows,
    processed,
    alreadyEncrypted,
    migrated,
    invalid,
  }, null, 2));

  if (!options.apply) {
    console.log('Dry run complete. Re-run with --apply to write encrypted authorization codes.');
  }
}

main()
  .catch((error) => {
    console.error('reencrypt-payment-authorizations failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });