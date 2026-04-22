import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'

import { getSentryBaseTags, isSentryRuntimeEnabled } from './lib/sentry'

const runtime = process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'server'

export async function register(): Promise<void> {
  if (runtime === 'edge') {
    await import('./sentry.edge.config')
    return
  }

  await import('./sentry.server.config')
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (!isSentryRuntimeEnabled(runtime)) {
    return
  }

  Sentry.withScope((scope) => {
    const tags = {
      ...getSentryBaseTags(runtime),
      source: 'next-instrumentation',
      route_type: context.routeType,
      router_kind: context.routerKind,
    }

    for (const [key, value] of Object.entries(tags)) {
      if (value) {
        scope.setTag(key, value)
      }
    }

    scope.setExtras({
      requestPath: request.path,
      requestMethod: request.method,
      routePath: context.routePath,
      renderSource: 'renderSource' in context ? context.renderSource : undefined,
      renderType: 'renderType' in context ? context.renderType : undefined,
      revalidateReason: 'revalidateReason' in context ? context.revalidateReason : undefined,
      digest: error instanceof Error && 'digest' in error ? error.digest : undefined,
    })

    Sentry.captureRequestError(error, request, context)
  })
}