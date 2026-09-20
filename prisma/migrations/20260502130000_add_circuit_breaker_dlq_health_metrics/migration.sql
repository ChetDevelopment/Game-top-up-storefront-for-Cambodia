-- CreateTable - DeadLetterQueue
CREATE TABLE "DeadLetterQueue" (
    "id" TEXT NOT NULL,
    "deliveryJobId" TEXT NOT NULL,
    "providerLedgerId" TEXT,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "originalState" TEXT NOT NULL,
    "ledgerSnapshot" JSONB,
    "lastError" TEXT,
    "retryHistory" JSONB,
    "canReplay" BOOLEAN NOT NULL DEFAULT false,
    "replayCount" INTEGER NOT NULL DEFAULT 0,
    "maxReplays" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable - ProviderHealthMetric
CREATE TABLE "ProviderHealthMetric" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "timeout" BOOLEAN NOT NULL,
    "conflict" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "statusCode" TEXT,
    "errorMessage" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderHealthMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable - CircuitBreaker
CREATE TABLE "CircuitBreaker" (
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureTime" TIMESTAMP(3),
    "lastStateChange" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryTime" TIMESTAMP(3),
    "testRequestsAllowed" INTEGER NOT NULL DEFAULT 0,
    "testRequestsUsed" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitBreaker_pkey" PRIMARY KEY ("provider")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterQueue_deliveryJobId_key" ON "DeadLetterQueue"("deliveryJobId");
CREATE INDEX "DeadLetterQueue_status_createdAt_idx" ON "DeadLetterQueue"("status", "createdAt");
CREATE INDEX "DeadLetterQueue_reason_severity_idx" ON "DeadLetterQueue"("reason", "severity");
CREATE INDEX "DeadLetterQueue_canReplay_status_idx" ON "DeadLetterQueue"("canReplay", "status");

CREATE INDEX "ProviderHealthMetric_provider_timestamp_idx" ON "ProviderHealthMetric"("provider", "timestamp");
CREATE INDEX "ProviderHealthMetric_provider_success_timestamp_idx" ON "ProviderHealthMetric"("provider", "success", "timestamp");
CREATE INDEX "ProviderHealthMetric_provider_timeout_timestamp_idx" ON "ProviderHealthMetric"("provider", "timeout", "timestamp");

CREATE INDEX "CircuitBreaker_state_idx" ON "CircuitBreaker"("state");

-- AddForeignKey
ALTER TABLE "DeadLetterQueue" ADD CONSTRAINT "DeadLetterQueue_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE;
ALTER TABLE "DeadLetterQueue" ADD CONSTRAINT "DeadLetterQueue_providerLedgerId_fkey" FOREIGN KEY ("providerLedgerId") REFERENCES "ProviderLedger"("id") ON DELETE SET NULL;
