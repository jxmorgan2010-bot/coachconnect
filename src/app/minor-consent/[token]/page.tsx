import type { Metadata } from "next";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { lookupConsentToken } from "@/lib/minorConsent";
import { minorConsentText } from "@/lib/legal/minorConsentText";
import { GUARDIAN_RELATIONSHIPS } from "@/lib/validation";
import LinkNotFound from "@/components/LinkNotFound";
import MinorConsentForm from "./MinorConsentForm";

// The token is in the URL: keep it out of search indexes and Referer headers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

function LinkDeadEnd({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card-flat flex flex-col items-start gap-4 p-6 sm:p-8">
        <p className="eyebrow text-muted-foreground">{eyebrow}</p>
        <h1 className="text-display-md font-display text-ink">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export default async function MinorConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!ENABLE_MINOR_COACHES) return <LinkNotFound what="consent" />;

  const { state, consent } = await lookupConsentToken(token);
  if (state === "NOT_FOUND" || !consent) return <LinkNotFound what="consent" />;

  const coachName = consent.coachProfile.user.name;
  if (state === "EXPIRED") {
    return (
      <LinkDeadEnd
        eyebrow="Link expired"
        title="This consent link has expired"
        body={`Links work for 7 days. Ask ${coachName} to send you a new one from their CoachConnect account.`}
      />
    );
  }
  if (state === "SUPERSEDED") {
    return (
      <LinkDeadEnd
        eyebrow="Link replaced"
        title="A newer link was sent"
        body={`${coachName} sent a newer consent link, so this one no longer works. Use the most recent one you received.`}
      />
    );
  }
  if (state === "USED") {
    return (
      <LinkDeadEnd
        eyebrow="Already used"
        title="This consent link has already been used"
        body="Each consent link works once. If you need to withdraw consent, use the withdrawal link from your confirmation email."
      />
    );
  }

  const text = minorConsentText(coachName);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <p role="note" className="mb-6 rounded-lg border-2 border-danger bg-danger/10 px-3.5 py-2.5 text-sm font-bold text-danger">
        {text.draftNotice}
      </p>
      <p className="eyebrow mb-2 text-pitch">Parent / guardian consent</p>
      <h1 className="text-display-lg font-display text-ink">{text.title}</h1>
      <div className="mt-3 mb-6 flex flex-col gap-3 text-muted-foreground">
        {text.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="text-sm">
          Sent to {consent.guardianName} ({consent.guardianEmail}). Form version {text.version}.
        </p>
      </div>
      <MinorConsentForm
        token={token}
        coachName={coachName}
        version={text.version}
        acknowledgments={text.acknowledgments}
        adultConfirmation={text.adultConfirmation}
        signatureExplanation={text.signatureExplanation}
        recordNotice={text.recordNotice}
        relationships={[...GUARDIAN_RELATIONSHIPS]}
      />
    </div>
  );
}
