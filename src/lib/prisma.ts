import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// No silent fallback: on a server with no local database file, a missing DATABASE_URL
// would otherwise surface later as a confusing SQLite error.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Locally, add it to .env (e.g. file:./dev.db); on Vercel, set it in the project's environment variables.",
  );
}

const adapter = new PrismaLibSql({ url: databaseUrl });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
