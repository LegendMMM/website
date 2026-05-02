import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "change-me-now";
  const partnerEmail = process.env.PARTNER_EMAIL ?? "partner@example.com";
  const partnerPassword = process.env.PARTNER_PASSWORD ?? "change-me-too";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "我方管理員",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
      locale: "ZH_TW",
    },
  });

  await prisma.user.upsert({
    where: { email: partnerEmail },
    update: {},
    create: {
      email: partnerEmail,
      name: "日本對方",
      passwordHash: await bcrypt.hash(partnerPassword, 12),
      role: "PARTNER",
      locale: "JA",
    },
  });

  await prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      jpyPerTwd: 4.85,
      wiseFixedFeeJpy: 120,
      wisePercentFee: 0.007,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
