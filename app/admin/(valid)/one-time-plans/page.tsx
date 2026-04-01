import React from 'react';
import { buildDashboardMetadata } from '../../../../lib/dashboardMetadata';

export async function generateMetadata() {
  return buildDashboardMetadata({
    page: 'One-Time Plans',
    description: 'Placeholder for managing one-time plan offerings within the admin console.',
    audience: 'admin',
  });
}

export default function OneTimePlansPage() {
  return (
    <div>
      <h1>One-time Plans</h1>
      <p>Placeholder page — removed the empty file to fix build errors. Replace with real UI as needed.</p>
    </div>
  );
}
