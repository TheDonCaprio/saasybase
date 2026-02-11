import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const libPath = path.join(__dirname, '..', 'lib', 'formatDate.js');
const prismaPath = path.join(__dirname, '..', 'lib', 'prisma.js');

let formatMod, prisma;
try {
  // Prefer compiled output under .build if present
  const buildLib = path.join(__dirname, '..', '.build', 'lib', 'formatDate.js');
  const buildPrisma = path.join(__dirname, '..', '.build', 'lib', 'prisma.js');
  if (await (async () => { try { await fs.promises.access(buildLib); return true } catch(e){return false} })()) {
    formatMod = await import('file://' + buildLib);
    prisma = await import('file://' + buildPrisma);
  } else {
    // Fallback to source imports; requires Node ESM loaders or ts-node transpile, may fail
    formatMod = await import('file://' + libPath);
    prisma = await import('file://' + prismaPath);
  }
} catch (e) {
  console.error('Import error:', e);
  process.exit(1);
}

const { formatDateServer, isValidTimeZone } = formatMod;

(async function run() {
  console.log('Running formatDate user timezone tests (mjs)');

  // Create a test user and setting
  const user = await prisma.prisma.user.create({ data: { email: `tz-test-${Date.now()}@example.com` } });
  try {
    await prisma.prisma.userSetting.create({ data: { userId: user.id, key: 'TIMEZONE', value: 'America/Los_Angeles' } });

    const d = new Date('2025-09-12T12:00:00Z');
    const formatted = await formatDateServer(d, user.id);
    console.log('Formatted (user tz):', formatted);

    // Now set an invalid timezone and ensure fallback to admin or default
    await prisma.prisma.userSetting.updateMany({ where: { userId: user.id, key: 'TIMEZONE' }, data: { value: 'Invalid/Zone' } });
    const formattedInvalid = await formatDateServer(d, user.id);
    console.log('Formatted (invalid user tz):', formattedInvalid);

    // Validate isValidTimeZone
    console.log('isValidTimeZone America/Los_Angeles =>', isValidTimeZone('America/Los_Angeles'));
    console.log('isValidTimeZone Invalid/Zone =>', isValidTimeZone('Invalid/Zone'));

    console.log('\nTest complete.\n');
  } catch (e) {
    console.error('Test error', e);
  } finally {
    // cleanup
    await prisma.prisma.userSetting.deleteMany({ where: { userId: user.id } });
    await prisma.prisma.user.delete({ where: { id: user.id } });
    await prisma.prisma.$disconnect();
  }
})();
