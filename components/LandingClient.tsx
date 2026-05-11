'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCreditCard, faLock, faBuilding, faTag, faGauge, faEnvelope,
  faArrowsRotate, faShield, faNewspaper, faFileLines, faHeadset, faUserShield,
  faUsers, faChartLine, faDollarSign, faTicket, faBars,
  faWaveSquare, faGaugeHigh, faLifeRing, faArrowUpRightFromSquare, faBolt, faGear, faTriangleExclamation,
  faPen, faHourglassEnd, faHandHoldingDollar,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { PAYMENT_PROVIDERS } from '../lib/payment/provider-config';
import { PaymentProviderBadge } from './ui/PaymentProviderBadge';
import { AdminStatCard } from './admin/AdminStatCard';
import { DashboardPageHeader } from './dashboard/DashboardPageHeader';
import { dashboardPanelClass, dashboardPillClass } from './dashboard/dashboardSurfaces';

/* ─── Fake data for the animated dashboard demo ─── */
const FAKE_TRANSACTIONS = [
  { id: '1',  ref: 'pi_3N7Yk9…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Stripe',   user: 'alex@demo.com',    time: '2s ago'  },
  { id: '2',  ref: 'psk_89ad…', plan: 'Starter Plan',    amount: '$19.00',  status: 'SUCCEEDED', provider: 'Paystack', user: 'maya@demo.com',    time: '14s ago' },
  { id: '3',  ref: 'rzp_41f2…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Razorpay', user: 'carlos@demo.com',  time: '1m ago'  },
  { id: '4',  ref: 'pad_2f10…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Paddle',   user: 'nina@demo.com',    time: '3m ago'  },
  { id: '5',  ref: 'in_7a0c…',  plan: 'Starter Plan',    amount: '$19.00',  status: 'REFUNDED',  provider: 'Stripe',   user: 'joe@demo.com',     time: '7m ago'  },
  { id: '6',  ref: 'pi_a91b…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Stripe',   user: 'priya@demo.com',   time: '11m ago' },
  { id: '7',  ref: 'rzp_12c3…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Razorpay', user: 'sam@demo.com',     time: '18m ago' },
  { id: '8',  ref: 'pi_8d2e…', plan: 'Starter Plan',    amount: '$19.00',  status: 'FAILED',    provider: 'Stripe',   user: 'jamie@demo.com',   time: '24m ago' },
  { id: '9',  ref: 'psk_1c5b…', plan: 'Pro Plan',        amount: '$49.00',  status: 'PENDING',   provider: 'Paystack', user: 'omar@demo.com',    time: '31m ago' },
  { id: '10', ref: 'rzp_90aa…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Razorpay', user: 'grace@demo.com',   time: '46m ago' },
  { id: '11', ref: 'pad_aa19…', plan: 'Starter Plan',    amount: '$19.00',  status: 'SUCCEEDED', provider: 'Paddle',   user: 'wei@demo.com',     time: '1h ago'  },
  { id: '12', ref: 'pi_001a…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Stripe',   user: 'lena@demo.com',    time: '2h ago'  },
  { id: '13', ref: 'psk_7d10…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Paystack', user: 'tim@demo.com',     time: '4h ago'  },
  { id: '14', ref: 'rzp_d12a…', plan: 'Starter Plan',    amount: '$19.00',  status: 'REFUNDED',  provider: 'Razorpay', user: 'denton@demo.com',  time: '6h ago'  },
  { id: '15', ref: 'pad_0b7c…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Paddle',   user: 'sara@demo.com',    time: '9h ago'  },
  { id: '16', ref: 'pi_77b2…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Stripe',   user: 'ken@demo.com',     time: '12h ago' },
  { id: '17', ref: 'psk_5510…', plan: 'Starter Plan',    amount: '$19.00',  status: 'FAILED',    provider: 'Paystack', user: 'zoe@demo.com',     time: '18h ago' },
  { id: '18', ref: 'rzp_08ae…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Razorpay', user: 'noah@demo.com',    time: '1d ago'  },
  { id: '19', ref: 'pad_19f0…', plan: 'Business Plan',   amount: '$129.00', status: 'PENDING',   provider: 'Paddle',   user: 'ivy@demo.com',     time: '1d ago'  },
  { id: '20', ref: 'pi_2c10…', plan: 'Starter Plan',    amount: '$19.00',  status: 'SUCCEEDED', provider: 'Stripe',   user: 'ben@demo.com',     time: '2d ago'  },
  { id: '21', ref: 'psk_32ab…', plan: 'Pro Plan',        amount: '$49.00',  status: 'SUCCEEDED', provider: 'Paystack', user: 'hana@demo.com',    time: '2d ago'  },
  { id: '22', ref: 'rzp_1f80…', plan: 'Business Plan',   amount: '$129.00', status: 'SUCCEEDED', provider: 'Razorpay', user: 'liam@demo.com',    time: '3d ago'  },
];

const FAKE_USERS = [
  { email: 'john@demo.com',   name: 'John Doe',        role: 'ADMIN', plan: 'Business', status: 'Active', joined: 'Dec 18, 2025', payments: 92, avatarBg: '#0ea5e9' },
  { email: 'maya@demo.com',   name: 'Maya Patel',      role: 'ADMIN', plan: 'Pro',      status: 'Active', joined: 'Dec 20, 2025', payments: 41, avatarBg: '#6366f1' },
  { email: 'tim@demo.com',    name: 'Tim Carlos',      role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 21, 2025', payments: 22, avatarBg: '#6366f1' },
  { email: 'lena@demo.com',   name: 'Lena Fischer',    role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 5, 2025',  payments: 4,  avatarBg: '#10b981' },
  { email: 'denton@demo.com', name: 'Denton Zane',     role: 'USER',  plan: 'Starter',  status: 'Active', joined: 'Dec 19, 2025', payments: 8,  avatarBg: '#8b5cf6' },
  { email: 'alex@demo.com',   name: 'Alex Kim',        role: 'USER',  plan: 'Pro',      status: 'Active', joined: 'Dec 17, 2025', payments: 12, avatarBg: '#0ea5e9' },
  { email: 'carlos@demo.com', name: 'Carlos Ruiz',     role: 'USER',  plan: 'Business', status: 'Active', joined: 'Dec 15, 2025', payments: 19, avatarBg: '#10b981' },
  { email: 'nina@demo.com',   name: 'Nina Park',       role: 'USER',  plan: 'Pro',      status: 'Active', joined: 'Dec 14, 2025', payments: 6,  avatarBg: '#6366f1' },
  { email: 'priya@demo.com',  name: 'Priya Singh',     role: 'USER',  plan: 'Business', status: 'Active', joined: 'Dec 13, 2025', payments: 27, avatarBg: '#8b5cf6' },
  { email: 'sam@demo.com',    name: 'Sam Jordan',      role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 12, 2025', payments: 1,  avatarBg: '#0ea5e9' },
  { email: 'wei@demo.com',    name: 'Wei Chen',        role: 'USER',  plan: 'Starter',  status: 'Active', joined: 'Dec 10, 2025', payments: 3,  avatarBg: '#10b981' },
  { email: 'omar@demo.com',   name: 'Omar Ali',        role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 9, 2025',  payments: 0,  avatarBg: '#6366f1' },
  { email: 'grace@demo.com',  name: 'Grace Lee',       role: 'USER',  plan: 'Pro',      status: 'Active', joined: 'Dec 8, 2025',  payments: 9,  avatarBg: '#8b5cf6' },
  { email: 'joe@demo.com',    name: 'Joe Martin',      role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 7, 2025',  payments: 2,  avatarBg: '#0ea5e9' },
  { email: 'sara@demo.com',   name: 'Sara Novak',      role: 'USER',  plan: 'Starter',  status: 'Active', joined: 'Dec 6, 2025',  payments: 5,  avatarBg: '#10b981' },
  { email: 'ken@demo.com',    name: 'Ken Adams',       role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 4, 2025',  payments: 0,  avatarBg: '#6366f1' },
  { email: 'zoe@demo.com',    name: 'Zoe Alvarez',     role: 'USER',  plan: 'Pro',      status: 'Active', joined: 'Dec 2, 2025',  payments: 14, avatarBg: '#8b5cf6' },
  { email: 'hana@demo.com',   name: 'Hana Ito',        role: 'USER',  plan: 'None',     status: 'Active', joined: 'Nov 30, 2025', payments: 1,  avatarBg: '#0ea5e9' },
  { email: 'liam@demo.com',   name: 'Liam Walker',     role: 'USER',  plan: 'Business', status: 'Active', joined: 'Nov 28, 2025', payments: 33, avatarBg: '#10b981' },
];

const USER_STATS = [
  { label: 'TOTAL USERS',        value: '19', sub: '+5 in 7 days',           faIcon: faUsers,       iconBg: 'rgba(59,130,246,0.18)',  iconColor: '#3b82f6' },
  { label: 'NEW USERS TODAY',    value: '2', sub: '7 this month',            faIcon: faArrowsRotate,iconBg: 'rgba(16,185,129,0.18)', iconColor: '#10b981' },
  { label: 'TEAM ADMINS',        value: '2', sub: 'Users with admin role',   faIcon: faUsers,       iconBg: 'rgba(139,92,246,0.18)', iconColor: '#8b5cf6' },
  { label: 'RENEWALS IN 14 DAYS',value: '4', sub: 'Upcoming expirations',    faIcon: faTicket,      iconBg: 'rgba(251,191,36,0.18)', iconColor: '#d97706' },
];

const FINANCE_SUBMENU = [
  { label: 'Transactions',   view: 'finance' as DemoView | null, badge: 122, icon: faFileLines },
  { label: 'One-Time Sales', view: null,                          badge: null, icon: faDollarSign },
  { label: 'Subscriptions',  view: null,                          badge: 69,   icon: faArrowsRotate },
];


type DemoView = 'finance' | 'users' | 'overview';
const DEMO_VIEWS: DemoView[] = ['finance', 'users', 'overview'];
const DEMO_HOLD_MS = [9500, 8500, 6500];

const FEATURES: Array<{ icon: IconDefinition; title: string; desc: string }> = [
  { icon: faCreditCard,   title: 'Multi-Provider Payments',  desc: 'Stripe, Paystack, Razorpay, and Paddle — all wired up. Switch providers with one env var.' },
  { icon: faLock,         title: 'Auth & User Management',   desc: 'Clerk-powered authentication out of the box. Magic links, OAuth, MFA — all handled.' },
  { icon: faBuilding,     title: 'Teams & Organizations',    desc: 'Built-in multi-tenant support with role-based access. Invite members, manage seats.' },
  { icon: faTag,          title: 'Coupons & Discounts',      desc: 'Create one-time, forever, or repeating discount codes. Native provider mapping included.' },
  { icon: faGauge,        title: 'Admin Dashboard',          desc: 'Full analytics, user management, revenue overview, and subscription controls.' },
  { icon: faEnvelope,     title: 'Transactional Emails',     desc: 'Nodemailer-powered email templates for receipts, renewals, and lifecycle events.' },
  { icon: faArrowsRotate, title: 'Subscriptions & Billing',  desc: 'Recurring plans, proration, upgrades, downgrades, and end-of-cycle reconciliation.' },
  { icon: faShield,       title: 'Token-based Access',       desc: 'Credit system with per-plan token limits. Control feature access with fine-grained gates.' },
  { icon: faNewspaper,    title: 'Blog Engine',              desc: 'MDX-powered blog built-in. Write posts, set metadata, publish — no third-party CMS needed.' },
  { icon: faFileLines,    title: 'Static Pages',             desc: 'Configurable marketing and legal pages (Terms, Privacy, etc.) with CMS-editable content.' },
  { icon: faHeadset,      title: 'Support System',           desc: 'Built-in ticket system so users can raise issues directly from their dashboard.' },
  { icon: faUserShield,   title: 'Moderator Tools',          desc: 'Role-based moderation controls. Suspend accounts, manage content, audit activity logs.' },
];

const PROVIDERS = [
  { name: 'Stripe',   color: '#5469D4', logoUrl: '/images/providers/stripe.svg' },
  { name: 'Paystack', color: '#00C3F7', logoUrl: '/images/providers/paystack.svg' },
  { name: 'Razorpay', color: '#3293FB', logoUrl: '/images/providers/razorpay.svg' },
  { name: 'Paddle',   color: '#1DCD9F', logoUrl: '/images/providers/paddle.svg' },
];

const STATS = [
  { label: 'MRR',           value: '$14,280', sub: '+12% this month',    faIcon: faDollarSign,  gradColor: '#10b981' },
  { label: 'Active Users',  value: '1,204',   sub: '↑ 38 new today',     faIcon: faUsers,       gradColor: '#3b82f6' },
  { label: 'Subscriptions', value: '847',     sub: '91% retention',      faIcon: faArrowsRotate,gradColor: '#8b5cf6' },
  { label: 'Open Tickets',  value: '7',       sub: 'avg < 2hr response',  faIcon: faTicket,      gradColor: '#f59e0b' },
];

const PROVIDER_NAMES = ['stripe', 'razorpay', 'paystack', 'paddle'];

/* ─── Typewriter for provider env section ─── */
function TypewriterProvider() {
  const [providerIdx, setProviderIdx] = useState(0);
  const [displayed, setDisplayed] = useState('stripe');
  const [phase, setPhase] = useState<'typing' | 'hold' | 'erasing'>('hold');

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const target = PROVIDER_NAMES[providerIdx];
    if (phase === 'hold') {
      t = setTimeout(() => setPhase('erasing'), 1800);
    } else if (phase === 'erasing') {
      if (displayed.length > 0) {
        t = setTimeout(() => setDisplayed(d => d.slice(0, -1)), 55);
      } else {
        const next = (providerIdx + 1) % PROVIDER_NAMES.length;
        t = setTimeout(() => {
          setProviderIdx(next);
          setPhase('typing');
        }, 0);
      }
    } else {
      if (displayed.length < target.length) {
        t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 90);
      } else {
        t = setTimeout(() => setPhase('hold'), 0);
      }
    }
    return () => clearTimeout(t);
  }, [phase, displayed, providerIdx]);

  return (
    <span className="lp-code-string">
      &quot;{displayed}<span className="lp-cursor">|</span>&quot;
    </span>
  );
}

function RoleBadge({ role }: { role: 'USER' | 'ADMIN' }) {
  const isAdmin = role === 'ADMIN';
  return (
    <span style={{
      background: isAdmin ? 'rgba(99,102,241,0.15)' : 'rgba(107,114,128,0.12)',
      color: isAdmin ? '#818cf8' : 'rgba(156,163,175,1)',
      border: `1px solid ${isAdmin ? 'rgba(99,102,241,0.35)' : 'rgba(107,114,128,0.2)'}`,
      borderRadius: 5, fontSize: 9, fontWeight: 700, padding: '2px 7px',
      letterSpacing: 0.4, display: 'inline-block',
    }}>{role}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    SUCCEEDED: { bg: 'rgba(16,185,129,0.15)', text: '#10b981', dot: '#10b981' },
    REFUNDED:  { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', dot: '#f59e0b' },
    PENDING:   { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', dot: '#818cf8' },
    FAILED:    { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444', dot: '#ef4444' },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span style={{ background: s.bg, color: s.text, borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {status}
    </span>
  );
}

function DemoActionIconButton({
  icon,
  title,
  tone = 'neutral',
  disabled = false,
  onClick,
}: {
  icon: IconDefinition;
  title: string;
  tone?: 'neutral' | 'danger' | 'dangerOutline';
  disabled?: boolean;
  onClick?: () => void;
}) {
  const disabledClass =
    'inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-400 shadow-sm transition dark:border-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-400 cursor-not-allowed';

  const neutralClass =
    'inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800';

  const dangerClass =
    'inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-red-600 text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900';

  const dangerOutlineClass =
    'inline-flex h-6 w-6 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10';

  const className = disabled
    ? disabledClass
    : tone === 'danger'
      ? dangerClass
      : tone === 'dangerOutline'
        ? dangerOutlineClass
        : neutralClass;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={className}
    >
      <FontAwesomeIcon icon={icon} className="h-3 w-3" />
    </button>
  );
}

/* ─── Animated dashboard "browser window" ─── */
function DashboardDemo() {
  const [demoView, setDemoView] = useState<DemoView>('finance');
  const [transitioning, setTransitioning] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  const tiltInnerRef = useRef<HTMLDivElement>(null);
  const viewIdxRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-cycle views
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timer = setTimeout(() => {
        setTransitioning(true);
        setTimeout(() => {
          viewIdxRef.current = (viewIdxRef.current + 1) % DEMO_VIEWS.length;
          setDemoView(DEMO_VIEWS[viewIdxRef.current]);
          setTransitioning(false);
          scheduleNext();
        }, 350);
      }, DEMO_HOLD_MS[viewIdxRef.current]);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  // auto-scroll each view slowly
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || transitioning) return;
    el.scrollTop = 0;
    let raf = 0;
    const delay = setTimeout(() => {
      const target = el.scrollHeight - el.clientHeight;
      if (target <= 0) return;
      const dur = Math.max(target * 22, 3500);
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        el.scrollTop = ease * target;
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 900);
    return () => { clearTimeout(delay); cancelAnimationFrame(raf); };
  }, [demoView, transitioning]);

  // 3D tilt — direct DOM update to avoid per-mousemove re-renders
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = tiltRef.current?.getBoundingClientRect();
    if (!rect || !tiltInnerRef.current) return;
    const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    tiltInnerRef.current.style.transform = `perspective(450px) rotateX(${dy * -3}deg) rotateY(${dx * 3}deg) scale(1.01)`;
  };
  const handleMouseLeave = () => {
    if (tiltInnerRef.current) {
      tiltInnerRef.current.style.transform = 'perspective(450px) rotateX(0deg) rotateY(0deg) scale(1)';
    }
  };

  const urlMap: Record<DemoView, string> = {
    finance:  'app.saasybase.com/admin/transactions',
    users:    'app.saasybase.com/admin/users',
    overview: 'app.saasybase.com/admin',
  };

  const paidUsers = FAKE_USERS.filter((u) => u.plan !== 'None');
  const freeUsers = FAKE_USERS.filter((u) => u.plan === 'None');

  const visitsToday = 982;
  const visitsYesterday = 935;
  const visitsDelta = visitsToday - visitsYesterday;
  const visitsTrend = visitsDelta === 0 ? 'flat' : visitsDelta > 0 ? 'up' : 'down';
  const openTickets = 7;
  const inProgressTickets = 3;
  const errorWarningToday = 4;
  const errorWarningWeek = 19;

  return (
    <div
      ref={tiltRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', maxWidth: 1060, margin: '0 auto' }}
    >
      {/* outward ambient glow */}
      <div style={{
        position: 'absolute', inset: 40, borderRadius: 18, zIndex: 0,
        boxShadow: '0 0 70px 18px rgba(99,102,241,0.42), 0 0 130px 35px rgba(139,92,246,0.2), 0 0 240px 75px rgba(6,182,212,0.1)',
        pointerEvents: 'none',
      }} />

      {/* 3D tilt wrapper */}
      <div ref={tiltInnerRef} className="lp-dd-tilt" style={{
        position: 'relative', zIndex: 1,
        transition: 'transform 1.15s ease-out',
      }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--lp-dd-border-main)',
          background: 'var(--lp-dd-outer-bg)',
          fontFamily: 'inherit',
        }}>
          {/* browser chrome */}
          <div style={{ background: 'var(--lp-dd-chrome-bg)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--lp-dd-border)' }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
            <div style={{ flex: 1, background: 'var(--lp-dd-url-bg)', borderRadius: 6, padding: '4px 12px', marginLeft: 8, fontSize: 11, color: 'var(--lp-dd-url-text)', maxWidth: 280, transition: 'color 0.3s' }}>
              {urlMap[demoView]}
            </div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(128,128,128,0.3)', marginLeft: 'auto' }} />
          </div>

          {/* app shell */}
          <div className="lp-dd-shell" style={{ display: 'flex', height: 520 }}>
            {/* mobile header – visible only on small screens */}
            <div className="lp-dd-mobile-hdr">
              <FontAwesomeIcon icon={faBars} style={{ fontSize: 14, color: 'var(--lp-dd-nav-text)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lp-dd-brand)', letterSpacing: '-.3px' }}>SaasyBase</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--lp-dd-muted)', fontWeight: 500 }}>Admin Panel</span>
            </div>
            {/* sidebar */}
            <nav className="lp-dd-sidebar" style={{ width: 174, background: 'var(--lp-dd-sidebar-bg)', borderRight: '1px solid var(--lp-dd-sidebar-border)', padding: '12px 0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
              {/* Brand */}
              <div style={{ padding: '0 14px 10px', fontSize: 13, fontWeight: 700, color: 'var(--lp-dd-brand)', letterSpacing: 0.3 }}>SaasyBase</div>
              {/* ADMIN section label */}
              <div style={{ padding: '2px 14px 3px', fontSize: 9, fontWeight: 700, color: 'var(--lp-dd-col-hdr)', letterSpacing: 1, textTransform: 'uppercase' }}>ADMIN</div>
              {/* Overview */}
              <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: demoView === 'overview' ? 'var(--lp-dd-nav-active-text)' : 'var(--lp-dd-nav-text)', fontWeight: demoView === 'overview' ? 600 : 400, background: demoView === 'overview' ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: demoView === 'overview' ? '2px solid #6366f1' : '2px solid transparent', cursor: 'default' }}>
                <span>Overview</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>˅</span>
              </div>
              {/* Users & Access parent */}
              <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--lp-dd-nav-text)', fontWeight: 500, cursor: 'default' }}>
                <span>Users &amp; Access</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>˄</span>
              </div>
              {/* Users child (active for users view) */}
              {[
                { label: 'Users',         view: 'users' as DemoView | null,    badge: FAKE_USERS.length,  icon: faUsers },
                { label: 'Organizations', view: null,                            badge: null, icon: faBuilding },
                { label: 'Moderation',    view: null,                            badge: 99, icon: faUserShield },
              ].map(item => {
                const active = item.view === demoView;
                return (
                  <div key={item.label} style={{ padding: '5px 14px 5px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: active ? 'var(--lp-dd-nav-active-text)' : 'var(--lp-dd-nav-text)', fontWeight: active ? 600 : 400, background: active ? 'rgba(99,102,241,0.14)' : 'transparent', borderLeft: active ? '2px solid #6366f1' : '2px solid transparent', cursor: 'default' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <FontAwesomeIcon icon={item.icon!} style={{ width: 10, color: active ? 'var(--lp-dd-nav-active-text)' : 'var(--lp-dd-nav-text)' }} />
                      {item.label}
                    </span>
                    {item.badge !== null && <span style={{ background: active ? '#6366f1' : 'rgba(99,102,241,0.2)', color: active ? '#fff' : '#818cf8', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{item.badge}</span>}
                  </div>
                );
              })}
              {/* Finances parent */}
              <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--lp-dd-nav-text)', fontWeight: 500, cursor: 'default', marginTop: 2 }}>
                <span>Finances</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>{demoView === 'finance' ? '˄' : '˅'}</span>
              </div>
              {demoView === 'finance' && FINANCE_SUBMENU.map(item => {
                const active = item.view === demoView;
                return (
                  <div key={item.label} style={{ padding: '5px 14px 5px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: active ? 'var(--lp-dd-nav-active-text)' : 'var(--lp-dd-nav-text)', fontWeight: active ? 600 : 400, background: active ? 'rgba(99,102,241,0.14)' : 'transparent', borderLeft: active ? '2px solid #6366f1' : '2px solid transparent', cursor: 'default' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <FontAwesomeIcon icon={item.icon} style={{ width: 10, color: active ? 'var(--lp-dd-nav-active-text)' : 'var(--lp-dd-nav-text)' }} />
                      {item.label}
                    </span>
                    {item.badge !== null && <span style={{ background: active ? '#6366f1' : 'rgba(99,102,241,0.2)', color: active ? '#fff' : '#818cf8', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{item.badge}</span>}
                  </div>
                );
              })}
              {/* Collapsed sections */}
              {['Platform', 'Support & Analytics', 'Developer'].map(lbl => (
                <div key={lbl} style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--lp-dd-nav-text)', cursor: 'default' }}>
                  <span>{lbl}</span>
                  <span style={{ fontSize: 9, opacity: 0.5 }}>˅</span>
                </div>
              ))}
              {/* Sign Out */}
              <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--lp-dd-sidebar-border)', fontSize: 11, color: 'var(--lp-dd-nav-text)', cursor: 'default' }}>Sign Out</div>
            </nav>

            {/* ── Finance / Transactions view ── */}
            {demoView === 'finance' && (
              <div ref={scrollRef} className="lp-dd-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                {/* Gradient page banner */}
                <div style={{ margin: '12px 14px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--lp-dd-banner-border-users)', flexShrink: 0 }}>
                <div style={{ background: 'var(--lp-dd-banner-bg-users)', padding: '12px 14px 14px' }}>
                  <div className="lp-dd-banner-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 10px', fontSize: 10, color: 'rgba(255,255,255,0.75)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
                        <FontAwesomeIcon icon={faCreditCard} style={{ width: 10, color: '#6366f1' }} />
                        <span style={{ marginLeft: 6, fontWeight: 700, letterSpacing: 0.2, color: '#6366f1' }}>Finances</span>
                      </span>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--lp-dd-banner-title)', letterSpacing: -0.5 }}>Transactions</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ border: '1px solid var(--lp-dd-banner-chip-border)', borderRadius: 8, padding: '5px 11px', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-label)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Total Revenue</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--lp-dd-banner-chip-num)', lineHeight: 1.3 }}>$14,280</div>
                      </div>
                      <div style={{ border: '1px solid var(--lp-dd-banner-chip-border)', borderRadius: 8, padding: '5px 11px', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-label)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>This Month</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--lp-dd-banner-free-num)', lineHeight: 1.3 }}>+12%</div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                {/* 4 stat cards (match real app styling) */}
                <div className="lp-dd-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '12px 14px 10px', flexShrink: 0 }}>
                  {STATS.map((stat) => (
                    <AdminStatCard
                      key={stat.label}
                      label={stat.label}
                      value={stat.value}
                      helper={stat.sub}
                      icon={stat.faIcon}
                      accent="theme"
                      size="compact"
                      className="rounded-xl"
                    />
                  ))}
                </div>
                {/* Transactions table */}
                <div style={{ padding: '0 14px 10px' }}>
                  <div style={{ background: 'var(--lp-dd-table-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--lp-dd-hdr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--lp-dd-title-text)' }}>Recent Transactions</span>
                    </div>
                    {/* Desktop grid table */}
                    <div className="lp-dd-tbl-desktop">
                      <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.4fr 2fr 1.7fr 1.1fr 0.9fr 0.6fr', padding: '5px 12px', gap: 8 }}>
                        {['Provider', 'Payment', 'User', 'Plan / Amount', 'Status', 'Date', 'Actions'].map(h => (
                          <div
                            key={h}
                            style={{
                              fontSize: 9,
                              color: 'var(--lp-dd-col-hdr)',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                              textAlign: h === 'Actions' ? 'right' : 'left',
                            }}
                          >
                            {h}
                          </div>
                        ))}
                      </div>
                      {FAKE_TRANSACTIONS.map((tx, i) => (
                        <div key={tx.id} className="lp-tx-row" style={{ display: 'grid', gridTemplateColumns: '0.6fr 1.4fr 2fr 1.7fr 1.1fr 0.9fr 0.6fr', padding: '6px 12px', gap: 8, alignItems: 'center', borderTop: '1px solid var(--lp-dd-row-border)', animationDelay: `${300 + i * 180}ms` }}>
                          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                            <PaymentProviderBadge provider={tx.provider} size="xs" showName={false} />
                          </div>
                          <div style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.ref}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.user}</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.plan.replace(' Plan','')}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--lp-dd-amount)', flexShrink: 0 }}>{tx.amount}</span>
                          </div>
                          <StatusBadge status={tx.status} />
                          <div style={{ fontSize: 10, color: 'var(--lp-dd-row-text3)' }}>{tx.time}</div>
                          <div className="flex justify-end">
                            <DemoActionIconButton
                              icon={faHandHoldingDollar}
                              title="Refund payment"
                              tone="danger"
                              disabled={tx.status !== 'SUCCEEDED'}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Mobile card layout */}
                    <div className="lp-dd-tbl-mobile">
                      {FAKE_TRANSACTIONS.map((tx, i) => (
                        <div key={tx.id} className="lp-tx-row" style={{ padding: '8px 12px', borderTop: '1px solid var(--lp-dd-row-border)', animationDelay: `${300 + i * 180}ms` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text)', fontWeight: 500 }}>{tx.user}</span>
                            <span className="flex items-center gap-2">
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--lp-dd-amount)' }}>{tx.amount}</span>
                              <DemoActionIconButton
                                icon={faHandHoldingDollar}
                                title="Refund payment"
                                tone="danger"
                                disabled={tx.status !== 'SUCCEEDED'}
                              />
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>{tx.plan.replace(' Plan','')}</span>
                            <span style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>·</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <PaymentProviderBadge provider={tx.provider} size="xs" showName={false} />
                            </span>
                            <span style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>·</span>
                            <span style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>{tx.time}</span>
                            <span style={{ marginLeft: 'auto' }}><StatusBadge status={tx.status} /></span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: 9, color: 'var(--lp-dd-row-text3)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', letterSpacing: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.ref}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Users view ── */}
            {demoView === 'users' && (
              <div ref={scrollRef} className="lp-dd-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                {/* Gradient page banner */}
                <div style={{ margin: '12px 14px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--lp-dd-banner-border)', flexShrink: 0 }}>
                <div style={{ background: 'var(--lp-dd-banner-bg)', padding: '12px 14px 14px' }}>
                  <div className="lp-dd-banner-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 10px', fontSize: 10, color: 'rgba(255,255,255,0.75)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <FontAwesomeIcon icon={faUsers} style={{ width: 10, color: '#10b981' }} />
                        <span style={{ marginLeft: 6, fontWeight: 700, letterSpacing: 0.2, color: '#10b981' }}>Accounts</span>
                      </span>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--lp-dd-banner-title)', letterSpacing: -0.5 }}>User management</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ border: '1px solid var(--lp-dd-banner-chip-border)', borderRadius: 8, padding: '5px 11px', minWidth: 110 }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-label)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Active Paid Accounts</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--lp-dd-banner-chip-num)', lineHeight: 1.2, marginTop: 1 }}>{paidUsers.length}</div>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-sub)' }}>1 renewal in 14 days</div>
                      </div>
                      <div style={{ border: '1px solid var(--lp-dd-banner-chip-border)', borderRadius: 8, padding: '5px 11px', minWidth: 80 }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-label)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Free Users</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--lp-dd-banner-free-num)', lineHeight: 1.2, marginTop: 1 }}>{freeUsers.length}</div>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-sub)' }}>0 new yesterday</div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                {/* 4 stat cards (match real app styling) */}
                <div className="lp-dd-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '12px 14px 4px', flexShrink: 0 }}>
                  {USER_STATS.map((s) => (
                    <AdminStatCard
                      key={s.label}
                      label={s.label}
                      value={s.value}
                      helper={s.sub}
                      icon={s.faIcon}
                      accent="theme"
                      size="compact"
                      className="rounded-xl"
                    />
                  ))}
                </div>
                {/* User table */}
                <div style={{ padding: '8px 14px 10px' }}>
                  <div style={{ background: 'var(--lp-dd-table-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Desktop grid table */}
                    <div className="lp-dd-tbl-desktop">
                      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.9fr 0.8fr 1.3fr 1.2fr 1fr 0.7fr', padding: '5px 12px', gap: 6, borderBottom: '1px solid var(--lp-dd-hdr-border)' }}>
                        {['NAME', 'EMAIL', 'ROLE', 'JOINED', 'SUBSCRIPTION', 'PAYMENTS', 'ACTIONS'].map(h => (
                          <div
                            key={h}
                            style={{
                              fontSize: 9,
                              color: 'var(--lp-dd-col-hdr)',
                              fontWeight: 600,
                              letterSpacing: 0.5,
                              textTransform: 'uppercase',
                              textAlign: h === 'ACTIONS' ? 'right' : 'left',
                            }}
                          >
                            {h}
                          </div>
                        ))}
                      </div>
                      {FAKE_USERS.map((u) => (
                        <div key={u.email} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.9fr 0.8fr 1.3fr 1.2fr 1fr 0.7fr', padding: '7px 12px', gap: 6, alignItems: 'center', borderTop: '1px solid var(--lp-dd-row-border)' }}>
                          {/* Name with avatar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: u.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0, letterSpacing: 0.2 }}>
                              {u.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                            </div>
                            <div style={{ overflow: 'hidden' }}>
                              <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                              <div style={{ fontSize: 9, color: 'var(--lp-dd-row-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email.split('@')[0]}@...</div>
                            </div>
                          </div>
                          {/* Email */}
                          <div style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email.replace('demo.com', 'demo...')}</div>
                          {/* Role badge */}
                          <RoleBadge role={u.role as 'USER' | 'ADMIN'} />
                          {/* Joined */}
                          <div style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>{u.joined}</div>
                          {/* Subscription */}
                          <div style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)' }}>{u.plan}</div>
                          {/* Payments */}
                          <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>{u.payments} payments</div>
                          {/* Actions */}
                          <div className="flex justify-end gap-1.5">
                            <DemoActionIconButton icon={faPen} title={`Edit user ${u.name}`} />
                            <DemoActionIconButton icon={faHourglassEnd} title={`Expire subscriptions for ${u.name}`} tone="dangerOutline" />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Mobile card layout */}
                    <div className="lp-dd-tbl-mobile">
                      {FAKE_USERS.map((u) => (
                        <div key={u.email} style={{ padding: '8px 12px', borderTop: '1px solid var(--lp-dd-row-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: u.avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {u.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                            </div>
                            <span style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                            <div className="flex items-center gap-2">
                              <RoleBadge role={u.role as 'USER' | 'ADMIN'} />
                              <div className="flex items-center gap-1">
                                <DemoActionIconButton icon={faPen} title={`Edit user ${u.name}`} />
                                <DemoActionIconButton icon={faHourglassEnd} title={`Expire subscriptions for ${u.name}`} tone="dangerOutline" />
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 29, gap: 8 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                              <span style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                              <span style={{ fontSize: 9, color: 'var(--lp-dd-row-text3)' }}>Plan: {u.plan}</span>
                            </div>
                            <span style={{ fontSize: 9.5, color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>{u.payments} payments</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Overview / Dashboard view ── */}
            {demoView === 'overview' && (
              <div ref={scrollRef} className="lp-dd-content" style={{ flex: 1, opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                <div className="space-y-4 p-4">
                  <DashboardPageHeader
                    eyebrow="Operations center"
                    eyebrowIcon={<FontAwesomeIcon icon={faGear} />}
                    title="Control room"
                    stats={[
                      { label: 'Visits today', value: visitsToday.toLocaleString('en-US'), helper: `vs ${visitsYesterday.toLocaleString('en-US')} yesterday` },
                      { label: 'Open tickets', value: openTickets.toLocaleString('en-US'), helper: `${inProgressTickets.toLocaleString('en-US')} in progress` },
                    ]}
                    className="p-4"
                  />

                  <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <AdminStatCard label="Total users" value="19" helper="All-time accounts" icon={faUsers} accent="theme" size="compact" />
                    <AdminStatCard label="Active subscriptions" value="847" helper="91% retention" icon={faArrowsRotate} accent="theme" size="compact" />
                    <AdminStatCard label="Net revenue" value="$14,280" helper="Refunds: $690" icon={faDollarSign} accent="theme" size="compact" />
                    <AdminStatCard label="Errors / warnings" value={errorWarningToday.toLocaleString('en-US')} helper={`${errorWarningWeek.toLocaleString('en-US')} this week`} icon={faTriangleExclamation} accent="theme" size="compact" />
                  </section>

                  <section className="grid gap-3 lg:grid-cols-3">
                    <div className={dashboardPanelClass('relative flex h-full flex-col gap-3 overflow-hidden p-3')}>
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.22),_transparent_60%)]" />
                      <div className="relative flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xxs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Traffic pulse</p>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Daily momentum</h3>
                        </div>
                        <span className={dashboardPillClass('text-indigo-700 dark:text-indigo-200')}>
                          <FontAwesomeIcon icon={faWaveSquare} className="h-3.5 w-3.5" />
                          {visitsTrend === 'up' ? '+' : visitsTrend === 'down' ? '-' : ''}{Math.abs(visitsDelta).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="relative space-y-1">
                        <div className="text-xl font-semibold leading-none text-slate-900 dark:text-neutral-100">{visitsToday.toLocaleString('en-US')}</div>
                        <p className="text-[11px] text-slate-600 dark:text-neutral-300">Visits today • {visitsYesterday.toLocaleString('en-US')} yesterday</p>
                      </div>
                      <div className="relative mt-auto inline-flex items-center gap-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                        Open traffic analytics
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    <div className={dashboardPanelClass('relative flex h-full flex-col gap-3 overflow-hidden p-3')}>
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.22),_transparent_60%)]" />
                      <div className="relative flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xxs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Revenue quality</p>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Transactions</h3>
                        </div>
                        <span className={dashboardPillClass('text-emerald-700 dark:text-emerald-200')}>
                          <FontAwesomeIcon icon={faGaugeHigh} className="h-3.5 w-3.5" />
                          $49.00
                        </span>
                      </div>
                      <dl className="relative grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <dt className="text-slate-500 dark:text-neutral-400">Refund rate</dt>
                          <dd className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-neutral-100">4.8%</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500 dark:text-neutral-400">Net revenue</dt>
                          <dd className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-neutral-100">$14,280</dd>
                        </div>
                      </dl>
                      <div className="relative mt-auto inline-flex items-center gap-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                        Open transactions
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    <div className={dashboardPanelClass('relative flex h-full flex-col gap-3 overflow-hidden p-3')}>
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_68%)] dark:bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.2),_transparent_60%)]" />
                      <div className="relative flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xxs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Support load</p>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Queue status</h3>
                        </div>
                        <span className={dashboardPillClass('text-amber-700 dark:text-amber-200')}>
                          <FontAwesomeIcon icon={faLifeRing} className="h-3.5 w-3.5" />
                          {(openTickets + inProgressTickets).toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="relative grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
                          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Open</p>
                          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-100">{openTickets.toLocaleString('en-US')}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
                          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">In progress</p>
                          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-neutral-100">{inProgressTickets.toLocaleString('en-US')}</p>
                        </div>
                      </div>
                      <div className="relative mt-auto inline-flex items-center gap-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                        Open support desk
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className={dashboardPanelClass('space-y-3 overflow-hidden p-4') + ' relative'}>
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_65%)] opacity-70 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_60%)]" />
                      <div className="relative flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Recent transactions</h3>
                          <p className="text-xs text-slate-500 dark:text-neutral-400">Latest five payments across the platform.</p>
                        </div>
                        <span className={dashboardPillClass('text-slate-700 dark:text-neutral-200')}>5 new</span>
                      </div>

                      <div className="relative space-y-2">
                        {FAKE_TRANSACTIONS.slice(0, 5).map((tx) => (
                          <div
                            key={tx.id}
                            className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs dark:border-neutral-800/70 dark:bg-neutral-900/70"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900 dark:text-neutral-100">{tx.user}</p>
                                <p className="text-[11px] text-slate-500 dark:text-neutral-400">{tx.plan}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono text-[12px] text-slate-900 dark:text-neutral-100">{tx.amount}</p>
                                <p className="text-[11px] text-slate-500 dark:text-neutral-400">{tx.time}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={dashboardPanelClass('space-y-3 p-4')}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-neutral-100">Quick actions</h3>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 dark:border-neutral-800/70 dark:bg-neutral-900/70">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
                          <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5" />
                          Recommended next step
                        </div>
                        <p className="mt-1.5 text-xs text-slate-700 dark:text-neutral-300">
                          Resolve support backlog ({openTickets.toLocaleString('en-US')} open) to keep response times healthy.
                        </p>
                      </div>

                      <div className="space-y-2">
                        {[
                          { title: 'Manage users', description: 'View accounts, roles, and status.', icon: faUsers },
                          { title: 'Review transactions', description: 'Audit payments, refunds, and disputes.', icon: faFileLines },
                          { title: 'View analytics', description: 'Traffic, revenue, and conversion snapshots.', icon: faChartLine },
                        ].map((action) => (
                          <div
                            key={action.title}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs dark:border-neutral-800/70 dark:bg-neutral-900/70"
                          >
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                                <FontAwesomeIcon icon={action.icon} className="h-3.5 w-3.5" />
                              </span>
                              <span className="block">
                                <span className="font-medium text-slate-900 dark:text-neutral-100">{action.title}</span>
                                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-neutral-400">
                                  {action.description}
                                </span>
                              </span>
                            </span>
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Animated counter ─── */
function Counter({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = Date.now();
      const dur = 1400;
      const tick = () => {
        const p = Math.min((Date.now() - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        setVal(Math.floor(ease * target));
        if (p < 1) requestAnimationFrame(tick);
      };
      tick();
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, delay }: { icon: IconDefinition; title: string; desc: string; delay: number }) {
  return (
    <div className="lp-feature-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="lp-feature-icon">
        <FontAwesomeIcon icon={icon} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="lp-feature-title">{title}</div>
        <div className="lp-feature-desc">{desc}</div>
      </div>
    </div>
  );
}

/* ─── Main landing component ─── */
export default function LandingClient({ isSignedIn }: { isSignedIn: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <style>{`
        html, body { overflow-x: hidden; }

        /* ── CSS vars: dark default ───────────────────────── */
        .lp-root {
          --lp-text1:        #f1f1f7;
          --lp-text2:        rgba(255,255,255,.45);
          --lp-text3:        rgba(255,255,255,.35);
          --lp-text4:        rgba(255,255,255,.38);
          --lp-border:       rgba(255,255,255,.06);
          --lp-border2:      rgba(255,255,255,.09);
          --lp-card-bg:      rgba(255,255,255,.03);
          --lp-card-hover:   rgba(99,102,241,.07);
          --lp-card-bdr-h:   rgba(99,102,241,.4);
          --lp-metric-num:   #e0e7ff;
          --lp-chip-border:  rgba(255,255,255,.1);
          --lp-chip-bg:      rgba(255,255,255,.04);
          --lp-chip-text:    rgba(255,255,255,.65);
          --lp-pill-border:  rgba(255,255,255,.1);
          --lp-pill-text:    rgba(255,255,255,.42);
          --lp-pill-bg:      rgba(255,255,255,.03);
          --lp-step-bg:      rgba(255,255,255,.03);
          --lp-step-border:  rgba(255,255,255,.07);
          --lp-step-title:   #e0e7ff;
          --lp-step-desc:    rgba(255,255,255,.38);
          --lp-badge-color:  #a5b4fc;
          --lp-badge-bg:     rgba(99,102,241,.08);
          --lp-badge-border: rgba(99,102,241,.4);
          --lp-code-bg:      #0d0d17;
          --lp-code-border:  rgba(255,255,255,.08);
          --lp-code-text:    rgba(255,255,255,.5);
          --lp-code-comment: rgba(255,255,255,.25);
          --lp-demo-hint:    rgba(255,255,255,.2);
          --lp-cta-bg:       linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08),rgba(6,182,212,.06));
          --lp-cta-border:   rgba(99,102,241,.2);
          --lp-cta-desc:     rgba(255,255,255,.4);
          --lp-divider:      rgba(255,255,255,.07);
          --lp-section-tag:  #6366f1;
          --lp-blob-op:      1;
          /* Dashboard demo — theme-aware */
          --lp-dd-outer-bg:           rgb(var(--bg-primary));
          --lp-dd-chrome-bg:          rgb(var(--bg-secondary));
          --lp-dd-sidebar-bg:         rgb(var(--bg-primary));
          --lp-dd-sidebar-border:     rgb(var(--border-primary) / 0.5);
          --lp-dd-border:             rgb(var(--border-primary) / 0.4);
          --lp-dd-border2:            rgb(var(--border-primary) / 0.5);
          --lp-dd-border-main:        rgb(var(--accent-primary) / 0.4);
          --lp-dd-url-bg:             rgb(var(--bg-tertiary));
          --lp-dd-url-text:           rgb(var(--text-tertiary));
          --lp-dd-brand:              rgb(var(--accent-primary));
          --lp-dd-muted:              rgb(var(--text-tertiary));
          --lp-dd-user-text:          rgb(var(--text-tertiary));
          --lp-dd-nav-text:           rgb(var(--text-tertiary));
          --lp-dd-nav-active-text:    rgb(var(--text-primary));
          --lp-dd-stat-bg:            rgb(var(--bg-secondary) / 0.5);
          --lp-dd-stat-label:         rgb(var(--text-tertiary));
          --lp-dd-stat-num:           rgb(var(--text-primary));
          --lp-dd-stat-sub:           #6ee7b7;
          --lp-dd-table-bg:           rgb(var(--bg-secondary) / 0.35);
          --lp-dd-hdr-border:         rgb(var(--border-primary) / 0.4);
          --lp-dd-col-hdr:            rgb(var(--text-tertiary));
          --lp-dd-title-text:         rgb(var(--text-primary));
          --lp-dd-row-text:           rgb(var(--text-primary) / 0.85);
          --lp-dd-row-text2:          rgb(var(--text-secondary));
          --lp-dd-row-text3:          rgb(var(--text-tertiary));
          --lp-dd-row-border:         rgb(var(--border-primary) / 0.3);
          --lp-dd-amount:             #a5f3fc;
          --lp-dd-live-bg:            rgb(var(--accent-primary) / 0.09);
          --lp-dd-live-border:        rgb(var(--accent-primary) / 0.22);
          --lp-dd-banner-bg:          linear-gradient(315deg, rgba(80,40,160,0.65) 0%, rgba(60,30,120,0.45) 55%, rgba(18,12,50,0.4) 100%);
          --lp-dd-banner-border:      rgba(139,92,246,0.35);
          --lp-dd-banner-bg-users:    linear-gradient(315deg, rgba(16,185,129,0.78) 0%, rgba(6,182,212,0.32) 55%, rgba(6,20,30,0.32) 100%);
          --lp-dd-banner-border-users:rgba(16,185,129,0.28);
          --lp-dd-banner-title:       #ffffff;
          --lp-dd-banner-chip-border: rgba(255,255,255,.18);
          --lp-dd-banner-chip-label:  rgba(255,255,255,.55);
          --lp-dd-banner-chip-num:    #ffffff;
          --lp-dd-banner-free-num:    #c4b5fd;
          --lp-dd-banner-chip-sub:    rgba(255,255,255,.4);
        }
        /* ── CSS vars: light mode ─────────────────────────── */
        .light .lp-root {
          --lp-text1:        #111827;
          --lp-text2:        rgba(0,0,0,.52);
          --lp-text3:        rgba(0,0,0,.4);
          --lp-text4:        rgba(0,0,0,.45);
          --lp-border:       rgba(0,0,0,.07);
          --lp-border2:      rgba(0,0,0,.1);
          --lp-card-bg:      rgba(0,0,0,.02);
          --lp-card-hover:   rgba(99,102,241,.05);
          --lp-card-bdr-h:   rgba(99,102,241,.35);
          --lp-metric-num:   #1e1b4b;
          --lp-chip-border:  rgba(0,0,0,.12);
          --lp-chip-bg:      rgba(0,0,0,.03);
          --lp-chip-text:    rgba(0,0,0,.62);
          --lp-pill-border:  rgba(0,0,0,.1);
          --lp-pill-text:    rgba(0,0,0,.45);
          --lp-pill-bg:      rgba(0,0,0,.03);
          --lp-step-bg:      rgba(0,0,0,.02);
          --lp-step-border:  rgba(0,0,0,.08);
          --lp-step-title:   #111827;
          --lp-step-desc:    rgba(0,0,0,.45);
          --lp-badge-color:  #4338ca;
          --lp-badge-bg:     rgba(99,102,241,.07);
          --lp-badge-border: rgba(99,102,241,.3);
          --lp-code-bg:      #f5f4ff;
          --lp-code-border:  rgba(0,0,0,.1);
          --lp-code-text:    rgba(0,0,0,.55);
          --lp-code-comment: rgba(0,0,0,.3);
          --lp-demo-hint:    rgba(0,0,0,.35);
          --lp-cta-bg:       linear-gradient(135deg,rgba(99,102,241,.07),rgba(139,92,246,.04),rgba(6,182,212,.03));
          --lp-cta-border:   rgba(99,102,241,.18);
          --lp-cta-desc:     rgba(0,0,0,.45);
          --lp-divider:      rgba(0,0,0,.07);
          --lp-section-tag:  #4f46e5;
          --lp-blob-op:      0.5;
          /* Dashboard demo — light overrides (decorative only) */
          --lp-dd-stat-sub:           #059669;
          --lp-dd-amount:             #0e7490;
          --lp-dd-banner-bg:          linear-gradient(315deg, rgba(180,170,250,0.45) 0%, rgba(200,190,255,0.3) 55%, rgba(240,238,255,0.35) 100%);
          --lp-dd-banner-border:      rgba(99,102,241,0.22);
          --lp-dd-banner-bg-users:    linear-gradient(315deg, rgba(198,252,233,0.6) 0%, rgba(220,253,240,0.35) 55%, rgba(255,255,255,0.35) 100%);
          --lp-dd-banner-border-users:rgba(16,185,129,0.15);
          --lp-dd-banner-title:       #1e1b4b;
          --lp-dd-banner-chip-border: rgba(99,102,241,.2);
          --lp-dd-banner-chip-label:  rgba(0,0,0,.5);
          --lp-dd-banner-chip-num:    #1e1b4b;
          --lp-dd-banner-free-num:    #4338ca;
          --lp-dd-banner-chip-sub:    rgba(0,0,0,.4);
        }

        /* Keyframes */
        @keyframes lpFadeUp   { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:none; } }
        @keyframes lpSlideIn  { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        @keyframes lpPulse    { 0%,100%{ opacity:1; } 50%{ opacity:0.3; } }
        @keyframes lpGlow     { 0%,100%{ opacity:.35; transform:scale(1); } 50%{ opacity:.55; transform:scale(1.06); } }
        @keyframes lpGlow2    { 0%,100%{ opacity:.2;  transform:scale(1); } 50%{ opacity:.38; transform:scale(1.08); } }
        @keyframes lpBadge    { from{ opacity:0; transform:translateY(-4px) scale(.95); } to{ opacity:1; transform:none; } }
        @keyframes lpMarquee  { from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
        @keyframes lpBlink    { 0%,100%{ opacity:1; } 50%{ opacity:0; } }

        /* Blobs */
        .lp-blob1 { position:absolute; width:540px; height:540px; border-radius:50%;
          background:radial-gradient(circle, rgba(99,102,241,.28) 0%, transparent 70%);
          top:-120px; left:-120px; pointer-events:none; animation:lpGlow 8s ease-in-out infinite;
          opacity:var(--lp-blob-op,1); }
        .lp-blob2 { position:absolute; width:440px; height:440px; border-radius:50%;
          background:radial-gradient(circle, rgba(139,92,246,.22) 0%, transparent 70%);
          top:40px; right:-80px; pointer-events:none; animation:lpGlow2 10s ease-in-out infinite;
          opacity:var(--lp-blob-op,1); }

        /* Hero */
        .lp-hero-badge {
          display:inline-flex; align-items:center; gap:6px;
          border:1px solid var(--lp-badge-border); background:var(--lp-badge-bg);
          color:var(--lp-badge-color); font-size:12px; font-weight:600; letter-spacing:.4px;
          padding:5px 14px; border-radius:100px; margin-bottom:24px;
          animation:lpBadge .6s ease both;
        }
        .lp-hero-h1 {
          font-size:clamp(2.6rem,6vw,4.2rem); font-weight:800; line-height:1.1;
          letter-spacing:-1.5px; color:var(--lp-text1);
          animation:lpFadeUp .7s .1s ease both;
        }
        .lp-hero-sub {
          font-size:clamp(1rem,2vw,1.0rem); color:var(--lp-text2);
          max-width:540px; margin:20px auto 0; line-height:1.7;
          animation:lpFadeUp .7s .2s ease both;
        }
        .lp-cta-row {
          display:flex; gap:12px; justify-content:center; flex-wrap:wrap;
          margin-top:32px; animation:lpFadeUp .7s .3s ease both;
        }
        .lp-btn-primary {
          padding:13px 28px; border-radius:10px; font-weight:700; font-size:14px;
          background:linear-gradient(135deg,#6366f1,#8b5cf6);
          color:#fff !important; border:none; cursor:pointer; text-decoration:none;
          box-shadow:0 4px 20px rgba(99,102,241,.35);
          transition:transform .15s, box-shadow .15s;
        }
        .lp-btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 28px rgba(99,102,241,.5); color:#fff !important; }
        .lp-btn-ghost {
          padding:13px 28px; border-radius:10px; font-weight:600; font-size:14px;
          background:var(--lp-chip-bg); color:var(--lp-chip-text);
          border:1px solid var(--lp-chip-border); cursor:pointer; text-decoration:none;
          transition:background .15s, border-color .15s;
        }
        .lp-btn-ghost:hover { background:var(--lp-card-hover); border-color:var(--lp-card-bdr-h); color:var(--lp-text1); }

        /* Demo */
        .lp-demo-wrap { animation:lpFadeUp .8s .5s ease both; }
        .lp-demo-hint { color:var(--lp-demo-hint); font-size:11px; text-align:center; margin-top:10px; }

        /* Metrics */
        .lp-metrics {
          display:flex; gap:0; overflow:hidden;
          border-top:1px solid var(--lp-divider); border-bottom:1px solid var(--lp-divider);
          margin:64px 0;
        }
        .lp-metric-item { flex:1; text-align:center; padding:28px 12px; border-right:1px solid var(--lp-divider); }
        .lp-metric-item:last-child { border-right:none; }
        .lp-metric-num { font-size:clamp(1.8rem,3.5vw,2.4rem); font-weight:800; letter-spacing:-1px; color:var(--lp-metric-num); }
        .lp-metric-label { font-size:12px; color:var(--lp-text3); margin-top:4px; font-weight:500; }

        /* Section headers */
        .lp-section-tag { display:inline-block; font-size:11px; font-weight:700; letter-spacing:2px;
          text-transform:uppercase; color:var(--lp-section-tag); margin-bottom:12px; }
        .lp-section-h2 { font-size:clamp(1.6rem,3.5vw,2.4rem); font-weight:800; letter-spacing:-.8px;
          color:var(--lp-text1); margin-bottom:12px; }
        .lp-section-sub { font-size:15px; color:var(--lp-text3); max-width:650px; margin:0 auto; line-height:1.7; }

        /* Feature cards */
        .lp-feature-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; margin-top:40px; }
        .lp-feature-card {
          display:flex; align-items:flex-start; gap:14px;
          background:var(--lp-card-bg); border:1px solid var(--lp-border2);
          border-radius:14px; padding:18px; text-align:left;
          transition:border-color .2s, background .2s, transform .2s;
          animation:lpFadeUp .7s ease both;
        }
        .lp-feature-card:hover { border-color:var(--lp-card-bdr-h); background:var(--lp-card-hover); transform:translateY(-2px); }
        .lp-feature-icon {
          width:44px; height:44px; border-radius:10px; margin:0;
          background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));
          border:1px solid rgba(99,102,241,.16);
          display:flex; align-items:center; justify-content:center;
          color:#818cf8; font-size:16px; flex-shrink:0;
        }
        .lp-feature-title { font-size:13.5px; font-weight:700; color:var(--lp-text1); margin-bottom:6px; }
        .lp-feature-desc  { font-size:12px; color:var(--lp-text4); line-height:1.65; }

        /* Provider chips */
        .lp-provider-row { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; margin-top:28px; }
        .lp-provider-chip {
          display:flex; align-items:center; gap:8px;
          border:1px solid var(--lp-chip-border); background:var(--lp-chip-bg);
          border-radius:10px; padding:10px 18px; font-size:13px; font-weight:600;
          color:var(--lp-chip-text); transition:all .2s;
        }
        .lp-provider-chip:hover { border-color:var(--lp-card-bdr-h); color:var(--lp-text1); background:var(--lp-card-hover); }
        .lp-provider-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        .lp-provider-logo { width:20px; height:20px; display:inline-block; flex-shrink:0; }
        .lp-provider-logo svg { width:20px; height:20px; display:block; }

        /* Code block */
        .lp-code-block {
          background:var(--lp-code-bg); border:1px solid var(--lp-code-border); border-radius:12px;
          padding:20px 24px; font-family:'Fira Code','Cascadia Code',monospace; font-size:12.5px;
          line-height:2; color:var(--lp-code-text); text-align:left; overflow:auto;
          max-width:520px; margin:28px auto 0;
        }
        .lp-code-comment { color:var(--lp-code-comment); }
        .lp-code-key     { color:#818cf8; }
        .lp-code-string  { color:#34d399; }
        .lp-cursor       { display:inline-block; animation:lpBlink 1s step-end infinite; color:#6366f1; }

        /* Step cards (How it works) */
        .lp-step-card { background:var(--lp-step-bg); border:1px solid var(--lp-step-border); border-radius:14px; padding:28px 22px; text-align:left; }
        .lp-step-num   { font-size:11px; font-weight:800; color:#6366f1; letter-spacing:2px; margin-bottom:10px; }
        .lp-step-title { font-size:15px; font-weight:700; color:var(--lp-step-title); margin-bottom:8px; }
        .lp-step-desc  { font-size:13px; color:var(--lp-step-desc); line-height:1.65; }

        /* CTA */
        .lp-cta-section {
          margin:80px 0 20px;
          background:var(--lp-cta-bg);
          border:1px solid var(--lp-cta-border); border-radius:20px; padding:60px 40px;
          text-align:center; position:relative; overflow:hidden;
        }
        .lp-cta-section::before {
          content:''; position:absolute; inset:0;
          background:radial-gradient(ellipse at 50% 0%, rgba(99,102,241,.15) 0%, transparent 65%);
          pointer-events:none;
        }
        .lp-cta-desc { font-size:15px; color:var(--lp-cta-desc); margin-bottom:32px; line-height:1.7; }

        /* Marquee */
        .lp-marquee-outer { overflow:hidden; mask-image:linear-gradient(to right,transparent,black 10%,black 90%,transparent); -webkit-mask-image:linear-gradient(to right,transparent,black 10%,black 90%,transparent); }
        .lp-marquee-inner { display:flex; gap:12px; width:max-content; animation:lpMarquee 28s linear infinite; }
        .lp-tech-pill {
          padding:6px 14px; border-radius:100px; font-size:11px; font-weight:600;
          border:1px solid var(--lp-pill-border); color:var(--lp-pill-text);
          background:var(--lp-pill-bg); white-space:nowrap;
        }

        /* Code block: always dark regardless of theme */
        .light .lp-root .lp-code-block {
          --lp-code-bg:      #0d0d17;
          --lp-code-border:  rgba(255,255,255,.08);
          --lp-code-text:    rgba(255,255,255,.5);
          --lp-code-comment: rgba(255,255,255,.25);
        }
        .light .lp-root .lp-code-block .lp-code-key    { color:#818cf8; }
        .light .lp-root .lp-code-block .lp-code-string  { color:#34d399; }
        .light .lp-root .lp-code-block .lp-cursor       { color:#818cf8; }

        /* Divider */
        .lp-divider { border:none; border-top:1px solid var(--lp-divider); margin:72px 0; }

        /* Responsive */
        @media(max-width:640px) {
          .lp-feature-grid { grid-template-columns:1fr 1fr; }
          .lp-feature-card { flex-direction:column; align-items:center; text-align:center; }
          .lp-feature-icon { margin:0 0 10px 0; }
          .lp-metrics { flex-wrap:wrap; }
          .lp-metric-item { flex:0 0 50%; border-bottom:1px solid var(--lp-divider); }
          .lp-cta-section { padding:40px 20px; }
        }

        /* ── Demo: mobile responsive ── */
        .lp-dd-mobile-hdr { display:none; }
        .lp-dd-tbl-mobile { display:none; }
        .lp-tx-row { animation: lpFadeUp 0.3s ease both; }
        .lp-dd-content { overflow:hidden; scrollbar-width:none; -ms-overflow-style:none; overscroll-behavior:auto; touch-action:auto; }
        .lp-dd-content::-webkit-scrollbar { display:none; }

        @media(max-width:768px) {
          /* Hide sidebar, show mobile header bar */
          .lp-dd-sidebar { display:none !important; }
          .lp-dd-mobile-hdr {
            display:flex !important;
            align-items:center;
            gap:10px;
            padding:8px 14px;
            border-bottom:1px solid var(--lp-dd-border);
            background:var(--lp-dd-sidebar-bg);
            flex-shrink:0;
          }

          /* Shell: column layout, auto height */
          .lp-dd-shell {
            flex-direction:column !important;
            height:auto !important;
            max-height:540px;
            overflow:hidden;
          }

          /* Disable 3D tilt on touch */
          .lp-dd-tilt {
            transform:none !important;
            transition:none !important;
          }

          /* Stat grids → 2 columns */
          .lp-dd-stat-grid {
            grid-template-columns:repeat(2,1fr) !important;
          }

          /* Banner: stack title and chips vertically */
          .lp-dd-banner-flex {
            flex-direction:column !important;
            align-items:flex-start !important;
            gap:8px !important;
          }

          /* Toggle desktop table ↔ mobile cards */
          .lp-dd-tbl-desktop { display:none !important; }
          .lp-dd-tbl-mobile  { display:block !important; }
        }
      `}</style>

      <div className="lp-root" style={{ maxWidth: 1140, margin: '0 auto', padding: '0 20px' }}>

        {/* ── HERO ─────────────────────────────────────────── */}
        <section style={{ textAlign: 'center', paddingTop: 60, paddingBottom: 0, position: 'relative' }}>
          <div className="lp-blob1" />
          <div className="lp-blob2" />

          <div className="lp-hero-badge">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6ee7b7', display: 'inline-block', boxShadow: '0 0 6px #6ee7b7' }} />
            The complete SaaS starter kit
          </div>

          <h1 className="lp-hero-h1">
            Don&apos;t re-invent the wheel,<br />
            <span
              style={{
                backgroundImage: 'linear-gradient(92deg, rgb(161 29 179) 0%, rgb(251, 113, 133) 18%, rgb(2 167 250) 38%, rgb(16 155 195) 52%, rgb(167 8 230) 68%, rgb(180 153 14) 82%, rgb(139, 92, 246) 100%)',
                backgroundSize: '140% 140%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 10px 30px rgba(139,92,246,0.12)',
              }}
            >
              launch your SaaS this weekend.
            </span>
          </h1>

          <p className="lp-hero-sub">
            SaasyBase is a production-ready Next.js boilerplate — auth, multi-provider payments, subscriptions, teams, admin, and more. Everything you need to go from zero to revenue.
          </p>

          <div className="lp-cta-row">
            {isSignedIn ? (
              <>
                <Link href="/dashboard" className="lp-btn-primary">Go to Dashboard →</Link>
                <Link href="/pricing"   className="lp-btn-ghost">View Pricing</Link>
              </>
            ) : (
              <>
                <Link href="/sign-up"  className="lp-btn-primary">Start Building Free →</Link>
                <Link href="/sign-in"  className="lp-btn-ghost">Sign In</Link>
                <Link href="/pricing"  className="lp-btn-ghost">Pricing</Link>
              </>
            )}
          </div>

          {/* scrolling tech pills */}
          <div style={{ marginTop: 36, marginBottom: 48 }}>
            <div className="lp-marquee-outer">
              <div className="lp-marquee-inner">
                {(['Next.js 16','TypeScript','Prisma','Tailwind CSS','Clerk Auth','Stripe','Razorpay','Paystack','Paddle','Nodemailer','Vitest','Multi-tenant','Webhooks','Token Credits','Coupons','Admin Panel','Zod','Dark Mode']).concat(['Next.js 16','TypeScript','Prisma','Tailwind CSS','Clerk Auth','Stripe','Razorpay','Paystack','Paddle','Nodemailer','Vitest']).map((t, i) => (
                  <span key={i} className="lp-tech-pill">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── DASHBOARD DEMO ──────────────────────────────── */}
        {mounted && (
          <section style={{ position: 'relative', marginBottom: 8 }}>
            <div className="lp-demo-wrap">
              <DashboardDemo />
            </div>
            <p className="lp-demo-hint">↑ Animated product preview — finance, users, and operations in one flow</p>
          </section>
        )}

        {/* ── METRICS ─────────────────────────────────────── */}
        <div className="lp-metrics">
          {[
            { num: 47, label: 'built-in API routes',   suffix: '+' },
            { num: 4,  label: 'payment providers',      suffix: '' },
            { num: 100, label: 'TypeScript files',      suffix: '+' },
            { num: 0,  label: 'config headaches',       suffix: '' },
          ].map((m, i) => (
            <div key={i} className="lp-metric-item">
              <div className="lp-metric-num">
                {mounted ? <Counter target={m.num} suffix={m.suffix} /> : `${m.num}${m.suffix}`}
              </div>
              <div className="lp-metric-label">{m.label}</div>
            </div>
          ))}
        </div>

        {/* ── FEATURES ─────────────────────────────────────── */}
        <section style={{ textAlign: 'center', marginBottom: 0 }}>
          <div className="lp-section-tag">What&apos;s included</div>
          <h2 className="lp-section-h2">Everything. Wired up. Ready to go.</h2>
          <p className="lp-section-sub">
            Don&apos;t waste weeks piecing together auth, payments, and billing. It&apos;s all here and it all works together.
          </p>
          <div className="lp-feature-grid">
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} {...f} delay={i * 60} />
            ))}
          </div>
        </section>

        <hr className="lp-divider" />

        {/* ── PROVIDERS ─────────────────────────────────────── */}
        <section style={{ textAlign: 'center' }}>
          <div className="lp-section-tag">Payment Providers</div>
          <h2 className="lp-section-h2">Four providers. One codebase.</h2>
          <p className="lp-section-sub">
            Switch between payment providers with a single environment variable. No re-wiring.
          </p>
          <div className="lp-provider-row">
            {PROVIDERS.map(p => {
              const cfg = PAYMENT_PROVIDERS[p.name.toLowerCase()];
              return (
                <div key={p.name} className="lp-provider-chip">
                  {cfg?.logoSvg ? (
                    <span
                      className="lp-provider-logo"
                      aria-hidden
                      style={{ color: p.color }}
                      dangerouslySetInnerHTML={{ __html: cfg.logoSvg }}
                    />
                  ) : (
                    <span className="lp-provider-dot" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}` }} />
                  )}
                  {p.name}
                </div>
              );
            })}
          </div>

          <div className="lp-code-block">
            <div><span className="lp-code-comment"># .env — just change this one line</span></div>
            <div>
              <span className="lp-code-key">PAYMENT_PROVIDER</span>
              <span className="lp-code-comment"> = </span>
              {mounted ? <TypewriterProvider /> : <span className="lp-code-string">&quot;stripe&quot;</span>}
            </div>
            <div><span className="lp-code-comment"># stripe | razorpay | paystack | paddle</span></div>
          </div>
        </section>

        <hr className="lp-divider" />

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <section style={{ textAlign: 'center' }}>
          <div className="lp-section-tag">Zero to production</div>
          <h2 className="lp-section-h2">Deploy in three steps.</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 36 }}>
            {[
              { step: '01', title: 'Clone & configure', desc: "Clone the repo, fill in your .env, run prisma migrate and you're live." },
              { step: '02', title: 'Customize & brand', desc: 'Swap colors, copy, logo. All config lives in one place — no hunting through files.' },
              { step: '03', title: 'Ship & collect', desc: 'Deploy to Vercel, connect your payment provider, and start collecting revenue from day one.' },
            ].map(s => (
              <div key={s.step} className="lp-step-card">
                <div className="lp-step-num">{s.step}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────── */}
        <div className="lp-cta-section">
          <div className="lp-section-tag">Ready to launch?</div>
          <h2 className="lp-section-h2" style={{ marginBottom: 12 }}>Your SaaS deserves a<br />solid foundation.</h2>
          <p className="lp-cta-desc">
            Stop rebuilding the same auth &amp; billing infrastructure.<br />
            Start with SaasyBase and ship what actually matters.
          </p>
          <div className="lp-cta-row" style={{ marginTop: 0 }}>
            {isSignedIn ? (
              <Link href="/dashboard" className="lp-btn-primary">Open my Dashboard →</Link>
            ) : (
              <>
                <Link href="/sign-up" className="lp-btn-primary">Get Started Free →</Link>
                <Link href="/pricing" className="lp-btn-ghost">See Pricing</Link>
              </>
            )}
          </div>
        </div>

        <div style={{ height: 48 }} />
      </div>
    </>
  );
}
