"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, UserPlus, Users, Lock } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { cn } from "@/lib/cn";

type Profile = { id: string; nickname: string; avatarColor: string };
type GameLineup = {
  id: string; profileId: string; profile: Profile;
  position: string; isStarting: boolean; leftAt: string | null; enteredAt: string;
};
type GameStat = {
  id: string; profileId: string; profile: Profile; statType: string; recordedAt: string;
};
type GameAttendee = { id: string; profileId: string; profile: Profile };
type Game = {
  id: string; name: string; opponentName: string;
  scoreUs: number; scoreThem: number; status: string;
  lineups: GameLineup[]; stats: GameStat[]; attendees?: GameAttendee[];
};

const POSITIONS = ["Zuspieler", "Diagonal", "Außen L", "Außen R", "Mitte L", "Mitte R", "Libero"];
const STAT_TYPES = [
  { type: "point",     emoji: "✅", name: "Punkt",       color: "bg-green-600 text-white",                              value:  1 },
  { type: "error",     emoji: "❌", name: "Fehler",      color: "bg-red-700 text-white",                                value: -1 },
  { type: "trichter",  emoji: "🍺", name: "Trichter",    color: "bg-yellow-500 text-[#0D1B2A]",                        value:  3 },
  { type: "nosebleed", emoji: "🩸", name: "Nasenbluten", color: "bg-red-950 text-red-300 border border-red-800",       value: -3 },
];

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const { tournamentId, gameId } = params as { tournamentId: string; gameId: string };

  const [game, setGame] = useState<Game | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [attendees, setAttendees] = useState<GameAttendee[]>([]);
  const [showLineupPicker, setShowLineupPicker] = useState(false);
  const [showAttendancePicker, setShowAttendancePicker] = useState(false);
  const [lineupPosition, setLineupPosition] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchGame() {
    const r = await fetch(`/api/games/${gameId}`);
    if (r.ok) { const g = await r.json(); setGame(g); }
  }

  async function fetchAttendees() {
    const r = await fetch(`/api/game-attendees?gameId=${gameId}`);
    if (r.ok) setAttendees(await r.json());
  }

  useEffect(() => {
    Promise.all([
      fetchGame(),
      fetchAttendees(),
      fetch(`/api/tournaments/${tournamentId}`).then((r) => r.json()).then((t) => {
        if (t.profiles) setAllProfiles(t.profiles);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [gameId, tournamentId]);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`game-${gameId}`);
    channel.bind("new_game_stat", (stat: GameStat) => {
      setGame((prev) => prev ? { ...prev, stats: [stat, ...prev.stats] } : prev);
    });
    channel.bind("lineup_change", () => fetchGame());
    channel.bind("game_updated", (updated: Partial<Game>) => {
      setGame((prev) => prev ? { ...prev, ...updated } : prev);
    });
    return () => { channel.unbind_all(); pusher.unsubscribe(`game-${gameId}`); };
  }, [gameId]);

  async function updateScore(team: "us" | "them", delta: number) {
    if (!game || game.status === "finished") return;
    const update = team === "us"
      ? { scoreUs: Math.max(0, game.scoreUs + delta) }
      : { scoreThem: Math.max(0, game.scoreThem + delta) };
    await fetch(`/api/games/${gameId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setGame((prev) => prev ? { ...prev, ...update } : prev);
  }

  async function toggleStatus() {
    if (!game) return;
    const nextStatus = game.status === "planned" ? "active" : game.status === "active" ? "finished" : null;
    if (!nextStatus) return;
    if (nextStatus === "finished" && !confirm("Spiel wirklich abschließen? Danach können keine Änderungen mehr vorgenommen werden.")) return;
    const update: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "active") update.startedAt = new Date().toISOString();
    if (nextStatus === "finished") update.endedAt = new Date().toISOString();
    await fetch(`/api/games/${gameId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setGame((prev) => prev ? { ...prev, ...update } : prev);
    if (nextStatus === "finished") toast.success("Spiel abgeschlossen und gesperrt 🔒");
  }

  async function recordStat(profileId: string, statType: string) {
    if (!game || game.status === "finished") return;
    await fetch("/api/game-stats", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, profileId, tournamentId, statType }),
    });
  }

  async function toggleAttendee(profileId: string) {
    const isPresent = attendees.some((a) => a.profileId === profileId);
    if (isPresent) {
      await fetch(`/api/game-attendees?gameId=${gameId}&profileId=${profileId}`, { method: "DELETE" });
      setAttendees((prev) => prev.filter((a) => a.profileId !== profileId));
    } else {
      const r = await fetch("/api/game-attendees", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, profileId }),
      });
      const a = await r.json();
      setAttendees((prev) => [...prev, a]);
    }
  }

  async function assignLineup(profileId: string) {
    if (!lineupPosition || game?.status === "finished") return;
    await fetch("/api/lineups", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, profileId, position: lineupPosition }),
    });
    setShowLineupPicker(false);
    setLineupPosition("");
    await fetchGame();
    toast.success("Aufstellung aktualisiert!");
  }

  if (loading || !game) {
    return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center"><div className="text-white/40">Lade...</div></div>;
  }

  const isFinished = game.status === "finished";
  const activeLineup = game.lineups.filter((l) => !l.leftAt);
  const playerScores: Record<string, number> = {};
  game.stats.forEach((s) => {
    const def = STAT_TYPES.find((t) => t.type === s.statType);
    if (def) playerScores[s.profileId] = (playerScores[s.profileId] || 0) + def.value;
  });

  return (
    <div className="min-h-screen bg-[#0D1B2A]">
      {/* Header */}
      <div className="sticky top-0 bg-[#0D1B2A]/95 backdrop-blur border-b border-white/10 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/60 p-1"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold">{game.name}</h1>
              {isFinished && <Lock className="w-4 h-4 text-white/40" />}
            </div>
            <p className="text-xs text-white/50">vs. {game.opponentName}</p>
          </div>
          {!isFinished && (
            <button onClick={toggleStatus}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold",
                game.status === "planned" ? "bg-blue-600 text-white" : "bg-red-600 text-white")}>
              {game.status === "planned" ? "Starten" : "🔴 Beenden"}
            </button>
          )}
          {isFinished && (
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 text-white/40">Beendet 🔒</span>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-5">
        {isFinished && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center text-sm text-white/50">
            🔒 Dieses Spiel ist abgeschlossen und kann nicht mehr bearbeitet werden.
          </div>
        )}

        {/* Score Board */}
        <div className="card">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-xs text-white/50 mb-2">Wir 🦁</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateScore("us", -1)} disabled={isFinished}
                  className="w-10 h-10 bg-[#0D1B2A] rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black text-yellow-400 w-16 text-center">{game.scoreUs}</span>
                <button onClick={() => updateScore("us", 1)} disabled={isFinished}
                  className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <span className="text-3xl font-black text-white/20">:</span>
            <div className="text-center">
              <p className="text-xs text-white/50 mb-2">{game.opponentName}</p>
              <div className="flex items-center gap-3">
                <button onClick={() => updateScore("them", -1)} disabled={isFinished}
                  className="w-10 h-10 bg-[#0D1B2A] rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black w-16 text-center">{game.scoreThem}</span>
                <button onClick={() => updateScore("them", 1)} disabled={isFinished}
                  className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-yellow-400" />
              Anwesend ({attendees.length})
            </h2>
            {!isFinished && (
              <button onClick={() => setShowAttendancePicker(true)}
                className="text-yellow-400 text-sm font-bold">Bearbeiten</button>
            )}
          </div>
          {attendees.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-2">Noch niemand eingetragen</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {attendees.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 bg-[#0D1B2A] px-2 py-1.5 rounded-lg">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: a.profile.avatarColor + "33", color: a.profile.avatarColor }}>
                    {a.profile.nickname[0].toUpperCase()}
                  </div>
                  <span className="text-sm">{a.profile.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lineup */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-lg">Aufstellung</h2>
            {!isFinished && (
              <button onClick={() => setShowLineupPicker(true)}
                className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
                <UserPlus className="w-4 h-4" /> Ändern
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            {POSITIONS.map((pos) => {
              const slot = activeLineup.find((l) => l.position === pos);
              const score = playerScores[slot?.profileId ?? ""] || 0;
              return (
                <div key={pos} className={cn("card", !slot && "opacity-40 border-dashed")}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs bg-white/10 text-white/50 px-2 py-1 rounded-lg w-20 text-center flex-shrink-0 truncate">{pos}</span>
                    {slot ? (
                      <>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                          style={{ backgroundColor: slot.profile.avatarColor + "33", color: slot.profile.avatarColor }}>
                          {slot.profile.nickname[0].toUpperCase()}
                        </div>
                        <span className="font-bold flex-1 truncate">{slot.profile.nickname}</span>
                        <span className={cn("text-lg font-black px-2 py-0.5 rounded-lg",
                          score > 0 ? "text-green-400 bg-green-400/10" : score < 0 ? "text-red-400 bg-red-400/10" : "text-white/30")}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30 text-sm">Noch kein Spieler</span>
                    )}
                  </div>
                  {slot && !isFinished && (
                    <div className="grid grid-cols-2 gap-2">
                      {STAT_TYPES.map((stat) => (
                        <button key={stat.type} onClick={() => recordStat(slot.profileId, stat.type)}
                          className={cn("py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform", stat.color)}>
                          <span className="text-xl">{stat.emoji}</span>
                          <span>{stat.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {slot && isFinished && (
                    <div className="grid grid-cols-4 gap-1 opacity-40">
                      {STAT_TYPES.map((stat) => {
                        const count = game.stats.filter((s) => s.profileId === slot.profileId && s.statType === stat.type).length;
                        return count > 0 ? (
                          <div key={stat.type} className="text-center text-xs py-1">
                            <span>{stat.emoji}</span> <span className="font-bold">{count}×</span>
                          </div>
                        ) : null;
                      })}
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
              {game.stats.slice(0, 15).map((s) => {
                const def = STAT_TYPES.find((t) => t.type === s.statType);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                    <span>{def?.emoji}</span>
                    <span style={{ color: s.profile.avatarColor }}>{s.profile.nickname}</span>
                    <span className={cn("ml-auto font-bold", (def?.value || 0) > 0 ? "text-green-400" : "text-red-400")}>
                      {(def?.value || 0) > 0 ? "+" : ""}{def?.value}
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

      {/* Attendance Picker */}
      {showAttendancePicker && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowAttendancePicker(false)}>
          <div className="bg-[#1A2F45] w-full rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">Wer ist dabei? 🦁</h2>
            <p className="text-white/50 text-sm mb-4">Tippe auf einen Spieler um ihn an-/abzuhaken</p>
            <div className="grid grid-cols-3 gap-3">
              {allProfiles.map((p) => {
                const isPresent = attendees.some((a) => a.profileId === p.id);
                return (
                  <button key={p.id} onClick={() => toggleAttendee(p.id)}
                    className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95",
                      isPresent ? "border-green-400 bg-green-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold relative"
                      style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                      {p.nickname[0].toUpperCase()}
                      {isPresent && <span className="absolute -top-1 -right-1 text-base">✅</span>}
                    </div>
                    <span className="text-sm font-medium text-center">{p.nickname}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowAttendancePicker(false)} className="btn-primary mt-4">Fertig</button>
          </div>
        </div>
      )}

      {/* Lineup Picker */}
      {showLineupPicker && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowLineupPicker(false)}>
          <div className="bg-[#1A2F45] w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Aufstellung ändern</h2>
            {!lineupPosition ? (
              <>
                <p className="text-white/50 text-sm mb-4">Welche Position?</p>
                <div className="grid grid-cols-2 gap-2">
                  {POSITIONS.map((pos) => (
                    <button key={pos} onClick={() => setLineupPosition(pos)}
                      className="card text-center active:scale-95 transition-transform py-4 font-semibold">{pos}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button onClick={() => setLineupPosition("")} className="text-white/40 text-sm mb-4">← {lineupPosition}</button>
                <p className="text-white/50 text-sm mb-4">Wer spielt {lineupPosition}?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(attendees.length > 0 ? attendees.map((a) => a.profile) : allProfiles).map((p) => (
                    <button key={p.id} onClick={() => assignLineup(p.id)}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[#0D1B2A] border border-white/10 active:scale-95 transition-transform">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                        style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
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
