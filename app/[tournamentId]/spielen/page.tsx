"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Game = {
  id: string;
  name: string;
  opponentName: string;
  scoreUs: number;
  scoreThem: number;
  status: string;
  createdAt: string;
  _count: { stats: number };
};

export default function SpielenPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", opponentName: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/games?tournamentId=${tournamentId}`)
      .then((r) => r.json())
      .then(setGames)
      .finally(() => setLoading(false));
  }, [tournamentId]);

  async function createGame() {
    if (!form.name || !form.opponentName) {
      toast.error("Bitte alle Felder ausfüllen");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, ...form }),
      });
      const game = await res.json();
      setGames((prev) => [...prev, game]);
      setShowNew(false);
      setForm({ name: "", opponentName: "" });
      toast.success("Spiel erstellt!");
      router.push(`/${tournamentId}/spielen/${game.id}`);
    } catch {
      toast.error("Fehler beim Erstellen");
    }
    setCreating(false);
  }

  const statusLabel: Record<string, string> = {
    planned: "Geplant",
    active: "Läuft 🔴",
    finished: "Beendet",
  };

  return (
    <div className="min-h-screen bg-navy">
      <div className="sticky top-0 bg-navy/95 backdrop-blur border-b border-white/10 z-10 px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <h1 className="text-xl font-black text-yellow-400">🏐 Spielen</h1>
          <button
            onClick={() => setShowNew(true)}
            className="bg-yellow-400 text-navy px-3 py-2 rounded-xl font-bold text-sm flex items-center gap-1 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
            Spiel
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="card animate-pulse h-20" />)}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🏐</p>
            <p>Noch keine Spiele</p>
          </div>
        ) : (
          games.map((game) => (
            <button
              key={game.id}
              onClick={() => router.push(`/${tournamentId}/spielen/${game.id}`)}
              className="card w-full text-left active:scale-95 transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{game.name}</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      game.status === "active" ? "bg-red-500/20 text-red-400" :
                      game.status === "finished" ? "bg-white/10 text-white/50" :
                      "bg-blue-500/20 text-blue-400"
                    )}>
                      {statusLabel[game.status] ?? game.status}
                    </span>
                  </div>
                  <div className="text-white/50 text-sm mt-1">
                    vs. {game.opponentName}
                  </div>
                  {game.status !== "planned" && (
                    <div className="text-lg font-black mt-1">
                      <span className="text-yellow-400">{game.scoreUs}</span>
                      <span className="text-white/30 mx-1">:</span>
                      <span>{game.scoreThem}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* New Game Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowNew(false)}>
          <div className="bg-navy-lighter w-full rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6">Neues Spiel 🏐</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-1 block">Spiel-Name</label>
                <input
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  placeholder="z.B. Gruppenspiel 1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Gegner</label>
                <input
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  placeholder="z.B. Team Rote Teufel"
                  value={form.opponentName}
                  onChange={(e) => setForm({ ...form, opponentName: e.target.value })}
                />
              </div>
              <button onClick={createGame} disabled={creating} className="btn-primary">
                {creating ? "..." : "Spiel erstellen 🏐"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
