# Redesign follow-ups

Issues found during the UI-only redesign (branch `redesign`) that need logic, payment,
or data changes, so they were deliberately **not** fixed on this branch.

## 1. Quick rebook fails when the parent's latest session hasn't happened yet

**What a parent sees:** they book a coach twice, open the coach's profile, tap
"Quick rebook with …", and get "That time was just booked by someone else. Pick
another time." Nobody else booked it — the app tried to book the parent's own slot.

**Why:** quick rebook copies the parent's most recent booking with that coach and
moves it to "the next occurrence of the same weekday and time." The helper that
does this only moves the date forward when the original is already in the past.
If the most recent booking is still upcoming, it returns that same date and time,
which is already taken by the parent's own booking, so the conflict check rejects it.

**Files involved:**
- `src/lib/rebook.ts` — `nextOccurrenceOf()` returns the original date unchanged when it's in the future.
- `src/app/coaches/[id]/page.tsx` — picks the booking to rebook from: the most recent by `scheduledAt`, including upcoming ones.
- `src/app/api/bookings/quick-rebook/route.ts` — calls `nextOccurrenceOf()`, then `validateBookingRequest()`, which raises the conflict.
- (`src/app/dashboard/BookingActions.tsx` — the button; display only, not part of the bug.)

**Possible fixes (need a decision; both are logic changes):**
- A: make `nextOccurrenceOf()` always return a date at least one week after the original *and* after now.
- B: base quick rebook on the parent's most recent *past* session instead.

**Verified on the redesign branch:** quick rebook works with Stripe test card 4242
when the latest session is in the past, and reproduces the error when it's upcoming.

## 2. Background checks are a mock

`src/lib/backgroundCheck.ts` simulates a Checkr result. Going live still requires a
"CLEAR" result from this mock. Until a real provider is integrated, no parent-facing
page may claim coaches are background-checked (enforced by the copy on this branch).

## 3. Contact details aren't filtered from messages

**Addressed on `fix/message-moderation`:** server-side contact filter on messages and every other user-entered text others can see, with strikes, suspension and an admin Flagged attempts view.

Nothing stops a parent or coach typing a phone number or email into chat. Copy on this
branch only claims that the app doesn't *show* contact details, which is true. If the
product wants to promise more, messages need server-side filtering.

## 4. Booking times ignore a coach's posted availability

**Addressed on `fix/booking-hours`:** the form only offers times inside posted Pacific hours that fit the session, and every server booking path enforces the same rule.

Coaches set weekly hours in onboarding, and those hours show on their profile, but the
booking form offers every 30-minute slot from 7am to 9pm regardless
(`src/app/coaches/[id]/book/BookingForm.tsx`, `SLOT_START_MINUTE`/`SLOT_END_MINUTE`;
the server-side checks in `src/lib/bookingValidation.ts` don't check availability either).
A parent can book a coach at a time the coach never offered. Copy on this branch only
says the hours are "shown on your public profile," which is true.

## 5. Seed data uses Austin, TX coaches

`prisma/seed.ts` creates coaches in Austin, TX, but the launch market is the Bay Area.
Only affects local/dev data and screenshots.
