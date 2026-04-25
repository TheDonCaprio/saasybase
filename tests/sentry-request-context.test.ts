import { afterEach, describe, expect, it } from 'vitest'

import {
  getSentryBaseTags,
  getSentryInitOptions,
  isSentryDevelopmentCaptureEnabled,
  isSentryRuntimeEnabled,
  isSentryRuntimeInitialized,
  markSentryRuntimeInitialized,
  shouldForwardLoggerEventsToSentry,
} from '../lib/sentry'

describe('Sentry runtime helpers', () => {
  const env = process.env as Record<string, string | undefined>
  const originalValues = {
    SENTRY_ENABLED: process.env.SENTRY_ENABLED,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_CAPTURE_IN_DEVELOPMENT: process.env.SENTRY_CAPTURE_IN_DEVELOPMENT,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    AUTH_PROVIDER: process.env.AUTH_PROVIDER,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  }

  afterEach(() => {
    env.SENTRY_ENABLED = originalValues.SENTRY_ENABLED
    env.SENTRY_DSN = originalValues.SENTRY_DSN
    env.NEXT_PUBLIC_SENTRY_DSN = originalValues.NEXT_PUBLIC_SENTRY_DSN
    env.SENTRY_CAPTURE_IN_DEVELOPMENT = originalValues.SENTRY_CAPTURE_IN_DEVELOPMENT
    env.SENTRY_ENVIRONMENT = originalValues.SENTRY_ENVIRONMENT
    env.AUTH_PROVIDER = originalValues.AUTH_PROVIDER
    env.PAYMENT_PROVIDER = originalValues.PAYMENT_PROVIDER
  })

  it('requires a public DSN for client-side enablement', () => {
    env.SENTRY_ENABLED = 'true'
    env.SENTRY_DSN = 'https://server@example.ingest.sentry.io/1'
    env.NEXT_PUBLIC_SENTRY_DSN = ''

    expect(isSentryRuntimeEnabled('server')).toBe(true)
    expect(isSentryRuntimeEnabled('client')).toBe(false)
  })

  it('allows client-side enablement from the public DSN alone', () => {
    env.SENTRY_ENABLED = undefined
    env.SENTRY_DSN = ''
    env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/2'

    expect(isSentryRuntimeEnabled('client')).toBe(true)
  })

  it('builds init options with runtime and provider tags', () => {
    env.SENTRY_ENABLED = 'true'
    env.SENTRY_DSN = 'https://server@example.ingest.sentry.io/1'
    env.SENTRY_ENVIRONMENT = 'staging'
    env.AUTH_PROVIDER = 'betterauth'
    env.PAYMENT_PROVIDER = 'stripe'

    const options = getSentryInitOptions('server')
    const tags = getSentryBaseTags('server')

    expect(options.environment).toBe('staging')
    expect(options.initialScope.tags).toMatchObject({
      runtime: 'server',
      next_runtime: 'server',
      auth_provider: 'betterauth',
      payment_provider: 'stripe',
    })
    expect(tags).toMatchObject({
      runtime: 'server',
      auth_provider: 'betterauth',
      payment_provider: 'stripe',
    })
  })

  it('tracks per-runtime initialization state', () => {
    expect(isSentryRuntimeInitialized('edge')).toBe(false)
    markSentryRuntimeInitialized('edge')
    expect(isSentryRuntimeInitialized('edge')).toBe(true)
  })

  it('supports opt-in logger fan-out in development', () => {
    env.NODE_ENV = 'development'
    env.SENTRY_CAPTURE_IN_DEVELOPMENT = 'true'

    expect(isSentryDevelopmentCaptureEnabled()).toBe(true)
    expect(shouldForwardLoggerEventsToSentry()).toBe(true)
  })
})