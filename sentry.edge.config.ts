import * as Sentry from '@sentry/nextjs'

import { getSentryInitOptions, isSentryRuntimeEnabled, isSentryRuntimeInitialized, markSentryRuntimeInitialized } from './lib/sentry'

if (isSentryRuntimeEnabled('edge') && !isSentryRuntimeInitialized('edge')) {
  Sentry.init(getSentryInitOptions('edge'))
  markSentryRuntimeInitialized('edge')
}