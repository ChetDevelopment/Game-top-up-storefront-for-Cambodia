import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Ty Khai TopUp",
  description: "Terms and conditions for using Ty Khai TopUp services.",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl sm:text-5xl font-bold mb-8">Terms of Service</h1>
        
        <div className="prose prose-invert prose-royal max-w-none space-y-8 text-royal-muted leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Ty Khai TopUp (the &quot;Website&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please refrain from using our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">2. Description of Service</h2>
            <p>
              Ty Khai TopUp provides digital top-up services for various online games and platforms. We act as an intermediary, facilitating the purchase of in-game credits using local Cambodian payment methods (KHQR/KHPay).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">3. User Responsibility</h2>
            <p>
              When placing an order, you are solely responsible for providing the correct **Game ID, User ID (UID), or Zone ID**. 
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li className="text-royal-primary font-medium">Orders delivered to an incorrect ID provided by the user are non-refundable and cannot be reversed.</li>
              <li>You must be at least 18 years old or have parental consent to use this service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">4. Payments</h2>
            <p>
              All payments are processed through KHPay (KHQR). By initiating a transaction, you authorize the payment through your respective banking application. Prices are subject to change without prior notice based on market rates and publisher pricing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">5. Intellectual Property</h2>
            <p>
              All game names, logos, and brands (e.g., Mobile Legends, PUBG, Free Fire) are the property of their respective owners (Moonton, Tencent, Garena, etc.). Ty Khai TopUp is not affiliated with, endorsed by, or partnered with these companies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">6. Governing Law</h2>
            <p>
              These terms are governed by and construed in accordance with the laws of the **Kingdom of Cambodia**. Any disputes arising from the use of this service shall be resolved through the competent courts of Cambodia.
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
