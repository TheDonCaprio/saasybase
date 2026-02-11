import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(req: NextRequest) {
  const bearer = req.headers.get('authorization') || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : null;
  const expected = process.env.INTERNAL_API_TOKEN || process.env.DEBUG_WEBHOOK_TOKEN || null;
  return expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && !isAuthorized(req)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    console.log('=== WEBHOOK DEBUG ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Signature header present:', !!signature);
    console.log('Body length:', body.length);
    console.log('Body preview:', body.substring(0, 200) + '...');
    console.log('Headers snapshot:', {
      'user-agent': req.headers.get('user-agent'),
      'stripe-signature': signature ? '[present]' : '[missing]',
      'content-type': req.headers.get('content-type'),
    });
    console.log('====================');

    return NextResponse.json({ debug: 'logged' });
  } catch (error) {
    console.error('Debug webhook error:', error);
    return NextResponse.json({ error: 'debug failed' }, { status: 500 });
  }
}