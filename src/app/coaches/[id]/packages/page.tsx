import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { isCoachLive } from "@/lib/coach";
import PackagePurchaseForm from "./PackagePurchaseForm";

export default async function PackagePurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect(`/login?callbackUrl=/coaches/${id}/packages`);
  if (session.user.role !== "PARENT") redirect("/dashboard");

  const profile = await prisma.coachProfile.findUnique({
    where: { id },
    include: { user: true, sports: true },
  });
  if (!profile || !isCoachLive(profile) || !profile.hourlyRateCents) notFound();

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: { orderBy: { createdAt: "asc" } } },
  });
  if (!parentProfile) redirect("/dashboard");

  return (
    <PackagePurchaseForm
      coach={{
        id: profile.id,
        name: profile.user.name,
        hourlyRateCents: profile.hourlyRateCents,
        sports: profile.sports.map((s) => s.sport),
      }}
    />
  );
}
