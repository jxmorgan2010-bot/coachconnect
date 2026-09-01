import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/** Returns the signed-in coach's own CoachProfile, or null if unauthorized. */
export async function requireCoachProfile() {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "COACH") return null;
  const profile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } });
  return profile;
}

export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}
