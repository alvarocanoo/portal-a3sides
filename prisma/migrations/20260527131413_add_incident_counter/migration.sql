-- CreateTable
CREATE TABLE "incident_counters" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "year" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "incident_counters_pkey" PRIMARY KEY ("id")
);
