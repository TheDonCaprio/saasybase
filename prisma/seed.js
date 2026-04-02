const { createPrismaClient } = require('../scripts/create-prisma-client.cjs');
const bcrypt = require('bcryptjs');
// Inline plan definitions to avoid importing TS/ESM modules from this CommonJS seed script
const PLAN_DEFINITIONS = [
  // One-time plans
  { id: '24H', name: '24 Hour Pro', durationHours: 24, priceCents: 299, externalPriceEnv: 'PAYMENT_PRICE_24H', sortOrder: 0, autoRenew: false },
  { id: '7D', name: '7 Day Pro', durationHours: 7 * 24, priceCents: 799, externalPriceEnv: 'PAYMENT_PRICE_7D', sortOrder: 1, autoRenew: false },
  { id: '1M_OT', name: '1 Month Extra', durationHours: 30 * 24, priceCents: 1999, externalPriceEnv: 'PAYMENT_PRICE_1M_OT', sortOrder: 2, autoRenew: false },
  
  // Subscription plans
  { id: '1M_SUB', name: 'Monthly Pro', durationHours: 30 * 24, priceCents: 1999, externalPriceEnv: 'SUBSCRIPTION_PRICE_1M', sortOrder: 3, autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 1 },
  { id: '3M_SUB', name: 'Quarterly Pro', durationHours: 90 * 24, priceCents: 4999, externalPriceEnv: 'SUBSCRIPTION_PRICE_3M', sortOrder: 4, autoRenew: true, recurringInterval: 'month', recurringIntervalCount: 3, description: 'Save 20%' },
  { id: '1Y_SUB', name: 'Yearly Pro', durationHours: 365 * 24, priceCents: 14999, externalPriceEnv: 'SUBSCRIPTION_PRICE_1Y', sortOrder: 5, autoRenew: true, recurringInterval: 'year', recurringIntervalCount: 1, description: 'Save 40%' },
];
const CORE_SITE_PAGES = [
  {
    slug: 'terms',
    title: 'Terms and Conditions',
    description: 'Understand the rules that govern access to {{siteName}}.',
    content: `<h1>Terms and Conditions</h1>
  <p>These terms outline the agreement between you and {{siteName}}. Please review them carefully before using the service.</p>
<h2>Using the service</h2>
<p>By accessing or using {{siteName}}, you agree to comply with all applicable laws and respect the intellectual property of others.</p>
<h2>Subscriptions and billing</h2>
<p>Subscriptions renew based on the plan you select. You may cancel at any time to prevent future renewals.</p>
<h2>Acceptable use</h2>
<p>You may not attempt to reverse engineer the service, disrupt other users, or upload malicious code.</p>`
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'Learn how your data is collected, stored, and protected.',
    content: `<h1>Privacy Policy</h1>
  <p>Your privacy matters. This policy explains what data {{siteName}} collects and how it is used.</p>
<h2>Information we collect</h2>
<p>We collect account details, usage metrics, and optional profile information you provide.</p>
<h2>How we use information</h2>
<p>Data is used to personalize your experience, support the product, and improve performance.</p>
<h2>Contact</h2>
<p>If you have any privacy questions, contact our team at support@saasybase.com.</p>`
  },
  {
    slug: 'refund-policy',
    title: 'Refund Policy',
    description: 'Clear expectations on refunds, prorations, and dispute handling.',
    content: `<h1>Refund Policy</h1>
  <p>We want you to love {{siteName}}. This policy describes when refunds are available.</p>
<h2>Subscriptions</h2>
<p>Refunds are evaluated case-by-case within 14 days of purchase. Contact support with your order ID.</p>
<h2>One-time purchases</h2>
<p>Non-subscription purchases are refundable within 7 days if the item was not downloaded or used.</p>
<h2>Charge disputes</h2>
<p>Please reach out to our support team before filing a dispute so we can help resolve the issue quickly.</p>`
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    description: 'Reach the {{siteName}} team for support, sales, or partnership inquiries.',
    content: `<h1>Contact {{siteName}}</h1>
  <p>Need help or want to partner with us? We would love to hear from you.</p>
  <h2>Support</h2>
  <p>Email <a href="mailto:{{supportEmail}}">{{supportEmail}}</a> for billing or technical help.</p>
  <h2>Partnerships</h2>
  <p>Interested in collaborating? Contact <a href="mailto:{{partnersEmail}}">{{partnersEmail}}</a>.</p>
<h2>Community</h2>
<p>Join the conversation on our community forum to share feedback and ideas.</p>`
  }
];
let prisma;

async function ensurePlansSeeded() {
  for (const plan of PLAN_DEFINITIONS) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
      },
      create: {
        name: plan.name,
        durationHours: plan.durationHours,
        priceCents: plan.priceCents,
        sortOrder: plan.sortOrder,
      }
    });
  }
}

async function ensureSitePagesSeeded() {
  for (const page of CORE_SITE_PAGES) {
    const existing = await prisma.sitePage.findFirst({
      where: {
        collection: 'page',
        slug: page.slug
      }
    });
    if (!existing) {
      // Replace any hardcoded support/partners addresses with values from
      // environment variables so seeded pages reflect configured settings.
      const supportEmail = process.env.SUPPORT_EMAIL || 'support@saasybase.com';
      const partnersEmail = process.env.PARTNERS_EMAIL || 'partners@saasybase.com';
      const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'SaaSyBase';
      let contentWithEmails = String(page.content)
        .replace(/support@saasybase\.com/gi, supportEmail)
        .replace(/partners@saasybase\.com/gi, partnersEmail)
        .replace(/SaaSyBase Pro/gi, siteName)
        .replace(/\{\{siteName\}\}/g, siteName)
        .replace(/\{\{supportEmail\}\}/g, supportEmail)
        .replace(/\{\{partnersEmail\}\}/g, partnersEmail);

      await prisma.sitePage.create({
        data: {
          collection: 'page',
          slug: page.slug,
          title: page.title,
          description: page.description,
          content: contentWithEmails,
          system: true,
          published: true,
          publishedAt: new Date()
        }
      });
    } else if (!existing.system) {
      await prisma.sitePage.update({
        where: { id: existing.id },
        data: { system: true }
      });
    }
  }
}

async function main() {
  prisma = await createPrismaClient();
  console.log('Seeding plans...');
  await ensurePlansSeeded();

  console.log('Ensuring core site pages exist...');
  await ensureSitePagesSeeded();

  console.log('Creating test admin user...');
  const hashedPassword = await bcrypt.hash('password', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@saasybase.com' },
    update: { 
      name: 'Admin', 
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(),
    },
    create: {
      email: 'admin@saasybase.com',
      name: 'Admin',
      role: 'ADMIN',
      password: hashedPassword,
      emailVerified: new Date(),
    }
  });

  console.log('Creating sample subscription for admin (24H plan)...');
  const plan = await prisma.plan.findFirst({ where: { name: '24 Hour Pro' } });
  if (plan) {
    const sub = await prisma.subscription.create({
      data: {
        userId: admin.id,
        planId: plan.id,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + plan.durationHours * 3600 * 1000),
      }
    });

    await prisma.payment.create({
      data: {
        userId: admin.id,
        subscriptionId: sub.id,
        amountCents: plan.priceCents,
        status: 'SUCCEEDED',
      }
    });
  } else {
    console.warn('Plan not found; skipping subscription/payment creation');
  }

  const counts = {
    users: await prisma.user.count(),
    plans: await prisma.plan.count(),
    subscriptions: await prisma.subscription.count(),
    payments: await prisma.payment.count(),
    pages: await prisma.sitePage.count()
  };

  console.log('Counts after seeding:', counts);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
