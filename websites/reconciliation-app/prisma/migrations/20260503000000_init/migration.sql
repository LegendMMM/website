-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTNER');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ZH_TW', 'JA');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TWD', 'JPY');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('SHIPMENT', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('ADMIN_TO_PARTNER', 'PARTNER_TO_ADMIN');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WiseFeePolicy" AS ENUM ('SENDER', 'RECEIVER', 'SPLIT');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTNER',
    "locale" "Locale" NOT NULL DEFAULT 'ZH_TW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'PENDING',
    "wiseFeePolicy" "WiseFeePolicy" NOT NULL DEFAULT 'SENDER',
    "trackingCode" TEXT,
    "externalRef" TEXT,
    "note" TEXT,
    "rejectionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerLineItem" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "settlementCurrency" "Currency" NOT NULL DEFAULT 'JPY',
    "exchangeRateJpyPerTwd" DECIMAL(14,6) NOT NULL,
    "wiseFixedFeeJpy" DECIMAL(14,2) NOT NULL,
    "wisePercentFee" DECIMAL(8,6) NOT NULL,
    "wiseFeePolicy" "WiseFeePolicy" NOT NULL DEFAULT 'SENDER',
    "grossAmountJpy" DECIMAL(14,2) NOT NULL,
    "estimatedFeeJpy" DECIMAL(14,2) NOT NULL,
    "totalDueJpy" DECIMAL(14,2) NOT NULL,
    "payerRole" "Role",
    "payeeRole" "Role",
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "actualTransferJpy" DECIMAL(14,2),
    "actualWiseFeeJpy" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementEntry" (
    "settlementId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,

    CONSTRAINT "SettlementEntry_pkey" PRIMARY KEY ("settlementId","ledgerEntryId")
);

-- CreateTable
CREATE TABLE "ExchangeFeeSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "jpyPerTwd" DECIMAL(14,6) NOT NULL,
    "wiseFixedFeeJpy" DECIMAL(14,2) NOT NULL,
    "wisePercentFee" DECIMAL(8,6) NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeFeeSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_status_idx" ON "LedgerEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_code_key" ON "Settlement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementEntry_ledgerEntryId_key" ON "SettlementEntry"("ledgerEntryId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLineItem" ADD CONSTRAINT "LedgerLineItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeFeeSetting" ADD CONSTRAINT "ExchangeFeeSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

