import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Ty Khai TopUp",
  description: "How we collect and protect your data at Ty Khai TopUp.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl sm:text-5xl font-bold mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-royal max-w-none space-y-8 text-royal-muted leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">1. Information We Collect</h2>
            <p>We collect minimal information required to process your orders and provide support:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>**Transaction Details:** Game ID/UID, server info, and product selection.</li>
              <li>**Contact Info:** Your phone number or email (if provided) for order status updates.</li>
              <li>**Technical Data:** IP address and browser type for security and fraud prevention.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">2. How We Use Your Information</h2>
            <p>Your data is used strictly for:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Fulfilling and delivering your top-up orders.</li>
              <li>Providing customer support and order tracking.</li>
              <li>Preventing fraudulent transactions and unauthorized access.</li>
              <li>Complying with legal obligations in Cambodia.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">3. Data Sharing</h2>
            <p>
              We **do not sell** your personal information. We only share data with third-party payment processors (KHPay/KHQR) to verify your payments. These partners are obligated to protect your data under their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">4. Security</h2>
            <p>
              We implement industry-standard security measures to protect your data. All transaction information is encrypted and transmitted securely. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">5. Cookies</h2>
            <p>
              We use cookies to improve your browsing experience, such as remembering your currency preference and keeping you logged in to your account. You can disable cookies in your browser settings, but some features of the Website may not function correctly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">6. Your Rights</h2>
            <p>
              You have the right to request access to the data we hold about you or request its deletion. For any privacy-related inquiries, please contact us via our official Telegram channel.
            </p>
          </section>

          <p className="text-xs italic pt-8 border-t border-royal-border/40">
            Last Updated: April 19, 2026
          </p>
        </div>
      </article>
      <Footer />
    </>
  );
}
