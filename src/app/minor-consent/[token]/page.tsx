import { prisma } from "@/lib/prisma";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
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
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-secondary">Link not found</h1>
        <p className="mt-2 text-muted-foreground">This consent link is invalid or has expired.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">Parent/guardian consent</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {profile.user.name} is signing up as a coach on CoachConnect, a marketplace where young athletes book
        coaching sessions with high school and college athletes. Because {profile.user.name.split(" ")[0]} is under
        18, we require their parent or legal guardian to consent before their profile can be reviewed.
      </p>
      <MinorConsentForm token={token} coachName={profile.user.name} alreadySigned={Boolean(profile.minorGuardianConsentedAt)} />
    </div>
  );
}
