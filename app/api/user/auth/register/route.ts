import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createUserSession, setUserSessionCookie } from "@/lib/auth";
import { isRealEmail } from "@/lib/email-validator";
import { sanitizeEmail, sanitizeInput, validateUid, isSuspiciousRequest, logSecurityEvent } from "@/lib/security";
import { encryptField } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  // Check for suspicious requests
  if (isSuspiciousRequest(req)) {
    logSecurityEvent("SUSPICIOUS_REGISTRATION", { url: req.url }, req);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const email = sanitizeEmail(body.email || "");
    const password = body.password || "";
    const name = sanitizeInput(body.name || "", 50);
    const referralCode = sanitizeInput(body.referralCode || "", 20);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const emailValid = await isRealEmail(email);
    if (!emailValid) {
      return NextResponse.json(
        { error: "Please use a real email address (e.g., Gmail, Outlook)" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check password strength
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain uppercase, lowercase, and numbers" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists with this email" },
        { status: 400 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Find referrer by referral code (last 6 chars of user ID)
    let referredById = null;
    if (referralCode) {
      const potentialReferrers = await prisma.user.findMany({
        where: { id: { endsWith: referralCode.toUpperCase() } },
        select: { id: true }
      });
      if (potentialReferrers.length === 1) {
        referredById = potentialReferrers[0].id;
      }
    }

    // Encrypt email before saving
    const encryptedEmail = encryptField(email);
    if (!encryptedEmail) {
      return NextResponse.json(
        { error: "Failed to encrypt email" },
        { status: 500 }
      );
    }
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: encryptedEmail,
        passwordHash,
        name,
        referredById,
      },
    });

    // Create session
    const session = await createUserSession({
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      vipRank: user.vipRank,
    });

    // Set cookie
    await setUserSessionCookie(session);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        vipRank: user.vipRank,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
