"use client";

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthSession } from '@/lib/auth-provider/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faTicketAlt } from '@fortawesome/free-solid-svg-icons';

interface CouponRedeemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CouponRedeemModal({ isOpen, onClose }: CouponRedeemModalProps) {
  const { isSignedIn } = useAuthSession();
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'coupon-modal-layer';
    document.body.appendChild(el);
    containerRef.current = el;
    setReady(true);
    return () => {
      mountedRef.current = false;
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
      containerRef.current = null;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/dashboard/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim() })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to redeem coupon');
      }

      if (mountedRef.current) {
        setSuccess(true);
        setCouponCode('');
      }
      setTimeout(() => {
        if (!mountedRef.current) return;
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  if (!ready || !containerRef.current || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faTicketAlt} className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-neutral-100">Redeem Coupon</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          {!isSignedIn ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-300">
                You need to log in to redeem a coupon code.
              </p>
              <Link
                href="/sign-in"
                className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="coupon" className="block text-sm font-medium text-neutral-300 mb-2">
                  Coupon Code
                </label>
                <input
                  id="coupon"
                  type="text"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="Enter your coupon code"
                  className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  Coupon redeemed successfully!
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !couponCode.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Redeeming...' : 'Redeem'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    containerRef.current
  );
}
