import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { resolvePrivateFilePath } from "@/lib/storage";

function contentTypeFor(filename: string) {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { filename } = await params;

  const coach = await prisma.coachProfile.findFirst({
    where: { idPhotoPath: filename },
    select: { userId: true },
  });
  if (!coach) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isOwner = coach.userId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const buffer = await readFile(resolvePrivateFilePath(filename));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeFor(filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
