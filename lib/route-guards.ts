import { redirect } from 'next/navigation';
import {
  getAuthSafe,
  isAuthGuardError,
  requireAdmin,
  requireAdminOrModerator,
  type AdminOrModeratorContext,
} from './auth';
import { ModeratorSection } from './moderator';

const DEFAULT_USER_RETURN_PATH = '/dashboard';
const DEFAULT_ADMIN_RETURN_PATH = '/admin';

export type RouteSearchParams = Record<string, string | string[] | undefined>;

function sanitizeReturnPath(returnPath?: string | null): string {
  if (!returnPath || typeof returnPath !== 'string') {
    return DEFAULT_USER_RETURN_PATH;
  }

  let candidate = returnPath.trim();
  if (!candidate) {
    return DEFAULT_USER_RETURN_PATH;
  }

  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    try {
      const url = new URL(candidate);
      candidate = `${url.pathname}${url.search}` || DEFAULT_USER_RETURN_PATH;
    } catch {
      return DEFAULT_USER_RETURN_PATH;
    }
  }

  if (!candidate.startsWith('/')) {
    return DEFAULT_USER_RETURN_PATH;
  }

  if (candidate === '/sign-in' || candidate.startsWith('/sign-in/')) {
    return DEFAULT_USER_RETURN_PATH;
  }

  if (candidate === '/sign-up' || candidate.startsWith('/sign-up/')) {
    return DEFAULT_USER_RETURN_PATH;
  }

  return candidate;
}

function buildSignInRedirect(returnPath?: string | null) {
  const sanitized = sanitizeReturnPath(returnPath);
  const params = new URLSearchParams({ redirect_url: sanitized });
  return `/sign-in?${params.toString()}`;
}

export function buildSignInRedirectUrl(returnPath?: string | null) {
  return buildSignInRedirect(returnPath);
}

function ensureBasePath(basePath: string | undefined): string {
  if (!basePath || typeof basePath !== 'string') {
    return DEFAULT_USER_RETURN_PATH;
  }

  const trimmed = basePath.trim();
  if (!trimmed) {
    return DEFAULT_USER_RETURN_PATH;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return `/${trimmed.replace(/^\/+/, '')}`;
}

export function buildReturnPath(basePath: string, searchParams?: RouteSearchParams) {
  const normalizedBase = ensureBasePath(basePath);

  if (!searchParams || Object.keys(searchParams).length === 0) {
    return sanitizeReturnPath(normalizedBase);
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          params.append(key, entry);
        }
      }
    }
  }

  const query = params.toString();
  const fullPath = query ? `${normalizedBase}?${query}` : normalizedBase;
  return sanitizeReturnPath(fullPath);
}

export async function requireAuth(returnPath?: string): Promise<{ userId: string; orgId?: string | null }> {
  const auth = await getAuthSafe();
  if (!auth?.userId) {
    redirect(buildSignInRedirect(returnPath ?? DEFAULT_USER_RETURN_PATH));
  }
  return { userId: auth.userId, orgId: auth.orgId };
}

export async function requireAdminAuth(returnPath?: string): Promise<{ userId: string }> {
  try {
    const userId = await requireAdmin();
    return { userId };
  } catch (error) {
    if (isAuthGuardError(error) && error.code === 'UNAUTHENTICATED') {
      redirect(buildSignInRedirect(returnPath ?? DEFAULT_ADMIN_RETURN_PATH));
    }

    redirect('/access-denied');
  }
}

export async function requireAdminSectionAccess(section: ModeratorSection): Promise<AdminOrModeratorContext> {
  try {
    return await requireAdminOrModerator(section);
  } catch {
    redirect('/access-denied');
  }
}

export async function requireAdminAreaActor(): Promise<AdminOrModeratorContext> {
  try {
    return await requireAdminOrModerator();
  } catch {
    redirect('/access-denied');
  }
}
