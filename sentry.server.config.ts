import * as Sentry from '@sentry/nextjs'

import { getSentryInitOptions, isSentryRuntimeEnabled, isSentryRuntimeInitialized, markSentryRuntimeInitialized } from './lib/sentry'

if (isSentryRuntimeEnabled('server') && !isSentryRuntimeInitialized('server')) {
  Sentry.init(getSentryInitOptions('server'))
  markSentryRuntimeInitialized('server')
}