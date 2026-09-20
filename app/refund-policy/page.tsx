import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy — Ty Khai TopUp",
  description: "Our policy regarding refunds and order cancellations.",
};

export default function RefundPage() {
  return (
    <>
      <Header />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl sm:text-5xl font-bold mb-8">Refund Policy</h1>
        
        <div className="prose prose-invert prose-royal max-w-none space-y-8 text-royal-muted leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">1. Nature of Digital Goods</h2>
            <p>
              By purchasing from Ty Khai TopUp, you acknowledge that you are buying **digital goods and services**. Once a top-up has been successfully processed and delivered to the provided Game ID, the transaction is considered final.
            </p>
          </section>

          <section className="bg-royal-surface/50 border border-royal-border/40 p-6 rounded-2xl">
            <h2 className="text-xl font-semibold text-royal-primary mb-3">2. No Refund Policy</h2>
            <p className="mb-4">
              We generally do not offer refunds once an order is marked as &quot;Completed&quot; or &quot;Processing&quot; if the delivery has been initiated.
            </p>
            <p className="font-medium text-royal-text">Refunds will NOT be issued for:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Providing the wrong Game ID, UID, or server info.</li>
              <li>Changing your mind after the payment is confirmed.</li>
              <li>Being banned from a game for violating its own terms of service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">3. Exceptions for Refunds</h2>
            <p>We will issue a full or partial refund in the following specific circumstances:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>**Technical Failure:** If a system error on our end prevents the delivery of your order.</li>
              <li>**Out of Stock:** If we are unable to fulfill your order due to stock unavailability within 24 hours.</li>
              <li>**Duplicate Payment:** If you were accidentally charged twice for the same order due to a payment gateway error.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">4. Dispute Process</h2>
            <p>
              If you believe you are entitled to a refund, you must contact us via Telegram (**@Vichet_SAT**) within 24 hours of the transaction. Please provide your **Order Number** and a screenshot of your payment receipt.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-royal-text mb-3">5. Processing Time</h2>
            <p>
              Approved refunds are typically processed within 1-3 business days. The funds will be returned via the same payment method used (ABA, Wing, etc.) or as store credit, depending on the situation.
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
