-- Migration: Single Source of Truth Architecture
-- Converts multi-table state to DeliveryState-centric model

-- Create DeliveryState table (SOURCE OF TRUTH)
CREATE TABLE "DeliveryState" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedBy" TEXT,
    "lockUntil" TIMESTAMP(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCode" TEXT,
    "providerTransactionId" TEXT,
    "providerResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryState_pkey" PRIMARY KEY ("id")
);

-- Create BackpressureState table (DB-stored, not memory)
CREATE TABLE "BackpressureState" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'NORMAL',
    "triggeredAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "reason" TEXT,
    "unknownRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualReviewCount" INTEGER NOT NULL DEFAULT 0,
    "dlqGrowthRate" INTEGER NOT NULL DEFAULT 0,
    "openCircuitBreakers" INTEGER NOT NULL DEFAULT 0,
    "reduceConcurrency" BOOLEAN NOT NULL DEFAULT false,
    "pauseDispatches" BOOLEAN NOT NULL DEFAULT false,
    "stopRetries" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackpressureState_pkey" PRIMARY KEY ("id")
);

-- Update CircuitBreaker (already exists, ensure schema matches)
-- (No changes needed if already created)

-- Create indexes for DeliveryState
CREATE UNIQUE INDEX "DeliveryState_orderId_key" ON "DeliveryState"("orderId");
CREATE INDEX "DeliveryState_status_nextAttemptAt_lockUntil_idx" ON "DeliveryState"("status", "nextAttemptAt", "lockUntil");
CREATE INDEX "DeliveryState_status_attempt_lockedBy_idx" ON "DeliveryState"("status", "attempt", "lockedBy");
CREATE INDEX "DeliveryState_orderId_status_idx" ON "DeliveryState"("orderId", "status");
CREATE INDEX "DeliveryState_provider_status_createdAt_idx" ON "DeliveryState"("provider", "status", "createdAt");

-- Create unique constraint for BackpressureState
CREATE UNIQUE INDEX "BackpressureState_id_key" ON "BackpressureState"("id");

-- Add foreign key from DeliveryState to Order
ALTER TABLE "DeliveryState" ADD CONSTRAINT "DeliveryState_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE;

-- Initialize singleton backpressure state
INSERT INTO "BackpressureState" (id, mode, unknownRate, manualReviewCount, dlqGrowthRate, openCircuitBreakers)
VALUES ('singleton', 'NORMAL', 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Migrate existing DeliveryJobs to DeliveryState
INSERT INTO "DeliveryState" (
    "id",
    "orderId",
    "status",
    "provider",
    "idempotencyKey",
    "payloadHash",
    "attempt",
    "maxAttempts",
    "lockedBy",
    "lockUntil",
    "lockVersion",
    "dispatchedAt",
    "completedAt",
    "nextAttemptAt",
    "lastError",
    "errorCode",
    "providerTransactionId",
    "providerResponse",
    "createdAt",
    "updatedAt"
)
SELECT 
    dj.id,
    dj."orderId",
    CASE dj.status
        WHEN 'PENDING' THEN 'PENDING'
        WHEN 'RETRYING' THEN 'PENDING'
        WHEN 'PROCESSING' THEN 'IN_PROGRESS'
        WHEN 'DISPATCHED' THEN 'DISPATCHED'
        WHEN 'COMPLETED' THEN 'SUCCESS'
        WHEN 'SUCCESS' THEN 'SUCCESS'
        WHEN 'FAILED' THEN 'FAILED'
        WHEN 'UNKNOWN_EXTERNAL_STATE' THEN 'UNKNOWN'
        WHEN 'MANUAL_REVIEW' THEN 'MANUAL_REVIEW'
        ELSE 'PENDING'
    END as status,
    pl.provider,
    dj."externalIdempotencyKey",
    pl."payloadHash",
    dj.attempt,
    dj."maxAttempts",
    dj."workerId",
    NULL, -- lockUntil reset on migration
    0,    -- lockVersion reset
    pl."dispatchedAt",
    dj."completedAt",
    dj."nextAttemptAt",
    dj."errorMessage",
    NULL,
    pl."providerTransactionId",
    pl."providerResponse",
    dj."createdAt",
    dj."updatedAt"
FROM "DeliveryJob" dj
LEFT JOIN "ProviderLedger" pl ON pl."deliveryJobId" = dj.id
ON CONFLICT (id) DO NOTHING;

-- Update ProviderLedger to reference DeliveryState instead of DeliveryJob
ALTER TABLE "ProviderLedger" 
ADD COLUMN "deliveryStateId" TEXT;

UPDATE "ProviderLedger" pl
SET "deliveryStateId" = dj.id
FROM "DeliveryJob" dj
WHERE pl."deliveryJobId" = dj.id;

-- Make deliveryStateId required
ALTER TABLE "ProviderLedger" 
ALTER COLUMN "deliveryStateId" SET NOT NULL;

-- Add foreign key
ALTER TABLE "ProviderLedger" 
ADD CONSTRAINT "ProviderLedger_deliveryStateId_fkey" 
FOREIGN KEY ("deliveryStateId") REFERENCES "DeliveryState"("id") ON DELETE CASCADE;

-- Add unique constraint
CREATE UNIQUE INDEX "ProviderLedger_deliveryStateId_key" ON "ProviderLedger"("deliveryStateId");

-- Add deliveryState relation to ManualReviewQueue and DeadLetterQueue (similar pattern)
-- (Implementation depends on whether these tables already exist)

COMMENT ON TABLE "DeliveryState" IS 'SINGLE SOURCE OF TRUTH for delivery execution. All other tables are projections.';
COMMENT ON TABLE "BackpressureState" IS 'DB-stored backpressure state (not in-memory) for cross-worker sync.';
COMMENT ON TABLE "ProviderLedger" IS 'Write-ahead log for AUDIT ONLY. Not used for execution decisions.';
