import prismaPackage from "@prisma/client";
import bcrypt from "bcryptjs";

const { PrismaClient } = prismaPackage;
const prisma = new PrismaClient();
const SUPERADMIN_EMAIL = "fabriciodacunhasantos@gmail.com";

async function main() {
  const existingUser = await prisma.user.findUnique({
    where: { email: SUPERADMIN_EMAIL },
    select: { id: true },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: "SUPERADMIN",
        emailVerified: true,
      },
    });
    console.log(`Seed ensured SUPERADMIN: ${SUPERADMIN_EMAIL}`);
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!password || password.length < 6) {
    throw new Error("Set SEED_ADMIN_PASSWORD (minimum 6 characters) to create the initial SUPERADMIN.");
  }

  await prisma.user.create({
    data: {
      email: SUPERADMIN_EMAIL,
      name: "Fabricio da Cunha Santos",
      password: await bcrypt.hash(password, 12),
      role: "SUPERADMIN",
      emailVerified: true,
    },
  });

  console.log(`Seed created SUPERADMIN: ${SUPERADMIN_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Failed to seed the initial SUPERADMIN.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
