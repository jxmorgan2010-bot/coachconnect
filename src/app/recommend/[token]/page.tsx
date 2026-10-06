import { prisma } from "@/lib/prisma";
import LinkNotFound from "@/components/LinkNotFound";
import RecommendForm from "./RecommendForm";

export default async function RecommendPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const recommendation = await prisma.recommendation.findUnique({
    where: { token },
    include: { coachProfile: { include: { user: true } } },
  });

  if (!recommendation) {
    return <LinkNotFound what="recommendation" />;
  }

  const coachName = recommendation.coachProfile.user.name;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="eyebrow mb-2 text-pitch">Coach recommendation</p>
      <h1 className="text-display-lg font-display text-ink">Recommend {coachName}</h1>
      <p className="mt-3 mb-6 text-muted-foreground">
        {coachName} asked you to write a short recommendation for their CoachConnect coach profile. Your name, role,
        and recommendation will appear on that public profile, along with a &quot;Recommended by a coach&quot;
        badge.
      </p>
      <RecommendForm token={token} coachName={coachName} alreadySubmitted={recommendation.status === "SUBMITTED"} />
    </div>
  );
}
