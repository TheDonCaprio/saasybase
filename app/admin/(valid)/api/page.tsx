import { redirect } from 'next/navigation';
import { requireAdminPageAccess } from '../../../../lib/route-guards';

export default async function AdminApiPage() {
  await requireAdminPageAccess('/admin/api');
  redirect('/docs/api');
}
