"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { calcAlcoholGrams, calcChampionScore, formatAlcohol, formatVolume } from "@/lib/calculations";
import { cn } from "@/lib/cn";
import { ArrowLeft, Beer, Trophy, Activity, Clock } from "lucide-react";

type Profile = { id: string; nickname: string; avatarColor: string };
type DrinkEntry = {
  id: string; profileId: string;
  drink: { name: string; category: string };
  volumeMl: number; alcoholPercent: number;
  consumedAt: string; isTrichter: boolean;
  durationSeconds?: number | null;
  timekeeperId?: string | null;
};
type VomitEntry = { id: string; profileId: string; notes?: string; recordedAt: string };
type GameStat = { id: string; profileId: string; statType: string; gameId: string; recordedAt: string };
type Game = {
  id: string; name: string; opponentName: string;
  scoreUs: number; scoreThem: number; status: string; createdAt: string;
  lineups?: GameLineup[];
  timeouts?: GameTimeout[];
};
type GameAttendee = { profileId: string; gameId: string };
type GameLineup = { id: string; profileId: string; position: string; leftAt: string | null; gameId: string };
type GameTimeout = { id: string; type: string; recordedAt: string };

const STAT_DEFS = [
  { type: "point",     emoji: "✅", label: "Punkte",    value:  1 },
  { type: "error",     emoji: "❌", label: "Fehler",    value: -1 },
  { type: "trichter",  emoji: "🍺", label: "Trichter",  value:  3 },
  { type: "nosebleed", emoji: "🩸", label: "Nasenbluten", value: -3 },
];

const TABS = [
  { key: "uebersicht", label: "📊 Übersicht" },
  { key: "trinken",    label: "🍺 Trinken"   },
  { key: "spielen",    label: "🏐 Spielen"   },
  { key: "timeline",   label: "📅 Timeline"  },
];

function formatDur(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function SpielrDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const profileId = params.profileId as string;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drinkEntries, setDrinkEntries] = useState<DrinkEntry[]>([]);
  const [vomitEntries, setVomitEntries] = useState<VomitEntry[]>([]);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [attendances, setAttendances] = useState<GameAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("uebersicht");

  useEffect(() => {
    const safe = (p: Promise<Response>) => p.then((r) => r.ok ? r.json() : []).catch(() => []);
    Promise.all([
      fetch(`/api/tournaments/${tournamentId}`).then((r) => r.json()).catch(() => ({})),
      safe(fetch(`/api/drink-entries?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/vomit-entries?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/game-stats?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/games?tournamentId=${tournamentId}`)),
    ]).then(async ([t, de, ve, gs, g]) => {
      if (t.profiles) setProfiles(t.profiles);
      setDrinkEntries(Array.isArray(de) ? de : []);
      setVomitEntries(Array.isArray(ve) ? ve : []);
      setGameStats(Array.isArray(gs) ? gs : []);
      const gameList: Game[] = Array.isArray(g) ? g : [];
      setGames(gameList);
      // Fetch attendances for all games
      const att: GameAttendee[] = [];
      await Promise.all(
        gameList.map((game) =>
          fetch(`/api/game-attendees?gameId=${game.id}`)
            .then((r) => r.ok ? r.json() : [])
            .then((rows: GameAttendee[]) => att.push(...rows))
            .catch(() => {})
        )
      );
      setAttendances(att);
    }).finally(() => setLoading(false));
  }, [tournamentId]);

  const profile = profiles.find((p) => p.id === profileId);
  const myDrinks = useMemo(() => drinkEntries.filter((e) => e.profileId === profileId), [drinkEntries, profileId]);
  const myVomits = useMemo(() => vomitEntries.filter((e) => e.profileId === profileId), [vomitEntries, profileId]);
  const myStats = useMemo(() => gameStats.filter((s) => s.profileId === profileId), [gameStats, profileId]);

  const myTrichter = myDrinks.filter((e) => e.isTrichter);
  const alcoholGrams = myDrinks.reduce((s, e) => s + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0);
  const gameScore = myStats.reduce((s, st) => {
    const def = STAT_DEFS.find((d) => d.type === st.statType);
    return s + (def?.value ?? 0);
  }, 0);
  const championScore = calcChampionScore({ gameScore, trichterCount: myTrichter.length, alcoholGrams, vomitCount: myVomits.length });

  const attendedGameIds = new Set(attendances.filter((a) => a.profileId === profileId).map((a) => a.gameId));
  const attendedGames = games.filter((g) => attendedGameIds.has(g.id));

  // Position history across all games
  const positionCounts: Record<string, number> = {};
  games.forEach((g) => {
    (g.lineups ?? []).forEach((l) => {
      if (l.profileId === profileId) {
        positionCounts[l.position] = (positionCounts[l.position] ?? 0) + 1;
      }
    });
  });
  const positionEntries = Object.entries(positionCounts).sort((a, b) => b[1] - a[1]);
  const bestTrichter = myTrichter.filter((e) => e.durationSeconds != null).sort((a, b) => (a.durationSeconds ?? 0) - (b.durationSeconds ?? 0));

  // Timeline merged
  type TimelineEvent =
    | { kind: "drink"; ts: string; entry: DrinkEntry }
    | { kind: "vomit"; ts: string; entry: VomitEntry }
    | { kind: "stat";  ts: string; entry: GameStat };

  const timeline: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [
      ...myDrinks.map((e) => ({ kind: "drink" as const, ts: e.consumedAt, entry: e })),
      ...myVomits.map((e) => ({ kind: "vomit" as const, ts: e.recordedAt, entry: e })),
      ...myStats.map((e)  => ({ kind: "stat"  as const, ts: e.recordedAt, entry: e })),
    ];
    return events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [myDrinks, myVomits, myStats]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center">
        <div className="text-[#F5C518] text-4xl animate-bounce">🦁</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0D1B2A] flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-white text-lg">Spieler nicht gefunden</div>
        <button
          onClick={() => router.back()}
          className="bg-[#F5C518] text-[#0D1B2A] px-6 py-3 rounded-xl font-bold"
        >
          Zurück
        </button>
      </div>
    );
  }

  const statCounts = Object.fromEntries(STAT_DEFS.map((d) => [d.type, myStats.filter((s) => s.statType === d.type).length]));

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      {/* Header */}
      <div className="bg-[#1A2F45] px-4 pt-12 pb-4">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-[#F5C518] mb-4">
          <ArrowLeft size={20} />
          <span className="text-sm font-semibold">Zurück</span>
        </button>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
            style={{ backgroundColor: profile.avatarColor }}
          >
            {profile.nickname.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-white text-2xl font-bold">{profile.nickname}</div>
            <div className="text-[#F5C518] font-bold text-lg">🏆 {championScore} Punkte</div>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { label: "Drinks", value: myDrinks.length, emoji: "🥤" },
            { label: "Trichter", value: myTrichter.length, emoji: "🍺" },
            { label: "Spiele", value: attendedGames.length, emoji: "🏐" },
            { label: "Kotzer", value: myVomits.length, emoji: "🤮" },
          ].map((s) => (
            <div key={s.label} className="bg-[#0D1B2A] rounded-xl p-2 text-center">
              <div className="text-lg">{s.emoji}</div>
              <div className="text-white font-bold text-lg">{s.value}</div>
              <div className="text-gray-400 text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto bg-[#1A2F45] border-b border-white/10 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors",
              activeTab === t.key
                ? "text-[#F5C518] border-b-2 border-[#F5C518]"
                : "text-gray-400"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-8">
        {/* ÜBERSICHT TAB */}
        {activeTab === "uebersicht" && (
          <>
            {/* Champion Score breakdown */}
            <div className="bg-[#1A2F45] rounded-2xl p-4">
              <div className="text-[#F5C518] font-bold mb-3 flex items-center gap-2">
                <Trophy size={18} /> Champion Score
              </div>
              <div className="space-y-2">
                {[
                  { label: "Spielscore",    value: `+${gameScore > 0 ? gameScore : 0}`, sub: `${gameScore} Punkte` },
                  { label: "Trichter-Bonus", value: `+${myTrichter.length * 5}`, sub: `${myTrichter.length} × 5` },
                  { label: "Alkohol-Bonus",  value: `+${Math.round(alcoholGrams / 10)}`, sub: formatAlcohol(alcoholGrams) },
                  { label: "Kotz-Abzug",    value: `-${myVomits.length * 10}`, sub: `${myVomits.length} × 10` },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center py-1 border-b border-white/5">
                    <div>
                      <div className="text-white text-sm">{row.label}</div>
                      <div className="text-gray-400 text-xs">{row.sub}</div>
                    </div>
                    <div className="text-[#F5C518] font-bold">{row.value}</div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2">
                  <div className="text-white font-bold">Gesamt</div>
                  <div className="text-[#F5C518] font-bold text-xl">{championScore}</div>
                </div>
              </div>
            </div>

            {/* Spielstats */}
            {myStats.length > 0 && (
              <div className="bg-[#1A2F45] rounded-2xl p-4">
                <div className="text-[#F5C518] font-bold mb-3 flex items-center gap-2">
                  <Activity size={18} /> Spielstatistiken
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {STAT_DEFS.map((d) => (
                    <div key={d.type} className="bg-[#0D1B2A] rounded-xl p-3 flex items-center gap-3">
                      <div className="text-2xl">{d.emoji}</div>
                      <div>
                        <div className="text-white font-bold text-xl">{statCounts[d.type] ?? 0}</div>
                        <div className="text-gray-400 text-xs">{d.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trinken-Übersicht */}
            <div className="bg-[#1A2F45] rounded-2xl p-4">
              <div className="text-[#F5C518] font-bold mb-3 flex items-center gap-2">
                <Beer size={18} /> Trink-Übersicht
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Gesamtvolumen", value: formatVolume(myDrinks.reduce((s, e) => s + e.volumeMl, 0)) },
                  { label: "Alkohol gesamt", value: formatAlcohol(alcoholGrams) },
                  { label: "Trichter", value: `${myTrichter.length}×` },
                  {
                    label: "Bester Trichter",
                    value: bestTrichter[0]?.durationSeconds != null
                      ? formatDur(bestTrichter[0].durationSeconds)
                      : "–",
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-[#0D1B2A] rounded-xl p-3">
                    <div className="text-white font-bold text-lg">{s.value}</div>
                    <div className="text-gray-400 text-xs mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* TRINKEN TAB */}
        {activeTab === "trinken" && (
          <>
            {myTrichter.length > 0 && (
              <div className="bg-[#1A2F45] rounded-2xl p-4">
                <div className="text-[#F5C518] font-bold mb-3">🍺 Trichter ({myTrichter.length})</div>
                <div className="space-y-2">
                  {myTrichter.map((e) => {
                    const timekeeper = profiles.find((p) => p.id === e.timekeeperId);
                    return (
                      <div key={e.id} className="bg-[#0D1B2A] rounded-xl p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-white font-semibold">
                              {e.drink.name} · {formatVolume(e.volumeMl)}
                            </div>
                            <div className="text-gray-400 text-xs mt-0.5">
                              {dayLabel(e.consumedAt)} {timeLabel(e.consumedAt)}
                              {timekeeper && ` · Zeitnehmer: ${timekeeper.nickname}`}
                            </div>
                          </div>
                          {e.durationSeconds != null && (
                            <div className="flex items-center gap-1 text-[#F5C518] font-bold">
                              <Clock size={14} />
                              <span>{formatDur(e.durationSeconds)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All drink entries */}
            <div className="bg-[#1A2F45] rounded-2xl p-4">
              <div className="text-[#F5C518] font-bold mb-3">🥤 Alle Drinks ({myDrinks.length})</div>
              {myDrinks.length === 0 ? (
                <div className="text-gray-400 text-center py-4">Noch keine Einträge</div>
              ) : (
                <div className="space-y-2">
                  {[...myDrinks].sort((a, b) => new Date(b.consumedAt).getTime() - new Date(a.consumedAt).getTime()).map((e) => (
                    <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="text-xl">{e.isTrichter ? "🍺" : e.drink.category === "bier" ? "🍺" : e.drink.category === "shot" ? "🥃" : "🥤"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">
                          {e.drink.name}{e.isTrichter ? " (Trichter)" : ""}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {formatVolume(e.volumeMl)} · {formatAlcohol(calcAlcoholGrams(e.volumeMl, e.alcoholPercent))}
                        </div>
                      </div>
                      <div className="text-gray-400 text-xs shrink-0">
                        {timeLabel(e.consumedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {myVomits.length > 0 && (
              <div className="bg-[#1A2F45] rounded-2xl p-4">
                <div className="text-[#F5C518] font-bold mb-3">🤮 Kotzen ({myVomits.length})</div>
                <div className="space-y-2">
                  {myVomits.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 bg-[#0D1B2A] rounded-xl p-3">
                      <div className="text-2xl">🤮</div>
                      <div>
                        <div className="text-white text-sm">{dayLabel(e.recordedAt)} {timeLabel(e.recordedAt)}</div>
                        {e.notes && <div className="text-gray-400 text-xs mt-0.5">{e.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* SPIELEN TAB */}
        {activeTab === "spielen" && (
          <>
            {/* Attended games */}
            <div className="bg-[#1A2F45] rounded-2xl p-4">
              <div className="text-[#F5C518] font-bold mb-3">
                🏐 Gespielte Spiele ({attendedGames.length}/{games.length})
              </div>
              {attendedGames.length === 0 ? (
                <div className="text-gray-400 text-center py-4">Keine Spiele</div>
              ) : (
                <div className="space-y-2">
                  {attendedGames.map((game) => {
                    const myGameStats = myStats.filter((s) => s.gameId === game.id);
                    const score = myGameStats.reduce((sum, s) => {
                      const def = STAT_DEFS.find((d) => d.type === s.statType);
                      return sum + (def?.value ?? 0);
                    }, 0);
                    return (
                      <div key={game.id} className="bg-[#0D1B2A] rounded-xl p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-white font-semibold">vs. {game.opponentName}</div>
                            <div className="text-gray-400 text-xs mt-0.5">
                              {game.scoreUs}:{game.scoreThem}
                              {game.scoreUs > game.scoreThem ? " 🏆" : game.scoreUs < game.scoreThem ? " 😔" : " 🤝"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn("font-bold text-sm", score > 0 ? "text-green-400" : score < 0 ? "text-red-400" : "text-gray-400")}>
                              {score > 0 ? "+" : ""}{score} Punkte
                            </div>
                            <div className="text-gray-400 text-xs mt-0.5">
                              {STAT_DEFS.map((d) => {
                                const count = myGameStats.filter((s) => s.statType === d.type).length;
                                return count > 0 ? `${d.emoji}${count}` : null;
                              }).filter(Boolean).join(" ")}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Position history */}
            {positionEntries.length > 0 && (
              <div className="bg-[#1A2F45] rounded-2xl p-4">
                <div className="text-[#F5C518] font-bold mb-3 flex items-center gap-2">
                  📍 Gespielte Positionen
                </div>
                <div className="space-y-2">
                  {positionEntries.map(([pos, count]) => {
                    const max = positionEntries[0][1];
                    return (
                      <div key={pos} className="flex items-center gap-3">
                        <span className="text-white/70 text-sm w-24 flex-shrink-0">{pos}</span>
                        <div className="flex-1 h-5 bg-[#0D1B2A] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#F5C518]/70 transition-all"
                            style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                        <span className="text-[#F5C518] font-bold text-sm w-6 text-right">{count}×</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-stat breakdown across all games */}
            {myStats.length > 0 && (
              <div className="bg-[#1A2F45] rounded-2xl p-4">
                <div className="text-[#F5C518] font-bold mb-3">📊 Statistik gesamt</div>
                <div className="space-y-2">
                  {STAT_DEFS.map((d) => {
                    const count = statCounts[d.type] ?? 0;
                    const max = Math.max(...STAT_DEFS.map((dd) => statCounts[dd.type] ?? 0), 1);
                    return (
                      <div key={d.type} className="flex items-center gap-3">
                        <div className="text-xl w-8">{d.emoji}</div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-white">{d.label}</span>
                            <span className="text-[#F5C518] font-bold">{count}</span>
                          </div>
                          <div className="h-2 bg-[#0D1B2A] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#F5C518] transition-all"
                              style={{ width: `${(count / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* TIMELINE TAB */}
        {activeTab === "timeline" && (
          <div className="bg-[#1A2F45] rounded-2xl p-4">
            <div className="text-[#F5C518] font-bold mb-3">📅 Alle Events ({timeline.length})</div>
            {timeline.length === 0 ? (
              <div className="text-gray-400 text-center py-4">Noch keine Aktivität</div>
            ) : (
              <div className="space-y-2">
                {timeline.map((item, i) => {
                  const prev = timeline[i - 1];
                  const showDay = !prev || item.ts.slice(0, 10) !== prev.ts.slice(0, 10);
                  return (
                    <div key={i}>
                      {showDay && (
                        <div className="text-gray-400 text-xs font-semibold py-2 border-b border-white/5 mb-2">
                          {dayLabel(item.ts)}
                        </div>
                      )}
                      <div className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                        <div className="text-xl mt-0.5">
                          {item.kind === "drink"
                            ? item.entry.isTrichter ? "🍺" : "🥤"
                            : item.kind === "vomit"
                            ? "🤮"
                            : STAT_DEFS.find((d) => d.type === (item.entry as GameStat).statType)?.emoji ?? "🏐"}
                        </div>
                        <div className="flex-1 min-w-0">
                          {item.kind === "drink" && (
                            <>
                              <div className="text-white text-sm font-medium">
                                {(item.entry as DrinkEntry).drink.name}
                                {item.entry.isTrichter ? " · Trichter 🍺" : ""}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {formatVolume((item.entry as DrinkEntry).volumeMl)} ·{" "}
                                {formatAlcohol(calcAlcoholGrams((item.entry as DrinkEntry).volumeMl, (item.entry as DrinkEntry).alcoholPercent))}
                                {(item.entry as DrinkEntry).durationSeconds != null &&
                                  ` · ⏱ ${formatDur((item.entry as DrinkEntry).durationSeconds!)}`}
                              </div>
                            </>
                          )}
                          {item.kind === "vomit" && (
                            <>
                              <div className="text-white text-sm font-medium">Gekotzt 🤮</div>
                              {(item.entry as VomitEntry).notes && (
                                <div className="text-gray-400 text-xs">{(item.entry as VomitEntry).notes}</div>
                              )}
                            </>
                          )}
                          {item.kind === "stat" && (
                            <>
                              <div className="text-white text-sm font-medium">
                                {STAT_DEFS.find((d) => d.type === (item.entry as GameStat).statType)?.label ?? (item.entry as GameStat).statType}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {games.find((g) => g.id === (item.entry as GameStat).gameId)
                                  ? `vs. ${games.find((g) => g.id === (item.entry as GameStat).gameId)?.opponentName}`
                                  : "Spiel"}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="text-gray-400 text-xs shrink-0 mt-0.5">{timeLabel(item.ts)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
