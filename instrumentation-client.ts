import * as Sentry from '@sentry/nextjs'

import { getSentryInitOptions, isSentryRuntimeEnabled, isSentryRuntimeInitialized, markSentryRuntimeInitialized } from './lib/sentry'

if (isSentryRuntimeEnabled('client') && !isSentryRuntimeInitialized('client')) {
  Sentry.init(getSentryInitOptions('client'))
  markSentryRuntimeInitialized('client')
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart