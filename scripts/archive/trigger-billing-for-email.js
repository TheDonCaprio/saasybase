// Archived: trigger-billing-for-email.js
// Purpose: Create a test notification and send emails to user/admin to validate billing emails.

const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
const prisma = new PrismaClient();

async function sendWithFallback(from, to, subject, text) {
  const host = process.env.SMTP_HOST || '127.0.0.1';
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 1025;
  let transporter = nodemailer.createTransport({ host, port, secure: port === 465 });
  try {
    const info = await transporter.sendMail({ from, to, subject, text });
    return { success: true, info };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

async function run(emailAddress) {
  try {
    const user = await prisma.user.findUnique({ where: { email: emailAddress } });
    if (!user) return console.error('No user with email', emailAddress);
    const userId = user.id;
    const message = `Test billing email for ${emailAddress} at ${new Date().toISOString()}`;

    await prisma.notification.create({ data: { userId, title: 'Billing Update', message, type: 'BILLING' } });
    const from = process.env.EMAIL_FROM || `no-reply@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost'}`;

    const userResult = await sendWithFallback(from, user.email, 'Billing test', message);
    await prisma.emailLog.create({ data: { userId, to: user.email, subject: 'Billing test', template: null, status: userResult.success ? 'SENT' : 'FAILED', error: userResult.success ? null : userResult.error } });
    console.log('User email result:', userResult);

    const adminEmail = process.env.SUPPORT_EMAIL || 'support@.com';
    const adminResult = await sendWithFallback(from, adminEmail, 'Billing test', `User ${userId}: ${message}`);
    await prisma.emailLog.create({ data: { userId: null, to: adminEmail, subject: 'Billing test', template: null, status: adminResult.success ? 'SENT' : 'FAILED', error: adminResult.success ? null : adminResult.error } });
    console.log('Admin email result:', adminResult);
  } catch (err) {
    console.error('Error', err && err.stack ? err.stack : err);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) run(process.argv[2] || 'caprio@capriofiles.com');
