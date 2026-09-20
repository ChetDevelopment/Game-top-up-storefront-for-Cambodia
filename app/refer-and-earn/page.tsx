import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReferralCard from "@/components/ReferralCard";

export default function ReferAndEarnPage() {
  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black uppercase tracking-tight">Refer & Earn</h1>
          <p className="text-royal-muted mt-2">Invite friends and earn TK Points for every referral.</p>
        </div>
        <ReferralCard />
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          <div className="card p-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-royal-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-royal-primary text-xl font-black">1</span>
            </div>
            <h3 className="font-bold mb-2">Share Your Link</h3>
            <p className="text-sm text-royal-muted">Copy your unique referral link and share it with friends.</p>
          </div>
          <div className="card p-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-royal-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-royal-primary text-xl font-black">2</span>
            </div>
            <h3 className="font-bold mb-2">Friend Signs Up</h3>
            <p className="text-sm text-royal-muted">Your friend creates an account using your referral link.</p>
          </div>
          <div className="card p-6 text-center">
            <div className="h-12 w-12 rounded-2xl bg-royal-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-royal-primary text-xl font-black">3</span>
            </div>
            <h3 className="font-bold mb-2">Earn Rewards</h3>
            <p className="text-sm text-royal-muted">You get 50 TK Points for each successful referral.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
