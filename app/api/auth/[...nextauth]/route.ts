import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

// Explicitly set runtime for better compatibility
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
