import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function hoursFromNow(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@coachconnect.dev" },
    update: {},
    create: {
      email: "admin@coachconnect.dev",
      name: "CoachConnect Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const demoParentUser = await prisma.user.upsert({
    where: { email: "parent@coachconnect.dev" },
    update: {},
    create: {
      email: "parent@coachconnect.dev",
      name: "Jamie Parent",
      role: "PARENT",
      passwordHash,
      parentProfile: {
        create: {
          phone: "555-0100",
          referralCode: "JAMIE0001",
          children: {
            create: [
              { firstName: "Alex", gradeOrAge: "5th grade" },
              { firstName: "Sam", gradeOrAge: "3rd grade" },
            ],
          },
        },
      },
    },
    include: { parentProfile: { include: { children: true } } },
  });
  const jamie = demoParentUser.parentProfile!;
  const alex = jamie.children.find((c) => c.firstName === "Alex")!;
  const sam = jamie.children.find((c) => c.firstName === "Sam")!;

  const referredParentUser = await prisma.user.upsert({
    where: { email: "taylor@coachconnect.dev" },
    update: {},
    create: {
      email: "taylor@coachconnect.dev",
      name: "Taylor Guardian",
      role: "PARENT",
      passwordHash,
      parentProfile: {
        create: {
          phone: "555-0101",
          referralCode: "TAYLOR001",
          referredById: jamie.id,
          creditCents: 1000,
          children: { create: [{ firstName: "Jordan", gradeOrAge: "4th grade" }] },
        },
      },
    },
    include: { parentProfile: { include: { children: true } } },
  });
  const taylor = referredParentUser.parentProfile!;
  const jordan = taylor.children[0];
  await prisma.parentProfile.update({ where: { id: jamie.id }, data: { creditCents: { increment: 1000 } } });

  const coachSeeds = [
    {
      email: "amara.basketball@coachconnect.dev",
      name: "Amara Johnson",
      bio: "Junior guard at State University, 3-year varsity starter in high school. I specialize in ball-handling, shooting form, and building confidence for young players just getting into the game.",
      schoolLevel: "COLLEGE" as const,
      schoolName: "State University",
      gradYear: 2027,
      hourlyRateCents: 4500,
      city: "Austin",
      state: "TX",
      zip: "78701",
      sports: ["BASKETBALL", "TENNIS"] as const,
      idVerificationStatus: "APPROVED" as const,
      backgroundCheckStatus: "CLEAR" as const,
      expiresInDays: 300,
      withRecommendation: true,
    },
    {
      email: "diego.soccer@coachconnect.dev",
      name: "Diego Martinez",
      bio: "Varsity captain and club soccer midfielder heading into my senior year. I love working with beginners on footwork fundamentals and game IQ.",
      schoolLevel: "HIGH_SCHOOL" as const,
      schoolName: "Lincoln High School",
      gradYear: 2026,
      hourlyRateCents: 3500,
      city: "Austin",
      state: "TX",
      zip: "78704",
      sports: ["SOCCER"] as const,
      idVerificationStatus: "APPROVED" as const,
      backgroundCheckStatus: "CLEAR" as const,
      expiresInDays: 20, // renewal needed — good test case
      withRecommendation: false,
    },
    {
      email: "priya.tennis@coachconnect.dev",
      name: "Priya Shah",
      bio: "Two-time regional tennis finalist now playing college tennis. Patient coach who focuses on stroke mechanics and match strategy for all skill levels.",
      schoolLevel: "COLLEGE" as const,
      schoolName: "Riverdale College",
      gradYear: 2028,
      hourlyRateCents: 5000,
      city: "Round Rock",
      state: "TX",
      zip: "78664",
      sports: ["TENNIS", "PICKLEBALL"] as const,
      idVerificationStatus: "APPROVED" as const,
      backgroundCheckStatus: "CLEAR" as const,
      expiresInDays: 200,
      withRecommendation: true,
    },
    {
      email: "marcus.football@coachconnect.dev",
      name: "Marcus Lee",
      bio: "Starting wide receiver looking to help younger athletes with route-running, catching technique, and speed drills.",
      schoolLevel: "HIGH_SCHOOL" as const,
      schoolName: "Westside High School",
      gradYear: 2027,
      hourlyRateCents: 4000,
      city: "Cedar Park",
      state: "TX",
      zip: "78613",
      sports: ["FOOTBALL", "BASEBALL"] as const,
      idVerificationStatus: "APPROVED" as const,
      backgroundCheckStatus: "CLEAR" as const,
      expiresInDays: -5, // expired — good test case for auto-unpublish
      withRecommendation: false,
    },
    // A profile that's fully filled out but still awaiting admin approval (demo of the gating flow).
    {
      email: "sofia.lacrosse@coachconnect.dev",
      name: "Sofia Reyes",
      bio: "Attack for my college club lacrosse team, four years of high school varsity experience. Excited to start coaching!",
      schoolLevel: "COLLEGE" as const,
      schoolName: "Bluff City University",
      gradYear: 2027,
      hourlyRateCents: 4200,
      city: "Austin",
      state: "TX",
      zip: "78702",
      sports: ["LACROSSE"] as const,
      idVerificationStatus: "PENDING" as const,
      backgroundCheckStatus: "PENDING" as const,
      expiresInDays: null,
      withRecommendation: false,
    },
  ];

  const coachIds: Record<string, string> = {};

  for (const seed of coachSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {},
      create: {
        email: seed.email,
        name: seed.name,
        role: "COACH",
        passwordHash,
        coachProfile: {
          create: {
            bio: seed.bio,
            schoolLevel: seed.schoolLevel,
            schoolName: seed.schoolName,
            gradYear: seed.gradYear,
            hourlyRateCents: seed.hourlyRateCents,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
            idVerificationStatus: seed.idVerificationStatus,
            backgroundCheckStatus: seed.backgroundCheckStatus,
            backgroundCheckExpiresAt: seed.expiresInDays !== null ? daysFromNow(seed.expiresInDays) : null,
            conductAcknowledged: true,
            sports: { create: seed.sports.map((sport) => ({ sport })) },
            availability: {
              create: [
                { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 },
                { dayOfWeek: 0, startMinute: 13 * 60, endMinute: 16 * 60 },
              ],
            },
          },
        },
      },
      include: { coachProfile: true },
    });

    const coachProfileId = user.coachProfile!.id;
    coachIds[seed.email] = coachProfileId;

    if (seed.withRecommendation) {
      await prisma.recommendation.upsert({
        where: { token: `seed_${coachProfileId}` },
        update: {},
        create: {
          coachProfileId,
          token: `seed_${coachProfileId}`,
          recommenderName: "Coach Taylor Reed",
          recommenderRole: "Varsity Head Coach",
          content: `${seed.name} is one of the most coachable, hardworking athletes I've worked with. Great with younger players and always positive.`,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });
    }
  }

  const amaraId = coachIds["amara.basketball@coachconnect.dev"];
  const diegoId = coachIds["diego.soccer@coachconnect.dev"];
  const priyaId = coachIds["priya.tennis@coachconnect.dev"];
  const marcusId = coachIds["marcus.football@coachconnect.dev"];

  // Amara + Alex: completed, reviewed, with a progress note (progress-history demo)
  const amaraAlexBooking = await prisma.booking.create({
    data: {
      parentProfileId: jamie.id,
      coachProfileId: amaraId,
      childId: alex.id,
      sport: "BASKETBALL",
      scheduledAt: daysFromNow(-7),
      durationMinutes: 60,
      locationText: "Zilker Park courts",
      priceCents: 4500,
      platformFeeCents: 675,
      status: "COMPLETED",
      parentalConsent: true,
      completedAt: daysFromNow(-7),
      videoCallUrl: "https://meet.coachconnect.dev/room/seed-amara-alex",
      progressWhatWorkedOn: "Ball-handling drills — crossover and hesitation moves. Free throw form.",
      progressNextFocus: "Left-hand layups and staying low on defense.",
      progressNoteAddedAt: daysFromNow(-6),
    },
  });
  await prisma.review.create({
    data: {
      bookingId: amaraAlexBooking.id,
      parentProfileId: jamie.id,
      coachProfileId: amaraId,
      rating: 5,
      comment: "Fantastic first session — patient, encouraging, and Alex can't wait for the next one!",
    },
  });

  // Amara + Sam: completed, NOT yet reviewed (tests the "rate this session" prompt) — also
  // makes Amara "Coached Alex too" for Sam, and vice versa (sibling detection).
  await prisma.booking.create({
    data: {
      parentProfileId: jamie.id,
      coachProfileId: amaraId,
      childId: sam.id,
      sport: "BASKETBALL",
      scheduledAt: daysFromNow(-2),
      durationMinutes: 60,
      locationText: "Zilker Park courts",
      priceCents: 4500,
      platformFeeCents: 675,
      status: "COMPLETED",
      parentalConsent: true,
      completedAt: daysFromNow(-2),
    },
  });

  // Diego + Alex: upcoming, ~24h out — lands right in the reminder sweep's 24h window.
  await prisma.booking.create({
    data: {
      parentProfileId: jamie.id,
      coachProfileId: diegoId,
      childId: alex.id,
      sport: "SOCCER",
      scheduledAt: hoursFromNow(24),
      durationMinutes: 60,
      locationText: "Northside Rec Center field",
      priceCents: 3500,
      platformFeeCents: 525,
      status: "CONFIRMED",
      parentalConsent: true,
      videoCallUrl: "https://meet.coachconnect.dev/room/seed-diego-alex",
    },
  });

  // Priya + Alex: upcoming, further out.
  await prisma.booking.create({
    data: {
      parentProfileId: jamie.id,
      coachProfileId: priyaId,
      childId: alex.id,
      sport: "TENNIS",
      scheduledAt: daysFromNow(10),
      durationMinutes: 60,
      locationText: "Round Rock Community Courts",
      priceCents: 5000,
      platformFeeCents: 750,
      status: "CONFIRMED",
      parentalConsent: true,
      videoCallUrl: "https://meet.coachconnect.dev/room/seed-priya-alex",
    },
  });

  // Marcus + Jordan (Taylor's kid): completed, disputed (no-show) — admin Disputes tab demo.
  const marcusJordanBooking = await prisma.booking.create({
    data: {
      parentProfileId: taylor.id,
      coachProfileId: marcusId,
      childId: jordan.id,
      sport: "FOOTBALL",
      scheduledAt: daysFromNow(-3),
      durationMinutes: 60,
      locationText: "Cedar Park High School field",
      priceCents: 4000,
      platformFeeCents: 600,
      status: "COMPLETED",
      parentalConsent: true,
      completedAt: daysFromNow(-3),
    },
  });
  await prisma.dispute.create({
    data: {
      bookingId: marcusJordanBooking.id,
      parentProfileId: taylor.id,
      coachProfileId: marcusId,
      reason: "NO_SHOW",
      details: "Waited 30 minutes at the field and the coach never showed up or messaged.",
    },
  });

  // Two open reports on Diego — enough to populate the admin Reports queue without
  // tripping the 3-report auto-suspend threshold.
  await prisma.report.createMany({
    data: [
      {
        reporterId: demoParentUser.id,
        targetType: "COACH_PROFILE",
        targetId: diegoId,
        reason: "Suspicious profile",
        details: "Bio seemed copy-pasted from another listing — just flagging for a look.",
      },
      {
        reporterId: referredParentUser.id,
        targetType: "COACH_PROFILE",
        targetId: diegoId,
        reason: "Other safety concern",
        details: "Showed up a few minutes late without a heads-up message.",
      },
    ],
  });

  // A message thread with real back-and-forth so the "average response time" stat has data.
  const amaraUser = await prisma.user.findUniqueOrThrow({ where: { email: "amara.basketball@coachconnect.dev" } });
  const thread = await prisma.thread.upsert({
    where: { parentProfileId_coachProfileId: { parentProfileId: jamie.id, coachProfileId: amaraId } },
    update: {},
    create: { parentProfileId: jamie.id, coachProfileId: amaraId },
  });
  await prisma.message.createMany({
    data: [
      { threadId: thread.id, senderId: demoParentUser.id, body: "Hi! Excited for Alex's first session Saturday.", createdAt: daysFromNow(-8) },
      { threadId: thread.id, senderId: amaraUser.id, body: "Looking forward to it! Meet by the north courts at 9am.", createdAt: new Date(daysFromNow(-8).getTime() + 12 * 60 * 1000) },
      { threadId: thread.id, senderId: demoParentUser.id, body: "Perfect, we'll be there.", createdAt: daysFromNow(-7.9) },
    ],
  });

  console.log("Seeded:", {
    admin: admin.email,
    parents: [demoParentUser.email, referredParentUser.email],
    coaches: coachSeeds.map((c) => c.email),
    referralCode: "JAMIE0001",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
