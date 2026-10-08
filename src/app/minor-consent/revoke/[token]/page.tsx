import type { Metadata } from "next";
import { lookupRevokeToken } from "@/lib/minorConsent";
import LinkNotFound from "@/components/LinkNotFound";
import RevokeConsentForm from "./RevokeConsentForm";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Where a parent/guardian withdraws consent. Deliberately works whether or not the Minor
 * Coach flag is on, and the link never expires.
 */
export default async function RevokeConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const consent = await lookupRevokeToken(token);
  if (!consent || !consent.completedAt) return <LinkNotFound what="withdrawal" />;

  const coachName = consent.coachProfile.user.name;
  const first = coachName.split(" ")[0];
  const signedOn = consent.completedAt.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long" });

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="eyebrow mb-2 text-pitch">Parent / guardian consent</p>
      <h1 className="text-display-lg font-display text-ink">Withdraw consent for {first}</h1>
      {consent.revokedAt ? (
        <p role="status" className="mt-4 rounded-lg border-2 border-ink bg-chalk px-4 py-3 text-ink">
          Consent was withdrawn on{" "}
          {consent.revokedAt.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long" })}.{" "}
          {first}&apos;s profile is hidden from families. There&apos;s nothing else you need to do.
        </p>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">
            You signed consent for {coachName} to coach on CoachConnect on {signedOn}. If you withdraw it:
          </p>
          <ul className="mt-2 mb-6 list-disc pl-5 text-muted-foreground">
            <li>{first}&apos;s profile is hidden from families right away.</li>
            <li>Their upcoming sessions are cancelled, and families aren&apos;t charged for them.</li>
            <li>To coach again, {first} would need you to sign a new consent form, and our team would review their profile again.</li>
          </ul>
          <RevokeConsentForm token={token} coachFirstName={first} />
        </>
      )}
    </div>
  );
}
