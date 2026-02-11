#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3000/api/admin/support/tickets?limit=2&count=false';
  console.log('Testing support tickets pagination at', base);
  try {
    const first = await fetch(base);
    if (!first.ok) throw new Error('HTTP ' + first.status);
    const a = await first.json();
    console.log('First page items:', a.tickets?.length);
    const cursor = a.nextCursor;
    if (!cursor) {
      console.log('No nextCursor returned; may be fewer items than limit. PASS if data small.');
      process.exit(0);
    }

    const secondUrl = base + '&cursor=' + encodeURIComponent(cursor);
    const second = await fetch(secondUrl);
    if (!second.ok) throw new Error('HTTP ' + second.status);
    const b = await second.json();
    console.log('Second page items:', b.tickets?.length);

    // Basic sanity: ensure no overlap of ids between pages
    const idsA = new Set((a.tickets || []).map(t => t.id));
    const overlap = (b.tickets || []).some(t => idsA.has(t.id));
    if (overlap) {
      console.error('Overlap between pages detected');
      process.exit(2);
    }

    console.log('PASS: support tickets cursor progression ok');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message || e);
    process.exit(1);
  }
})();
