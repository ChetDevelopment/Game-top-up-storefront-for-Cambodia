import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import crypto from "crypto";
import { put } from "@vercel/blob";
import { guardAdminApi } from "@/lib/api-security";

export const runtime = "nodejs";

// Fail-fast if token is missing
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("FATAL: BLOB_READ_WRITE_TOKEN is required. Server startup aborted.");
}

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sniffMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "image/gif";
  }

  return null;
}

export async function POST(req: NextRequest) {
  const security = await guardAdminApi(req);
  if ("response" in security) return security.response;

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_BYTES / 1024 / 1024}MB.` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detectedType = sniffMimeType(buffer);
    if (!detectedType) {
      return NextResponse.json(
        { error: "Unsupported file signature. Use PNG, JPG, WEBP, or GIF." },
        { status: 415 }
      );
    }

    if (file.type !== detectedType || !ALLOWED_TYPES[detectedType]) {
      return NextResponse.json(
        { error: `Unsupported type "${file.type}". Use PNG, JPG, WEBP, or GIF.` },
        { status: 415 }
      );
    }

    const name = `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${ALLOWED_TYPES[detectedType]}`;

    // Upload to Vercel Blob (token is now available)
    try {
      const blob = await put(name, buffer, {
        access: "public",
        contentType: detectedType,
      });

      return NextResponse.json({
        url: blob.url,
        size: file.size,
        type: detectedType,
      });
    } catch (blobError) {
      console.error("[upload] Vercel Blob error:", blobError);
      const message = blobError instanceof Error ? blobError.message : "Upload failed";
      return NextResponse.json(
        { error: message.includes("Access denied") ? "Invalid BLOB_READ_WRITE_TOKEN" : message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[upload] error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
