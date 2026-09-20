import type { Metadata } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono, Battambang } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/prisma";
import { CurrencyProvider } from "@/lib/currency";
import RouteProgress from "@/components/RouteProgress";
import AnnouncementBar from "@/components/AnnouncementBar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Providers from "@/components/Providers";
import LiveRefresher from "@/components/LiveRefresher";
import SupportBubble from "@/components/SupportBubble";
import LiveDeliveryFeed from "@/components/LiveDeliveryFeed";

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk" 
});

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ["latin"], 
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta" 
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"], 
  weight: ["400", "600"],
  variable: "--font-jetbrains-mono" 
});

const battambang = Battambang({ 
  subsets: ["latin", "khmer"], 
  weight: ["400", "700"],
  variable: "--font-battambang" 
});

export const metadata: Metadata = {
  title: "Ty Khai TopUp — Fast & Secure Game Top Up",
  description:
    "Top up Mobile Legends, Free Fire, PUBG, Genshin Impact and more. Instant delivery, secure KHQR payment. 24/7 service in Cambodia.",
  keywords: [
    "top up",
    "mobile legends diamonds",
    "free fire diamonds",
    "pubg uc",
    "genshin impact",
    "ABA Pay",
    "KHQR",
    "Cambodia top up",
  ],
  openGraph: {
    title: "Ty Khai TopUp — Fast & Secure Game Top Up",
    description: "Instant game top-ups with KHQR · ABA Pay · Wing · ACLEDA",
    type: "website",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icon-512x512.png", sizes: "512x512" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ty Khai TopUp",
  },
};

export const viewport = {
  themeColor: "#6366f1",
};

import SecurityWrapper from "@/components/SecurityWrapper";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let exchangeRate = 4100;
  
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);
    exchangeRate = settings?.exchangeRate ?? 4100;
  } catch (error) {
    console.warn('Could not fetch settings, using default exchange rate');
  }
  
  let session = null;
  try {
    // Only attempt session if NextAuth is properly configured
    if (process.env.NEXTAUTH_SECRET && process.env.GOOGLE_CLIENT_ID) {
      session = await getServerSession(authOptions);
    }
  } catch (error) {
    // Silently ignore session errors - they're usually from corrupted cookies
    // The page will still work, just without admin session
    console.warn('[layout] Session fetch error:', error instanceof Error ? error.message : error);
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} ${battambang.variable}`}>
      <body className="font-battambang">
        <Providers session={session}>
          <SecurityWrapper>
            <RouteProgress />
            <CurrencyProvider exchangeRate={exchangeRate}>
              <AnnouncementBar />
              {children}
              <LiveDeliveryFeed />
              <SupportBubble />
            </CurrencyProvider>
          </SecurityWrapper>
        </Providers>
      </body>
    </html>
  );
}
