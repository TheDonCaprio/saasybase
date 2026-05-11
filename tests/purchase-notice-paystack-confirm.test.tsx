// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn(() => '/dashboard'));
const searchParamsMock = vi.hoisted(() => vi.fn());
const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
  usePathname: () => pathnameMock(),
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('../components/ui/Toast', () => ({
  showToast: showToastMock,
}));

import { PurchaseNotice } from '../components/dashboard/PurchaseNotice';

describe('PurchaseNotice paystack confirmation polling', () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.mockReturnValue(new URLSearchParams('purchase=success&provider=paystack&payment_intent=paystack_ref_123&trxref=paystack_ref_123&reference=paystack_ref_123'));
    window.history.replaceState({}, '', '/dashboard?purchase=success&provider=paystack&payment_intent=paystack_ref_123&trxref=paystack_ref_123&reference=paystack_ref_123');
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }

    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function render(ui: React.ReactElement) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(ui);
    });

    await act(async () => {
      await Promise.resolve();
    });

    return container;
  }

  it('polls checkout confirmation for paystack dashboard success redirects using payment_intent fallback', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/checkout/confirm?')) {
        return new Response(JSON.stringify({ ok: true, completed: true, paymentId: 'pay_local_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.startsWith('/api/dashboard/payments?')) {
        return new Response(JSON.stringify({
          payments: [{
            plan: {
              name: 'Daily Pro',
              tokenLimit: 200,
              tokenName: 'tokens',
            },
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await render(<PurchaseNotice />);

    expect(fetchMock).toHaveBeenCalledWith('/api/checkout/confirm?payment_id=paystack_ref_123');
    expect(replaceMock).toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalled();
  });
});