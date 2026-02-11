// Archived: send-test-email.js
// Purpose: Test SMTP/MailHog integration and log email results. Dev/ops helper.

const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function main() {
  const host = process.env.SMTP_HOST || '127.0.0.1';
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 1025;
  const from = process.env.EMAIL_FROM || `Test <no-reply@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost'}>`;
  const to = process.env.TEST_EMAIL || process.env.SMTP_USER || 'test@example.com';

  const transporter = nodemailer.createTransport({ host, port, secure: port === 465 });
  try {
    const info = await transporter.sendMail({ from, to, subject: 'SaaSyBase test email (MailHog)', text: 'This is a test email sent from pro-app to verify MailHog SMTP integration for SaaSyBase.' });
    console.log('Message sent:', info && info.messageId ? info.messageId : info);
    console.log('If you run MailHog locally, open http://localhost:8025 to see the message.');
    process.exit(0);
  } catch (err) {
    console.error('Error sending test email', err && err.stack ? err.stack : err);
    process.exit(2);
  }
}

if (require.main === module) main();
