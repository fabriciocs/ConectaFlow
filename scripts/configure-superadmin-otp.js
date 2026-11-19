#!/usr/bin/env node

const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits) result += BASE32[(value << (5 - bits)) & 31];
  return result;
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) throw new Error("Usage: node scripts/configure-superadmin-otp.js <superadmin-email>");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, emailVerified: true },
  });
  if (!user || user.role !== "SUPERADMIN" || !user.emailVerified) {
    throw new Error("A verified SUPERADMIN account with that email is required.");
  }

  const secret = encodeBase32(randomBytes(20));
  const issuer = "WA-AKG";
  const label = encodeURIComponent(`${issuer}:${user.email}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  console.log(`Account: ${user.email} (${user.id})`);
  console.log(`Secret: ${secret}`);
  console.log(`Authenticator URI: ${uri}`);
  console.log(`Add this entry to the WA_AKG_ADMIN_TOTP_KEYS JSON object in your secret manager: \"${user.id}\":\"${secret}\"`);
  console.log("Store the generated secret securely; this script does not save it or change the database.");
}

main()
  .catch((error) => {
    console.error(error.message || "Unable to configure superadmin OTP.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
