-- CreateTable
CREATE TABLE "CouponPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "couponId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    CONSTRAINT "CouponPlan_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CouponPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CouponPlan_planId_idx" ON "CouponPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponPlan_couponId_planId_key" ON "CouponPlan"("couponId", "planId");
