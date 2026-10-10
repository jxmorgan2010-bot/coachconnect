/**
 * Parent/guardian consent text for a Minor Coach — the ONE place this wording lives.
 *
 * DRAFT. Not reviewed by an attorney. It must be reviewed and replaced before real use.
 *
 * To replace it: edit the text below and change MINOR_CONSENT_TEXT_VERSION. The version
 * is stored with every signature (MinorConsent.consentTextVersion), along with the keys of
 * the acknowledgments that were ticked, so an old signature always points at the wording
 * that was actually shown. The consent page sends back the version it displayed, and the
 * server rejects a signature made against an older version.
 *
 * Keys are stored with signatures, so keep a key's meaning stable; give a new statement a
 * new key instead of rewording an old one into something different.
 */

export const MINOR_CONSENT_TEXT_VERSION = "2026-10-07-draft-1";

export const MINOR_CONSENT_DRAFT_NOTICE = "Draft - must be reviewed by an attorney before real use";

export type ConsentAcknowledgment = { key: string; text: string };

/** Everything the consent page shows, worded for one coach. */
export function minorConsentText(coachName: string) {
  const first = coachName.trim().split(/\s+/)[0] || coachName;
  return {
    version: MINOR_CONSENT_TEXT_VERSION,
    draftNotice: MINOR_CONSENT_DRAFT_NOTICE,
    title: `Parent or guardian consent for ${first} to coach on CoachConnect`,
    intro: [
      `${coachName} has applied to offer sports coaching sessions to families through CoachConnect. Because ${first} is under 18, their profile can't be reviewed or shown to families until their parent or legal guardian reads and signs this form.`,
      `Please read each statement and tick it to confirm. If anything is unclear, don't sign — contact CoachConnect first.`,
    ],
    acknowledgments: [
      {
        key: "authorize-coaching",
        text: `I am ${first}'s parent or legal guardian, and I give permission for ${first} to create a coach profile and offer paid coaching sessions to families through CoachConnect.`,
      },
      {
        key: "minor-no-background-check",
        text: `I understand that ${first} is under 18 and has not had a standard background check through CoachConnect.`,
      },
      {
        key: "parent-and-second-adult",
        text: `I understand that CoachConnect requires the booking family's parent and a second adult to be present for every session ${first} coaches, and that ${first} should not start or continue a session without them.`,
      },
      {
        key: "platform-rules",
        text: `I agree that ${first} will follow CoachConnect's rules, including keeping all contact and payments with families on CoachConnect (no sharing phone numbers, social media or other apps). I understand that breaking this rule results in a strike, and that repeated strikes can lead to ${first}'s account being suspended.`,
      },
      {
        key: "emergency-contact",
        text: `I'm providing an emergency contact below, and I agree CoachConnect may contact that person if there is an urgent issue involving ${first} and a session booked through CoachConnect.`,
      },
      {
        key: "school-id-and-photos",
        text: `I consent to CoachConnect collecting, storing and using ${first}'s school ID, which is used to check identity, age and enrollment and is seen only by ${first} and CoachConnect staff, and the photos and any videos ${first} uploads to their coach profile, which are shown publicly on that profile.`,
      },
      {
        key: "may-revoke",
        text: `I understand I can withdraw this consent at any time using the withdrawal link I'll receive after signing. Withdrawing hides ${first}'s profile from families right away and cancels their upcoming sessions.`,
      },
    ] satisfies ConsentAcknowledgment[],
    adultConfirmation: "I am 18 or older.",
    signatureExplanation:
      "Type your full legal name to sign. By typing your name and selecting Sign consent, you are signing this form electronically.",
    recordNotice:
      "With your signature we record the date and time, your IP address, your browser details, and which version of this form you saw.",
  };
}

export const REQUIRED_ACKNOWLEDGMENT_KEYS: readonly string[] = minorConsentText("").acknowledgments.map((a) => a.key);
