import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { idPhotoResponse } from "@/lib/storage";
import { ID_REVIEW_WINDOW_SECONDS, idReviewCookieName, idReviewCookiePath, issueIdReviewToken } from "@/lib/idReview";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const coach = await prisma.coachProfile.findUnique({ where: { id }, select: { idPhotoPath: true } });
  if (!coach?.idPhotoPath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const response = await idPhotoResponse(coach.idPhotoPath);
    if (!response) return NextResponse.json({ error: "Not found." }, { status: 404 });
    // Records that this admin opened this exact ID; approving requires it (see lib/idReview.ts).
    response.cookies.set(
      idReviewCookieName(id),
      issueIdReviewToken({ adminUserId: admin.user.id, coachProfileId: id, idPhotoPath: coach.idPhotoPath }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: idReviewCookiePath(id),
        maxAge: ID_REVIEW_WINDOW_SECONDS,
      },
    );
    return response;
  } catch (err) {
    console.error("[id-photo] Couldn't load ID photo for coach", id, err);
    return NextResponse.json({ error: "Couldn't load the ID photo." }, { status: 500 });
  }
}
