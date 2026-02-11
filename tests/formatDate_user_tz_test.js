const { isValidTimeZone } = require('../lib/formatDate');
const { formatDateServer } = require('../lib/formatDate.server');
const { prisma } = require('../lib/prisma');

(async function run() {
  console.log('Running formatDate user timezone tests');

  // Create a test user and setting
  const user = await prisma.user.create({ data: { email: `tz-test-${Date.now()}@example.com` } });
  try {
    await prisma.userSetting.create({ data: { userId: user.id, key: 'TIMEZONE', value: 'America/Los_Angeles' } });

    const d = new Date('2025-09-12T12:00:00Z');
    const formatted = await formatDateServer(d, user.id);
    console.log('Formatted (user tz):', formatted);

    // Now set an invalid timezone and ensure fallback to admin or default
    await prisma.userSetting.updateMany({ where: { userId: user.id, key: 'TIMEZONE' }, data: { value: 'Invalid/Zone' } });
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
    await prisma.userSetting.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
})();
