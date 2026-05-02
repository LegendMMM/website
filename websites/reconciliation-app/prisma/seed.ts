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
    update: {
      name: "Admin",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
      locale: "ZH_TW",
    },
    create: {
      email: adminEmail,
      name: "Admin",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
      locale: "ZH_TW",
    },
  });

  await prisma.user.upsert({
    where: { email: partnerEmail },
    update: {
      name: "Partner",
      passwordHash: await bcrypt.hash(partnerPassword, 12),
      role: "PARTNER",
      locale: "JA",
    },
    create: {
      email: partnerEmail,
      name: "Partner",
      passwordHash: await bcrypt.hash(partnerPassword, 12),
      role: "PARTNER",
      locale: "JA",
    },
  });

  await prisma.exchangeFeeSetting.upsert({
    where: { id: "default" },
    update: {
      jpyPerTwd: 4.85,
      wiseFixedFeeJpy: 120,
      wisePercentFee: 0.007,
    },
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
