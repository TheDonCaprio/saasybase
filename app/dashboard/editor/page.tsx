export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  return {
    title: 'Redirecting…',
  };
}

export default async function DashboardEditorPage({ searchParams }: PageProps) {
  void searchParams;
  redirect('/dashboard');
}
