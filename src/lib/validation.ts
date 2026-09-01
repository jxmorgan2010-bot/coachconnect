import { z } from "zod";
import { SPORTS } from "@/lib/sports";

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

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty.").max(4000),
});

export const coachRegisterSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name."),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const coachProfileSchema = z.object({
  bio: z.string().trim().min(30, "Bio should be at least 30 characters.").max(2000),
  schoolLevel: z.enum(["HIGH_SCHOOL", "COLLEGE"]),
  schoolName: z.string().trim().min(2, "School name is required."),
  gradYear: z.coerce.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 8),
  hourlyRateDollars: z.coerce.number().min(5, "Minimum rate is $5/hr.").max(500, "Max rate is $500/hr."),
  city: z.string().trim().min(2, "City is required."),
  state: z.string().trim().min(2, "State is required.").max(2, "Use a 2-letter state code."),
  zip: z.string().trim().min(5, "Enter a 5-digit zip code.").max(10).optional().or(z.literal("")),
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

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
