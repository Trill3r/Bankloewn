"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, UserPlus, Users, Lock, X } from "lucide-react";
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
  { type: "point",     emoji: "✅", name: "Punkt",       color: "bg-green-600 active:bg-green-500",   textColor: "text-white",             value:  1 },
  { type: "trichter",  emoji: "🍺", name: "Trichter",    color: "bg-yellow-500 active:bg-yellow-400", textColor: "text-[#0D1B2A]",          value:  3 },
  { type: "error",     emoji: "❌", name: "Fehler",      color: "bg-red-700 active:bg-red-600",        textColor: "text-white",             value: -1 },
  { type: "nosebleed", emoji: "🩸", name: "Nasenbluten", color: "bg-[#1a0505] active:bg-red-950 border border-red-800", textColor: "text-red-300", value: -3 },
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

  // Selected player for stat entry (bottom sheet)
  const [selectedPlayer, setSelectedPlayer] = useState<{ profileId: string; nickname: string; color: string } | null>(null);
  // Recording lock: prevents double-taps; tracks which stat type is in-flight for the spinner
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatType, setRecordingStatType] = useState<string | null>(null);
  // Score update lock (debounce rapid +/- taps)
  const scoreUpdateRef = useRef(false);

  // Timeout overlay
  type TimeoutType = "tactical" | "technical" | null;
  const [activeTimeout, setActiveTimeout] = useState<TimeoutType>(null);
  const [timeoutSecondsLeft, setTimeoutSecondsLeft] = useState(30);
  const timeoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    if (!game || game.status === "finished" || scoreUpdateRef.current) return;
    scoreUpdateRef.current = true;
    const key = team === "us" ? "scoreUs" : "scoreThem";
    const prev_val = game[key];
    const newVal = Math.max(0, prev_val + delta);
    // Optimistic — update UI immediately
    setGame((prev) => prev ? { ...prev, [key]: newVal } : prev);
    try {
      await fetch(`/api/games/${gameId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newVal }),
      });
    } catch {
      // Rollback on error
      setGame((prev) => prev ? { ...prev, [key]: prev_val } : prev);
      toast.error("Fehler beim Speichern");
    }
    scoreUpdateRef.current = false;
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

  async function callTimeout(type: TimeoutType) {
    if (!type || !game || game.status !== "active") return;
    // Record in DB
    fetch("/api/game-timeouts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, type }),
    });
    // Start overlay countdown
    setActiveTimeout(type);
    setTimeoutSecondsLeft(30);
    if (timeoutRef.current) clearInterval(timeoutRef.current);
    timeoutRef.current = setInterval(() => {
      setTimeoutSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timeoutRef.current!);
          setActiveTimeout(null);
          return 30;
        }
        return s - 1;
      });
    }, 1000);
  }

  function dismissTimeout() {
    if (timeoutRef.current) clearInterval(timeoutRef.current);
    setActiveTimeout(null);
    setTimeoutSecondsLeft(30);
  }

  const recordStat = useCallback(async (profileId: string, statType: string) => {
    if (!game || game.status === "finished" || isRecording) return;

    const def = STAT_TYPES.find((s) => s.type === statType);
    const profileObj = allProfiles.find((p) => p.id === profileId) ??
      { id: profileId, nickname: selectedPlayer?.nickname ?? "", avatarColor: selectedPlayer?.color ?? "#888" };

    // Lock immediately + show which button is saving
    setIsRecording(true);
    setRecordingStatType(statType);

    // Optimistic: add temp stat so score updates instantly
    const tempId = `temp-${Date.now()}`;
    const tempStat: GameStat = { id: tempId, profileId, profile: profileObj, statType, recordedAt: new Date().toISOString() };
    setGame((prev) => prev ? { ...prev, stats: [tempStat, ...prev.stats] } : prev);

    // Close sheet right away — no perceived lag
    const playerName = selectedPlayer?.nickname ?? "";
    setSelectedPlayer(null);

    try {
      const r = await fetch("/api/game-stats", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, profileId, tournamentId, statType }),
      });
      const realStat: GameStat = await r.json();
      // Swap temp with confirmed stat
      setGame((prev) => prev ? { ...prev, stats: prev.stats.map((s) => s.id === tempId ? realStat : s) } : prev);
      toast.success(`${def?.emoji} ${playerName} · ${def?.name}`);
    } catch {
      // Rollback temp stat
      setGame((prev) => prev ? { ...prev, stats: prev.stats.filter((s) => s.id !== tempId) } : prev);
      toast.error("Fehler beim Speichern ❌");
    }

    setIsRecording(false);
    setRecordingStatType(null);
  }, [game, isRecording, allProfiles, selectedPlayer, gameId, tournamentId]);

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
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center">
        <div className="text-[#F5C518] text-4xl animate-bounce">🦁</div>
      </div>
    );
  }

  const isFinished = game.status === "finished";
  const activeLineup = game.lineups.filter((l) => !l.leftAt);

  const playerScores: Record<string, number> = {};
  const playerStatCounts: Record<string, Record<string, number>> = {};
  game.stats.forEach((s) => {
    const def = STAT_TYPES.find((t) => t.type === s.statType);
    if (def) {
      playerScores[s.profileId] = (playerScores[s.profileId] || 0) + def.value;
      if (!playerStatCounts[s.profileId]) playerStatCounts[s.profileId] = {};
      playerStatCounts[s.profileId][s.statType] = (playerStatCounts[s.profileId][s.statType] || 0) + 1;
    }
  });

  return (
    <div className="min-h-screen bg-[#0D1B2A]">
      {/* Header */}
      <div className="sticky top-0 bg-[#0D1B2A]/95 backdrop-blur border-b border-white/10 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/60 p-1 -ml-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
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

      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        {isFinished && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center text-sm text-white/50">
            🔒 Dieses Spiel ist abgeschlossen und kann nicht mehr bearbeitet werden.
          </div>
        )}

        {/* Timeout Buttons */}
        {game.status === "active" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => callTimeout("tactical")}
              className="py-4 rounded-2xl bg-blue-700/80 border border-blue-500/50 text-white font-bold text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <span className="text-2xl">🤲</span>
              <span>Takt. Auszeit</span>
            </button>
            <button
              onClick={() => callTimeout("technical")}
              className="py-4 rounded-2xl bg-orange-700/80 border border-orange-500/50 text-white font-bold text-sm flex flex-col items-center gap-1 active:scale-95 transition-transform"
            >
              <span className="text-2xl">🍺</span>
              <span>Tech. Auszeit</span>
            </button>
          </div>
        )}

        {/* Score Board */}
        <div className="card px-3">
          <div className="flex items-center justify-around gap-2">
            {/* Us */}
            <div className="text-center flex-1">
              <p className="text-xs text-white/50 mb-2">Wir 🦁</p>
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => updateScore("us", -1)} disabled={isFinished}
                  className="w-11 h-11 bg-[#0D1B2A] rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black text-yellow-400 w-12 text-center tabular-nums">{game.scoreUs}</span>
                <button onClick={() => updateScore("us", 1)} disabled={isFinished}
                  className="w-11 h-11 bg-green-700 rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <span className="text-3xl font-black text-white/20 flex-shrink-0">:</span>
            {/* Them */}
            <div className="text-center flex-1">
              <p className="text-xs text-white/50 mb-2 truncate">{game.opponentName}</p>
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => updateScore("them", -1)} disabled={isFinished}
                  className="w-11 h-11 bg-[#0D1B2A] rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0">
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-5xl font-black w-12 text-center tabular-nums">{game.scoreThem}</span>
                <button onClick={() => updateScore("them", 1)} disabled={isFinished}
                  className="w-11 h-11 bg-green-700 rounded-2xl flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 flex-shrink-0">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── LIVE STAT ENTRY ─── */}
        {!isFinished && activeLineup.length > 0 && (
          <div className="card">
            <p className="text-xs text-white/40 mb-3 font-semibold uppercase tracking-wider">
              Tippe einen Spieler für eine Aktion
            </p>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map((pos) => {
                const slot = activeLineup.find((l) => l.position === pos);
                if (!slot) return null;
                const score = playerScores[slot.profileId] ?? 0;
                const isSelected = selectedPlayer?.profileId === slot.profileId;
                return (
                  <button
                    key={pos}
                    onClick={() => setSelectedPlayer(
                      isSelected ? null : { profileId: slot.profileId, nickname: slot.profile.nickname, color: slot.profile.avatarColor }
                    )}
                    className={cn(
                      "relative flex items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95",
                      isSelected
                        ? "border-yellow-400 bg-yellow-400/10"
                        : "border-white/10 bg-[#0D1B2A]"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: slot.profile.avatarColor + "33", color: slot.profile.avatarColor }}>
                      {slot.profile.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-bold text-sm truncate">{slot.profile.nickname}</div>
                      <div className="text-[10px] text-white/30 truncate">{pos}</div>
                    </div>
                    <div className={cn(
                      "text-sm font-black px-1.5 py-0.5 rounded-lg min-w-[28px] text-center",
                      score > 0 ? "text-green-400 bg-green-400/15" : score < 0 ? "text-red-400 bg-red-400/15" : "text-white/20"
                    )}>
                      {score > 0 ? "+" : ""}{score}
                    </div>
                  </button>
                );
              })}
            </div>
            {activeLineup.length === 0 && (
              <p className="text-white/30 text-sm text-center py-3">Noch keine Aufstellung</p>
            )}
          </div>
        )}

        {/* Aufstellung + Ändern */}
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
          <div className="grid grid-cols-1 gap-2">
            {POSITIONS.map((pos) => {
              const slot = activeLineup.find((l) => l.position === pos);
              const score = playerScores[slot?.profileId ?? ""] ?? 0;
              const counts = slot ? playerStatCounts[slot.profileId] ?? {} : {};
              return (
                <div key={pos} className={cn("flex items-center gap-3 bg-[#1A2F45] rounded-xl px-3 py-2.5",
                  !slot && "opacity-40")}>
                  <span className="text-xs bg-white/10 text-white/40 px-2 py-1 rounded-lg w-20 text-center flex-shrink-0 truncate">{pos}</span>
                  {slot ? (
                    <>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                        style={{ backgroundColor: slot.profile.avatarColor + "33", color: slot.profile.avatarColor }}>
                        {slot.profile.nickname[0].toUpperCase()}
                      </div>
                      <span className="font-bold flex-1 truncate text-sm">{slot.profile.nickname}</span>
                      <div className="flex items-center gap-2">
                        {Object.entries(counts).map(([type, cnt]) => {
                          const def = STAT_TYPES.find((s) => s.type === type);
                          return cnt > 0 ? (
                            <span key={type} className="text-xs text-white/40">{def?.emoji}{cnt}</span>
                          ) : null;
                        })}
                        <span className={cn("text-sm font-black px-1.5 py-0.5 rounded-lg min-w-[28px] text-center",
                          score > 0 ? "text-green-400 bg-green-400/15" : score < 0 ? "text-red-400 bg-red-400/15" : "text-white/20")}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-white/20 text-sm">Kein Spieler</span>
                  )}
                </div>
              );
            })}
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

        {/* Recent Stats */}
        {game.stats.length > 0 && (
          <div>
            <h2 className="font-bold text-lg mb-3">Letzte Aktionen</h2>
            <div className="space-y-1">
              {game.stats.slice(0, 15).map((s) => {
                const def = STAT_TYPES.find((t) => t.type === s.statType);
                return (
                  <div key={s.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-base">{def?.emoji}</span>
                    <span style={{ color: s.profile.avatarColor }} className="font-semibold">{s.profile.nickname}</span>
                    <span className="text-white/40 flex-1">{def?.name}</span>
                    <span className={cn("font-bold", (def?.value || 0) > 0 ? "text-green-400" : "text-red-400")}>
                      {(def?.value || 0) > 0 ? "+" : ""}{def?.value}
                    </span>
                    <span className="text-white/20 text-xs">
                      {new Date(s.recordedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── STAT ENTRY BOTTOM SHEET ─── */}
      {selectedPlayer && !isFinished && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setSelectedPlayer(null)}>
          <div className="w-full bg-[#1A2F45] rounded-t-3xl p-6 pb-10 shadow-2xl max-w-md mx-auto"
            onClick={(e) => e.stopPropagation()}>
            {/* Player header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black"
                style={{ backgroundColor: selectedPlayer.color + "33", color: selectedPlayer.color }}>
                {selectedPlayer.nickname[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-black text-lg" style={{ color: selectedPlayer.color }}>
                  {selectedPlayer.nickname}
                </div>
                <div className="text-white/40 text-sm">Welche Aktion?</div>
              </div>
              <button onClick={() => setSelectedPlayer(null)} className="text-white/30 p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 2×2 action grid — big tap targets */}
            <div className="grid grid-cols-2 gap-3">
              {STAT_TYPES.map((stat) => {
                const isSavingThis = isRecording && recordingStatType === stat.type;
                return (
                  <button
                    key={stat.type}
                    onClick={() => recordStat(selectedPlayer.profileId, stat.type)}
                    disabled={isRecording}
                    className={cn(
                      "py-5 rounded-2xl font-bold text-base flex flex-col items-center gap-1 transition-all",
                      isRecording ? "opacity-50 scale-95" : "active:scale-95",
                      stat.color, stat.textColor
                    )}
                  >
                    {isSavingThis ? (
                      <>
                        <span className="text-3xl animate-spin">⏳</span>
                        <span>Speichern…</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl">{stat.emoji}</span>
                        <span>{stat.name}</span>
                        <span className="text-xs opacity-60">{stat.value > 0 ? "+" : ""}{stat.value} Pkt</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {isRecording && (
              <p className="text-center text-xs text-white/30 mt-1">Wird gespeichert…</p>
            )}
          </div>
        </div>
      )}

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
                    <span className="text-sm font-medium text-center leading-tight">{p.nickname}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowAttendancePicker(false)} className="btn-primary mt-4">Fertig</button>
          </div>
        </div>
      )}

      {/* ─── TIMEOUT FULLSCREEN OVERLAY ─── */}
      {activeTimeout && (
        <div
          className={cn(
            "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 cursor-pointer select-none",
            activeTimeout === "tactical" ? "bg-blue-950" : "bg-[#1a0a00]"
          )}
          onClick={dismissTimeout}
        >
          {activeTimeout === "tactical" ? (
            <>
              <div className="text-[120px] leading-none animate-bounce">🤲</div>
              <div className="text-white font-black text-5xl tracking-widest text-center px-8">
                VERSCHIEBEN
              </div>
            </>
          ) : (
            <>
              <div className="text-[120px] leading-none animate-bounce">🍺</div>
              <div className="text-[#F5C518] font-black text-5xl tracking-widest text-center px-8">
                TRICHTER
              </div>
            </>
          )}
          {/* Countdown ring */}
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke={activeTimeout === "tactical" ? "#60a5fa" : "#F5C518"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - timeoutSecondsLeft / 30)}`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-3xl font-black">{timeoutSecondsLeft}</span>
            </div>
          </div>
          <p className="text-white/40 text-sm">Tippen zum Schließen</p>
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
                      <span className="text-xs text-center leading-tight">{p.nickname}</span>
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
