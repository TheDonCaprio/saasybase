'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCreditCard, faLock, faBuilding, faTag, faGauge, faEnvelope,
  faArrowsRotate, faShield, faNewspaper, faFileLines, faHeadset, faUserShield,
  faUsers, faLayerGroup, faChartLine, faCode, faDollarSign, faTicket,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { PAYMENT_PROVIDERS } from '../lib/payment/provider-config';

/* ─── Fake data for the animated dashboard demo ─── */
const FAKE_TRANSACTIONS = [
  { id: '1', plan: 'Pro Plan',      amount: '$49.00', status: 'SUCCEEDED', provider: 'Stripe',    user: 'alex@demo.com',    time: '2s ago'   },
  { id: '2', plan: 'Starter Plan',  amount: '$19.00', status: 'SUCCEEDED', provider: 'Paystack',  user: 'maya@demo.com',    time: '14s ago'  },
  { id: '3', plan: 'Business Plan', amount: '$129.00',status: 'SUCCEEDED', provider: 'Razorpay',  user: 'carlos@demo.com',  time: '1m ago'   },
  { id: '4', plan: 'Pro Plan',      amount: '$49.00', status: 'SUCCEEDED', provider: 'Paddle',    user: 'nina@demo.com',    time: '3m ago'   },
  { id: '5', plan: 'Starter Plan',  amount: '$19.00', status: 'REFUNDED',  provider: 'Stripe',    user: 'joe@demo.com',     time: '7m ago'   },
  { id: '6', plan: 'Business Plan', amount: '$129.00',status: 'SUCCEEDED', provider: 'Stripe',    user: 'priya@demo.com',   time: '11m ago'  },
  { id: '7', plan: 'Pro Plan',      amount: '$49.00', status: 'SUCCEEDED', provider: 'Razorpay',  user: 'sam@demo.com',     time: '18m ago'  },
];

const FAKE_USERS = [
  { email: 'caprio+1@demo.com', name: 'Tim Adekile',   role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 21, 2025', payments: 22, avatarBg: '#6366f1' },
  { email: 'caprio+2@demo.com', name: 'Sugaga Ade',    role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 19, 2025', payments: 8,  avatarBg: '#8b5cf6' },
  { email: 'caprio@demo.com',   name: 'AdeWale Ad',    role: 'ADMIN', plan: 'One Day Team', status: 'Active', joined: 'Dec 18, 2025', payments: 92, avatarBg: '#0ea5e9' },
  { email: 'lena@demo.com',     name: 'Lena Fischer',  role: 'USER',  plan: 'None',     status: 'Active', joined: 'Dec 5, 2025',  payments: 4,  avatarBg: '#10b981' },
];

const USER_STATS = [
  { label: 'TOTAL USERS',        value: '3', sub: '+0 in 7 days',           faIcon: faUsers,       iconBg: 'rgba(59,130,246,0.18)',  iconColor: '#3b82f6' },
  { label: 'NEW USERS TODAY',    value: '0', sub: '0 this month',             faIcon: faArrowsRotate,iconBg: 'rgba(16,185,129,0.18)', iconColor: '#10b981' },
  { label: 'TEAM ADMINS',        value: '1', sub: 'Users with admin role',    faIcon: faUsers,       iconBg: 'rgba(139,92,246,0.18)', iconColor: '#8b5cf6' },
  { label: 'RENEWALS IN 14 DAYS',value: '1', sub: 'Upcoming expirations',     faIcon: faTicket,      iconBg: 'rgba(251,191,36,0.18)', iconColor: '#d97706' },
];

const FINANCE_SUBMENU = [
  { label: 'Transactions',   view: 'finance' as DemoView | null, badge: 122, icon: faFileLines },
  { label: 'One-Time Sales', view: null,                          badge: null, icon: faDollarSign },
  { label: 'Subscriptions',  view: null,                          badge: 69,   icon: faArrowsRotate },
];


type DemoView = 'finance' | 'users' | 'overview';
const DEMO_VIEWS: DemoView[] = ['finance', 'users', 'overview'];
const DEMO_HOLD_MS = [5200, 4200, 4200];

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
        setProviderIdx(next);
        setPhase('typing');
      }
    } else {
      if (displayed.length < target.length) {
        t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 90);
      } else {
        setPhase('hold');
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

/* ─── Animated dashboard "browser window" ─── */
function DashboardDemo() {
  const [visible, setVisible] = useState<number[]>([]);
  const [liveRow, setLiveRow] = useState<typeof FAKE_TRANSACTIONS[0] | null>(null);
  const [blink, setBlink] = useState(false);
  const [demoView, setDemoView] = useState<DemoView>('finance');
  const [transitioning, setTransitioning] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const tiltRef = useRef<HTMLDivElement>(null);
  const viewIdxRef = useRef(0);

  // stagger initial rows
  useEffect(() => {
    FAKE_TRANSACTIONS.forEach((_, i) => {
      setTimeout(() => setVisible(v => [...v, i]), 300 + i * 180);
    });
  }, []);

  // live payment blink
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      const newRow = {
        id: String(Date.now()),
        plan: ['Pro Plan', 'Business Plan', 'Starter Plan'][Math.floor(Math.random() * 3)],
        amount: ['$49.00', '$129.00', '$19.00'][Math.floor(Math.random() * 3)],
        status: 'SUCCEEDED',
        provider: ['Stripe', 'Razorpay', 'Paystack', 'Paddle'][Math.floor(Math.random() * 4)],
        user: ['wei@demo.com', 'lena@demo.com', 'omar@demo.com', 'grace@demo.com'][Math.floor(Math.random() * 4)],
        time: 'just now',
      };
      setLiveRow(newRow);
      setTimeout(() => setBlink(false), 600);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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

  // 3D tilt
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = tiltRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    setTilt({ x: dy * -3, y: dx * 3 });
  };
  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  const urlMap: Record<DemoView, string> = {
    finance:  'app.saasybase.com/admin/transactions',
    users:    'app.saasybase.com/admin/users',
    overview: 'app.saasybase.com/admin',
  };

  return (
    <div
      ref={tiltRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', maxWidth: 920, margin: '0 auto' }}
    >
      {/* outward ambient glow */}
      <div style={{
        position: 'absolute', inset: 40, borderRadius: 18, zIndex: 0,
        boxShadow: '0 0 70px 18px rgba(99,102,241,0.42), 0 0 130px 35px rgba(139,92,246,0.2), 0 0 240px 75px rgba(6,182,212,0.1)',
        pointerEvents: 'none',
      }} />

      {/* 3D tilt wrapper */}
      <div style={{
        position: 'relative', zIndex: 1,
        transform: `perspective(450px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${tilt.x === 0 && tilt.y === 0 ? 1 : 1.01})`,
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
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: blink ? '#10b981' : 'rgba(128,128,128,0.3)', transition: 'background 0.2s', marginLeft: 'auto', boxShadow: blink ? '0 0 8px #10b981' : 'none' }} />
          </div>

          {/* app shell */}
          <div style={{ display: 'flex', height: 386 }}>
            {/* sidebar */}
            <nav style={{ width: 194, background: 'var(--lp-dd-sidebar-bg)', borderRight: '1px solid var(--lp-dd-sidebar-border)', padding: '12px 0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
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
                { label: 'Users',         view: 'users' as DemoView | null,    badge: 3,  icon: faUsers },
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
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                {/* Gradient page banner */}
                <div style={{ margin: '12px 14px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--lp-dd-banner-border-users)', flexShrink: 0 }}>
                <div style={{ background: 'var(--lp-dd-banner-bg-users)', padding: '12px 14px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
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
                {/* 4 stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px 8px', flexShrink: 0 }}>
                  {STATS.map(stat => (
                    <div key={stat.label} style={{ background: `linear-gradient(145deg, ${stat.gradColor}1e 0%, transparent 60%), var(--lp-dd-stat-bg)`, border: '1px solid var(--lp-dd-border2)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 9, color: 'var(--lp-dd-col-hdr)', marginBottom: 3, fontWeight: 600, letterSpacing: 0.3 }}>{stat.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-dd-stat-num)', letterSpacing: '-0.5px' }}>{stat.value}</div>
                      <div style={{ fontSize: 8, color: 'var(--lp-dd-stat-sub)', marginTop: 2 }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>
                {/* Transactions table */}
                <div style={{ padding: '0 14px 10px' }}>
                  <div style={{ background: 'var(--lp-dd-table-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--lp-dd-hdr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--lp-dd-title-text)' }}>Recent Transactions</span>
                      {blink && <span style={{ fontSize: 9, color: '#10b981', animation: 'lpPulse 0.5s ease' }}>● New payment</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '5px 12px', gap: 8 }}>
                      {['User', 'Plan', 'Amount', 'Provider', 'Status'].map(h => (
                        <div key={h} style={{ fontSize: 9, color: 'var(--lp-dd-col-hdr)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                      ))}
                    </div>
                    {liveRow && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '6px 12px', gap: 8, alignItems: 'center', background: 'var(--lp-dd-live-bg)', borderTop: '1px solid var(--lp-dd-live-border)', animation: 'lpSlideIn 0.3s ease' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-title-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{liveRow.user}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text2)' }}>{liveRow.plan.replace(' Plan','')}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--lp-dd-amount)' }}>{liveRow.amount}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text3)' }}>{liveRow.provider}</div>
                        <StatusBadge status={liveRow.status} />
                      </div>
                    )}
                    {FAKE_TRANSACTIONS.slice(0, 4).map((tx, i) => (
                      <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '6px 12px', gap: 8, alignItems: 'center', borderTop: '1px solid var(--lp-dd-row-border)', opacity: visible.includes(i) ? 1 : 0, transform: visible.includes(i) ? 'none' : 'translateY(6px)', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.user}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text2)' }}>{tx.plan.replace(' Plan','')}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--lp-dd-amount)' }}>{tx.amount}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--lp-dd-row-text3)' }}>{tx.provider}</div>
                        <StatusBadge status={tx.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Users view ── */}
            {demoView === 'users' && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                {/* Gradient page banner */}
                <div style={{ margin: '12px 14px 0', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--lp-dd-banner-border)', flexShrink: 0 }}>
                <div style={{ background: 'var(--lp-dd-banner-bg)', padding: '12px 14px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
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
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--lp-dd-banner-chip-num)', lineHeight: 1.2, marginTop: 1 }}>1</div>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-sub)' }}>1 renewal in 14 days</div>
                      </div>
                      <div style={{ border: '1px solid var(--lp-dd-banner-chip-border)', borderRadius: 8, padding: '5px 11px', minWidth: 80 }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-label)', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>Free Users</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--lp-dd-banner-free-num)', lineHeight: 1.2, marginTop: 1 }}>2</div>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-banner-chip-sub)' }}>0 new yesterday</div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                {/* 4 stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px 0', flexShrink: 0 }}>
                  {USER_STATS.map(s => (
                    <div key={s.label} style={{ background: `linear-gradient(145deg, ${s.iconColor}1e 0%, transparent 60%), var(--lp-dd-stat-bg)`, border: '1px solid var(--lp-dd-border2)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                        <div style={{ fontSize: 8, color: 'var(--lp-dd-col-hdr)', fontWeight: 600, letterSpacing: 0.3, lineHeight: 1.3, paddingRight: 4 }}>{s.label}</div>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FontAwesomeIcon icon={s.faIcon} style={{ width: 10, color: s.iconColor }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--lp-dd-stat-num)', letterSpacing: '-0.5px' }}>{s.value}</div>
                      <div style={{ fontSize: 8, color: 'var(--lp-dd-stat-sub)', marginTop: 2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
                {/* User table */}
                <div style={{ padding: '8px 14px 10px' }}>
                  <div style={{ background: 'var(--lp-dd-table-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 2fr 0.8fr 1.4fr 1fr', padding: '5px 12px', gap: 6, borderBottom: '1px solid var(--lp-dd-hdr-border)' }}>
                      {['NAME', 'EMAIL', 'ROLE', 'JOINED', 'PAYMENTS'].map(h => (
                        <div key={h} style={{ fontSize: 9, color: 'var(--lp-dd-col-hdr)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{h}</div>
                      ))}
                    </div>
                    {FAKE_USERS.map((u) => (
                      <div key={u.email} style={{ display: 'grid', gridTemplateColumns: '2.2fr 2fr 0.8fr 1.4fr 1fr', padding: '7px 12px', gap: 6, alignItems: 'center', borderTop: '1px solid var(--lp-dd-row-border)' }}>
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
                        {/* Payments */}
                        <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>{u.payments} payments</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Overview / Dashboard view ── */}
            {demoView === 'overview' && (
              <div style={{ flex: 1, padding: 20, overflow: 'hidden', opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(6px)' : 'none', transition: 'opacity 0.3s ease, transform 0.3s ease' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lp-dd-title-text)', marginBottom: 14 }}>Dashboard Overview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {STATS.map(stat => (
                    <div key={stat.label} style={{ background: 'var(--lp-dd-stat-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--lp-dd-stat-label)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FontAwesomeIcon icon={stat.faIcon} style={{ width: 12 }} />
                        {stat.label}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--lp-dd-stat-num)', letterSpacing: '-0.5px' }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--lp-dd-stat-sub)', marginTop: 3 }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--lp-dd-table-bg)', border: '1px solid var(--lp-dd-border2)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--lp-dd-title-text)', marginBottom: 8 }}>Recent Activity</div>
                  {[
                    { icon: '💳', text: 'New Pro subscription',  sub: 'alex@demo.com',  time: '2s ago'  },
                    { icon: '👤', text: 'User registered',        sub: 'wei@demo.com',   time: '14s ago' },
                    { icon: '🔄', text: 'Subscription renewed',   sub: 'maya@demo.com',  time: '1m ago'  },
                    { icon: '🎫', text: 'Support ticket opened',  sub: 'carlos@demo.com',time: '4m ago'  },
                  ].map(a => (
                    <div key={a.text} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--lp-dd-row-border)' }}>
                      <span style={{ fontSize: 13 }}>{a.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--lp-dd-row-text)', fontWeight: 500 }}>{a.text}</div>
                        <div style={{ fontSize: 10, color: 'var(--lp-dd-row-text3)' }}>{a.sub}</div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--lp-dd-row-text3)' }}>{a.time}</div>
                    </div>
                  ))}
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
  useEffect(() => { setMounted(true); }, []);

  return (
    <>
      <style>{`
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
          /* Dashboard demo — dark defaults */
          --lp-dd-outer-bg:           #0d0c16;
          --lp-dd-chrome-bg:          #14131f;
          --lp-dd-sidebar-bg:         #0c0c18;
          --lp-dd-sidebar-border:     rgba(255,255,255,.06);
          --lp-dd-border:             rgba(255,255,255,.07);
          --lp-dd-border2:            rgba(255,255,255,.08);
          --lp-dd-border-main:        rgba(99,102,241,.4);
          --lp-dd-url-bg:             #0e0d1c;
          --lp-dd-url-text:           rgba(255,255,255,.32);
          --lp-dd-brand:              #818cf8;
          --lp-dd-user-text:          rgba(255,255,255,.3);
          --lp-dd-nav-text:           rgba(255,255,255,.35);
          --lp-dd-nav-active-text:    #e0e7ff;
          --lp-dd-stat-bg:            rgba(255,255,255,.025);
          --lp-dd-stat-label:         rgba(255,255,255,.35);
          --lp-dd-stat-num:           #e0e7ff;
          --lp-dd-stat-sub:           #6ee7b7;
          --lp-dd-table-bg:           rgba(255,255,255,.02);
          --lp-dd-hdr-border:         rgba(255,255,255,.07);
          --lp-dd-col-hdr:            rgba(255,255,255,.3);
          --lp-dd-title-text:         #e0e7ff;
          --lp-dd-row-text:           rgba(255,255,255,.75);
          --lp-dd-row-text2:          rgba(255,255,255,.5);
          --lp-dd-row-text3:          rgba(255,255,255,.38);
          --lp-dd-row-border:         rgba(255,255,255,.05);
          --lp-dd-amount:             #a5f3fc;
          --lp-dd-live-bg:            rgba(99,102,241,.09);
          --lp-dd-live-border:        rgba(99,102,241,.22);
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
          /* Dashboard demo — light overrides */
          --lp-dd-outer-bg:           #ffffff;
          --lp-dd-chrome-bg:          #eaeaf4;
          --lp-dd-sidebar-bg:         #f4f4fb;
          --lp-dd-sidebar-border:     rgba(0,0,0,.08);
          --lp-dd-border:             rgba(0,0,0,.09);
          --lp-dd-border2:            rgba(0,0,0,.09);
          --lp-dd-border-main:        rgba(99,102,241,.28);
          --lp-dd-url-bg:             #e0e0ec;
          --lp-dd-url-text:           rgba(0,0,0,.4);
          --lp-dd-brand:              #5b52d5;
          --lp-dd-user-text:          rgba(0,0,0,.4);
          --lp-dd-nav-text:           rgba(0,0,0,.45);
          --lp-dd-nav-active-text:    #1e1b4b;
          --lp-dd-stat-bg:            #ffffff;
          --lp-dd-stat-label:         rgba(0,0,0,.48);
          --lp-dd-stat-num:           #1e1b4b;
          --lp-dd-stat-sub:           #059669;
          --lp-dd-table-bg:           #ffffff;
          --lp-dd-hdr-border:         rgba(0,0,0,.08);
          --lp-dd-col-hdr:            rgba(0,0,0,.4);
          --lp-dd-title-text:         #111827;
          --lp-dd-row-text:           #111827;
          --lp-dd-row-text2:          rgba(0,0,0,.6);
          --lp-dd-row-text3:          rgba(0,0,0,.45);
          --lp-dd-row-border:         rgba(0,0,0,.06);
          --lp-dd-amount:             #0e7490;
          --lp-dd-live-bg:            rgba(99,102,241,.05);
          --lp-dd-live-border:        rgba(99,102,241,.2);
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
          font-size:clamp(1rem,2vw,1.15rem); color:var(--lp-text2);
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
        .lp-section-sub { font-size:15px; color:var(--lp-text3); max-width:500px; margin:0 auto; line-height:1.7; }

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
          .lp-metrics { flex-wrap:wrap; }
          .lp-metric-item { flex:0 0 50%; border-bottom:1px solid var(--lp-divider); }
          .lp-cta-section { padding:40px 20px; }
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
            Don't re-invent the wheel,<br />
            <span style={{ background: 'linear-gradient(135deg,#6366f1,#a78bfa,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
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
            <p className="lp-demo-hint">↑ Live animated preview — transactions stream in real-time</p>
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
