-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "actorId" TEXT,
    "route" TEXT,
    "method" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "firstRequestAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRequestAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "rate_limit_actor_window_idx" ON "RateLimitBucket"("actorId", "windowStart");

-- CreateIndex
CREATE INDEX "RateLimitBucket_route_idx" ON "RateLimitBucket"("route");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_windowStart_key" ON "RateLimitBucket"("key", "windowStart");
