# Production readiness audit

Date: 2026-10-11. Code audited: `master` at `b5809e0` (includes PRs #4 and #5).

This audit was read-only. Nothing was edited apart from this report, no migrations were run, and `.env`, `dev.db` and the Turso database were not touched. **Not checked, because they're outside the repo:** Vercel project settings and environment variables, the live Turso schema, and Stripe dashboard settings. Items that depend on those are marked "owner to confirm".

Vercel platform limits this report relies on (check them against the current Vercel docs for your plan):

- **Read-only filesystem:** the deployed code can't be written to. Only `/tmp` is writable, and it's temporary and separate for each server instance.
- **Request body limit:** about 4.5 MB per request to a serverless function.
- **Cron:** cron jobs call a route with a GET request. The Hobby plan only allows cron jobs that run once a day.

---

## 1. File uploads

All three upload types go through `src/lib/storage.ts`, which writes to local disk with `mkdir` + `writeFile`.

| Upload | Route | Saved to | Served by | Who can see it |
|---|---|---|---|---|
| School ID photo (8 MB max) | `POST /api/coach/upload-id` | `storage/id-verifications/<coachId>-<uuid>.<ext>` | `GET /api/private-files/[filename]` and `GET /api/admin/coaches/[id]/id-photo`, both read with `fs.readFile` | The coach who owns it and admins (checked in both routes). `storage/` is gitignored. |
| Profile photo (8 MB max) | `POST /api/coach/upload-photo` | `public/uploads/coach-photos/` | Static file at `/uploads/coach-photos/...` | Anyone with the URL (public by design) |
| Bio video clips: intro, coaching, playing (50 MB max each) | `POST /api/coach/upload-video` | `public/uploads/coach-videos/` | Static file at `/uploads/coach-videos/...` | Anyone with the URL |

**What breaks on Vercel:**

- **Every upload fails.** `writeFile` into the deployment directory fails on a read-only filesystem. The upload routes catch the error and return a 400 with the raw Node error text (a read-only file system error naming the server path), so the coach sees a technical error message.
- **Moving the writes to `/tmp` wouldn't help.** Those files are temporary and not shared between server instances. Files added under `public/` after the build are never served either, because static files are fixed at deploy time.
- **Files over about 4.5 MB are rejected before the route runs,** even once storage is fixed. The app allows photos up to 8 MB and video clips up to 50 MB.
- **The site makes a promise that can't be kept.** It says "A person reviews every coach's ID…" in four places: the footer (`src/components/Footer.tsx`), the homepage (`src/app/page.tsx`), parent signup (`src/app/signup/parent/ParentSignupForm.tsx`) and the site description used by search engines (`src/app/layout.tsx`). With no ID uploads, an admin can still approve a coach (approval doesn't require an ID photo in code), but nobody actually reviews an ID. Those lines are untrue in production until uploads work.
- **One coach photo is committed to git** (`public/uploads/coach-photos/cmtfa27g30003w0uvfs3krhd5-…png`, from the first commit), so it's deployed as a public static file. Confirm it's a test image.

**Real replacement:**

- **Object storage:** Vercel Blob, S3 or Cloudflare R2.
- **Direct uploads:** upload from the browser straight to storage (Blob client uploads or presigned URLs), so files never pass through a function and the 4.5 MB limit doesn't apply. Check the file type and size when issuing the upload token.
- **Private ID photos:** keep IDs in a private store. Serve them through the existing owner/admin-checked routes (streaming from storage) or with short-lived signed URLs. Never serve them from a public URL.
- **Public photos and videos:** these can stay public (CDN URLs). Store the URL or key on `CoachProfile` as now.

---

## 2. Writes to the local filesystem

- **`src/lib/storage.ts`** is the only code that writes to disk (`saveIdPhoto`, `savePublicProfilePhoto`, `saveBioVideoClip`), covered in section 1.
- **The two ID-photo routes** are the only code that reads from disk.
- **The database:** `src/lib/prisma.ts` uses `process.env.DATABASE_URL ?? "file:./dev.db"`. If `DATABASE_URL` were ever missing in Vercel, the app would quietly try a local SQLite file and fail confusingly. It should throw a clear error instead.
- No other runtime code writes files, caches or databases locally. There's no in-memory rate limiting or other state that would break across multiple server instances.

---

## 3. Mocks and placeholders

| What | Where | What it does today | In production | Real replacement |
|---|---|---|---|---|
| Email | `src/lib/mockEmail.ts` (`sendMockEmail` = `console.log`). Called from `reminders.ts`, `autoRelease.ts`, `bookings/[id]/no-show`, `minorConsent.ts` (revocation and cancellation notices), `coach/minor-consent-request`, `minor-consent/[token]` | Prints the email to the server console | Nobody receives anything. The full message bodies, including **consent-signing links and the never-expiring withdraw-consent links**, go into the Vercel logs, so anyone with log access could use them. There's also no password-reset flow, because there's no email. | A transactional email provider (Resend, Postmark or SES) behind one `sendEmail()` function, logging only the recipient and subject. Add a password reset. |
| Video-call link | `src/lib/videoCall.ts`, used in `api/bookings/route.ts` and `lib/bookingValidation.ts`, shown on the booking confirmation | Returns `https://meet.coachconnect.dev/room/<bookingId>`, labelled "Mock link" in the UI | Parents see a link to a domain the app doesn't control | A video provider API (Daily, Whereby or Zoom), or hide the feature until one is added |
| Background check | `src/lib/backgroundCheck.ts`, `api/coach/background-check` | The coach clicks a button and, after a 1.2-second delay, gets a random result: `CLEAR` 90% of the time, otherwise `FLAGGED`. Nothing stops a re-run after `FLAGGED`. | `isCoachLive` requires a valid background check for adult coaches, so **the go-live safety gate is a dice roll the coach can repeat.** Admins can already set the status by hand (`api/admin/coaches/[id]/background-check`). | Short term: remove the self-serve button so only an admin can mark a check clear. Real fix: a screening provider (for example Checkr) with its webhook, the required disclosure and consent, and admin review of flagged results. |
| Coach payouts | none (see section 5) | Nothing is paid out. `CoachProfile.payoutStatus` exists in the schema but nothing uses it. | Coaches are never paid, but the coach dashboard says "Card held. Paid out when the parent marks it complete, or automatically 48 hours after the session." **That copy is untrue.** | Stripe Connect (see section 5) |
| Tips | `chargeTipOffSession` in `src/lib/payment.ts`, `api/bookings/[id]/tip` | Charges the parent's saved card immediately | The money stays in the platform's Stripe account. The comment says tips "pass through to the coach in full", but nothing transfers them. | Transfer to the coach's Connect account |
| Consent links for under-18 coaches | `api/admin/coaches/[id]/minor-consent-link` | Admins copy the link and send it by hand, because email is mocked | Works, but it's manual (and the tier is off in production) | Send through the real email provider |

---

## 4. Scheduled and background work

| Job | Code | What triggers it today | What production needs |
|---|---|---|---|
| 48-hour auto-release (capture payment if the parent doesn't respond) | `src/lib/autoRelease.ts`, `POST /api/system/auto-release` | Only the "Manual jobs" button on `/admin/analytics`. The route accepts POST from a signed-in admin only. | Vercel Cron, hourly. Cron sends GET without an admin session, so the route needs a GET handler checked against `Authorization: Bearer $CRON_SECRET`. Until then, holds are only captured when a parent marks the session complete or an admin clicks the button. |
| 24-hour and 1-hour reminders | `src/lib/reminders.ts`, `POST /api/system/send-reminders` | The same admin button | The windows are 23–25 hours ahead and 0.5–1.5 hours ahead, so the job has to run at least every 30–60 minutes. **A once-a-day Hobby cron can't do that:** it needs a Pro plan or an external scheduler (GitHub Actions cron, Upstash QStash). Reminders are also mock emails (section 3). |
| Consent link expiry (7 days) | `expiresAt`, checked when the link is opened (`lookupConsentToken`) | Checked on every request | Nothing needed |
| Background-check expiry | `backgroundCheckExpiresAt`, checked in `isCoachLive` / `getBackgroundCheckExpiryState` | Checked on every request | Nothing needed for gating. There are no renewal reminder emails, only a UI state. |
| "Card holds to release" (holds that failed to void after a consent revocation) | Listed on `/admin` (`status CANCELLED, paymentStatus AUTHORIZED`) | An admin follows up by hand in Stripe | Acceptable at low volume. A webhook (section 5) would show when Stripe cancels the hold itself. |
| Revocation re-check (30 s after a revocation) | `after()` in `api/minor-consent/revoke/[token]/route.ts`, `maxDuration = 60` | Runs inside the same request after the response | `after()` works on Vercel if the plan allows 60-second functions. It's one-shot, with no retry if the instance dies. Fine for now. |
| Expired card holds | Not handled | Stripe cancels uncaptured PaymentIntents on its own (see section 5), and the app never finds out | Webhook `payment_intent.canceled` (section 5) |

**Also:** if a capture fails (for example because the hold expired), auto-release logs the error and skips the booking, then picks it up again on every run forever. The booking stays `CONFIRMED` / `AUTHORIZED` and nobody is alerted. It needs a terminal state, such as "capture failed", and an admin alert.

---

## 5. Stripe

**Coach payouts.** There's no Stripe Connect at all: no connected accounts, `transfers`, `transfer_data`, `application_fee_amount` or `on_behalf_of` anywhere in the code. Every payment is captured into the platform's own Stripe account. The 15% platform fee and the coach's share exist only as numbers (`src/lib/money.ts`). Coaches aren't even tracked in the database as owed money, apart from the unused `payoutStatus` field. Paying coaches needs:

- **Coach accounts:** Stripe Connect accounts for coaches (Express is the usual choice), with onboarding during coach setup.
- **Moving the money:** a transfer, or a destination charge with the platform fee, when a session is captured, and the same for tips.
- **Under-18 coaches:** check Stripe's age and eligibility rules for connected accounts before planning payouts to 16–17-year-olds. It may need a parent-held account or a different payout route.

**Webhooks.** There are none (no webhook route and no `constructEvent`). The app only learns about payments from its own API calls. Real money needs a webhook endpoint that checks signatures (`STRIPE_WEBHOOK_SECRET`, raw request body), handling at least:

- **`payment_intent.canceled`:** a hold expired or was cancelled outside the app.
- **`payment_intent.succeeded`:** a package was paid but the browser closed before `POST /api/packages`, so the parent was charged with no package created.
- **`payment_intent.payment_failed` and `requires_action`:** off-session charges for quick rebooks and tips.
- **`charge.refunded` and `charge.dispute.created`:** chargebacks.
- **`account.updated`:** once Connect exists, to track coach onboarding status.

A card hold confirmed in the browser for a booking that's never saved is also orphaned today. The hold expires on its own, but the parent sees a pending charge.

**Bookings made well ahead of the session.**

- **When the hold is placed:** at booking time (`api/bookings/create-intent`, `capture_method: "manual"`). Quick rebook does the same off-session (`chargeOffSessionHold`).
- **When it's captured:** when the parent marks the session complete (`api/bookings/[id]/complete`), or 48 hours after the session ends through auto-release.
- **How far ahead parents can book:** the booking UI offers up to 42 days (`MAX_DAYS = 42` in `api/coaches/[id]/open-slots`). The server sets no maximum.
- **How long holds last:** Stripe cancels an uncaptured card PaymentIntent when the authorization expires, usually after about 7 days for online card payments and sooner for some card types. Check Stripe's current "place a hold on a payment method" docs.
- **What happens when it expires:**
  - "Mark complete" returns a 502 error, "We couldn't charge the card on file".
  - The booking stays `CONFIRMED`, and the dashboard keeps saying "Card held".
  - Auto-release retries forever (section 4), and the coach is never paid.
  - A no-show's attempt to cancel the hold also fails and is only logged.
- **Who's affected:** any booking where capture happens more than about 5 days after booking. **Quick rebook books the same slot about 7 days ahead, so in live mode almost every quick rebook would fail to capture.**
- **The usual fix:**
  1. At booking, save the card with a SetupIntent (or `setup_future_usage`) and don't place a hold yet.
  2. A scheduled job places the manual-capture hold off-session about 24–48 hours before the session. If Stripe needs the parent to confirm their card, email them a link and cancel the booking if they don't.
  3. Capture after the session, as today.

  Alternatives: cap bookings at about 5 days ahead (worse for families), or renew holds before they expire. Stripe's extended authorizations (up to about 30 days) are only available to some merchant categories and pricing plans. Ask Stripe if you want to rely on them.

---

## 6. Environment variables

The code reads these (search of `process.env.*` in `src/`, `prisma/`):

| Variable | Used in | Notes |
|---|---|---|
| `DATABASE_URL` | `src/lib/prisma.ts`, `prisma/seed.ts` | Only `url` is passed to the libSQL adapter, so for Turso the auth token has to be inside this URL (`libsql://…?authToken=…`). Falls back to `file:./dev.db` if missing (section 2). |
| `NEXTAUTH_SECRET` | `src/lib/auth.ts` | Must be set. Sessions are JWTs signed with it. |
| `NEXTAUTH_URL` | Read by next-auth itself | On Vercel next-auth can fall back to the deployment URL, but set it to the production domain so sign-in redirects and callbacks use the real domain. |
| `STRIPE_SECRET_KEY` | `src/lib/stripe.ts` | Test or live key. Production should only get the live key once section 5 is done. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `BookingForm.tsx`, `CardSection.tsx`, `PackagePurchaseForm.tsx` | Baked into the browser code at build time, so redeploy after changing it. It must be the same mode (test or live) as the secret key. |
| `ENABLE_MINOR_COACHES`, `MINOR_COACHES_LEGAL_REVIEW_CONFIRMED` | `src/lib/flags.ts` | Leave both unset or `"false"` in production (the tier is off). |

**Owner to confirm in Vercel** (I couldn't see the project settings): that all of the above exist for the Production environment, and for Preview if previews are used. Previews share the production database.

**Not yet used by the code, but needed by the fixes above:**
- `CRON_SECRET`: for scheduled jobs.
- `STRIPE_WEBHOOK_SECRET`: for webhooks.
- `BLOB_READ_WRITE_TOKEN`, or S3/R2 credentials: for file storage.
- An email provider key, such as `RESEND_API_KEY`.
- A background-check provider key, such as `CHECKR_API_KEY`.
- A video provider key, if video calls are kept.

---

## 7. Schema changes production (Turso) may still need

- **Hand-written migrations in `prisma/sql/`:**
  - `2026-10-06-contact-moderation.sql` (PR #2, message moderation: strikes, suspension, flagged log). I'm assuming this is "Fix 1", which you said is applied.
  - `2026-10-07-minor-coach-consent.sql` (PR #4). Applied, as you confirmed on 2026-10-08.
- **Since then:** no schema changes on `master` after `9734f4d`. PR #5 (16+ age rule and docs) had none.
- **Earlier changes:** schema changes before 2026-10-06 (the commits on 2026-08-31, 09-06, 09-12, 09-20 and 09-27) have no SQL files in `prisma/sql/`. I can't tell from the repo whether production got all of them. If production was created from the schema after 2026-09-27, it has them. To be sure, compare `PRAGMA table_info` for each table in Turso with `prisma/schema.prisma`. That's a read-only check the owner runs, and I can write a read-only script for it on request.
- **Future:** the fixes in this report will need new additive schema changes, for example:
  - a Stripe Connect account id and payout status for coaches;
  - hold-scheduling and capture-failure fields on `Booking`;
  - a table of processed webhook events.

---

## Prioritized list

### Must fix before beta (real families and coaches, even with test-mode payments)

1. **File uploads:** move to object storage with direct browser uploads, and keep IDs private (section 1). Without this, no coach can upload an ID, photo or video, and "A person reviews every coach's ID" (footer, homepage, parent signup, site description) isn't true.
2. **Background check:** remove the coach's self-serve random check, so only an admin can mark a check clear until a real provider is added (section 3).
3. **Email:** add a real provider for reminders, cancellations, no-shows, auto-release notices and consent links, and add a password reset. Stop writing email bodies, especially consent and withdraw links, to the logs (section 3).
4. **Scheduled jobs:**
   - Make the auto-release and reminder routes callable by a scheduler, with a GET handler and `CRON_SECRET`.
   - Schedule both hourly or better. That needs Vercel Pro or an external scheduler.
   - Give failed captures a terminal state and an admin alert (section 4).
5. **Untrue or broken copy:**
   - Coach dashboard: "Paid out when the parent marks it complete…" (no payouts exist).
   - The ID-review line in its four places, until uploads work.
   - Booking confirmation: the mock video-call link. Hide it, or replace it with a real provider.
6. **Environment and config:**
   - Confirm the Vercel variables in section 6.
   - Make `prisma.ts` throw a clear error if `DATABASE_URL` is missing.
   - Run the Turso schema comparison in section 7.

### Before real money (switching to live Stripe keys)

1. **Stripe Connect payouts to coaches,** including tips, and the right copy about when coaches get paid. Check the rules for paying 16–17-year-old coaches before enabling that tier.
2. **Card-hold timing:** save the card at booking and place the hold about 24–48 hours before the session. Otherwise any booking more than about 5 days ahead, and nearly every quick rebook, will fail to capture (section 5).
3. **Stripe webhook endpoint** with signature checks, for the events in section 5 (expired or cancelled holds, package payments finished after the browser closed, failed off-session charges, refunds, disputes, Connect account updates).
4. **A real background-check provider** with webhook, disclosure and consent, and admin review of flagged results. Whether this has to come before beta is the owner's safety call. Today checks are clearly a placeholder and aren't claimed anywhere, but adult coaches still meet families in person.
5. **A server-side limit on how far ahead a session can be booked,** to match the hold design.

### Later

- Clean up orphaned holds (authorized in the browser but never booked) using the webhook data.
- Background-check renewal reminder emails.
- Real video-call provider, if the first-session video call is kept.
- Admin notification for new support requests (they only go into the admin queue today).
- Confirm the coach photo committed to git is a test image, or remove it from the repo.
- Before ever turning the minor-coach tier on: confirm the real email provider is in place, so consent and withdraw links are emailed, not logged or sent by hand.
