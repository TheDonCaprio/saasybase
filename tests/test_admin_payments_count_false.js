#!/usr/bin/env node
(async () => {
  const url = 'http://localhost:3000/api/admin/payments?page=2&limit=10&count=false';
  console.log('Testing:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('HTTP error', res.status);
      process.exit(2);
    }
    const json = await res.json();
    console.log('Response keys:', Object.keys(json));

    if (json.totalCount !== null && typeof json.totalCount !== 'undefined') {
      console.error('Expected totalCount to be null/undefined when count=false, got:', json.totalCount);
      process.exit(3);
    }

    if (!Array.isArray(json.payments)) {
      console.error('Expected payments array, got:', typeof json.payments);
      process.exit(4);
    }

    console.log('PASS: admin payments count=false behavior ok');
    process.exit(0);
  } catch (e) {
    console.error('Error running test:', e.message || e);
    process.exit(1);
  }
})();
