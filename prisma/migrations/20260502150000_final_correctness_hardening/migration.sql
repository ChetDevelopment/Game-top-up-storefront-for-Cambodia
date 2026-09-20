-- Migration: Final Correctness Hardening
-- Adds: providerFinalizedAt, SENDING state support, lockVersion enforcement

-- Add providerFinalizedAt to DeliveryState (if not exists)
DO $$ BEGIN
  ALTER TABLE "DeliveryState" ADD COLUMN "providerFinalizedAt" TIMESTAMP(3);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Add index for providerFinalizedAt queries (critical for replay safety)
CREATE INDEX IF NOT EXISTS "DeliveryState_providerFinalizedAt_status_idx" 
ON "DeliveryState"("providerFinalizedAt", "status");

-- Ensure lockVersion has default (should already exist)
ALTER TABLE "DeliveryState" ALTER COLUMN "lockVersion" SET DEFAULT 0;

-- Add comment documenting the crash boundary
COMMENT ON COLUMN "DeliveryState"."status" IS '
EXECUTION PHASE MACHINE:
PENDING → IN_PROGRESS → SENDING → DISPATCHED → SUCCESS/FAILED/UNKNOWN

CRITICAL:
- SENDING = Intent persisted, about to call provider (CRASH BOUNDARY)
- After SENDING: Assume "unknown sent state", recovery must be idempotent-safe
- providerFinalizedAt = External execution definitively complete (NEVER retry)
';

COMMENT ON COLUMN "DeliveryState"."providerFinalizedAt" IS '
FINAL AUTHORITY: External provider execution complete.
When set: NEVER retry, NEVER replay, NEVER reprocess.
This is the one-way irreversible marker for external completion.
';

COMMENT ON COLUMN "DeliveryState"."lockVersion" IS '
OPTIMISTIC LOCKING VERSION.
Every state transition increments this.
Prevents stale worker overwrites after crash recovery.
All updates MUST check: WHERE lockVersion = expectedVersion
';

-- Initialize backpressure singleton if not exists
INSERT INTO "BackpressureState" (id, mode, unknownRate, manualReviewCount, dlqGrowthRate, openCircuitBreakers)
VALUES ('singleton', 'NORMAL', 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Migrate any existing DISPATCHED states to have providerFinalizedAt if SUCCESS
UPDATE "DeliveryState"
SET "providerFinalizedAt" = "completedAt"
WHERE status = 'SUCCESS'
  AND "providerFinalizedAt" IS NULL
  AND "completedAt" IS NOT NULL;

-- Migrate FAILED_FINAL to have providerFinalizedAt
UPDATE "DeliveryState"
SET "providerFinalizedAt" = "completedAt"
WHERE status = 'FAILED_FINAL'
  AND "providerFinalizedAt" IS NULL
  AND "completedAt" IS NOT NULL;

-- Ensure all IN_PROGRESS or SENDING jobs without lock are reset to PENDING
UPDATE "DeliveryState"
SET 
  status = 'PENDING',
  "lockedBy" = NULL,
  "lockUntil" = NULL,
  "nextAttemptAt" = NOW() + INTERVAL '5 minutes'
WHERE status IN ('IN_PROGRESS', 'SENDING')
  AND ("lockUntil" IS NULL OR "lockUntil" < NOW())
  AND "providerFinalizedAt" IS NULL;

-- Create recovery helper view (for monitoring stuck jobs)
CREATE OR REPLACE VIEW "v_stuck_jobs" AS
SELECT 
  id,
  status,
  "lockedBy",
  "lockUntil",
  "lockVersion",
  "dispatchedAt",
  "providerFinalizedAt",
  CASE 
    WHEN status = 'SENDING' AND "dispatchedAt" < NOW() - INTERVAL '10 minutes' THEN 'CRASH_AFTER_SENDING'
    WHEN status = 'IN_PROGRESS' AND "lockUntil" < NOW() THEN 'CRASH_BEFORE_SENDING'
    ELSE NULL
  END as recovery_type
FROM "DeliveryState"
WHERE "providerFinalizedAt" IS NULL
  AND (
    (status = 'SENDING' AND "dispatchedAt" < NOW() - INTERVAL '10 minutes')
    OR (status = 'IN_PROGRESS' AND "lockUntil" < NOW())
  );

-- Create audit trigger for state transitions (for debugging)
CREATE OR REPLACE FUNCTION audit_delivery_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO "AuditLog" ("eventType", "targetType", "targetId", "oldState", "newState", "details", "createdAt")
    VALUES (
      'STATE_TRANSITION',
      'DeliveryState',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'lockVersion', OLD."lockVersion"),
      jsonb_build_object('status', NEW.status, 'lockVersion', NEW."lockVersion"),
      format('Transition: %s → %s (attempt %s)', OLD.status, NEW.status, NEW.attempt),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach audit trigger
DROP TRIGGER IF EXISTS audit_delivery_state_change ON "DeliveryState";
CREATE TRIGGER audit_delivery_state_change
  AFTER UPDATE ON "DeliveryState"
  FOR EACH ROW
  EXECUTE FUNCTION audit_delivery_state_change();

-- Grant appropriate permissions (adjust for your setup)
-- GRANT SELECT ON "v_stuck_jobs" TO application_role;

COMMENT ON VIEW "v_stuck_jobs" IS '
Monitor for jobs requiring crash recovery.
- CRASH_AFTER_SENDING: Set to UNKNOWN, assume provider may have received
- CRASH_BEFORE_SENDING: Set to PENDING, safe to retry
';
