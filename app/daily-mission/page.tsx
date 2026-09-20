import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DailyCheckin from "@/components/DailyCheckin";

export default function DailyMissionPage() {
  return (
    <div className="min-h-screen bg-royal-bg text-royal-text">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black uppercase tracking-tight">Daily Mission</h1>
          <p className="text-royal-muted mt-2">Complete daily missions to earn TK Points.</p>
        </div>
        <DailyCheckin />
        <div className="mt-8 card p-6">
          <h2 className="text-xl font-bold mb-4">How it works</h2>
          <ul className="space-y-3 text-royal-muted">
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-royal-primary/20 flex items-center justify-center text-royal-primary text-xs font-bold shrink-0">1</span>
              <span>Visit this page every day and claim your daily reward</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-royal-primary/20 flex items-center justify-center text-royal-primary text-xs font-bold shrink-0">2</span>
              <span>Each check-in earns you 5 TK Points</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="h-6 w-6 rounded-full bg-royal-primary/20 flex items-center justify-center text-royal-primary text-xs font-bold shrink-0">3</span>
              <span>Use points to get discounts on future top-ups</span>
            </li>
          </ul>
        </div>
      </main>
      <Footer />
    </div>
  );
}
