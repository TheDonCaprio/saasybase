import { NextResponse } from 'next/server';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Mock Stripe session data for testing stacking
  const mockSession = {
    id: 'cs_test_7day_stacking_mock_' + Date.now(),
    client_reference_id: 'user_323THm91hd4lilt0VxjggohKfFb',
    metadata: {
      priceId: 'price_1S25ndFMsqy36GdGbdlFo9ND', // 7-day plan price ID from .env
      userId: 'user_323THm91hd4lilt0VxjggohKfFb'
    },
    line_items: {
      data: [{
        price: {
          id: 'price_1S25ndFMsqy36GdGbdlFo9ND'
        }
      }]
    }
  };

  return NextResponse.json({ 
    mockSessionId: mockSession.id,
    testUrl: `/api/checkout/confirm?session_id=${mockSession.id}`,
    note: 'Use this session ID to test 7-day plan stacking'
  });
}
