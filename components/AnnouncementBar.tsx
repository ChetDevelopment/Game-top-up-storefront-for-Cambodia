import { prisma } from "@/lib/prisma";

const TONES: Record<string, string> = {
  info: "bg-royal-primary/15 border-royal-primary/30 text-royal-primary",
  warning: "bg-yellow-500/15 border-yellow-500/40 text-yellow-400",
  promo: "bg-green-500/15 border-green-500/40 text-green-400",
};

export default async function AnnouncementBar() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);
  if (!settings?.announcement || !settings.announcement.trim()) return null;

  const tone = TONES[settings.announcementTone || "info"] || TONES.info;

  return (
    <div className={`border-b ${tone}`}>
      <div className="mx-auto max-w-7xl px-4 py-2 text-center text-xs sm:text-sm font-medium">
        {settings.announcement}
      </div>
    </div>
  );
}

