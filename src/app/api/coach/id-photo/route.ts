import { NextResponse } from "next/server";
import { requireCoachProfile } from "@/lib/session";
import { idPhotoResponse } from "@/lib/storage";

/** The signed-in coach's own ID photo (school or government), streamed from the private store. Admins use /api/admin/coaches/[id]/id-photo. */
export async function GET() {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!profile.idPhotoPath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const response = await idPhotoResponse(profile.idPhotoPath);
    return response ?? NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (err) {
    console.error("[id-photo] Couldn't load the coach's ID photo:", err);
    return NextResponse.json({ error: "Couldn't load the ID photo." }, { status: 500 });
  }
}
