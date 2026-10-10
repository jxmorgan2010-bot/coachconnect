import { z } from "zod";
import { SPORTS } from "@/lib/sports";
import { BAY_AREA_CITIES, isBayAreaZip } from "@/lib/bayArea";
import { parseCalendarDate, compareCalendarDates, todayInPacific } from "@/lib/age";

export const parentRegisterSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name."),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  phone: z.string().trim().optional(),
  referralCode: z.string().trim().optional(),
});

export const childSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  gradeOrAge: z.string().trim().min(1, "Grade or age is required.").max(30),
  notes: z.string().trim().max(500).optional(),
});

export const bookingCreateSchema = z.object({
  coachProfileId: z.string().min(1),
  childId: z.string().min(1, "Select which child this session is for."),
  sport: z.enum(SPORTS as [string, ...string[]]),
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), "Pick a future date and time."),
  durationMinutes: z.coerce.number().int().min(30).max(180),
  locationText: z.string().trim().min(5, "Enter a public location, like a park or rec center."),
  consent: z.literal(true, { error: "Parental consent is required to book." }),
  paymentIntentId: z.string().trim().min(1).optional(),
  // Required only when the selected coach is a minor coach — validated against that fact
  // server-side in validateBookingRequest, since it depends on which coach was picked.
  secondAdultName: z.string().trim().min(2, "Enter the second adult's name.").max(120).optional(),
  // When set, this booking draws from a prepaid SessionPackage instead of a card hold —
  // see validatePackageBookingRequest, which locks sport/coach/duration to the package.
  packageId: z.string().trim().min(1).optional(),
});

export const packagePurchaseSchema = z.object({
  coachProfileId: z.string().min(1),
  sport: z.enum(SPORTS as [string, ...string[]]),
  durationMinutes: z.coerce.number().int().min(30).max(180),
});

export const packageConfirmSchema = z.object({
  paymentIntentId: z.string().trim().min(1),
});

export const quickRebookSchema = z.object({
  bookingId: z.string().trim().min(1),
});

export const pointsRedeemSchema = z.object({
  points: z.coerce.number().int().min(1, "Enter how many points to redeem."),
});

export const trainingPlanItemSchema = z.object({
  childId: z.string().trim().min(1),
  sport: z.enum(SPORTS as [string, ...string[]]),
  label: z.string().trim().min(2, "Describe the drill or focus area.").max(200),
});

export const trainingPlanToggleSchema = z.object({
  isDone: z.boolean(),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const progressNoteSchema = z.object({
  whatWorkedOn: z.string().trim().min(3, "Add a few words on what you worked on.").max(1000),
  nextFocus: z.string().trim().max(1000).optional(),
});

export const disputeSchema = z.object({
  reason: z.enum(["NO_SHOW", "DISSATISFIED", "OTHER"]),
  details: z.string().trim().min(10, "Give a few details so admins can look into it.").max(2000),
});

export const noShowSchema = z.object({
  details: z.string().trim().max(2000).optional(),
});

export const tipSchema = z.object({
  tipCents: z.coerce.number().int().min(100, "Minimum tip is $1.").max(50000, "Max tip is $500."),
});

export const supportRequestSchema = z.object({
  bookingId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(5, "Give us a few details so we can help.").max(2000),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty.").max(4000),
});

export const coachRegisterSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name."),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  // A calendar date ("YYYY-MM-DD"), compared against today in Pacific time — see src/lib/age.ts.
  dateOfBirth: z
    .string()
    .transform((value, ctx) => {
      const date = parseCalendarDate(value);
      if (!date || date.year < 1900 || compareCalendarDates(date, todayInPacific()) >= 0) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date of birth." });
        return z.NEVER;
      }
      return date;
    }),
  // CoachConnect is Bay Area only at launch — see src/lib/bayArea.ts.
  zip: z
    .string()
    .trim()
    .min(5, "Enter a 5-digit zip code.")
    .max(10)
    .refine(isBayAreaZip, "CoachConnect is Bay Area only at launch. That zip code isn't in our service area yet."),
});

/** The teen names the parent/guardian who should receive the consent link. */
export const minorConsentRequestSchema = z.object({
  guardianName: z.string().trim().min(2, "Enter your parent or guardian's full name.").max(120),
  guardianEmail: z.string().trim().pipe(z.email("Enter a valid email address for your parent or guardian.").max(254)),
});

export const GUARDIAN_RELATIONSHIPS = ["Parent", "Legal guardian"] as const;

/** What the parent/guardian submits on the consent page. Acknowledgments are checked against the current text in src/lib/minorConsent.ts. */
export const minorConsentSignSchema = z.object({
  consentTextVersion: z.string().min(1),
  acknowledgedKeys: z.array(z.string()).max(50),
  signerLegalName: z.string().trim().min(2, "Enter your full legal name.").max(120),
  signerRelationship: z.enum(GUARDIAN_RELATIONSHIPS, { error: "Choose your relationship to the coach." }),
  emergencyContactName: z.string().trim().min(2, "Enter an emergency contact name.").max(120),
  emergencyContactPhone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15;
    }, "Enter an emergency contact phone number, including area code."),
  confirmedAdult: z.literal(true, { error: "Confirm that you're 18 or older." }),
  typedSignature: z.string().trim().min(2, "Type your full legal name to sign.").max(120),
});

export const ageIdentityVerificationSchema = z.object({
  method: z.string().trim().min(3, "Describe how age and identity were verified.").max(2000),
});

export const minorVerificationNoteSchema = z.object({
  note: z.string().trim().min(1, "Enter a note describing the verification performed.").max(2000),
});

export const coachProfileSchema = z.object({
  bio: z.string().trim().min(30, "Bio should be at least 30 characters.").max(2000),
  schoolLevel: z.enum(["HIGH_SCHOOL", "COLLEGE"]),
  schoolName: z.string().trim().min(2, "School name is required."),
  gradYear: z.coerce.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 8),
  hourlyRateDollars: z.coerce.number().min(5, "Minimum rate is $5/hr.").max(500, "Max rate is $500/hr."),
  // Bay Area only at launch — city is a fixed select (see BAY_AREA_CITIES) rather than
  // free text so it can't drift from the list the coach search filter matches against.
  city: z.enum(BAY_AREA_CITIES as [string, ...string[]], { error: "Select a Bay Area city." }),
  state: z.string().trim().min(2, "State is required.").max(2, "Use a 2-letter state code."),
  zip: z
    .string()
    .trim()
    .min(5, "Enter a 5-digit zip code.")
    .max(10)
    .refine(isBayAreaZip, "CoachConnect is Bay Area only at launch. That zip code isn't in our service area yet."),
  sports: z.array(z.enum(SPORTS as [string, ...string[]])).min(1, "Select at least one sport."),
});

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(1).max(1440),
}).refine((slot) => slot.endMinute > slot.startMinute, {
  message: "End time must be after start time.",
  path: ["endMinute"],
});

export const availabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).min(1, "Add at least one availability slot."),
});

export const recommendationRequestSchema = z.object({
  recommenderName: z.string().trim().min(2).optional(),
  recommenderRole: z.string().trim().min(2).optional(),
});

export const recommendationSubmitSchema = z.object({
  token: z.string().min(10),
  recommenderName: z.string().trim().min(2, "Please enter your name."),
  recommenderRole: z.string().trim().min(2, "Please enter your role (e.g. Varsity Coach)."),
  content: z.string().trim().min(20, "Please write at least a couple of sentences.").max(2000),
});

export const waitlistSchema = z.object({
  email: z.email("Please enter a valid email address."),
  zip: z.string().trim().min(5, "Enter a 5-digit zip code.").max(10),
  role: z.enum(["PARENT", "COACH"]).optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
