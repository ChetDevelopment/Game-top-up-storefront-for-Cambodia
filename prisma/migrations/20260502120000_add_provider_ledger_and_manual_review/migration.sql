-- CreateTable - ProviderLedger (Write-Ahead Log)
CREATE TABLE "ProviderLedger" (
    "id" TEXT NOT NULL,
    "deliveryJobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedBy" TEXT,
    "providerTransactionId" TEXT,
    "providerResponse" JSONB,
    "externalState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable - ManualReviewQueue
CREATE TABLE "ManualReviewQueue" (
    "id" TEXT NOT NULL,
    "deliveryJobId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedTo" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "resolution" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualReviewQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderLedger_deliveryJobId_key" ON "ProviderLedger"("deliveryJobId");
CREATE UNIQUE INDEX "ProviderLedger_idempotencyKey_key" ON "ProviderLedger"("idempotencyKey");
CREATE INDEX "ProviderLedger_externalState_dispatchedAt_idx" ON "ProviderLedger"("externalState", "dispatchedAt");
CREATE INDEX "ProviderLedger_provider_idempotencyKey_idx" ON "ProviderLedger"("provider", "idempotencyKey");
CREATE INDEX "ProviderLedger_resolutionSource_idx" ON "ProviderLedger"("resolutionSource");

CREATE UNIQUE INDEX "ManualReviewQueue_deliveryJobId_key" ON "ManualReviewQueue"("deliveryJobId");
CREATE INDEX "ManualReviewQueue_status_createdAt_idx" ON "ManualReviewQueue"("status", "createdAt");
CREATE INDEX "ManualReviewQueue_reason_status_idx" ON "ManualReviewQueue"("reason", "status");

-- AddForeignKey
ALTER TABLE "ProviderLedger" ADD CONSTRAINT "ProviderLedger_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE;
ALTER TABLE "ManualReviewQueue" ADD CONSTRAINT "ManualReviewQueue_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE;
