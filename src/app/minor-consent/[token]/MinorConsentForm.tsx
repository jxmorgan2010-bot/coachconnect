"use client";

import { useState } from "react";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass } from "@/lib/ui";

type Acknowledgment = { key: string; text: string };

const checkboxClass = "mt-0.5 h-5 w-5 shrink-0 accent-[var(--pitch)]";
const tickRowClass = "flex cursor-pointer items-start gap-3 rounded-lg border-2 border-line bg-surface p-3 text-sm text-ink has-[:checked]:border-ink";

export default function MinorConsentForm({
  token,
  coachName,
  version,
  acknowledgments,
  adultConfirmation,
  signatureExplanation,
  recordNotice,
  relationships,
}: {
  token: string;
  coachName: string;
  version: string;
  acknowledgments: Acknowledgment[];
  adultConfirmation: string;
  signatureExplanation: string;
  recordNotice: string;
  relationships: string[];
}) {
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [signerLegalName, setSignerLegalName] = useState("");
  const [signerRelationship, setSignerRelationship] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [typedSignature, setTypedSignature] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revokeLink, setRevokeLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tickedCount = acknowledgments.filter((a) => ticked[a.key]).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tickedCount < acknowledgments.length) {
      setError("Tick each statement to confirm you've read and agree to it.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/minor-consent/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentTextVersion: version,
        acknowledgedKeys: acknowledgments.filter((a) => ticked[a.key]).map((a) => a.key),
        signerLegalName,
        signerRelationship,
        emergencyContactName,
        emergencyContactPhone,
        confirmedAdult,
        typedSignature,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setRevokeLink(data.revokeLink);
  }

  function copy() {
    if (!revokeLink) return;
    navigator.clipboard?.writeText(revokeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (revokeLink) {
    return (
      <div role="status" className="card flex flex-col gap-4 p-5 sm:p-6">
        <p className="font-display text-2xl leading-tight text-ink">Consent recorded</p>
        <p className="text-sm text-ink">
          Thank you. {coachName}&apos;s profile can now go to our team for review.
        </p>
        <div className="rounded-lg border-2 border-ink bg-chalk p-3">
          <p className="text-sm font-bold text-ink">Save your withdrawal link</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use it any time to withdraw consent. It doesn&apos;t expire. We&apos;ve also sent it to your email.
          </p>
          <code className="mt-2 block break-all rounded bg-surface px-3 py-2 text-xs text-pitch">{revokeLink}</code>
          <button type="button" onClick={copy} className={`${secondaryButtonClass} mt-2`}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-6 p-5 sm:p-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-display text-xl text-ink">
          Read and tick each statement{" "}
          <span className="font-sans text-sm font-bold text-muted-foreground">
            {tickedCount} of {acknowledgments.length}
          </span>
        </legend>
        {acknowledgments.map((a) => (
          <label key={a.key} className={tickRowClass}>
            <input
              type="checkbox"
              className={checkboxClass}
              checked={Boolean(ticked[a.key])}
              onChange={(e) => setTicked((prev) => ({ ...prev, [a.key]: e.target.checked }))}
              required
            />
            {a.text}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-display text-xl text-ink">About you</legend>
        <div>
          <label className={labelClass} htmlFor="signerLegalName">Your full legal name</label>
          <input id="signerLegalName" autoComplete="name" className={inputClass} value={signerLegalName} onChange={(e) => setSignerLegalName(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="signerRelationship">Your relationship to {coachName}</label>
          <select id="signerRelationship" className={inputClass} value={signerRelationship} onChange={(e) => setSignerRelationship(e.target.value)} required>
            <option value="" disabled>Choose one</option>
            {relationships.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <label className={tickRowClass}>
          <input type="checkbox" className={checkboxClass} checked={confirmedAdult} onChange={(e) => setConfirmedAdult(e.target.checked)} required />
          {adultConfirmation}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-display text-xl text-ink">Emergency contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="emergencyContactName">Name</label>
            <input id="emergencyContactName" className={inputClass} value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass} htmlFor="emergencyContactPhone">Phone</label>
            <input
              id="emergencyContactPhone"
              type="tel"
              autoComplete="tel"
              className={inputClass}
              placeholder="(415) 555-0123"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              required
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-xl text-ink">Sign</legend>
        <div>
          <label className={labelClass} htmlFor="typedSignature">Type your full legal name</label>
          <input
            id="typedSignature"
            className={`${inputClass} font-display text-xl sm:text-xl`}
            value={typedSignature}
            onChange={(e) => setTypedSignature(e.target.value)}
            aria-describedby="signature-help"
            autoComplete="off"
            required
          />
          <p id="signature-help" className="mt-1.5 text-xs text-muted-foreground">{signatureExplanation}</p>
        </div>
        <p className="text-xs text-muted-foreground">{recordNotice}</p>
      </fieldset>

      {error && <p role="alert" className={errorClass}>{error}</p>}

      <button type="submit" className={`${primaryButtonClass} w-full text-base`} disabled={loading}>
        {loading ? "Signing..." : "Sign consent"}
      </button>
    </form>
  );
}
