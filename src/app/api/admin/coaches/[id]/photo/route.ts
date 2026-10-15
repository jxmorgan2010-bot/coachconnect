import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { approvePendingProfilePhoto, rejectPendingProfilePhoto, PhotoReviewConflict } from "@/lib/profilePhoto";

/** Approves or rejects a coach's pending profile photo. `url` is the pending photo the admin reviewed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const url = body?.url;
  if ((action !== "approve" && action !== "reject") || typeof url !== "string" || !url) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (action === "approve") await approvePendingProfilePhoto(id, url);
    else await rejectPendingProfilePhoto(id, url);
  } catch (err) {
    if (err instanceof PhotoReviewConflict) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
