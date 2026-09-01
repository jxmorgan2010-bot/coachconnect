import { prisma } from "@/lib/prisma";
import RecommendForm from "./RecommendForm";

export default async function RecommendPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const recommendation = await prisma.recommendation.findUnique({
    where: { token },
    include: { coachProfile: { include: { user: true } } },
  });

  if (!recommendation) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-secondary">Link not found</h1>
        <p className="mt-2 text-muted-foreground">This recommendation link is invalid or has expired.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold text-secondary">
        Recommend {recommendation.coachProfile.user.name}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {recommendation.coachProfile.user.name} asked you to write a short recommendation for their CoachConnect
        profile. This will be shown publicly with a &quot;Recommended by Coach&quot; badge.
      </p>
      <RecommendForm token={token} coachName={recommendation.coachProfile.user.name} alreadySubmitted={recommendation.status === "SUBMITTED"} />
    </div>
  );
}
