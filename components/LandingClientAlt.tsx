'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReact, faNodeJs } from '@fortawesome/free-brands-svg-icons';
import {
  faCreditCard, faLock, faBuilding, faTag, faGauge, faEnvelope,
  faArrowsRotate, faShield, faNewspaper, faFileLines, faHeadset, faUserShield,
  faUsers, faChartLine, faDollarSign, faTicket, faBars,
  faWaveSquare, faGaugeHigh, faLifeRing, faArrowUpRightFromSquare, faBolt, faGear, faTriangleExclamation,
  faPen, faHourglassEnd, faHandHoldingDollar,
  faPalette, faReceipt, faEye,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { PAYMENT_PROVIDERS } from '../lib/payment/provider-config';
import { PaymentProviderBadge } from './ui/PaymentProviderBadge';
import { AdminStatCard } from './admin/AdminStatCard';
import { DashboardPageHeader } from './dashboard/DashboardPageHeader';
import { dashboardPanelClass, dashboardPillClass } from './dashboard/dashboardSurfaces';
import { shouldDisableLandingDemoTilt } from '@/lib/landing-demo-tilt';

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

type SurfaceTone = 'auth' | 'tests' | 'security' | 'meter';

const NEXTAUTH_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 232" fill="none"><path d="M0 0C1.21752.370087 2.43504.740174 3.68945 1.12148C6.94224 2.11054 10.1879 3.12125 13.4324 4.1372C16.7917 5.18553 20.1567 6.21523 23.5212 7.24658C27.5452 8.48147 31.5684 9.71867 35.5885 10.966C43.281 13.3525 50.9859 15.6874 58.7148 17.9531C61.1946 18.6857 63.674 19.4193 66.1533 20.1532C67.6627 20.5974 69.1734 21.0374 70.6853 21.4731C72.7318 22.0642 74.7724 22.6724 76.8125 23.2852C77.9231 23.6105 79.0337 23.9358 80.178 24.271C83.2028 25.5943 84.3153 26.5613 85.8711 29.4492C86.2434 31.4502 86.2434 31.4502 86.2344 33.5898C86.2354 34.4001 86.2365 35.2104 86.2375 36.0452C86.2197 36.921 86.2019 37.7968 86.1836 38.6992C86.1716 39.626 86.1596 40.5527 86.1472 41.5076C85.2156 88.9591 74.5348 141.488 45.8711 180.449C45.2988 181.232 44.7264 182.014 44.1367 182.82C39.7203 188.665 34.8514 194.083 29.8711 199.449C29.331 200.055 28.7909 200.661 28.2344 201.285C18.5458 211.681 5.7712 218.83-7.12891 224.449C-8.27746 224.952-9.42602 225.455-10.6094 225.973C-17.5139 228.563-22.0601 228.804-28.8984 225.977C-29.9645 225.473-31.0305 224.969-32.1289 224.449C-33.0636 224.03-33.0636 224.03-34.0171 223.602C-70.3465 207.261-93.0817 174.359-106.959 138.156C-112.275 123.906-116.238 109.646-119.379 94.7617C-119.625 93.5988-119.872 92.4359-120.126 91.2378C-123.106 76.5186-124.519 61.9596-124.554 46.9507C-124.567 44.5261-124.616 42.1038-124.666 39.6797C-124.675 38.1263-124.683 36.5729-124.688 35.0195C-124.707 34.3009-124.727 33.5822-124.747 32.8418C-124.728 30.8247-124.728 30.8247-124.129 27.4492C-120.012 24.2722-115.138 23.0204-110.23 21.5383C-109.344 21.2648-108.457 20.9913-107.543 20.7094C-104.615 19.8092-101.685 18.9194-98.7539 18.0312C-96.7071 17.4078-94.6603 16.7844-92.6135 16.1608C-88.3212 14.8554-84.0271 13.5561-79.7319 12.26C-74.2542 10.6058-68.7837 8.9288-63.3146 7.24602C-59.087 5.9495-54.8545 4.66935-50.6205 3.3935C-48.6031 2.78266-46.5875 2.16593-44.5738 1.54301C-28.4029-3.44892-16.471-5.22489 0 0Z" fill="#38E9D5" transform="translate(124.129 3.551)"/><path d="M0 0C.99.495.99.495 2 1C2.96379 52.402-6.8426 109.65-38 152C-38.5723 152.782-39.1447 153.565-39.7344 154.371C-44.1508 160.216-49.0197 165.634-54 171C-54.8102 171.909-54.8102 171.909-55.6367 172.836C-65.3253 183.232-78.0999 190.38-91 196C-92.1486 196.503-93.2971 197.005-94.4805 197.523C-101.385 200.114-105.931 200.355-112.77 197.527C-113.836 197.023-114.902 196.519-116 196C-116.623 195.72-117.246 195.441-117.888 195.153C-142.663 184.009-160.375 165.36-174.83 142.818C-175.87 141.202-176.934 139.6-178 138C-178 137.01-178 136.02-178 135C-176.076 133.425-174.189 132.059-172.125 130.688C-165.14 125.898-158.483 120.758-151.868 115.471C-151.133 114.89-150.398 114.31-149.641 113.711C-148.986 113.188-148.332 112.665-147.657 112.126C-146 111-146 111-144 111C-144 110.34-144 109.68-144 109C-143.34 109-142.68 109-142 109C-140.952 110.146-139.962 111.344-139 112.563C-131.703 121.064-122.117 127.224-110.756 128.191C-94.9376 128.958-83.2727 126.944-70.75 116.688C-61.6685 108.246-57.2343 97.1057-55.5859 84.9453C-55.1772 72.1253-60.0055 61.3676-67 51C-56.6318 42.9978-46.2147 35.0604-35.7935 27.1274C-32.9954 24.9965-30.1986 22.8638-27.4023 20.7305C-18.2953 13.7838-9.18379 6.84506 0 0Z" fill="#8C2AE9" transform="translate(208 32)"/><path d="M0 0C11.0753 8.54932 17.3925 19.7482 19.25 33.4375C20.6166 45.0535 17.0871 56.965 10.4375 66.5C2.74196 76.0728-7.14505 84.0387-19.75 85.4375C-35.6553 86.4931-48.0462 84.7953-60.75 74.4375C-61.7052 73.6873-61.7052 73.6873-62.6797 72.9219C-70.9078 65.6811-76.1899 53.2691-76.9609 42.4883C-77.4453 26.7476-72.4726 14.8564-61.8086 3.40625C-44.988-12.6802-18.4942-12.2697 0 0Z" fill="#E2E0F8" transform="translate(133.75 75.563)"/></svg>`;

const CLERK_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" fill="none"><path d="M0 0C.83429-.00807175 1.66858-.0161435 2.52815-.0244598C4.29568-.0382524 6.06324-.048996 7.83081-.0568848C9.6001-.0682912 11.3694-.0885581 13.1384-.118408C40.7056-.582136 70.5893 6.78287 92.8906 23.7773C95.332 26.2383 95.332 26.2383 96.1641 28.6328C96.1274 33.1699 95.7784 36.3082 92.6328 39.6992C91.9998 40.3838 91.3668 41.0684 90.7146 41.7737C86.0265 46.6232 81.3129 51.4434 76.543 56.2126C74.6989 58.0589 72.8631 59.913 71.0273 61.7676C69.8455 62.9523 68.6633 64.1366 67.4805 65.3203C66.9376 65.8703 66.3948 66.4203 65.8355 66.987C58.8524 73.9287 58.8524 73.9287 54.2969 74.4883C49.6983 73.9212 45.8921 72.7322 41.6445 70.8633C23.0504 62.7942 1.13292 62.6616-17.7461 70.0518C-37.473 78.4227-52.7443 92.5632-61.668 112.238C-70.6956 135.222-69.2922 157.666-59.668 180.238C-59.338 180.898-59.008 181.558-58.668 182.238C-58.1144 185.698-57.9003 188.158-59.993 191.102C-60.5715 191.732-61.1499 192.361-61.7458 193.01C-62.3834 193.708-63.0209 194.407-63.6777 195.126C-64.3345 195.823-64.9913 196.52-65.668 197.238C-66.2573 197.864-66.8467 198.49-67.4539 199.135C-71.289 203.149-75.2021 207.089-79.1111 211.031C-80.5312 212.468-81.9458 213.91-83.3552 215.358C-85.4071 217.464-87.4749 219.554-89.5469 221.641C-90.4846 222.612-90.4846 222.612-91.4413 223.604C-95.0019 227.147-97.3902 229.193-102.668 229.238C-108.022 227.465-110.379 224.433-113.043 219.676C-113.422 219.018-113.8 218.36-114.19 217.683C-121.755 204.234-127.271 190.292-130.668 175.238C-130.853 174.478-131.037 173.718-131.228 172.934C-133.218 163.712-133.11 154.379-133.105 144.988C-133.106 144.099-133.106 143.21-133.107 142.294C-133.007 104.031-118.906 70.9955-92.668 43.2383C-91.9216 42.4275-91.1752 41.6166-90.4062 40.7812C-67.8289 17.0844-32.9277.310099 0 0Z" fill="#B9B0FF" transform="translate(178.668 15.762)"/><path d="M0 0C18.1406 7.80364 39.921 8.39355 58.3555 1.08984C60.9287.0491918 63.4606-1.04331 66-2.16797C69.6289-3.46582 71.5807-4.0574 75.375-3.375C81.1185.206237 85.9494 4.91328 90.6836 9.70312C91.6619 10.6821 91.6619 10.6821 92.6599 11.6808C94.0227 13.0466 95.383 14.4147 96.741 15.7852C98.8261 17.8887 100.919 19.9839 103.014 22.0781C104.342 23.411 105.669 24.7443 106.996 26.0781C107.622 26.7052 108.248 27.3323 108.893 27.9783C112.747 31.8755 114.549 33.9207 114.938 39.375C115.021 40.2155 115.105 41.0559 115.191 41.9219C113.325 48.1011 105.366 51.4049 99.9836 54.3533C92.3916 58.3515 84.8257 61.8172 76.6875 64.5625C75.8945 64.8325 75.1015 65.1025 74.2844 65.3806C60.6436 69.7286 47.3499 71.1431 33.1218 71.071C30.5745 71.0625 28.0295 71.0914 25.4824 71.123C-1.98346 71.2404-30.47 62.1187-52.625 45.625C-54.4277 42.0196-54.4513 38.5384-53.625 34.625C-51.4229 31.1719-48.596 28.4982-45.6367 25.6875C-44.8226 24.8814-44.0084 24.0752-43.1696 23.2446C-40.571 20.683-37.9421 18.1548-35.3125 15.625C-33.5534 13.8939-31.7962 12.1608-30.041 10.4258C-28.3663 8.78213-26.6899 7.14014-25.0117 5.5C-24.2179 4.72406-23.424 3.94813-22.6061 3.14868C-21.4953 2.08122-21.4953 2.08122-20.3621.992188C-19.3861.0502856-19.3861.0502856-18.3904-.910645C-12.7819-5.56267-5.872-.602811 0 0Z" fill="#6C47FF" transform="translate(159.625 233.375)"/><path d="M0 0C9.80521 9.19114 14.854 21.549 15.3125 34.875C14.8725 47.6646 10.331 59.1792 1.37109 68.3828C-8.44878 77.0449-20.1332 81.2608-33.1602 81.0859C-45.9416 80.1954-57.3379 74.9011-66.1133 65.5586C-74.5002 54.7078-78.2455 42.2537-76.9805 28.6484C-75.2194 16.7658-68.8584 5.05337-59.1875-2.125C-39.8506-13.7764-18.3305-14.7349 0 0Z" fill="#6C47FF" transform="translate(221.188 125.125)"/></svg>`;

const FEATURES: Array<{ icon: IconDefinition; title: string; desc: string; tone: SurfaceTone }> = [
  { icon: faCreditCard,   title: 'Multi-Provider Payments',  desc: 'Stripe, Paystack, Razorpay, and Paddle are already wired behind one payment interface.', tone: 'meter' },
  { icon: faLock,         title: 'Auth & User Management',   desc: 'Clerk or NextAuth sit behind one app boundary, with sessions, OAuth, and magic links already handled.', tone: 'auth' },
  { icon: faBuilding,     title: 'Teams & Organizations',    desc: 'Built-in multi-tenant support with seats, invites, and role-based access already in place.', tone: 'security' },
  { icon: faTag,          title: 'Coupons & Discounts',      desc: 'Create one-time, forever, or repeating discount codes with provider mapping already done.', tone: 'meter' },
  { icon: faGauge,        title: 'Admin Dashboard',          desc: 'Analytics, user management, revenue overview, and subscription controls are already connected.', tone: 'tests' },
  { icon: faEnvelope,     title: 'Transactional Emails',     desc: 'HTML email templates with variable interpolation, lifecycle triggers, and send logging — editable from the admin panel.', tone: 'auth' },
  { icon: faArrowsRotate, title: 'Subscriptions & Billing',  desc: 'Recurring plans, proration, upgrades, downgrades, and end-of-cycle reconciliation.', tone: 'tests' },
  { icon: faShield,       title: 'Token-based Access',       desc: 'Three-bucket system (paid, free, and shared org pool) with configurable names — call them tokens, credits, API calls, or points.', tone: 'security' },
  { icon: faNewspaper,    title: 'Blog Engine',              desc: 'Rich-text blog with TipTap editor, categories, SEO metadata, and full CRUD admin — no external CMS needed.', tone: 'tests' },
  { icon: faFileLines,    title: 'Static Pages',             desc: 'Marketing and legal pages are configurable without introducing a separate CMS.', tone: 'auth' },
  { icon: faHeadset,      title: 'Support System',           desc: 'Users can raise issues directly from the dashboard with a built-in ticket surface.', tone: 'security' },
  { icon: faUserShield,   title: 'Moderator Tools',          desc: 'Role-based moderation, account controls, and audit-aware admin operations are included.', tone: 'meter' },
  { icon: faPalette,      title: 'Dark Mode & Theming',      desc: 'Zero-flash dark mode, live theme designer, custom CSS injection, and brand color controls — all from the admin panel.', tone: 'meter' },
  { icon: faReceipt,      title: 'PDF Invoices & Receipts',  desc: 'Auto-generated PDF invoices and refund receipts with your branding, delivered by email or downloadable from the dashboard.', tone: 'tests' },
  { icon: faEye,          title: 'Traffic Analytics',         desc: 'Built-in visit tracking, page-level analytics, referrer breakdown, and admin traffic dashboards — no third-party scripts needed.', tone: 'auth' },
  { icon: faGaugeHigh,    title: 'Rate Limiting & Security',  desc: 'DB-backed rate limiting, CSP and HSTS headers, encrypted fields, webhook secret rotation, and auto-redacted logging.', tone: 'security' },
];

const PROVIDERS = [
  { name: 'Stripe',   color: '#5469D4', logoUrl: '/images/providers/stripe.svg' },
  { name: 'Paystack', color: '#00C3F7', logoUrl: '/images/providers/paystack.svg' },
  { name: 'Razorpay', color: '#3293FB', logoUrl: '/images/providers/razorpay.svg' },
  { name: 'Paddle',   color: '#1DCD9F', logoUrl: '/images/providers/paddle.svg' },
];

const AUTH_PROVIDERS = [
  { name: 'Clerk', color: '#6366F1', logoSvg: CLERK_LOGO_SVG },
  { name: 'NextAuth', color: '#0F172A', logoSvg: NEXTAUTH_LOGO_SVG },
];

const TECH_STACK_ICONS: Array<
  | { label: string; kind: 'fa'; icon: unknown }
  | { label: string; kind: 'svg'; svg: string }
> = [
  { label: 'Next.js', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.4 20 8.1 6.75H6v10.48h1.68V8.89L17.1 21h.98c.65 0 1.17-.52 1.17-1.17V6.77H17.6V20Z"/><path d="M14.77 6.77h1.68v10.46h-1.68z"/></svg>' },
  { label: 'React', kind: 'fa', icon: faReact },
  { label: 'TypeScript', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3h18v18H3V3Z" fill="#3178C6"/><path d="M13.3 13.34v1.7c.29.15.63.26 1.02.35.39.08.77.13 1.14.13 1.48 0 2.22-.5 2.22-1.49 0-.28-.08-.52-.23-.71-.15-.2-.36-.38-.62-.54-.26-.16-.56-.31-.91-.46-.34-.15-.71-.3-1.1-.46-.39-.17-.77-.35-1.11-.55a5 5 0 0 1-.91-.68 2.8 2.8 0 0 1-.61-.88 2.9 2.9 0 0 1-.22-1.19c0-1 .37-1.8 1.12-2.4.75-.6 1.74-.9 2.97-.9.92 0 1.71.11 2.36.33v1.64a4.74 4.74 0 0 0-2.14-.47c-.59 0-1.05.1-1.39.31-.34.2-.5.49-.5.84 0 .27.07.5.2.69.13.19.31.36.54.51.23.15.5.29.82.43.31.14.65.29 1.01.45.41.17.8.36 1.17.56.37.2.69.43.97.69.28.26.5.56.66.91.16.35.24.76.24 1.22 0 1.06-.38 1.87-1.13 2.44-.75.57-1.82.85-3.2.85-.48 0-.96-.04-1.45-.13-.49-.09-.88-.2-1.17-.33Zm-2.54-5.89H8.13v7.81H6.46V7.45H3.84V6.03h6.92v1.42Z" fill="white"/></svg>' },
  { label: 'Tailwind CSS', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5c-2.67 0-4.34 1.3-5 3.9.99-1.3 2.15-1.79 3.49-1.47.76.18 1.3.7 1.9 1.28.97.94 2.1 2.03 4.61 2.03 2.67 0 4.34-1.3 5-3.9-.99 1.3-2.15 1.79-3.49 1.47-.76-.18-1.3-.7-1.9-1.28C15.64 7.59 14.51 6.5 12 6.5Zm-5 5.76c-2.67 0-4.34 1.3-5 3.9.99-1.3 2.15-1.79 3.49-1.47.76.18 1.3.7 1.9 1.28.97.94 2.1 2.03 4.61 2.03 2.67 0 4.34-1.3 5-3.9-.99 1.3-2.15 1.79-3.49 1.47-.76-.18-1.3-.7-1.9-1.28-.97-.94-2.1-2.03-4.61-2.03Z" fill="#38BDF8"/></svg>' },
  { label: 'Prisma', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.9 18.18 10.3 2.85c-.18-.33-.63-.34-.82-.03L5.22 9.43a1 1 0 0 0-.08.87l3.4 10.14c.14.43.63.61 1 .37l8.95-5.74c.41-.26.53-.81.27-1.21-.03-.05-.07-.09-.1-.14Z" fill="#2D3748"/><path d="m10.1 20.35 7.9-5.05a.54.54 0 0 0 .21-.7L10.08 3.13c-.14-.26-.52-.17-.55.12L8.2 19.72c-.04.46.42.88.85.63Z" fill="#A0AEC0"/></svg>' },
  { label: 'Node.js', kind: 'fa', icon: faNodeJs },
  { label: 'Clerk', kind: 'svg', svg: CLERK_LOGO_SVG },
  { label: 'Auth.js / NextAuth', kind: 'svg', svg: NEXTAUTH_LOGO_SVG },
  { label: 'Playwright', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.4 5.5c3.35 0 5.47 2.57 5.47 5.66 0 3.28-2.2 5.9-5.18 5.9-1.73 0-3.11-.83-3.97-2.07.63.18 1.49.08 2.08-.39.67-.54 1-1.4.92-2.41-.12-1.64.88-3 2.5-3.27 1.1-.19 2.08.22 2.75.98-.36-2.14-1.92-3.79-4.57-3.79-2.39 0-3.82 1.22-4.59 3.04C4.25 7.15 5.83 5.5 8.4 5.5Z" fill="#2EAD33"/><path d="M15.64 6.01c2.35 0 4.36 1.83 4.36 4.42 0 2.85-2.28 4.62-4.92 4.62-.94 0-1.8-.2-2.48-.55.87-.2 1.67-.74 2.12-1.57.72-1.31 2.1-1.96 3.54-1.63.46.1.88.29 1.24.54-.35-1.75-1.73-3.07-3.86-3.07-1.22 0-2.18.46-2.93 1.25.52-2.34 1.92-4.01 4.93-4.01Z" fill="#45BA4B"/></svg>' },
  { label: 'Vitest', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.93 4H22l-6.24 16h-3.07L18.93 4Z" fill="#FBBF24"/><path d="M8.24 4h3.07l4.46 16h-3.07L8.24 4Z" fill="#A3E635"/><path d="M2 4h3.07l6.24 16H8.24L2 4Z" fill="#84CC16"/></svg>' },
  { label: 'Zod', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="#3068B7"/><path d="M7.5 8.2h9.1v1.8l-6.2 6h6.2v1.8H7.3V16l6.16-6H7.5V8.2Z" fill="white"/></svg>' },
  { label: 'Nodemailer', kind: 'svg', svg: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="#10B981"/><path d="m6.5 8.5 5.5 4 5.5-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15h8" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>' },
];

const STATS = [
  { label: 'MRR',           value: '$14,280', sub: '+12% this month',    faIcon: faDollarSign,  gradColor: '#10b981' },
  { label: 'Active Users',  value: '1,204',   sub: '↑ 38 new today',     faIcon: faUsers,       gradColor: '#3b82f6' },
  { label: 'Subscriptions', value: '847',     sub: '91% retention',      faIcon: faArrowsRotate,gradColor: '#8b5cf6' },
  { label: 'Open Tickets',  value: '7',       sub: 'avg < 2hr response',  faIcon: faTicket,      gradColor: '#f59e0b' },
];

const PROVIDER_NAMES = ['stripe', 'razorpay', 'paystack', 'paddle'];
const AUTH_PROVIDER_NAMES = ['clerk', 'nextauth'];

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

function TypewriterAuthProvider() {
  const [providerIdx, setProviderIdx] = useState(0);
  const [displayed, setDisplayed] = useState('clerk');
  const [phase, setPhase] = useState<'typing' | 'hold' | 'erasing'>('hold');

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const target = AUTH_PROVIDER_NAMES[providerIdx];
    if (phase === 'hold') {
      t = setTimeout(() => setPhase('erasing'), 1800);
    } else if (phase === 'erasing') {
      if (displayed.length > 0) {
        t = setTimeout(() => setDisplayed((value) => value.slice(0, -1)), 55);
      } else {
        const next = (providerIdx + 1) % AUTH_PROVIDER_NAMES.length;
        t = setTimeout(() => {
          setProviderIdx(next);
          setPhase('typing');
        }, 0);
      }
    } else if (displayed.length < target.length) {
      t = setTimeout(() => setDisplayed(target.slice(0, displayed.length + 1)), 90);
    } else {
      t = setTimeout(() => setPhase('hold'), 0);
    }
    return () => clearTimeout(t);
  }, [displayed, phase, providerIdx]);

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
  const tiltDisabledRef = useRef(false);
  const tiltRef = useRef<HTMLDivElement>(null);
  const tiltInnerRef = useRef<HTMLDivElement>(null);
  const viewIdxRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tiltDisabledRef.current = shouldDisableLandingDemoTilt(window.navigator.userAgent);
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
    if (tiltDisabledRef.current) return;
    const rect = tiltRef.current?.getBoundingClientRect();
    if (!rect || !tiltInnerRef.current) return;
    const dxRaw = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dyRaw = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const dx = Math.max(-1, Math.min(1, dxRaw));
    const dy = Math.max(-1, Math.min(1, dyRaw));
    tiltInnerRef.current.style.transition = 'transform 90ms linear';
    tiltInnerRef.current.style.transform = `perspective(450px) rotateX(${dy * -2.2}deg) rotateY(${dx * 2.2}deg) scale(1)`;
  };
  const handleMouseLeave = () => {
    if (tiltDisabledRef.current) return;
    if (tiltInnerRef.current) {
      tiltInnerRef.current.style.transition = 'transform 260ms ease-out';
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
      style={{ position: 'relative', maxWidth: 1220, margin: '0 auto' }}
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
        transition: 'transform 260ms ease-out',
        willChange: 'transform',
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden',
          border: '1px solid var(--lp-dd-border-main)',
          background: 'var(--lp-dd-outer-bg)',
          fontFamily: 'inherit',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
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

          <div className="lp-dd-topbar">
            <span className="lp-dd-topbar-logo">SaasyBase</span>
            <div className="lp-dd-topbar-nav" aria-hidden>
              <span className="lp-dd-topbar-nav-active">Dashboard</span>
              <span>Billing</span>
              <span>Docs</span>
              <span>Support</span>
            </div>
            <div className="lp-dd-topbar-actions" aria-hidden>
              <span className="lp-dd-topbar-icon"><FontAwesomeIcon icon={faChartLine} /></span>
              <span className="lp-dd-topbar-icon"><FontAwesomeIcon icon={faLifeRing} /></span>
              <span className="lp-dd-topbar-icon"><FontAwesomeIcon icon={faGear} /></span>
            </div>
          </div>

          {/* app shell */}
          <div className="lp-dd-shell" style={{ display: 'flex', height: 600 }}>
            {/* mobile header – visible only on small screens */}
            <div className="lp-dd-mobile-hdr">
              <FontAwesomeIcon icon={faBars} style={{ fontSize: 14, color: 'var(--lp-dd-nav-text)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lp-dd-brand)', letterSpacing: '-.3px' }}>SaasyBase</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--lp-dd-muted)', fontWeight: 500 }}>Admin Panel</span>
            </div>
            {/* sidebar */}
            <nav className="lp-dd-sidebar" style={{ width: 190, background: 'var(--lp-dd-sidebar-bg)', borderRight: '1px solid var(--lp-dd-sidebar-border)', padding: '12px 0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)' }}>
              {/* Brand */}

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
                              <div style={{ fontSize: 9, color: 'var(--lp-dd-row-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{demoUserIdFromEmail(u.email)}</div>
                            </div>
                          </div>
                          {/* Email */}
                          <div style={{ fontSize: 9.5, color: 'var(--lp-dd-row-text3)', whiteSpace: 'nowrap' }}>{u.email}</div>
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
                              <span style={{ fontSize: 9, color: 'var(--lp-dd-row-text3)' }}>ID: {demoUserIdFromEmail(u.email)}</span>
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
                            className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs backdrop-blur-sm dark:border-neutral-800/70 dark:bg-neutral-900/70"
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
function FeatureCard({ icon, title, desc, tone, delay }: { icon: IconDefinition; title: string; desc: string; tone: SurfaceTone; delay: number }) {
  return (
    <div className={`lp-feature-card lp-feature-card-${tone}`} style={{ animationDelay: `${delay}ms` }}>
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

function demoUserIdFromEmail(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return `usr_${hash.toString(36).padStart(7, '0').slice(0, 7)}`;
}

/* ─── Main landing component ─── */
export default function LandingClientAlt({ isSignedIn }: { isSignedIn: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <style suppressHydrationWarning>{`
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
          --lp-dd-sidebar-bg:         linear-gradient(180deg, rgba(12,18,34,.92), rgba(9,14,28,.82));
          --lp-dd-sidebar-border:     rgb(var(--border-primary) / 0.5);
          --lp-dd-border:             rgb(var(--border-primary) / 0.4);
          --lp-dd-border2:            rgb(var(--border-primary) / 0.5);
          --lp-dd-border-main:        rgba(var(--accent-primary-rgb), 0.4);
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
          --lp-dd-row-text:           rgb(var(--text-primary) / 0.94);
          --lp-dd-row-text2:          rgb(var(--text-secondary) / 0.95);
          --lp-dd-row-text3:          rgb(var(--text-secondary));
          --lp-dd-row-border:         rgb(var(--border-primary) / 0.3);
          --lp-dd-amount:             #a5f3fc;
          --lp-dd-live-bg:            rgba(var(--accent-primary-rgb), 0.09);
          --lp-dd-live-border:        rgba(var(--accent-primary-rgb), 0.22);
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
          --lp-dd-topbar-bg:          rgb(var(--bg-secondary) / 0.72);
          --lp-dd-topbar-border:      rgb(var(--border-primary) / 0.45);
          --lp-dd-topbar-text:        rgb(var(--text-secondary));
          --lp-dd-topbar-link:        rgb(var(--text-tertiary));
          --lp-dd-topbar-link-active: rgb(var(--text-primary));
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
          --lp-dd-sidebar-bg:         linear-gradient(180deg, rgba(245,247,255,.98), rgba(238,242,255,.94));
          --lp-dd-sidebar-border:     rgba(99,102,241,.1);
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
          --lp-dd-topbar-bg:          rgba(255,255,255,.88);
          --lp-dd-topbar-border:      rgba(99,102,241,.16);
          --lp-dd-topbar-text:        rgba(15,23,42,.8);
          --lp-dd-topbar-link:        rgba(15,23,42,.6);
          --lp-dd-topbar-link-active: #1e1b4b;
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
        .lp-hero-shell {
          position:relative;
          isolation:isolate;
        }
        .lp-hero-grid {
          display:grid;
          grid-template-columns:minmax(0, 1.15fr) minmax(340px, 0.85fr);
          gap:48px;
          align-items:stretch;
        }
        .lp-hero-copy {
          position:relative;
          text-align:left;
          padding:28px 0 0;
        }
        .lp-hero-kicker {
          display:inline-flex;
          align-items:center;
          gap:10px;
          margin-bottom:18px;
          color:var(--lp-text3);
          font-size:11px;
          font-weight:700;
          letter-spacing:2.2px;
          text-transform:uppercase;
        }
        .lp-hero-kicker::before {
          content:'';
          width:34px;
          height:2px;
          border-radius:1px;
          background:linear-gradient(90deg, #6366f1, #06b6d4);
        }
        .lp-hero-copy .lp-hero-badge {
          margin-bottom:18px;
        }
        .lp-hero-copy .lp-hero-sub {
          max-width:680px;
          margin:18px 0 0;
        }
        .lp-hero-copy .lp-cta-row {
          justify-content:flex-start;
        }
        .lp-hero-panel {
          position:relative;
          overflow:hidden;
          border:1px solid var(--lp-border2);
          border-radius:26px;
          background:linear-gradient(180deg, rgba(18,178,210,0.28), rgba(255,255,255,.01));
          backdrop-filter:blur(18px);
          padding:22px;
          box-shadow:0 30px 70px rgba(2,6,23,.28);
          animation:lpFadeUp .8s .25s ease both;
          height:100%;
          display:flex;
          flex-direction:column;
          justify-content:center;
        }
        .lp-hero-panel::before {
          content:'';
          position:absolute;
          inset:0;
          background:
            linear-gradient(90deg, rgba(99,102,241,.12) 0, rgba(99,102,241,0) 18%),
            linear-gradient(180deg, rgba(6,182,212,.08) 0, rgba(6,182,212,0) 35%),
            repeating-linear-gradient(90deg, transparent 0 44px, rgba(255,255,255,.09) 44px 45px),
            repeating-linear-gradient(180deg, transparent 0 44px, rgba(255,255,255,.09) 44px 45px);
          pointer-events:none;
        }
        .lp-hero-panel > * {
          position:relative;
          z-index:1;
        }
        .lp-panel-topbar {
          display:flex;
          align-items:center;
          gap:8px;
          margin-bottom:16px;
        }
        .lp-panel-dot {
          width:9px;
          height:9px;
          border-radius:999px;
          background:rgba(255,255,255,.2);
        }
        .lp-panel-label {
          margin-left:auto;
          font-size:10px;
          letter-spacing:1.8px;
          text-transform:uppercase;
          color:var(--lp-text3);
          font-weight:700;
        }
        .lp-panel-title {
          font-size:20px;
          line-height:1.12;
          color:var(--lp-text1);
          font-weight:800;
          letter-spacing:-.7px;
          margin-bottom:8px;
        }
        .lp-panel-sub {
          font-size:13px;
          line-height:1.55;
          color:var(--lp-text3);
          margin-bottom:16px;
        }
        .lp-arch-grid {
          display:grid;
          gap:12px;
        }
        .lp-arch-card {
          border:1px solid var(--lp-border2);
          border-radius:18px;
          background:rgba(12,18,34,.56);
          padding:14px;
        }
        .light .lp-root .lp-arch-card {
          background:rgba(255,255,255,.72);
          box-shadow:0 1px 4px rgba(0,0,0,.04);
        }
        .light .lp-root .lp-chip-strong {
          color:#4338ca;
          background:linear-gradient(135deg, rgba(99,102,241,.12), rgba(6,182,212,.08));
          border-color:rgba(99,102,241,.28);
        }
        .light .lp-root .lp-chip-soft {
          background:rgba(0,0,0,.035);
          border-color:rgba(0,0,0,.1);
          color:rgba(0,0,0,.58);
        }
        .light .lp-root .lp-arch-icon {
          background:linear-gradient(135deg, rgba(99,102,241,.1), rgba(6,182,212,.08));
          border-color:rgba(99,102,241,.18);
          color:#6366f1;
        }
        .light .lp-root .lp-signal-pill {
          background:rgba(255,255,255,.7);
          border-color:rgba(0,0,0,.08);
          box-shadow:0 1px 3px rgba(0,0,0,.04);
        }
        .light .lp-root .lp-signal-pill svg {
          color:#6366f1;
        }
        .light .lp-root .lp-hero-panel {
          background:linear-gradient(180deg, rgba(20,178,192,.1), rgba(255,255,255));
          border-color:rgba(0,0,0,.1);
          box-shadow:0 20px 50px rgba(0,0,0,.06);
        }
        .light .lp-root .lp-hero-panel::before {
          background:
            linear-gradient(90deg, rgba(99,102,241,.06) 0, rgba(99,102,241,0) 18%),
            linear-gradient(180deg, rgba(6,182,212,.04) 0, rgba(6,182,212,0) 35%),
            repeating-linear-gradient(90deg, transparent 0 44px, rgba(99,102,241,.1) 44px 45px),
            repeating-linear-gradient(180deg, transparent 0 44px, rgba(99,102,241,.1) 44px 45px);
        }
        .light .lp-root .lp-panel-dot {
          opacity:.6;
        }
        .lp-hero-panel .lp-chip-soft {
          background:rgba(255,255,255,.07);
          border-color:rgba(255,255,255,.11);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
        }
        .light .lp-root .lp-hero-panel .lp-chip-soft {
          background:rgba(99,102,241,.07);
          border-color:rgba(99,102,241,.12);
          color:rgba(15,23,42,.68);
        }
        .lp-arch-head {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
        }
        .lp-arch-title {
          display:flex;
          align-items:center;
          gap:10px;
          font-size:12px;
          font-weight:700;
          letter-spacing:.7px;
          text-transform:uppercase;
          color:var(--lp-text1);
        }
        .lp-arch-icon {
          width:34px;
          height:34px;
          border-radius:12px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:linear-gradient(135deg, rgba(99,102,241,.22), rgba(6,182,212,.16));
          border:1px solid rgba(99,102,241,.22);
          color:#c4b5fd;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 8px 20px rgba(15,23,42,.16);
          flex-shrink:0;
        }
        .lp-chip-row {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
        }
        .lp-chip-strong, .lp-chip-soft {
          display:inline-flex;
          align-items:center;
          border-radius:999px;
          font-size:11px;
          font-weight:700;
          line-height:1;
          padding:8px 11px;
        }
        .lp-chip-strong {
          color:#eef2ff;
          background:linear-gradient(135deg, rgba(99,102,241,.55), rgba(6,182,212,.35));
          border:1px solid rgba(129,140,248,.45);
        }
        .lp-chip-soft {
          color:var(--lp-chip-text);
          background:var(--lp-chip-bg);
          border:1px solid var(--lp-chip-border);
        }
        .lp-env-line {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
          font-family:'Fira Code','Cascadia Code',monospace;
          font-size:12px;
          color:var(--lp-code-text);
          background:rgba(8,12,24,.5);
          border:1px solid rgba(255,255,255,.08);
          border-radius:14px;
          padding:10px 12px;
        }
        .light .lp-root .lp-env-line {
          background:rgba(243,244,246,.8);
          border-color:rgba(0,0,0,.08);
        }
        .lp-hero-proofs {
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:14px;
          margin-top:28px;
        }
        .lp-proof-card {
          padding:18px 20px;
          border-radius:18px;
          border:1px solid var(--lp-border2);
          background:linear-gradient(160deg, rgba(99,102,241,.06) 0%, rgba(255,255,255,.03) 40%, rgba(6,182,212,.04) 100%);
          animation:lpFadeUp .8s ease both;
          transition:border-color .2s, transform .2s, box-shadow .2s;
          position:relative;
          overflow:hidden;
        }
        .lp-proof-card > * {
          position:relative;
          z-index:1;
        }
        .lp-proof-card::before {
          content:'';
          position:absolute;
          top:0; left:0;
          width:3px; height:100%;
          border-radius:3px 0 0 3px;
          background:linear-gradient(180deg, #6366f1, #06b6d4);
          opacity:.55;
          transition:opacity .2s;
        }
        .lp-proof-card::after {
          content:'';
          position:absolute;
          inset:auto -40px -50px auto;
          width:120px;
          height:120px;
          border-radius:999px;
          background:radial-gradient(circle, rgba(255,255,255,.08), rgba(255,255,255,0) 70%);
          pointer-events:none;
        }
        .lp-proof-meta {
          display:inline-flex;
          align-items:center;
          gap:8px;
          margin-bottom:14px;
          font-size:10px;
          font-weight:800;
          letter-spacing:1.5px;
          text-transform:uppercase;
          color:var(--lp-text3);
        }
        .lp-proof-dot {
          width:8px;
          height:8px;
          border-radius:999px;
          flex-shrink:0;
        }
        .lp-proof-card-auth {
          background:linear-gradient(160deg, rgba(99,102,241,.12) 0%, rgba(255,255,255,.03) 44%, rgba(79,70,229,.05) 100%);
        }
        .lp-proof-card-auth::before,
        .lp-proof-card-auth .lp-proof-dot {
          background:linear-gradient(180deg, #6366f1, #818cf8);
        }
        .lp-proof-card-tests {
          background:linear-gradient(160deg, rgba(14,165,233,.1) 0%, rgba(255,255,255,.03) 44%, rgba(6,182,212,.05) 100%);
        }
        .lp-proof-card-tests::before,
        .lp-proof-card-tests .lp-proof-dot {
          background:linear-gradient(180deg, #0ea5e9, #06b6d4);
        }
        .lp-proof-card-security {
          background:linear-gradient(160deg, rgba(16,185,129,.09) 0%, rgba(255,255,255,.03) 44%, rgba(52,211,153,.05) 100%);
        }
        .lp-proof-card-security::before,
        .lp-proof-card-security .lp-proof-dot {
          background:linear-gradient(180deg, #10b981, #34d399);
        }
        .lp-proof-card-meter {
          background:linear-gradient(160deg, rgba(245,158,11,.09) 0%, rgba(255,255,255,.03) 44%, rgba(249,115,22,.05) 100%);
        }
        .lp-proof-card-meter::before,
        .lp-proof-card-meter .lp-proof-dot {
          background:linear-gradient(180deg, #f59e0b, #f97316);
        }
        .lp-proof-card:hover {
          border-color:var(--lp-card-bdr-h);
          transform:translateY(-2px);
          box-shadow:0 8px 24px rgba(99,102,241,.12);
        }
        .lp-proof-card:hover::before {
          opacity:1;
        }
        .lp-proof-kpi {
          font-size:16px;
          line-height:1;
          font-weight:700;
          letter-spacing:-.6px;
          color:var(--lp-text1);
          margin-bottom:8px;
        }
        .lp-proof-copy {
          font-size:12px;
          line-height:1.65;
          color:var(--lp-text3);
        }
        .light .lp-root .lp-proof-card {
          background:linear-gradient(160deg, rgba(99,102,241,.04) 0%, rgba(255,255,255,.8) 40%, rgba(6,182,212,.03) 100%);
          box-shadow:0 1px 4px rgba(0,0,0,.04);
        }
        .light .lp-root .lp-proof-card-auth {
          background:linear-gradient(160deg, rgba(99,102,241,.06) 0%, rgba(255,255,255,.92) 44%, rgba(79,70,229,.03) 100%);
        }
        .light .lp-root .lp-proof-card-tests {
          background:linear-gradient(160deg, rgba(14,165,233,.06) 0%, rgba(255,255,255,.92) 44%, rgba(6,182,212,.03) 100%);
        }
        .light .lp-root .lp-proof-card-security {
          background:linear-gradient(160deg, rgba(16,185,129,.05) 0%, rgba(255,255,255,.92) 44%, rgba(52,211,153,.03) 100%);
        }
        .light .lp-root .lp-proof-card-meter {
          background:linear-gradient(160deg, rgba(245,158,11,.05) 0%, rgba(255,255,255,.92) 44%, rgba(249,115,22,.03) 100%);
        }
        .light .lp-root .lp-proof-card::before {
          opacity:.4;
        }
        .lp-signal-strip {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          margin-top:20px;
          justify-content:center;
        }
        .lp-signal-pill {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:9px 12px;
          border-radius:999px;
          border:1px solid var(--lp-chip-border);
          background:rgba(255,255,255,.035);
          font-size:11px;
          font-weight:600;
          color:var(--lp-chip-text);
        }
        .lp-signal-pill svg {
          color:#818cf8;
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
        .lp-feature-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; margin-top:40px; }
        .lp-feature-card {
          display:flex; align-items:flex-start; gap:14px;
          background:var(--lp-card-bg); border:1px solid var(--lp-border2);
          border-radius:14px; padding:18px; text-align:left;
          transition:border-color .2s, background .2s, transform .2s;
          animation:lpFadeUp .7s ease both;
          position:relative;
          overflow:hidden;
        }
        .lp-feature-card::before {
          content:'';
          position:absolute;
          top:0; left:0;
          width:3px; height:100%;
          border-radius:3px 0 0 3px;
          opacity:.7;
        }
        .lp-feature-card::after {
          content:'';
          position:absolute;
          inset:auto -28px -42px auto;
          width:92px;
          height:92px;
          border-radius:999px;
          background:radial-gradient(circle, rgba(255,255,255,.08), rgba(255,255,255,0) 72%);
          pointer-events:none;
        }
        .lp-feature-card:hover { border-color:var(--lp-card-bdr-h); background:var(--lp-card-hover); transform:translateY(-2px); }
        .lp-feature-icon {
          width:44px; height:44px; border-radius:10px; margin:0;
          background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));
          border:1px solid rgba(99,102,241,.16);
          display:flex; align-items:center; justify-content:center;
          color:#818cf8; font-size:16px; flex-shrink:0;
        }
        .lp-feature-card-auth {
          background:linear-gradient(160deg, rgba(99,102,241,.08) 0%, rgba(255,255,255,.03) 44%, rgba(79,70,229,.05) 100%);
        }
        .lp-feature-card-auth::before {
          background:linear-gradient(180deg, #6366f1, #818cf8);
        }
        .lp-feature-card-auth .lp-feature-icon {
          background:linear-gradient(135deg, rgba(99,102,241,.18), rgba(129,140,248,.08));
          border-color:rgba(99,102,241,.2);
          color:#a5b4fc;
        }
        .lp-feature-card-tests {
          background:linear-gradient(160deg, rgba(14,165,233,.08) 0%, rgba(255,255,255,.03) 44%, rgba(6,182,212,.05) 100%);
        }
        .lp-feature-card-tests::before {
          background:linear-gradient(180deg, #0ea5e9, #06b6d4);
        }
        .lp-feature-card-tests .lp-feature-icon {
          background:linear-gradient(135deg, rgba(14,165,233,.16), rgba(6,182,212,.08));
          border-color:rgba(14,165,233,.18);
          color:#67e8f9;
        }
        .lp-feature-card-security {
          background:linear-gradient(160deg, rgba(16,185,129,.07) 0%, rgba(255,255,255,.03) 44%, rgba(52,211,153,.05) 100%);
        }
        .lp-feature-card-security::before {
          background:linear-gradient(180deg, #10b981, #34d399);
        }
        .lp-feature-card-security .lp-feature-icon {
          background:linear-gradient(135deg, rgba(16,185,129,.16), rgba(52,211,153,.08));
          border-color:rgba(16,185,129,.18);
          color:#6ee7b7;
        }
        .lp-feature-card-meter {
          background:linear-gradient(160deg, rgba(245,158,11,.08) 0%, rgba(255,255,255,.03) 44%, rgba(249,115,22,.05) 100%);
        }
        .lp-feature-card-meter::before {
          background:linear-gradient(180deg, #f59e0b, #f97316);
        }
        .lp-feature-card-meter .lp-feature-icon {
          background:linear-gradient(135deg, rgba(245,158,11,.16), rgba(249,115,22,.08));
          border-color:rgba(245,158,11,.2);
          color:#fbbf24;
        }
        .light .lp-root .lp-feature-card-auth {
          background:linear-gradient(160deg, rgba(99,102,241,.05) 0%, rgba(255,255,255,.94) 44%, rgba(79,70,229,.03) 100%);
        }
        .light .lp-root .lp-feature-card-tests {
          background:linear-gradient(160deg, rgba(14,165,233,.05) 0%, rgba(255,255,255,.94) 44%, rgba(6,182,212,.03) 100%);
        }
        .light .lp-root .lp-feature-card-security {
          background:linear-gradient(160deg, rgba(16,185,129,.04) 0%, rgba(255,255,255,.94) 44%, rgba(52,211,153,.03) 100%);
        }
        .light .lp-root .lp-feature-card-meter {
          background:linear-gradient(160deg, rgba(245,158,11,.04) 0%, rgba(255,255,255,.94) 44%, rgba(249,115,22,.03) 100%);
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
        .lp-auth-provider-logo { width:18px; height:18px; display:inline-block; flex-shrink:0; }
        .lp-auth-provider-logo svg { width:18px; height:18px; display:block; }
        .lp-switch-grid {
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:18px;
          margin-top:30px;
        }
        .lp-switch-card {
          text-align:left;
          border:1px solid var(--lp-border2);
          border-radius:22px;
          background:linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.018));
          padding:22px;
          box-shadow:0 16px 40px rgba(2,6,23,.14);
          position:relative;
          overflow:hidden;
        }
        .lp-switch-card::before {
          content:'';
          position:absolute;
          inset:0;
          pointer-events:none;
          opacity:.7;
        }
        .light .lp-root .lp-switch-card {
          background:linear-gradient(160deg, rgba(255,255,255,.92), rgba(248,250,252,.82));
          box-shadow:0 14px 30px rgba(15,23,42,.06);
        }
        .lp-switch-card > * {
          position:relative;
          z-index:1;
        }
        .lp-switch-card-pay {
          border-color:rgba(6,182,212,.18);
          background:linear-gradient(155deg, rgba(8,145,178,.12), rgba(255,255,255,.025) 34%, rgba(99,102,241,.06) 100%);
        }
        .lp-switch-card-pay::before {
          background:
            radial-gradient(circle at top right, rgba(6,182,212,.22), transparent 36%),
            linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0));
        }
        .lp-switch-card-auth {
          border-color:rgba(99,102,241,.2);
          background:linear-gradient(155deg, rgba(99,102,241,.14), rgba(255,255,255,.02) 34%, rgba(16,185,129,.05) 100%);
        }
        .lp-switch-card-auth::before {
          background:
            radial-gradient(circle at top left, rgba(99,102,241,.24), transparent 34%),
            linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,0));
        }
        .light .lp-root .lp-switch-card-pay {
          background:linear-gradient(155deg, rgba(6,182,212,.08), rgba(255,255,255,.94) 34%, rgba(99,102,241,.05) 100%);
          border-color:rgba(6,182,212,.16);
        }
        .light .lp-root .lp-switch-card-auth {
          background:linear-gradient(155deg, rgba(99,102,241,.08), rgba(255,255,255,.94) 34%, rgba(16,185,129,.04) 100%);
          border-color:rgba(99,102,241,.16);
        }
        .lp-switch-kicker {
          display:inline-flex;
          align-items:center;
          gap:8px;
          font-size:10px;
          font-weight:800;
          letter-spacing:1.8px;
          text-transform:uppercase;
          color:var(--lp-section-tag);
          margin-bottom:10px;
        }
        .lp-switch-kicker-dot {
          width:9px;
          height:9px;
          border-radius:999px;
          flex-shrink:0;
        }
        .lp-switch-card-pay .lp-switch-kicker-dot {
          background:#06b6d4;
          box-shadow:0 0 12px rgba(6,182,212,.45);
        }
        .lp-switch-card-auth .lp-switch-kicker-dot {
          background:#6366f1;
          box-shadow:0 0 12px rgba(99,102,241,.45);
        }
        .lp-switch-title {
          font-size:22px;
          line-height:1.15;
          color:var(--lp-text1);
          font-weight:800;
          letter-spacing:-.7px;
          margin-bottom:10px;
        }
        .lp-switch-sub {
          font-size:14px;
          line-height:1.7;
          color:var(--lp-text3);
          margin-bottom:16px;
        }
        .lp-switch-card-pay .lp-provider-chip {
          background:rgba(6,182,212,.08);
          border-color:rgba(6,182,212,.15);
        }
        .lp-switch-card-auth .lp-provider-chip {
          background:rgba(99,102,241,.08);
          border-color:rgba(99,102,241,.15);
        }
        .light .lp-root .lp-switch-card-pay .lp-provider-chip {
          background:rgba(6,182,212,.06);
        }
        .light .lp-root .lp-switch-card-auth .lp-provider-chip {
          background:rgba(99,102,241,.06);
        }
        .lp-switch-card-auth .lp-provider-chip .lp-auth-provider-logo {
          filter:drop-shadow(0 2px 6px rgba(15,23,42,.12));
        }
        .lp-switch-card .lp-code-block {
          max-width:none;
          margin:18px 0 0;
          padding:16px 18px;
        }
        .lp-switch-bridge {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:12px;
          margin:18px 0 0;
          color:var(--lp-text3);
          font-size:11px;
          font-weight:700;
          letter-spacing:1.4px;
          text-transform:uppercase;
        }
        .lp-switch-bridge::before,
        .lp-switch-bridge::after {
          content:'';
          flex:1;
          max-width:100px;
          height:1px;
          background:linear-gradient(90deg, rgba(99,102,241,0), rgba(99,102,241,.28), rgba(6,182,212,0));
        }
        .lp-flow-row {
          display:flex;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          margin-top:14px;
        }
        .lp-flow-node {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:34px;
          padding:8px 12px;
          border-radius:999px;
          border:1px solid var(--lp-chip-border);
          background:rgba(255,255,255,.04);
          color:var(--lp-chip-text);
          font-size:11px;
          font-weight:700;
        }
        .lp-flow-arrow {
          color:var(--lp-text3);
          font-size:12px;
          font-weight:800;
        }
        .lp-switch-card-auth .lp-flow-node {
          background:rgba(99,102,241,.08);
          border-color:rgba(99,102,241,.15);
        }
        .light .lp-root .lp-switch-card-auth .lp-flow-node {
          background:rgba(99,102,241,.06);
          border-color:rgba(99,102,241,.12);
          color:rgba(15,23,42,.68);
        }

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
        .lp-marquee-inner { display:flex; gap:12px; width:max-content; animation:lpMarquee 36s linear infinite; }
        .lp-tech-pill {
          padding:6px 14px; border-radius:100px; font-size:11px; font-weight:600;
          border:1px solid var(--lp-pill-border); color:var(--lp-pill-text);
          background:var(--lp-pill-bg); white-space:nowrap;
        }
        .lp-tech-icons {
          margin-top:26px;
        }
        .lp-tech-icons:hover .lp-tech-marquee-inner {
          animation-play-state:paused;
        }
        .lp-tech-marquee-inner {
          gap:16px;
          padding:8px 0;
        }
        .lp-tech-icon {
          flex:0 0 104px;
          width:104px;
          height:104px;
          border-radius:16px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          border:1px solid var(--lp-pill-border);
          background:var(--lp-pill-bg);
          color:var(--lp-pill-text);
          transition:transform .18s, border-color .18s, color .18s, background .18s;
          box-shadow:0 8px 24px rgba(15,23,42,.08);
        }
        .lp-tech-icon:hover {
          transform:translateY(-2px);
          border-color:var(--lp-card-bdr-h);
          color:var(--lp-text1);
          background:var(--lp-card-hover);
        }
        .lp-tech-icon > svg,
        .lp-tech-icon > span {
          width:82px;
          height:82px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        }
        .lp-tech-icon > svg,
        .lp-tech-icon > span svg {
          width:82px;
          height:82px;
          display:block;
        }

        /* Code block: theme-aware */
        .light .lp-root .lp-code-block {
          background:linear-gradient(180deg, rgba(255,255,255,.96), rgba(245,247,255,.9));
          border-color:rgba(99,102,241,.14);
          box-shadow:0 10px 28px rgba(15,23,42,.06);
        }
        .light .lp-root .lp-code-block .lp-code-key    { color:#818cf8; }
        .light .lp-root .lp-code-block .lp-code-string  { color:#059669; }
        .light .lp-root .lp-code-block .lp-code-comment { color:rgba(15,23,42,.34); }
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
          .lp-hero-proofs { grid-template-columns:1fr; }
        }

        /* ── Demo: mobile responsive ── */
        .lp-dd-mobile-hdr { display:none; }
        .lp-dd-tbl-mobile { display:none; }
        .lp-tx-row { animation: lpFadeUp 0.3s ease both; }
        .lp-dd-content { overflow:hidden; scrollbar-width:none; -ms-overflow-style:none; overscroll-behavior:auto; touch-action:auto; }
        .lp-dd-content::-webkit-scrollbar { display:none; }
        .lp-dd-topbar {
          display:flex;
          align-items:center;
          gap:14px;
          min-height:40px;
          padding:0 14px;
          border-bottom:1px solid var(--lp-dd-topbar-border);
          background:var(--lp-dd-topbar-bg);
          backdrop-filter:blur(10px);
        }
        .lp-dd-topbar-logo {
          font-size:12px;
          font-weight:800;
          letter-spacing:-0.2px;
          color:var(--lp-dd-brand);
        }
        .lp-dd-topbar-nav {
          display:flex;
          align-items:center;
          gap:10px;
          font-size:10px;
          font-weight:700;
          letter-spacing:0.8px;
          text-transform:uppercase;
          color:var(--lp-dd-topbar-link);
        }
        .lp-dd-topbar-nav span {
          padding:4px 8px;
          border-radius:999px;
          border:1px solid transparent;
          white-space:nowrap;
        }
        .lp-dd-topbar-nav .lp-dd-topbar-nav-active {
          color:var(--lp-dd-topbar-link-active);
          border-color:var(--lp-dd-topbar-border);
          background:rgba(99,102,241,0.1);
        }
        .lp-dd-topbar-actions {
          margin-left:auto;
          display:flex;
          align-items:center;
          gap:6px;
          color:var(--lp-dd-topbar-text);
        }
        .lp-dd-topbar-icon {
          width:22px;
          height:22px;
          border-radius:999px;
          border:1px solid var(--lp-dd-topbar-border);
          background:rgba(99,102,241,0.08);
          display:inline-flex;
          align-items:center;
          justify-content:center;
          font-size:10px;
        }

        @media(max-width:768px) {
          .lp-root {
            padding:0 16px !important;
          }
          .lp-hero-grid {
            grid-template-columns:1fr;
          }
          .lp-hero-panel {
            padding:16px;
            border-radius:22px;
          }
          .lp-panel-topbar {
            margin-bottom:12px;
          }
          .lp-panel-sub {
            margin-bottom:12px;
          }
          .lp-arch-grid {
            gap:10px;
          }
          .lp-arch-card {
            padding:12px;
            border-radius:16px;
          }
          .lp-arch-head {
            gap:10px;
            margin-bottom:8px;
          }
          .lp-arch-title {
            gap:8px;
            font-size:11px;
          }
          .lp-arch-icon {
            width:30px;
            height:30px;
            border-radius:10px;
          }
          .lp-chip-row {
            gap:6px;
          }
          .lp-chip-strong,
          .lp-chip-soft {
            padding:7px 9px;
            font-size:10px;
          }
          .lp-env-line {
            gap:6px;
            padding:8px 10px;
            border-radius:12px;
            font-size:11px;
          }
          .lp-hero-copy {
            padding:12px 0 0;
            text-align:center;
          }
          .lp-hero-kicker {
            justify-content:center;
          }
          .lp-hero-copy .lp-hero-badge,
          .lp-hero-copy .lp-hero-sub {
            margin-left:auto;
            margin-right:auto;
          }
          .lp-hero-copy .lp-cta-row {
            justify-content:center;
          }
          .lp-signal-strip {
            justify-content:center;
          }
          .lp-switch-grid {
            grid-template-columns:1fr;
          }
          .lp-dd-topbar {
            display:none;
          }
          .lp-switch-bridge {
            margin-top:16px;
          }

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

      <div className="lp-root" style={{ maxWidth: 1440, margin: '0 auto', padding: '0 20px' }}>

        {/* ── HERO ─────────────────────────────────────────── */}
        <section className="lp-hero-shell" style={{ paddingTop: 60, paddingBottom: 0 }}>
          <div className="lp-blob1" />
          <div className="lp-blob2" />
          <div className="lp-hero-grid">
            <div className="lp-hero-copy">
              <div className="lp-hero-kicker">The AI-ready SaaS foundation</div>


              <h1 className="lp-hero-h1">
                Two auth stacks.<br />
                Four payment rails.<br />
                <span
                  style={{
                    backgroundImage: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 54%, #10b981 100%)',
                    backgroundSize: '140% 140%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 10px 30px rgba(99,102,241,0.15)',
                    fontSize: '2.9rem',
                  }}
                >
                  One codebase you can actually ship.
                </span>
              </h1>

              <p className="lp-hero-sub">
                SaaSyBase is more than a boilerplate — it is an AI-friendly SaaS foundation with structured docs (CLAUDE.md, AGENTS.md, PATTERNS.md) that let any LLM understand the full codebase. Clerk or NextAuth behind one interface, Stripe or Paystack or Paddle or Razorpay behind one payment layer, 240+ regression tests, security defaults, and a usage meter you can rename to anything. Prompt your way to production.
              </p>

              <div className="lp-cta-row">
                {isSignedIn ? (
                  <>
                    <Link href="/dashboard" className="lp-btn-primary">Go to Dashboard →</Link>
                    <Link href="/pricing" className="lp-btn-ghost">View Pricing</Link>
                  </>
                ) : (
                  <>
                    <Link href="/sign-up" className="lp-btn-primary">Start Building Free →</Link>
                    <Link href="/sign-in" className="lp-btn-ghost">Sign In</Link>
                    <Link href="/pricing" className="lp-btn-ghost">Pricing</Link>
                  </>
                )}
              </div>

              <div className="lp-hero-proofs">
                {[
                  {
                    value: 'NextAuth or Clerk',
                    copy: 'Provider-agnostic auth architecture with vendor-specific code kept behind adapters.',
                    meta: 'Auth boundary',
                    tone: 'auth',
                  },
                  {
                    value: 'Over 240 tests',
                    copy: 'Regression coverage for webhooks, resurrection, proration, expiry, org access, and checkout flows.',
                    meta: 'Regression coverage',
                    tone: 'tests',
                  },
                  {
                    value: 'Security by default',
                    copy: 'Headers, encrypted fields, secret rotation, sanitized errors, request IDs, rate limits, and redacted logs.',
                    meta: 'Production posture',
                    tone: 'security',
                  },
                  {
                    value: 'LLM-ready docs',
                    copy: 'CLAUDE.md, AGENTS.md, and PATTERNS.md give any AI coding agent full context \u2014 prompt your way to production.',
                    meta: 'Vibecoder-friendly',
                    tone: 'meter',
                  },
                ].map((item, index) => (
                  <div key={item.value} className={`lp-proof-card lp-proof-card-${item.tone}`} style={{ animationDelay: `${180 + index * 70}ms` }}>
                    <div className="lp-proof-meta"><span className="lp-proof-dot" />{item.meta}</div>
                    <div className="lp-proof-kpi">{item.value}</div>
                    <div className="lp-proof-copy">{item.copy}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lp-hero-panel">
              <div className="lp-panel-topbar">
                <span className="lp-panel-dot" style={{ background: '#ff5f56' }} />
                <span className="lp-panel-dot" style={{ background: '#ffbd2e' }} />
                <span className="lp-panel-dot" style={{ background: '#27c93f' }} />
                <span className="lp-panel-label">Next.js 16 Boilerplate</span>
              </div>

              <div className="lp-panel-title">Built for professionals & vibecoders.</div>
              <div className="lp-panel-sub">
                LLM-ready docs (CLAUDE.md, AGENTS.md, PATTERNS.md) let your AI agent understand the entire codebase — so you can prompt your way to a finished product.
              </div>

              <div className="lp-arch-grid">
                <div className="lp-arch-card">
                  <div className="lp-arch-head">
                    <div className="lp-arch-title">
                      <span className="lp-arch-icon"><FontAwesomeIcon icon={faLock} /></span>
                      Auth Layer
                    </div>
                    <span className="lp-chip-soft">Swap providers</span>
                  </div>
                  <div className="lp-chip-row" style={{ marginBottom: 10 }}>
                    <span className="lp-chip-strong">Clerk</span>
                    <span className="lp-chip-strong">NextAuth</span>
                    <span className="lp-chip-soft">OAuth</span>
                    <span className="lp-chip-soft">Magic links</span>
                  </div>
                  <div className="lp-env-line">
                    <span className="lp-code-key">AUTH_PROVIDER</span>
                    <span>=</span>
                    <span className="lp-code-string">&quot;clerk&quot;</span>
                    <span className="lp-code-comment">or</span>
                    <span className="lp-code-string">&quot;nextauth&quot;</span>
                  </div>
                </div>

                <div className="lp-arch-card">
                  <div className="lp-arch-head">
                    <div className="lp-arch-title">
                      <span className="lp-arch-icon"><FontAwesomeIcon icon={faCreditCard} /></span>
                      Billing Layer
                    </div>
                    <span className="lp-chip-soft">One checkout lifecycle</span>
                  </div>
                  <div className="lp-chip-row" style={{ marginBottom: 10 }}>
                    <span className="lp-chip-strong">Stripe</span>
                    <span className="lp-chip-strong">Paystack</span>
                    <span className="lp-chip-strong">Razorpay</span>
                    <span className="lp-chip-strong">Paddle</span>
                  </div>
                  <div className="lp-env-line">
                    <span className="lp-code-key">PAYMENT_PROVIDER</span>
                    <span>=</span>
                    <span className="lp-code-string">&quot;stripe&quot;</span>
                    <span className="lp-code-comment">→ provider-agnostic routes, webhooks, plans</span>
                  </div>
                </div>

                <div className="lp-arch-card">
                  <div className="lp-arch-head">
                    <div className="lp-arch-title">
                      <span className="lp-arch-icon"><FontAwesomeIcon icon={faShield} /></span>
                      Safeguards
                    </div>
                    <span className="lp-chip-soft">Production posture</span>
                  </div>
                  <div className="lp-chip-row">
                    <span className="lp-chip-soft">Webhook signature rotation</span>
                    <span className="lp-chip-soft">Request IDs</span>
                    <span className="lp-chip-soft">Audit logs</span>
                    <span className="lp-chip-soft">Encrypted fields</span>
                    <span className="lp-chip-soft">Rate limits</span>
                    <span className="lp-chip-soft">Sanitized errors</span>
                  </div>
                </div>

                <div className="lp-arch-card">
                  <div className="lp-arch-head">
                    <div className="lp-arch-title">
                      <span className="lp-arch-icon"><FontAwesomeIcon icon={faGear} /></span>
                      Product Surface
                    </div>
                    <span className="lp-chip-soft">Brand without rewrites</span>
                  </div>
                  <div className="lp-chip-row" style={{ marginBottom: 10 }}>
                    <span className="lp-chip-soft">Theme designer</span>
                    <span className="lp-chip-soft">Custom CSS / head / body</span>
                    <span className="lp-chip-soft">Light + dark palettes</span>
                    <span className="lp-chip-soft">Reusable components</span>
                    <span className="lp-chip-soft">32-section README</span>
                  </div>
                  <div className="lp-env-line">
                    <span className="lp-code-key">tokenName</span>
                    <span>=</span>
                    <span className="lp-code-string">&quot;API calls&quot;</span>
                    <span className="lp-code-comment">or &quot;HD exports&quot;, &quot;credits&quot;, &quot;points&quot;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* ── DASHBOARD DEMO ──────────────────────────────── */}
        <section style={{ marginBottom: 0, marginTop: 58 }}>
          <div style={{ textAlign: 'center' }}>
          <div className="lp-section-tag">What ships on day one</div>
          <h2 className="lp-section-h2">Launch with billing, users, and ops already working.</h2>
          <p className="lp-section-sub" style={{ marginBottom: 40 }}>
            Skip months of stitching tools together. SaaSyBase gives you the admin surface, payment visibility, and operational control a real SaaS product needs from the start.
          </p>
          </div>
          {mounted && (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <div className="lp-demo-wrap">
                <DashboardDemo />
              </div>
              <p className="lp-demo-hint">↑ Animated product preview — finance, users, and operations in one flow</p>
            </div>
          )}
          <div className="lp-signal-strip" style={{ marginTop: 40 }}>
            {[
              { icon: faArrowsRotate, label: 'Subscription resurrection covered' },
              { icon: faFileLines, label: 'Centralized webhook ingress' },
              { icon: faGaugeHigh, label: 'No-flash dark mode + theme controls' },
              { icon: faUsers, label: 'Teams, invites, org token pools' },
              { icon: faShield, label: 'Secure logger with secret redaction' },
              { icon: faBolt, label: 'Edge cases tested before you launch' },
              { icon: faLock, label: 'Provider-agnostic auth and billing adapters' },
              { icon: faChartLine, label: '240+ regression tests across critical flows' },
              { icon: faTriangleExclamation, label: 'Rate limits, request IDs, sanitized errors' },
              { icon: faBuilding, label: 'Dual-column compatibility for safe migrations' },
              { icon: faCreditCard, label: 'Proration, retries, refunds, and lifecycle states' },
              { icon: faLifeRing, label: 'Admin actions and support workflows already wired' },
            ].map((signal) => (
              <span key={signal.label} className="lp-signal-pill">
                <FontAwesomeIcon icon={signal.icon} />
                {signal.label}
              </span>
            ))}
          </div>
        </section>

        {/* ── METRICS ─────────────────────────────────────── */}
        <div className="lp-metrics">
          {[
            { num: 47, label: 'built-in API routes',   suffix: '+' },
            { num: 4,  label: 'payment providers',      suffix: '' },
            { num: 244, label: 'regression tests',      suffix: '' },
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
          <div className="lp-tech-icons lp-marquee-outer" aria-label="Technology used in SaaSyBase">
            <div className="lp-marquee-inner lp-tech-marquee-inner">
              {TECH_STACK_ICONS.map((tech, index) => (
                <span key={`tech-primary-${tech.label}-${index}`} className="lp-tech-icon" title={tech.label} aria-label={tech.label}>
                  {tech.kind === 'fa' ? (
                    <FontAwesomeIcon icon={tech.icon as never} />
                  ) : (
                    <span aria-hidden dangerouslySetInnerHTML={{ __html: tech.svg }} />
                  )}
                </span>
              ))}
              {TECH_STACK_ICONS.map((tech, index) => (
                <span key={`tech-loop-${tech.label}-${index}`} className="lp-tech-icon" title={tech.label} aria-hidden="true">
                  {tech.kind === 'fa' ? (
                    <FontAwesomeIcon icon={tech.icon as never} />
                  ) : (
                    <span aria-hidden dangerouslySetInnerHTML={{ __html: tech.svg }} />
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        <hr className="lp-divider" />

        {/* ── PROVIDERS ─────────────────────────────────────── */}
        <section style={{ textAlign: 'center' }}>
          <div className="lp-section-tag">Switchable infrastructure</div>
          <h2 className="lp-section-h2">Four payment rails. Two auth providers.</h2>
          <p className="lp-section-sub">
            The billing layer and the auth layer are both swappable, so you can change vendors without rewriting your product surface.
          </p>

          <div className="lp-switch-grid">
            <div className="lp-switch-card lp-switch-card-pay">
              <div className="lp-switch-kicker"><span className="lp-switch-kicker-dot" />Payments</div>
              <div className="lp-switch-title">One checkout model across four processors.</div>
              <div className="lp-switch-sub">
                Stripe, Paystack, Razorpay, and Paddle all plug into the same plans, routes, webhooks, and admin flows.
              </div>
              <div className="lp-provider-row" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
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
                <div><span className="lp-code-comment"># .env — switch the billing rail</span></div>
                <div>
                  <span className="lp-code-key">PAYMENT_PROVIDER</span>
                  <span className="lp-code-comment"> = </span>
                  {mounted ? <TypewriterProvider /> : <span className="lp-code-string">&quot;stripe&quot;</span>}
                </div>
                <div><span className="lp-code-comment"># stripe | razorpay | paystack | paddle</span></div>
              </div>
            </div>

            <div className="lp-switch-card lp-switch-card-auth">
              <div className="lp-switch-kicker"><span className="lp-switch-kicker-dot" />Authentication</div>
              <div className="lp-switch-title">Self-hosted NextAuth or just Clerk</div>
              <div className="lp-switch-sub">
                Clerk and NextAuth sit behind the same integration boundary, so account flows can stay stable while your auth provider changes.
              </div>
              <div className="lp-provider-row" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                {AUTH_PROVIDERS.map((provider) => (
                  <div key={provider.name} className="lp-provider-chip">
                    <span
                      className="lp-auth-provider-logo"
                      aria-hidden
                      dangerouslySetInnerHTML={{ __html: provider.logoSvg }}
                    />
                    {provider.name}
                  </div>
                ))}
                <div className="lp-provider-chip">OAuth</div>
                <div className="lp-provider-chip">Magic links</div>
              </div>

              <div className="lp-code-block">
                <div><span className="lp-code-comment"># .env — switch the auth layer</span></div>
                <div>
                  <span className="lp-code-key">AUTH_PROVIDER</span>
                  <span className="lp-code-comment"> = </span>
                  {mounted ? <TypewriterAuthProvider /> : <span className="lp-code-string">&quot;clerk&quot;</span>}
                </div>
                <div><span className="lp-code-comment"># clerk | nextauth</span></div>
              </div>

            </div>
          </div>
          <div className="lp-switch-bridge">Shared interface above vendor-specific code</div>
        </section>

        <hr className="lp-divider" />

        {/* ── HOW IT WORKS ─────────────────────────────────── */}
        <section style={{ textAlign: 'center' }}>
          <div className="lp-section-tag">Zero to production</div>
          <h2 className="lp-section-h2">Deploy in three steps.</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 36 }}>
            {[
              { step: '01', title: 'Clone & configure', desc: 'Clone the repo, fill in your .env, pick your auth and payment providers, then run the migrations.' },
              { step: '02', title: 'Prompt in your product', desc: 'Use the starter as the shell, then scaffold your own app surface into it with prompts, copied modules, or direct component swaps.' },
              { step: '03', title: 'Brand, deploy & collect', desc: 'Polish the theme, connect your provider, deploy to Vercel, and start charging without rebuilding the infrastructure layer.' },
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
