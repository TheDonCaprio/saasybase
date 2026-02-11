import React from 'react';
import Stat from './ui/Stat';
import { prisma } from '../lib/prisma';

export default async function AdminStats() {
  const [users, plans, subscriptions, payments] = await Promise.all([
    prisma.user.count(),
    prisma.plan.count(),
    prisma.subscription.count(),
    prisma.payment.count(),
  ]);
  // `payments` is intentionally unused in the UI for now; reference to silence lint
  void payments;
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Stat label="Users" value={users} />
      <Stat label="Plans" value={plans} />
      <Stat label="Subscriptions" value={subscriptions} />
    </div>
  );
}
