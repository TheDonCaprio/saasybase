import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  $queryRawUnsafe: vi.fn().mockResolvedValue([{ name: 'SystemLog' }]),
  systemLog: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({}),
  },
}

vi.mock('../lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('../lib/sentry', () => ({
  captureSentryException: vi.fn().mockResolvedValue(undefined),
  captureSentryMessage: vi.fn().mockResolvedValue(undefined),
}))

describe('SecureLogger Sentry fan-out', () => {
  const env = process.env as Record<string, string | undefined>
  const originalNodeEnv = process.env.NODE_ENV
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null
  const flushAsyncWork = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    env.NODE_ENV = 'production'
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
    consoleErrorSpy = null
  })

  afterAll(() => {
    env.NODE_ENV = originalNodeEnv
  })

  it('forwards production errors to Sentry without skipping SystemLog persistence', async () => {
    const { Logger } = await import('../lib/logger')
    const { captureSentryException } = await import('../lib/sentry')

    Logger.error('Checkout confirmation failed', new Error('boom'), { route: '/api/checkout/confirm' })

    expect(captureSentryException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          source: 'secure-logger',
          level: 'error',
        }),
        extras: expect.objectContaining({
          message: 'Checkout confirmation failed',
          context: { route: '/api/checkout/confirm' },
        }),
      })
    )

    await flushAsyncWork()

    expect(prismaMock.systemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'error',
          message: 'Checkout confirmation failed',
        }),
      })
    )
  })
})