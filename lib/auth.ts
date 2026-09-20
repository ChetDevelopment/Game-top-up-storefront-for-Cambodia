import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getServerSession, NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getRank } from "./vip";
import { decryptField, encryptField } from "./encryption";

const ADMIN_COOKIE = "tykhai_admin";
const USER_COOKIE = "tykhai_user";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  
  if (!secret) {
    throw new Error("FATAL: JWT_SECRET or NEXTAUTH_SECRET environment variable is required");
  }
  
  if (secret.length < 32) {
    throw new Error("FATAL: JWT_SECRET must be at least 32 characters long");
  }
  
  if (secret === "development_secret_key_at_least_32_characters_long") {
    throw new Error("FATAL: Default development secret detected. Set a unique JWT_SECRET for production");
  }
  
  return new TextEncoder().encode(secret);
}

// --- NextAuth Options ---
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  // Skip error logging for client-side fetch errors (expected when Google not configured)
  logger: {
    error(code, metadata) {
      // Silence CLIENT_FETCH_ERROR for Google provider when not configured
      if (code === 'CLIENT_FETCH_ERROR' && !process.env.GOOGLE_CLIENT_ID) {
        return;
      }
      console.error('[NextAuth] Error:', code, metadata);
    },
    warn(code) {
      console.warn('[NextAuth] Warning:', code);
    },
    debug(code, metadata) {
      console.log('[NextAuth] Debug:', code, metadata);
    },
  },
  // Ensure proper session configuration
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  // Configure pages to avoid redirect loops
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Debug mode in development
  debug: false, // Disable to prevent JWT error spam
  // Suppress JWT errors in development
  callbacks: {
    async jwt({ token, user, account, error }) {
      // Suppress decryption errors in development
      if (error && process.env.NODE_ENV === 'development') {
        // Silent fail - old cookies cause this
        return { ...token, error: null };
      }
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      // Persist the OAuth access token to the token so we can use it later
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token, error }) {
      // Suppress session errors
      if (error && process.env.NODE_ENV === 'development') {
        return session;
      }
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.email = token.email as string;
        (session.user as any).accessToken = token.accessToken;
        (session.user as any).provider = token.provider;
      }
      return session;
    },
    async signIn({ user, account }) {
      // OAuth sign in
      if (account?.provider === "google") {
        // Make sure the user exists in our database
        let existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });
        
        if (!existingUser) {
          // Create user if doesn't exist (should be handled by adapter, but just in case)
          existingUser = await prisma.user.create({
            data: {
              email: user.email!,
              name: user.name || "",
              role: "USER",
            },
          });
          console.log("[NextAuth] Created new user:", existingUser.id, existingUser.email);
        } else {
          console.log("[NextAuth] Found existing user:", existingUser.id, existingUser.email);
        }
        
        // IMPORTANT: Set our custom cookie so the rest of the app recognizes the user
        // This bridges NextAuth with our custom auth system
        const userSession = await createUserSession({
          userId: existingUser.id,
          email: existingUser.email,
          name: existingUser.name || undefined,
          role: existingUser.role,
          vipRank: existingUser.vipRank,
          pointsBalance: existingUser.pointsBalance,
          walletBalance: existingUser.walletBalance,
        });
        
        // Note: We can't set cookies directly in signIn callback
        // The cookie will be set by the session callback below
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
  events: {
    async createUser(message) {
      console.log("[NextAuth] User created:", { 
        id: message.user.id, 
        email: message.user.email,
        name: message.user.name 
      });
    },
    async linkAccount(message) {
      console.log("[NextAuth] Account linked:", {
        userId: message.user.id,
        provider: message.account.provider,
        providerAccountId: message.account.providerAccountId,
      });
    },
    async session(message) {
      console.log("[NextAuth] Session:", {
        userId: (message.session.user as any)?.id,
        email: message.session.user?.email,
      });
    },
  },
};

export interface AdminSession {
  adminId: string;
  email: string;
  role: string;
}

export interface UserSession {
  userId: string;
  email: string;
  name?: string;
  role: string;
  vipRank: string;
  pointsBalance?: number;
  walletBalance?: number;
}

// --- Admin Auth ---
export async function createAdminSession(payload: AdminSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.adminId) return null;
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return await verifyAdminSession(token);
}

export async function verifyAdminCredentials(email: string, password: string) {
  // Email lookup - try both encrypted and plaintext for migration
  let admin = await prisma.admin.findUnique({ where: { email } });
  
  if (!admin) {
    const encryptedEmail = encryptField(email);
    if (encryptedEmail) {
      admin = await prisma.admin.findFirst({ 
        where: { email: encryptedEmail } 
      });
    }
  }
  
  if (!admin || !admin.active) return null;
  
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return null;
  
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  
  return { 
    adminId: admin.id, 
    email: decryptField(admin.email) || admin.email, 
    role: admin.role 
  };
}

export async function setAdminSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}

// --- User Auth ---
export async function createUserSession(payload: UserSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifyUserSession(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.userId) return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      vipRank: payload.vipRank as string,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserSession | null> {
  let userId: string | null = null;
  let email: string | null = null;

  // 1. Try Manual JWT Cookie (tykhai_user)
  const cookieStore = await cookies();
  const manualToken = cookieStore.get(USER_COOKIE)?.value;
  if (manualToken) {
    const session = await verifyUserSession(manualToken);
    if (session) {
      userId = session.userId;
      email = session.email;
      console.log("[getCurrentUser] Found manual JWT session for:", email);
    }
  }

  // 2. Try NextAuth Session (Google login)
  if (!email) {
    try {
      const nextAuthSession = await getServerSession(authOptions);
      if (nextAuthSession?.user?.email) {
        email = nextAuthSession.user.email;
        userId = (nextAuthSession.user as any).id || null;
        console.log("[getCurrentUser] Found NextAuth session for:", email, "userId:", userId);
        
        // If we have a NextAuth session but no manual cookie, create one
        // This bridges NextAuth with our custom auth system
        if (!manualToken && userId) {
          const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              vipRank: true,
              pointsBalance: true,
              walletBalance: true,
            },
          });
          
          if (dbUser) {
            console.log("[getCurrentUser] Creating manual session for NextAuth user");
            // Create and set our custom cookie
            const sessionToken = await createUserSession({
              userId: dbUser.id,
              email: dbUser.email,
              name: dbUser.name ?? undefined,
              role: dbUser.role,
              vipRank: dbUser.vipRank,
              pointsBalance: dbUser.pointsBalance,
              walletBalance: dbUser.walletBalance,
            });
            
            // Set the cookie
            cookieStore.set(USER_COOKIE, sessionToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              maxAge: SESSION_TTL,
              path: "/",
            });
            
            // Return the session immediately
            return {
              userId: dbUser.id,
              email: dbUser.email,
              name: dbUser.name ?? undefined,
              role: dbUser.role,
              vipRank: dbUser.vipRank,
              pointsBalance: dbUser.pointsBalance,
              walletBalance: dbUser.walletBalance,
            };
          }
        }
      }
    } catch (error) {
      console.error("[getCurrentUser] NextAuth session error:", error);
    }
  }

  if (!email && !userId) return null;

  // 3. Find user in database - try email first for NextAuth users
  const user = await prisma.user.findFirst({
    where: {
      email: email || undefined
    },
    select: { 
      id: true, 
      email: true, 
      name: true, 
      role: true, 
      vipRank: true, 
      pointsBalance: true, 
      walletBalance: true,
      totalSpentUsd: true,
      accounts: {
        select: {
          provider: true,
          providerAccountId: true
        }
      }
    }
  });

  if (!user) {
    console.log("[getCurrentUser] No user found in database for email:", email);
    return null;
  }

  console.log("[getCurrentUser] Found user in database:", user.id, user.email);

  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    role: user.role,
    vipRank: user.vipRank,
    pointsBalance: user.pointsBalance,
    walletBalance: user.walletBalance
  };
}

export async function verifyUserCredentials(email: string, password: string) {
  // Try plaintext first, then encrypted
  let user = await prisma.user.findUnique({ 
    where: { email },
    include: { accounts: true }
  });

  if (!user) {
    const encryptedEmail = encryptField(email);
    if (encryptedEmail) {
      user = await prisma.user.findFirst({ 
        where: { email: encryptedEmail },
        include: { accounts: true }
      });
    }
  }

  if (!user) return null;

  if (!user.passwordHash) {
    if (user.accounts.length > 0) {
      throw new Error("This account uses social login (Google). Please use the social login button.");
    }
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    userId: user.id,
    email: decryptField(user.email) || user.email,
    name: user.name ?? undefined,
    role: user.role,
    vipRank: user.vipRank,
    pointsBalance: user.pointsBalance,
    walletBalance: user.walletBalance,
  };
}

export async function setUserSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(USER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function clearUserSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_COOKIE);
}

export async function updateUserTotalSpent(userId: string, amountUsd: number) {
  if (!userId || amountUsd <= 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totalSpentUsd: true } });
  if (!user) return;
  const newTotal = user.totalSpentUsd + amountUsd;
  const newRank = getRank(newTotal);
  await prisma.user.update({
    where: { id: userId },
    data: { 
      totalSpentUsd: { increment: amountUsd },
      vipRank: newRank
    }
  });
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}

export async function requireUser(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

// Session timeout check (15 minutes for admin)
export function checkSessionTimeout(lastActivity: Date | null, timeoutMinutes: number = 15): boolean {
  if (!lastActivity) return false;
  const now = Date.now();
  const last = new Date(lastActivity).getTime();
  return (now - last) > (timeoutMinutes * 60 * 1000);
}

export { ADMIN_COOKIE, USER_COOKIE };
