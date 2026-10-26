import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { del, get, head, BlobNotFoundError } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  UPLOAD_RULES,
  checkUploadFile,
  coachUploadPathname,
  isOwnUploadPathname,
  type BioVideoClipType,
  type UploadKind,
} from "./uploadRules";

/**
 * Coach uploads live in two Vercel Blob stores: a private one for ID photos (school or
 * government) and a public one for profile photos and bio videos. Files go straight from the browser to the
 * store (so Vercel's ~4.5 MB request limit doesn't apply):
 *
 *   1. POST /api/coach/upload-token: the server checks the coach, picks the pathname and issues
 *      a short-lived client token locked to that pathname, content type and size limit.
 *   2. The browser uploads the file with that token.
 *   3. POST /api/coach/upload-{id,photo,video}: the server checks the stored file (owner folder,
 *      type, size), saves it on CoachProfile and deletes the file it replaced.
 *
 * Each store has its own read-write token, passed explicitly on every call so nothing can
 * fall back to a default BLOB_READ_WRITE_TOKEN / OIDC store and write to the wrong one.
 */

/** An error whose message is safe to show the coach. */
export class UploadError extends Error {}

const TOKEN_ENV = {
  private: "BLOB_PRIVATE_READ_WRITE_TOKEN",
  public: "BLOB_PUBLIC_READ_WRITE_TOKEN",
} as const;

function storeToken(access: "private" | "public"): string {
  const name = TOKEN_ENV[access];
  const token = process.env[name];
  if (!token) {
    console.error(`[storage] ${name} is not set, so ${access} file storage is unavailable.`);
    throw new UploadError("File uploads aren't available right now. Please try again later.");
  }
  return token;
}

// Long enough for a large file on a slow phone connection (the SDK default is 30 seconds).
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

/** Step 1: validates the file the coach is about to send and returns a client token for it. */
export async function createCoachUploadToken(
  kind: UploadKind,
  coachProfileId: string,
  file: { type: string; size: number },
  clipType?: BioVideoClipType,
): Promise<{ clientToken: string; pathname: string }> {
  const problem = checkUploadFile(kind, file);
  if (problem) throw new UploadError(problem);
  const rule = UPLOAD_RULES[kind];
  const pathname = coachUploadPathname(kind, coachProfileId, file.type, clipType);
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: storeToken(rule.access),
    pathname,
    allowedContentTypes: [file.type],
    maximumSizeInBytes: rule.maxBytes,
    addRandomSuffix: true,
    validUntil: Date.now() + UPLOAD_WINDOW_MS,
  });
  return { clientToken, pathname };
}

/**
 * Step 3: confirms an uploaded file is this coach's and still within the limits, and returns
 * what to store (`pathname` for private IDs, `url` for public files). Rule-breaking files are
 * deleted. The store already enforces type and size through the client token; this is the
 * server-side backstop.
 */
export async function confirmCoachUpload(
  kind: UploadKind,
  coachProfileId: string,
  pathname: unknown,
): Promise<{ pathname: string; url: string }> {
  if (typeof pathname !== "string" || !isOwnUploadPathname(kind, coachProfileId, pathname)) {
    throw new UploadError("That upload doesn't belong to your account.");
  }
  const token = storeToken(UPLOAD_RULES[kind].access);
  let blob;
  try {
    blob = await head(pathname, { token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new UploadError("We couldn't find that upload. Please try again.");
    throw err;
  }
  const problem = checkUploadFile(kind, { type: blob.contentType, size: blob.size });
  if (problem) {
    await deleteStoredCoachFile(kind, blob.pathname);
    throw new UploadError(problem);
  }
  return { pathname: blob.pathname, url: blob.url };
}

/**
 * Turns a stored value (a pathname for IDs, a public URL for photos and videos) into a
 * pathname in our store folder for `kind`. Returns null for anything else, including the
 * pre-Blob local values (`/uploads/...` URLs and bare ID filenames).
 */
function storedPathname(kind: UploadKind, value: string): string | null {
  const folder = `${UPLOAD_RULES[kind].folder}/`;
  if (value.startsWith(folder)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".blob.vercel-storage.com")) return null;
    const pathname = decodeURIComponent(url.pathname.slice(1));
    return pathname.startsWith(folder) ? pathname : null;
  } catch {
    return null;
  }
}

/**
 * Deletes a file this app stored, such as the one a re-upload replaced. Never throws: a
 * failed delete only leaves an unreferenced file behind, so it's logged rather than shown.
 */
export async function deleteStoredCoachFile(kind: UploadKind, value: string | null | undefined): Promise<void> {
  if (!value) return;
  const pathname = storedPathname(kind, value);
  if (!pathname) return;
  try {
    await del(pathname, { token: storeToken(UPLOAD_RULES[kind].access) });
  } catch (err) {
    // ID paths stay out of the logs, and so does the error, in case it echoes the path.
    if (kind === "id") console.error(`[storage] Couldn't delete a replaced ID file (${err instanceof Error ? err.name : "unknown error"}).`);
    else console.error(`[storage] Couldn't delete ${kind} file ${pathname}:`, err);
  }
}

/** Shared error response for the upload routes: friendly messages only, never raw errors. */
export function uploadErrorResponse(err: unknown): NextResponse {
  if (err instanceof UploadError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[storage] Upload failed:", err);
  return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
}

// Before Blob, ID photos were written to local disk. Only dev databases can still point there.
const LEGACY_PRIVATE_ROOT = path.join(process.cwd(), "storage", "id-verifications");

function legacyContentType(filename: string) {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Streams a school ID photo from the private store. Callers must have already checked that
 * the viewer is the coach who owns it or an admin. Returns null if the file is missing.
 */
export async function idPhotoResponse(idPhotoPath: string): Promise<NextResponse | null> {
  if (idPhotoPath.startsWith(`${UPLOAD_RULES.id.folder}/`)) {
    const result = await get(idPhotoPath, { access: "private", token: storeToken("private") });
    if (!result || result.statusCode !== 200) return null;
    return new NextResponse(result.stream, {
      headers: { ...PRIVATE_HEADERS, "Content-Type": result.blob.contentType },
    });
  }

  try {
    // Legacy filenames were uuid-based and generated by us; basename() still blocks traversal.
    const buffer = await readFile(path.join(LEGACY_PRIVATE_ROOT, path.basename(idPhotoPath)));
    return new NextResponse(new Uint8Array(buffer), {
      headers: { ...PRIVATE_HEADERS, "Content-Type": legacyContentType(idPhotoPath) },
    });
  } catch {
    return null;
  }
}
