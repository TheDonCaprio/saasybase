// Secure logging system for production safety
// This replaces console.log statements throughout the application

import { prisma } from './prisma'

const MAX_PERSISTED_LOGS = 1000
const PERSIST_PRUNE_PROBABILITY = 0.05
let unmigratedDbHealthWarned = false
let systemLogAvailability: 'unknown' | 'available' | 'missing' = 'unknown'
let systemLogAvailabilityPromise: Promise<boolean> | null = null

export function emitUnmigratedDbHealthWarningOnce(missingTable: 'Setting' | 'SystemLog' | 'unknown' = 'unknown'): void {
  if (process.env.NODE_ENV === 'test') return
  if (unmigratedDbHealthWarned) return
  unmigratedDbHealthWarned = true
  console.warn(`[HEALTH WARNING] Unmigrated database detected (missing ${missingTable} table); running with fallback defaults and reduced persistence.`)
}

export class SecureLogger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private isProduction = process.env.NODE_ENV === 'production'
  private systemLogUnavailable = false

  private sanitizeData(data: unknown): unknown {
    if (!data) return data

    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'authorization',
      'stripe_secret', 'clerk_secret', 'webhook_secret',
      'stripeSecretKey', 'clerkSecretKey', 'webhookSecret',
    ]

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item))
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) }
      for (const key of Object.keys(sanitized)) {
        const lowerKey = key.toLowerCase()
        if (sensitiveKeys.some(s => lowerKey.includes(s))) {
          sanitized[key] = '[REDACTED]'
        } else if (typeof sanitized[key] === 'object') {
          sanitized[key] = this.sanitizeData(sanitized[key])
        }
      }
      return sanitized
    }

    return data
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString()
    const sanitized = this.sanitizeData(data)
    return `[${timestamp}] ${level}: ${message}${sanitized ? ' | Data: ' + JSON.stringify(sanitized) : ''}`
  }

  private serializeForStorage(input: unknown): string | null {
    if (input === undefined || input === null) return null
    try {
      return JSON.stringify(input)
    } catch {
      const fallback = typeof input === 'object' ? Object.prototype.toString.call(input) : String(input)
      try {
        return JSON.stringify({ value: fallback })
      } catch {
        return fallback
      }
    }
  }

  private getSystemLogDelegate() {
    const maybeClient = (prisma as unknown as {
      systemLog?: {
        create: (args: { data: { level: string; message: string; meta?: string | null; context?: string | null } }) => Promise<unknown>
        findMany: (args: { select: { id: true }; orderBy: { createdAt: 'desc' }; skip: number }) => Promise<Array<{ id: string }>>
        deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown>
      }
    }).systemLog

    return maybeClient ?? null
  }

  private async ensureSystemLogAvailable(): Promise<boolean> {
    if (this.systemLogUnavailable || systemLogAvailability === 'missing') {
      this.systemLogUnavailable = true
      return false
    }

    if (systemLogAvailability === 'available') {
      return true
    }

    if (!systemLogAvailabilityPromise) {
      systemLogAvailabilityPromise = (async () => {
        try {
          const result = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'SystemLog' LIMIT 1"
          )
          const exists = Array.isArray(result) && result.length > 0
          systemLogAvailability = exists ? 'available' : 'missing'
          if (!exists) {
            emitUnmigratedDbHealthWarningOnce('SystemLog')
          }
          return exists
        } catch {
          systemLogAvailability = 'unknown'
          return true
        } finally {
          systemLogAvailabilityPromise = null
        }
      })()
    }

    const available = await systemLogAvailabilityPromise
    if (!available) {
      this.systemLogUnavailable = true
    }
    return available
  }

  private async persistLog(level: 'WARN' | 'ERROR', message: string, data?: unknown, context?: Record<string, unknown>): Promise<void> {
    if (this.systemLogUnavailable) {
      return
    }

    const systemLogAvailable = await this.ensureSystemLogAvailable()
    if (!systemLogAvailable) {
      return
    }

    const metaPayload = this.serializeForStorage(this.sanitizeData(data))
    const contextPayload = context ? this.serializeForStorage(this.sanitizeData(context)) : null
    const delegate = this.getSystemLogDelegate()

    if (!delegate) {
      return
    }

    try {
      await delegate.create({
        data: {
          level: level.toLowerCase(),
          message,
          meta: metaPayload,
          context: contextPayload,
        }
      })

      if (Math.random() < PERSIST_PRUNE_PROBABILITY) {
        const overflowEntries = await delegate.findMany({
          select: { id: true },
          orderBy: { createdAt: 'desc' },
          skip: MAX_PERSISTED_LOGS,
        })

        if (overflowEntries.length > 0) {
          const overflowIds = overflowEntries.map((entry) => entry.id)
          await delegate.deleteMany({ where: { id: { in: overflowIds } } })
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err ?? '')
      if (errorMessage.includes('P2021') || errorMessage.includes('main.SystemLog') || errorMessage.includes('table `main.SystemLog` does not exist')) {
        this.systemLogUnavailable = true
        systemLogAvailability = 'missing'
        emitUnmigratedDbHealthWarningOnce('SystemLog')
        return
      }
      if (this.isDevelopment) {
        console.warn('[LOGGER] Failed to persist log entry', err)
      }
    }
  }

  debug(message: string, data?: unknown, _context?: Record<string, unknown>): void {
    const formatted = this.formatMessage('DEBUG', message, data)
    if (this.isDevelopment) console.debug(formatted)
    void _context;
  }

  info(message: string, data?: unknown, _context?: Record<string, unknown>): void {
    const formatted = this.formatMessage('INFO', message, data)
    if (this.isDevelopment) console.info(formatted)
    if (this.isProduction) {
      // Hook to external logging in production if needed
    }
    void _context;
  }

  warn(message: string, data?: unknown, context?: Record<string, unknown>): void {
    const formatted = this.formatMessage('WARN', message, data)
    if (this.isDevelopment) console.warn(formatted)
    if (this.isProduction) {
      // Hook to external logging in production if needed
    }
    void this.persistLog('WARN', message, data, context)
  }

  error(message: string, data?: unknown, context?: Record<string, unknown>): void {
    const errorPayload = data instanceof Error ? {
      name: data.name,
      message: data.message,
      stack: this.isDevelopment ? data.stack : undefined,
    } : data

    const formatted = this.formatMessage('ERROR', message, errorPayload)
    if (this.isDevelopment) console.error(formatted)
    if (this.isProduction) {
      // Minimal production logging
      console.error(`[PRODUCTION ERROR] ${message}`)
    }
    void this.persistLog('ERROR', message, errorPayload, context)
  }

  apiRequest(method: string, path: string, userId?: string, durationMs?: number): void {
    this.info(`API ${method} ${path}`, {
      method,
      path,
      userId: userId ? `user_${userId.slice(0, 8)}...` : 'anonymous',
      duration: typeof durationMs === 'number' ? `${durationMs}ms` : undefined,
    })
  }

  async auditLog(action: string, userId: string, details?: unknown): Promise<void> {
    const entry = {
      action,
      userId,
      details: this.sanitizeData(details),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    }

    this.info(`AUDIT: ${action}`, entry)
    // TODO: persist to audit table
  }
}

export const Logger = new SecureLogger()
export const log = Logger.info.bind(Logger)
export const logError = Logger.error.bind(Logger)
export const logWarn = Logger.warn.bind(Logger)
export const logDebug = Logger.debug.bind(Logger)

export const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') console.log('[DEV]', ...args)
}

export const safeConsole = {
  log: Logger.info.bind(Logger),
  error: Logger.error.bind(Logger),
  warn: Logger.warn.bind(Logger),
  debug: Logger.debug.bind(Logger),
}
