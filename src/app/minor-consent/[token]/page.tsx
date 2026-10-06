import { prisma } from "@/lib/prisma";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import LinkNotFound from "@/components/LinkNotFound";
import MinorConsentForm from "./MinorConsentForm";

export default async function MinorConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const profile = ENABLE_MINOR_COACHES
    ? await prisma.coachProfile.findUnique({
        where: { minorConsentToken: token },
        include: { user: true },
      })
    : null;

  if (!profile || !profile.isMinorCoach) {
    return <LinkNotFound what="consent" />;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="eyebrow mb-2 text-pitch">Parent / guardian consent</p>
      <h1 className="text-display-lg font-display text-ink">Consent for {profile.user.name.split(" ")[0]} to coach</h1>
      <p className="mt-3 mb-6 text-muted-foreground">
        {profile.user.name} is signing up as a coach on CoachConnect, a marketplace where young athletes book
        coaching sessions with high school and college athletes. Because {profile.user.name.split(" ")[0]} is under
        18, we require their parent or legal guardian to consent before their profile can be reviewed.
      </p>
      <MinorConsentForm token={token} coachName={profile.user.name} alreadySigned={Boolean(profile.minorGuardianConsentedAt)} />
    </div>
  );
}
