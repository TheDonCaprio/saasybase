import { redirect } from 'next/navigation';

export default function UnknownDashboardRoutePage() {
  redirect('/404');
}