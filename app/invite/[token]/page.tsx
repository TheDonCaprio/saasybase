import Link from 'next/link';
import { notFound } from 'next/navigation';
import { authService } from '@/lib/auth-provider';
import { prisma } from '../../../lib/prisma';
import { dashboardPanelClass } from '../../../components/dashboard/dashboardSurfaces';
import { InviteAcceptanceClient } from '../../../components/team/InviteAcceptanceClient';

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

function normalizeToken(value: string | string[] | undefined) {
  if (!value) return null;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length ? trimmed : null;
}

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: InvitePageProps) {
  const resolved = await params;
  const token = normalizeToken(resolved?.token);
  if (!token) {
    notFound();
  }

  const invite = await prisma.organizationInvite.findUnique({
    where: { token },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!invite || !invite.organization) {
    notFound();
  }

  const { userId } = await authService.getSession();
  const viewer = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } })
    : null;
  const now = new Date();

  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt) : null;
  const expired = invite.status === 'EXPIRED' || (expiresAt ? expiresAt.getTime() < now.getTime() : false);
  const accepted = invite.status === 'ACCEPTED';

  const existingMembership = userId
    ? await prisma.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invite.organizationId,
            userId,
          },
        },
        select: { id: true },
      })
    : null;

  return (
    <div className="flex justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className={dashboardPanelClass('w-full max-w-2xl space-y-6')}>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-neutral-400">Workspace invite</p>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-neutral-50">Join {invite.organization.name}</h1>
          <p className="text-sm text-slate-600 dark:text-neutral-400">Accept the invite with the email it was sent to and you’ll be routed to the shared dashboard.</p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
          <p><span className="font-semibold">Sent to:</span> {invite.email}</p>
          {expiresAt ? <p><span className="font-semibold">Expires:</span> {expiresAt.toLocaleString()}</p> : null}
        </div>

        {expired ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
            This invite has expired. Ask the workspace owner to send a new one.
          </div>
        ) : accepted ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            This invite was already accepted. You can head to the dashboard once you’re signed in.
          </div>
        ) : userId ? (
          <InviteAcceptanceClient
            token={token}
            organizationName={invite.organization.name}
            inviteEmail={invite.email}
            viewerEmail={viewer?.email ?? null}
            alreadyMember={Boolean(existingMembership)}
          />
        ) : (
          <div className="space-y-3 text-sm text-slate-600 dark:text-neutral-300">
            <p>Sign in with the email that received this invite, then return here to finish joining the workspace.</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`}
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Sign in
              </Link>
              <Link
                href={`/sign-up?redirect_url=${encodeURIComponent(`/invite/${token}`)}`}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2 font-semibold text-slate-700 transition hover:border-indigo-500 hover:text-indigo-600 dark:border-neutral-700 dark:text-neutral-100"
              >
                Create account
              </Link>
            </div>
          </div>
        )}

        <div className="text-xs text-slate-500 dark:text-neutral-500">
          Need help? <Link href="/dashboard/support" className="font-semibold text-indigo-600 dark:text-indigo-300">Contact support</Link> and include this invitation email.
        </div>
      </div>
    </div>
  );
}
