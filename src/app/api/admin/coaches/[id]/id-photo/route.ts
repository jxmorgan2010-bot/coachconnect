import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { idPhotoResponse } from "@/lib/storage";

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
    return response ?? NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch (err) {
    console.error("[id-photo] Couldn't load ID photo for coach", id, err);
    return NextResponse.json({ error: "Couldn't load the ID photo." }, { status: 500 });
  }
}
