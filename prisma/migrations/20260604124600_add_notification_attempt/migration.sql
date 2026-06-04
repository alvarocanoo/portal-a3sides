-- CreateTable
CREATE TABLE "notification_attempts" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "incidentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_attempts_status_createdAt_idx" ON "notification_attempts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_attempts_incidentId_idx" ON "notification_attempts"("incidentId");
