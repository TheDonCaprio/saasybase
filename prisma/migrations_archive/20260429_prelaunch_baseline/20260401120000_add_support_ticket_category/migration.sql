ALTER TABLE "SupportTicket"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';

CREATE INDEX "SupportTicket_category_idx" ON "SupportTicket"("category");