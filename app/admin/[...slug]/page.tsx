import { redirect } from 'next/navigation';

export default function UnknownAdminRoutePage() {
  redirect('/404');
}