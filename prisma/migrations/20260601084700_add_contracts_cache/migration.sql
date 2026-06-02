-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cachedContracts" JSONB,
ADD COLUMN     "cachedContractsAt" TIMESTAMP(3);
