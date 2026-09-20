"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useCsrfToken } from "@/lib/useCsrfToken";

export default function LogoutButton() {
  const router = useRouter();
  const { token: csrfToken } = useCsrfToken();

  async function handleLogout() {
    await fetch("/api/admin/auth", {
      method: "DELETE",
      headers: { "x-csrf-token": csrfToken || "" },
    });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 border border-transparent hover:border-red-500/20"
    >
      <LogOut className="h-4 w-4" />
      <span>Sign out</span>
    </button>
  );
}

