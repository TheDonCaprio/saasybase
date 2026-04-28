type SentryModule = typeof import('@sentry/nextjs')
export type SentryRuntime = 'server' | 'edge' | 'client'

type CaptureContext = {
  extras?: Record<string, unknown>
  tags?: Record<string, string>
}

type SentryApi = {
  init?: (options: ReturnType<typeof getSentryInitOptions>) => void
  withScope?: (callback: (scope: {
    setTag: (key: string, value: string) => void
    setExtras: (extras: Record<string, unknown>) => void
  }) => void) => void
  captureMessage?: (message: string, level?: 'warning' | 'error' | 'info') => string
  captureException?: (error: unknown) => string
  flush?: (timeoutMs?: number) => Promise<boolean>
}

let sentryModulePromise: Promise<SentryModule | null> | null = null
let initPromise: Promise<boolean> | null = null

type GlobalSentryState = Record<SentryRuntime, boolean>

const SENTRY_STATE_KEY = '__saasybaseSentryRuntimeState__'

function getGlobalSentryState(): GlobalSentryState {
  const globalState = globalThis as typeof globalThis & {
    [SENTRY_STATE_KEY]?: GlobalSentryState
  }

  globalState[SENTRY_STATE_KEY] ??= {
    server: false,
    edge: false,
    client: false,
  }

  return globalState[SENTRY_STATE_KEY]
}

function getCurrentRuntime(): SentryRuntime {
  if (typeof window !== 'undefined') {
    return 'client'
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    return 'edge'
  }

  return 'server'
}

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isSentryDevelopmentCaptureEnabled(): boolean {
  return isTruthyFlag(process.env.SENTRY_CAPTURE_IN_DEVELOPMENT)
}

export function shouldForwardLoggerEventsToSentry(): boolean {
  return process.env.NODE_ENV === 'production' || isSentryDevelopmentCaptureEnabled()
}

function getSentryDsn(runtime: SentryRuntime): string {
  if (runtime === 'client') {
    return process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || ''
  }

  return process.env.SENTRY_DSN?.trim() || ''
}

function getSentryEnvironment(): string {
  if (process.env.SENTRY_ENVIRONMENT?.trim()) {
    return process.env.SENTRY_ENVIRONMENT.trim()
  }

  return process.env.NODE_ENV || 'development'
}

export function getSentryBaseTags(runtime: SentryRuntime = getCurrentRuntime()): Record<string, string> {
  const tags: Record<string, string> = {
    runtime,
  }

  const authProvider = process.env.AUTH_PROVIDER || process.env.NEXT_PUBLIC_AUTH_PROVIDER
  const paymentProvider = process.env.PAYMENT_PROVIDER || process.env.NEXT_PUBLIC_PAYMENT_PROVIDER

  if (authProvider) {
    tags.auth_provider = authProvider
  }

  if (paymentProvider) {
    tags.payment_provider = paymentProvider
  }

  return tags
}

export function isSentryEnabled(): boolean {
  return isSentryRuntimeEnabled(getCurrentRuntime())
}

export function isSentryRuntimeEnabled(runtime: SentryRuntime): boolean {
  if (runtime === 'client') {
    return getSentryDsn(runtime).length > 0
  }

  return isTruthyFlag(process.env.SENTRY_ENABLED) && getSentryDsn(runtime).length > 0
}

export function isSentryRuntimeInitialized(runtime: SentryRuntime): boolean {
  return getGlobalSentryState()[runtime]
}

export function markSentryRuntimeInitialized(runtime: SentryRuntime): void {
  getGlobalSentryState()[runtime] = true
}

export function getSentryInitOptions(runtime: SentryRuntime): {
  dsn: string
  enabled: true
  environment: string
  release?: string
  sendDefaultPii: false
  initialScope: {
    tags: Record<string, string>
  }
} {
  return {
    dsn: getSentryDsn(runtime),
    enabled: true,
    environment: getSentryEnvironment(),
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    sendDefaultPii: false,
    initialScope: {
      tags: {
        ...getSentryBaseTags(runtime),
        next_runtime: runtime,
      },
    },
  }
}

async function loadSentryModule(): Promise<SentryModule | null> {
  if (!isSentryRuntimeEnabled(getCurrentRuntime())) {
    return null
  }

  sentryModulePromise ??= import('@sentry/nextjs').catch(() => null)
  return sentryModulePromise
}

function getSentryApi(module: SentryModule): SentryApi {
  const moduleWithDefault = module as SentryModule & { default?: SentryApi }

  return {
    init: typeof module.init === 'function' ? module.init : moduleWithDefault.default?.init,
    withScope: typeof module.withScope === 'function' ? module.withScope : moduleWithDefault.default?.withScope,
    captureMessage:
      typeof module.captureMessage === 'function'
        ? module.captureMessage
        : moduleWithDefault.default?.captureMessage,
    captureException:
      typeof module.captureException === 'function'
        ? module.captureException
        : moduleWithDefault.default?.captureException,
    flush: typeof module.flush === 'function' ? module.flush : moduleWithDefault.default?.flush,
  }
}

async function ensureSentryInitialized(): Promise<boolean> {
  const runtime = getCurrentRuntime()

  if (isSentryRuntimeInitialized(runtime)) {
    return true
  }

  initPromise ??= (async () => {
    const sentry = await loadSentryModule()
    const dsn = getSentryDsn(runtime)

    if (!sentry || !dsn) {
      return false
    }

    const api = getSentryApi(sentry)

    if (typeof api.init !== 'function') {
      return false
    }

    api.init(getSentryInitOptions(runtime))
    markSentryRuntimeInitialized(runtime)
    return true
  })().finally(() => {
    initPromise = null
  })

  return initPromise
}

function applyScopeContext(scope: {
  setTag: (key: string, value: string) => void
  setExtras: (extras: Record<string, unknown>) => void
}, context?: CaptureContext): void {
  const tags = {
    ...getSentryBaseTags(),
    ...(context?.tags || {}),
  }

  for (const [key, value] of Object.entries(tags)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      scope.setTag(key, value)
    }
  }

  if (context?.extras && Object.keys(context.extras).length > 0) {
    scope.setExtras(context.extras)
  }
}

export async function captureSentryMessage(
  message: string,
  level: 'warning' | 'error' | 'info' = 'error',
  context?: CaptureContext,
): Promise<string | undefined> {
  if (!(await ensureSentryInitialized())) {
    return undefined
  }

  const sentry = await loadSentryModule()
  if (!sentry) {
    return undefined
  }

  const api = getSentryApi(sentry)
  if (typeof api.captureMessage !== 'function') {
    return undefined
  }

  let eventId: string | undefined
  if (typeof api.withScope === 'function') {
    api.withScope((scope) => {
      applyScopeContext(scope, context)
      eventId = api.captureMessage?.(message, level)
    })
  } else {
    eventId = api.captureMessage(message, level)
  }

  return eventId
}

export async function captureSentryException(error: unknown, context?: CaptureContext): Promise<string | undefined> {
  if (!(await ensureSentryInitialized())) {
    return undefined
  }

  const sentry = await loadSentryModule()
  if (!sentry) {
    return undefined
  }

  const api = getSentryApi(sentry)
  if (typeof api.captureException !== 'function') {
    return undefined
  }

  let eventId: string | undefined
  if (typeof api.withScope === 'function') {
    api.withScope((scope) => {
      applyScopeContext(scope, context)
      eventId = api.captureException?.(error)
    })
  } else {
    eventId = api.captureException(error)
  }

  return eventId
}

export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!(await ensureSentryInitialized())) {
    return false
  }

  const sentry = await loadSentryModule()
  if (!sentry) {
    return false
  }

  const api = getSentryApi(sentry)
  if (typeof api.flush !== 'function') {
    return false
  }

  try {
    return await api.flush(timeoutMs)
  } catch {
    return false
  }
}

export async function captureClientRenderError(
  error: Error & { digest?: string },
  boundary: 'app' | 'global',
): Promise<void> {
  const extras: Record<string, unknown> = {}

  if (error.digest) {
    extras.digest = error.digest
  }

  await captureSentryException(error, {
    tags: {
      boundary,
      surface: 'react-error-boundary',
    },
    extras,
  })
}