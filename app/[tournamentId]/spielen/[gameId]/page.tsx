"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, UserPlus } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { cn } from "@/lib/cn";

type Profile = { id: string; nickname: string; avatarColor: string };
type GameLineup = {
  id: string;
  profileId: string;
  profile: Profile;
  position: string;
  isStarting: boolean;
  leftAt: string | null;
};
type GameStat = {
  id: string;
  profileId: string;
  profile: Profile;
  statType: string;
  recordedAt: string;
};
type Game = {
  id: string;
  name: string;
  opponentName: string;
  scoreUs: number;
  scoreThem: number;
  status: string;
  lineups: GameLineup[];
  stats: GameStat[];
};

const POSITIONS = ["Zuspieler", "Diagonal", "Außen L", "Außen R", "Mitte L", "Mitte R", "Libero"];
const STAT_TYPES = [
  { type: "point", label: "✅ Punkt", emoji: "✅", name: "Punkt", color: "bg-green-600 text-white", value: 1 },
  { type: "error", label: "❌ Fehler", emoji: "❌", name: "Fehler", color: "bg-red-700 text-white", value: -1 },
  { type: "trichter", label: "🍺 Trichter", emoji: "🍺", name: "Trichter", color: "bg-yellow-500 text-[#0D1B2A]", value: 3 },
  { type: "nosebleed", label: "🩸 Nasenbluten", emoji: "🩸", name: "Nasenbluten", color: "bg-red-950 text-red-300 border border-red-800", value: -3 },
];

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const { tournamentId, gameId } = params as { tournamentId: string; gameId: string };

  const [game, setGame] = useState<Game | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [showLineupPicker, setShowLineupPicker] = useState(false);
  const [lineupPosition, setLineupPosition] = useState("");
  const [loading, setLoading] = useState(true);

  function fetchGame() {
    return fetch(`/api/games/${gameId}`)
      .then((r) => r.json())
      .then(setGame);
  }

  useEffect(() => {
    Promise.all([
      fetchGame(),
      fetch(`/api/tournaments/${tournamentId}`).then((r) => r.json()).then((t) => {
        if (t.profiles) setAllProfiles(t.profiles);
      }),
    ]).finally(() => setLoading(false));
  }, [gameId, tournamentId]);

  // Pusher realtime
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`game-${gameId}`);

    channel.bind("new_game_stat", (stat: GameStat) => {
      setGame((prev) => prev ? { ...prev, stats: [stat, ...prev.stats] } : prev);
    });
    channel.bind("lineup_change", () => fetchGame());
    channel.bind("game_updated", (updated: Game) => {
      setGame((prev) => prev ? { ...prev, ...updated } : prev);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${gameId}`);
    };
  }, [gameId]);

  async function updateScore(team: "us" | "them", delta: number) {
    if (!game) return;
    const update = team === "us"
      ? { scoreUs: Math.max(0, game.scoreUs + delta) }
      : { scoreThem: Math.max(0, game.scoreThem + delta) };
    await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setGame((prev) => prev ? { ...prev, ...update } : prev);
  }

  async function toggleStatus() {
    if (!game) return;
    const nextStatus = game.status === "planned" ? "active" : game.status === "active" ? "finished" : "active";
    const update: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "active") update.startedAt = new Date().toISOString();
    if (nextStatus === "finished") update.endedAt = new Date().toISOString();

    await fetch(`/api/games/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setGame((prev) => prev ? { ...prev, ...update } : prev);
  }

  async function recordStat(profileId: string, statType: string) {
    await fetch("/api/game-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, profileId, tournamentId, statType }),
    });
  }

  async function assignLineup(profileId: string) {
    if (!lineupPosition) return;
    await fetch("/api/lineups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, profileId, position: lineupPosition }),
    });
    setShowLineupPicker(false);
    setLineupPosition("");
    await fetchGame();
    toast.success("Aufstellung aktualisiert!");
  }

  if (loading || !game) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-white/40">Lade...</div>
      </div>
    );
  }

  const activeLineup = game.lineups.filter((l) => !l.leftAt);

  // Calculate per-player scores from stats
  const playerScores: Record<string, number> = {};
  game.stats.forEach((s) => {
    const statDef = STAT_TYPES.find((t) => t.type === s.statType);
    if (statDef) {
      playerScores[s.profileId] = (playerScores[s.profileId] || 0) + statDef.value;
    }
  });

  return (
    <div className="min-h-screen bg-navy">
      {/* Header */}
      <div className="sticky top-0 bg-navy/95 backdrop-blur border-b border-white/10 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/60 p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold">{game.name}</h1>
            <p className="text-xs text-white/50">vs. {game.opponentName}</p>
          </div>
          <button
            onClick={toggleStatus}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold",
              game.status === "planned" ? "bg-blue-600 text-white" :
              game.status === "active" ? "bg-red-600 text-white" :
              "bg-white/10 text-white/50"
            )}
          >
            {game.status === "planned" ? "Starten" : game.status === "active" ? "🔴 Beenden" : "Beendet"}
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-6">
        {/* Score Board */}
        <div className="card">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-xs text-white/50 mb-2">Wir 🦁</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateScore("us", -1)} className="w-10 h-10 bg-navy rounded-xl flex items-center justify-center active:scale-90 transition-transform">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black text-yellow-400 w-16 text-center">{game.scoreUs}</span>
                <button onClick={() => updateScore("us", 1)} className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center active:scale-90 transition-transform">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <span className="text-3xl font-black text-white/20">:</span>

            <div className="text-center">
              <p className="text-xs text-white/50 mb-2">{game.opponentName}</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateScore("them", -1)} className="w-10 h-10 bg-navy rounded-xl flex items-center justify-center active:scale-90 transition-transform">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black w-16 text-center">{game.scoreThem}</span>
                <button onClick={() => updateScore("them", 1)} className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center active:scale-90 transition-transform">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Lineup */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Aufstellung</h2>
            <button
              onClick={() => setShowLineupPicker(true)}
              className="flex items-center gap-1 text-yellow-400 text-sm font-bold"
            >
              <UserPlus className="w-4 h-4" />
              Ändern
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {POSITIONS.map((pos) => {
              const slot = activeLineup.find((l) => l.position === pos);
              const score = playerScores[slot?.profileId ?? ""] || 0;
              return (
                <div key={pos} className={cn("card", !slot && "opacity-40 border-dashed")}>
                  {/* Top row: player info */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg w-20 text-center flex-shrink-0 truncate">
                      {pos}
                    </span>
                    {slot ? (
                      <>
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                          style={{ backgroundColor: slot.profile.avatarColor + "33", color: slot.profile.avatarColor }}
                        >
                          {slot.profile.nickname[0].toUpperCase()}
                        </div>
                        <span className="font-bold flex-1 truncate">{slot.profile.nickname}</span>
                        <span className={cn(
                          "text-lg font-black px-2 py-0.5 rounded-lg",
                          score > 0 ? "text-green-400 bg-green-400/10" :
                          score < 0 ? "text-red-400 bg-red-400/10" :
                          "text-white/30"
                        )}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30 text-sm">Noch kein Spieler</span>
                    )}
                  </div>

                  {/* Bottom row: 2x2 stat buttons */}
                  {slot && (
                    <div className="grid grid-cols-2 gap-2">
                      {STAT_TYPES.map((stat) => (
                        <button
                          key={stat.type}
                          onClick={() => recordStat(slot.profileId, stat.type)}
                          className={cn(
                            "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform",
                            stat.color
                          )}
                        >
                          <span className="text-xl">{stat.emoji}</span>
                          <span>{stat.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Stats */}
        {game.stats.length > 0 && (
          <div>
            <h2 className="font-bold text-lg mb-3">Letzte Aktionen</h2>
            <div className="space-y-1">
              {game.stats.slice(0, 10).map((s) => {
                const statDef = STAT_TYPES.find((t) => t.type === s.statType);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                    <span>{statDef?.emoji}</span>
                    <span style={{ color: s.profile.avatarColor }}>{s.profile.nickname}</span>
                    <span className={cn(
                      "ml-auto font-bold",
                      (statDef?.value || 0) > 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {(statDef?.value || 0) > 0 ? "+" : ""}{statDef?.value}
                    </span>
                    <span className="text-white/30">
                      {new Date(s.recordedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lineup Picker Modal */}
      {showLineupPicker && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowLineupPicker(false)}>
          <div className="bg-navy-lighter w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Aufstellung ändern</h2>

            {!lineupPosition ? (
              <>
                <p className="text-white/50 text-sm mb-4">Welche Position?</p>
                <div className="grid grid-cols-2 gap-2">
                  {POSITIONS.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setLineupPosition(pos)}
                      className="card text-center active:scale-95 transition-transform py-4 font-semibold"
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setLineupPosition("")} className="text-white/40 text-sm mb-4">← {lineupPosition}</button>
                <p className="text-white/50 text-sm mb-4">Wer spielt {lineupPosition}?</p>
                <div className="grid grid-cols-3 gap-2">
                  {allProfiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => assignLineup(p.id)}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-navy border border-white/10 active:scale-95 transition-transform"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                        style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}
                      >
                        {p.nickname[0].toUpperCase()}
                      </div>
                      <span className="text-xs">{p.nickname}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
