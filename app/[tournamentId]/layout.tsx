"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Beer, Trophy, Volleyball } from "lucide-react";
import { cn } from "@/lib/cn";

// Lucide doesn't have a volleyball icon, using a custom emoji approach
function VolleyballIcon({ className }: { className?: string }) {
  return <span className={cn("text-xl leading-none", className)}>🏐</span>;
}

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const tournamentId = params.tournamentId as string;

  const tabs = [
    { href: `/${tournamentId}/trinken`, label: "Trinken", icon: "🍺" },
    { href: `/${tournamentId}/spielen`, label: "Spielen", icon: "🏐" },
    { href: `/${tournamentId}/auswertung`, label: "Auswertung", icon: "🏆" },
  ];

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-navy-light border-t border-white/10 z-40"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex max-w-md mx-auto">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                  isActive ? "text-yellow-400" : "text-white/40"
                )}
              >
                <span className="text-2xl">{tab.icon}</span>
                <span className="text-xs font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
