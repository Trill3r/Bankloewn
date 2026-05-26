"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { calcAlcoholGrams, calcChampionScore, formatAlcohol, formatVolume } from "@/lib/calculations";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/cn";
import { ChevronRight, Filter } from "lucide-react";

type Profile = { id: string; nickname: string; avatarColor: string };
type DrinkEntry = {
  id: string; profileId: string; profile: Profile;
  drink: { name: string; category: string };
  volumeMl: number; alcoholPercent: number;
  consumedAt: string; isTrichter: boolean;
  durationSeconds?: number | null;
};
type VomitEntry = { id: string; profileId: string; profile: Profile; notes?: string; recordedAt: string };
type GameStat = { id: string; profileId: string; profile: Profile; statType: string; gameId: string; recordedAt: string };
type Game = { id: string; name: string; opponentName: string; scoreUs: number; scoreThem: number; status: string; createdAt: string };

const TABS = [
  { key: "trinken", label: "🍺 Trinken" },
  { key: "spielen", label: "🏐 Spielen" },
  { key: "gesamt",  label: "🏆 Gesamt"  },
  { key: "spieler", label: "👤 Spieler" },
  { key: "timeline",label: "📅 Timeline"},
];

const STAT_DEFS = [
  { type: "point",     emoji: "✅", value:  1 },
  { type: "error",     emoji: "❌", value: -1 },
  { type: "trichter",  emoji: "🍺", value:  3 },
  { type: "nosebleed", emoji: "🩸", value: -3 },
];

function formatDur(s: number) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`; }
function dayKey(iso: string) { return iso.slice(0, 10); }
function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default function AuswertungPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  const [activeTab, setActiveTab] = useState("trinken");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drinkEntries, setDrinkEntries] = useState<DrinkEntry[]>([]);
  const [vomitEntries, setVomitEntries] = useState<VomitEntry[]>([]);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [timelineFilter, setTimelineFilter] = useState<string>("all");

  useEffect(() => {
    const safe = (p: Promise<Response>) => p.then((r) => r.ok ? r.json() : []).catch(() => []);
    Promise.all([
      fetch(`/api/tournaments/${tournamentId}`).then((r) => r.json()).catch(() => ({})),
      safe(fetch(`/api/drink-entries?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/vomit-entries?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/game-stats?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/games?tournamentId=${tournamentId}`)),
    ]).then(([t, de, ve, gs, g]) => {
      if (t.profiles) setProfiles(t.profiles);
      setDrinkEntries(Array.isArray(de) ? de : []);
      setVomitEntries(Array.isArray(ve) ? ve : []);
      setGameStats(Array.isArray(gs) ? gs : []);
      setGames(Array.isArray(g) ? g : []);
    }).finally(() => setLoading(false));
  }, [tournamentId]);

  // All unique days
  const allDays = useMemo(() => {
    const days = new Set<string>();
    drinkEntries.forEach((e) => days.add(dayKey(e.consumedAt)));
    vomitEntries.forEach((e) => days.add(dayKey(e.recordedAt)));
    return Array.from(days).sort();
  }, [drinkEntries, vomitEntries]);

  const filteredDrinks = selectedDay === "all" ? drinkEntries : drinkEntries.filter((e) => dayKey(e.consumedAt) === selectedDay);
  const filteredVomits = selectedDay === "all" ? vomitEntries : vomitEntries.filter((e) => dayKey(e.recordedAt) === selectedDay);

  // Per-profile stats
  const profileStats = profiles.map((p) => {
    const drinks = filteredDrinks.filter((e) => e.profileId === p.id);
    const vomits = filteredVomits.filter((e) => e.profileId === p.id);
    const trichter = drinks.filter((e) => e.isTrichter);
    const alcoholGrams = drinks.reduce((s, e) => s + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0);
    const totalVolume = drinks.reduce((s, e) => s + e.volumeMl, 0);
    const gStats = gameStats.filter((s) => s.profileId === p.id);
    const points = gStats.filter((s) => s.statType === "point").length;
    const errors = gStats.filter((s) => s.statType === "error").length;
    const trichterActions = gStats.filter((s) => s.statType === "trichter").length;
    const nosebleeds = gStats.filter((s) => s.statType === "nosebleed").length;
    const gameScore = points - errors + trichterActions * 3 - nosebleeds * 3;
    const championScore = calcChampionScore({ gameScore, trichterCount: trichter.length, alcoholGrams, vomitCount: vomits.length });
    return { profile: p, drinks: drinks.length, trichter: trichter.length, alcoholGrams, totalVolume, vomits: vomits.length, gameScore, points, errors, trichterActions, nosebleeds, championScore };
  });

  // Timeline: merge all events
  const timelineItems = useMemo(() => {
    type TItem = { id: string; ts: string; type: string; profile: Profile; label: string; sub?: string; emoji: string; day: string };
    const items: TItem[] = [];
    drinkEntries.forEach((e) => items.push({
      id: e.id, ts: e.consumedAt, type: e.isTrichter ? "trichter" : "drink",
      profile: e.profile,
      label: e.isTrichter ? `Trichter ${e.volumeMl}ml` : `${e.drink.name} ${e.volumeMl}ml`,
      sub: e.durationSeconds ? `⏱ ${formatDur(e.durationSeconds)}` : undefined,
      emoji: e.isTrichter ? "🍺" : "🥤",
      day: dayKey(e.consumedAt),
    }));
    vomitEntries.forEach((e) => items.push({
      id: e.id, ts: e.recordedAt, type: "vomit",
      profile: e.profile, label: "Gekotzt 🤮",
      sub: e.notes, emoji: "🤮", day: dayKey(e.recordedAt),
    }));
    gameStats.forEach((s) => {
      const def = STAT_DEFS.find((d) => d.type === s.statType);
      items.push({
        id: s.id, ts: s.recordedAt, type: "game",
        profile: s.profile,
        label: `${def?.emoji ?? "?"} Spiel-Aktion`,
        sub: s.statType, emoji: def?.emoji ?? "🏐",
        day: dayKey(s.recordedAt),
      });
    });
    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [drinkEntries, vomitEntries, gameStats]);

  const filteredTimeline = timelineItems.filter((i) => {
    if (selectedDay !== "all" && i.day !== selectedDay) return false;
    if (timelineFilter !== "all" && i.type !== timelineFilter) return false;
    return true;
  });

  // Group timeline by day
  const timelineByDay = useMemo(() => {
    const groups: Record<string, typeof filteredTimeline> = {};
    filteredTimeline.forEach((i) => {
      if (!groups[i.day]) groups[i.day] = [];
      groups[i.day].push(i);
    });
    return groups;
  }, [filteredTimeline]);

  // Trichter by hour (filtered)
  const trichterByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}h`,
    count: filteredDrinks.filter((e) => e.isTrichter && new Date(e.consumedAt).getHours() === h).length,
  })).slice(8);

  const championRanking = [...profileStats].sort((a, b) => b.championScore - a.championScore);
  const vomitRanking = [...profileStats].sort((a, b) => b.vomits - a.vomits);
  const drinkRanking = [...profileStats].sort((a, b) => b.alcoholGrams - a.alcoholGrams);

  if (loading) return <div className="min-h-screen bg-[#0D1B2A] flex items-center justify-center"><div className="text-white/40">Lade...</div></div>;

  // Day filter bar (shown on all tabs when multi-day)
  const DayFilter = allDays.length > 1 ? (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
      <button onClick={() => setSelectedDay("all")}
        className={cn("px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap",
          selectedDay === "all" ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#1A2F45] text-white/50 border border-white/10")}>
        Alle Tage
      </button>
      {allDays.map((d) => (
        <button key={d} onClick={() => setSelectedDay(d)}
          className={cn("px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap",
            selectedDay === d ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#1A2F45] text-white/50 border border-white/10")}>
          {dayLabel(d + "T12:00:00")}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[#0D1B2A]">
      <div className="sticky top-0 bg-[#0D1B2A]/95 backdrop-blur border-b border-white/10 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-xl font-black text-yellow-400 mb-3">🏆 Auswertung</h1>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {TABS.map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn("flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                  activeTab === tab.key ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#1A2F45] text-white/50 border border-white/10")}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-5">

        {/* ─── TRINKEN ─── */}
        {activeTab === "trinken" && (
          <>
            {DayFilter}

            <div className="card">
              <h2 className="font-bold text-lg mb-3">🍺 Team-Übersicht</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-yellow-400">{filteredDrinks.filter((e) => e.isTrichter).length}</div>
                  <div className="text-xs text-white/50 mt-1">Trichter</div>
                </div>
                <div className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-yellow-400">
                    {formatAlcohol(filteredDrinks.reduce((s, e) => s + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0))}
                  </div>
                  <div className="text-xs text-white/50 mt-1">Alkohol gesamt</div>
                </div>
                <div className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-purple-400">{filteredVomits.length}</div>
                  <div className="text-xs text-white/50 mt-1">Kotz-Events</div>
                </div>
                <div className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-blue-400">{filteredDrinks.length}</div>
                  <div className="text-xs text-white/50 mt-1">Getränke</div>
                </div>
              </div>
            </div>

            {trichterByHour.some((h) => h.count > 0) && (
              <div className="card">
                <h2 className="font-bold mb-3">Trichter nach Uhrzeit</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={trichterByHour} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <XAxis dataKey="hour" tick={{ fill: "#ffffff60", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#ffffff60", fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#1A2F45", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "white" }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {trichterByHour.map((entry, i) => (
                        <Cell key={i} fill={entry.count === Math.max(...trichterByHour.map((h) => h.count), 1) ? "#F5C518" : "#F5C51860"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="card">
              <h2 className="font-bold text-lg mb-3">🍺 Trichter Ranking</h2>
              <div className="space-y-3">
                {[...profileStats].sort((a, b) => b.trichter - a.trichter).map((ps, i) => {
                  const bestTime = filteredDrinks
                    .filter((e) => e.profileId === ps.profile.id && e.isTrichter && e.durationSeconds)
                    .sort((a, b) => (a.durationSeconds ?? 999) - (b.durationSeconds ?? 999))[0];
                  return (
                    <div key={ps.profile.id} className="flex items-center gap-3">
                      <span className="text-white/30 text-sm w-5 text-center font-bold">{i + 1}</span>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}>
                        {ps.profile.nickname[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{ps.profile.nickname}</div>
                        {bestTime?.durationSeconds && (
                          <div className="text-xs text-yellow-400/70">⏱ Best: {formatDur(bestTime.durationSeconds)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-yellow-400">{ps.trichter}</div>
                        <div className="text-xs text-white/40">Trichter</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h2 className="font-bold text-lg mb-3">🤮 Kotz-Ranking</h2>
              {vomitRanking.filter((p) => p.vomits > 0).length === 0 ? (
                <p className="text-white/30 text-center py-4">Niemand hat gekotzt! 💪</p>
              ) : (
                <div className="space-y-2">
                  {vomitRanking.filter((p) => p.vomits > 0).map((ps, i) => (
                    <div key={ps.profile.id} className="flex items-center gap-3">
                      <span className="text-lg">{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}>
                        {ps.profile.nickname[0].toUpperCase()}
                      </div>
                      <span className="flex-1 font-semibold">{ps.profile.nickname}</span>
                      <span className="text-xl font-black text-purple-400">{ps.vomits}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="font-bold text-lg mb-3">🍹 Trinkleistung</h2>
              <div className="space-y-2">
                {drinkRanking.map((ps, i) => (
                  <div key={ps.profile.id} className="flex items-center gap-3">
                    <span className="text-white/30 text-sm w-5 text-center">{i + 1}</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}>
                      {ps.profile.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{ps.profile.nickname}</div>
                      <div className="text-xs text-white/40">{formatVolume(ps.totalVolume)} · {ps.drinks} Getränke</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-yellow-400">{formatAlcohol(ps.alcoholGrams)}</div>
                      <div className="text-xs text-white/40">Alkohol</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── SPIELEN ─── */}
        {activeTab === "spielen" && (
          <>
            <div className="card">
              <h2 className="font-bold text-lg mb-3">🏐 Spiele</h2>
              {games.length === 0 ? (
                <p className="text-white/30 text-center py-6">Noch keine Spiele</p>
              ) : (
                <div className="space-y-2">
                  {games.map((g) => {
                    const gStats = gameStats.filter((s) => s.gameId === g.id);
                    return (
                      <div key={g.id} className="bg-[#0D1B2A] rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold">{g.name}</div>
                            <div className="text-xs text-white/50">vs. {g.opponentName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-black">
                              <span className="text-yellow-400">{g.scoreUs}</span>
                              <span className="text-white/30 mx-1">:</span>
                              <span>{g.scoreThem}</span>
                            </div>
                            <div className="text-xs text-white/30">{gStats.length} Aktionen</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="font-bold text-lg mb-3">📊 Spieler Rankings</h2>
              {profileStats.every((p) => p.points === 0 && p.errors === 0) ? (
                <p className="text-white/30 text-center py-6">Noch keine Spiel-Stats</p>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: "✅ Punkte", key: "points" as const, color: "text-green-400" },
                    { label: "🍺 Trichter-Aktionen", key: "trichterActions" as const, color: "text-yellow-400" },
                    { label: "❌ Fehler-Shame", key: "errors" as const, color: "text-red-400" },
                    { label: "🩸 Nasenbluten-Shame", key: "nosebleeds" as const, color: "text-red-300" },
                  ].map(({ label, key, color }) => (
                    <div key={key}>
                      <h3 className="text-sm text-white/50 mb-2">{label}</h3>
                      <div className="space-y-1">
                        {[...profileStats].sort((a, b) => b[key] - a[key]).filter((p) => p[key] > 0).slice(0, 5).map((ps) => (
                          <div key={ps.profile.id} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}>
                              {ps.profile.nickname[0].toUpperCase()}
                            </div>
                            <span className="flex-1 text-sm">{ps.profile.nickname}</span>
                            <span className={cn("font-bold", color)}>{ps[key]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── GESAMT ─── */}
        {activeTab === "gesamt" && (
          <>
            <div className="card">
              <h2 className="font-bold text-xl mb-4 text-center">🦁 Banklöwen Champions</h2>
              <div className="flex items-end justify-center gap-3 mb-6">
                {championRanking[1] && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black border-4 border-gray-400"
                      style={{ backgroundColor: championRanking[1].profile.avatarColor + "33", color: championRanking[1].profile.avatarColor }}>
                      {championRanking[1].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-center">{championRanking[1].profile.nickname}</span>
                    <div className="bg-gray-500/30 text-gray-300 rounded-xl px-2 py-1 text-xs font-bold">{championRanking[1].championScore.toFixed(0)}</div>
                    <div className="bg-gray-500 h-16 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥈</div>
                  </div>
                )}
                {championRanking[0] && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-3xl">👑</div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4 border-yellow-400"
                      style={{ backgroundColor: championRanking[0].profile.avatarColor + "33", color: championRanking[0].profile.avatarColor }}>
                      {championRanking[0].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-yellow-400">{championRanking[0].profile.nickname}</span>
                    <div className="bg-yellow-400/20 text-yellow-400 rounded-xl px-2 py-1 text-sm font-black">{championRanking[0].championScore.toFixed(0)} Pkt</div>
                    <div className="bg-yellow-500 h-24 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥇</div>
                  </div>
                )}
                {championRanking[2] && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black border-4 border-amber-700"
                      style={{ backgroundColor: championRanking[2].profile.avatarColor + "33", color: championRanking[2].profile.avatarColor }}>
                      {championRanking[2].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-center">{championRanking[2].profile.nickname}</span>
                    <div className="bg-amber-700/30 text-amber-600 rounded-xl px-2 py-1 text-xs font-bold">{championRanking[2].championScore.toFixed(0)}</div>
                    <div className="bg-amber-700 h-10 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥉</div>
                  </div>
                )}
              </div>
              <p className="text-xs text-white/30 text-center">Score = Spiel + Trichter×5 + Alkohol/10 − Kotzen×10</p>
            </div>

            <div className="card">
              <h2 className="font-bold text-lg mb-3">Vollständige Rangliste</h2>
              <div className="space-y-3">
                {championRanking.map((ps, i) => (
                  <div key={ps.profile.id} className={cn("flex items-center gap-3 p-2 rounded-xl", i < 3 && "bg-yellow-400/5")}>
                    <span className="text-lg w-6 text-center">{["🥇","🥈","🥉"][i] || `${i+1}.`}</span>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-black"
                      style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}>
                      {ps.profile.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{ps.profile.nickname}</div>
                      <div className="text-xs text-white/40 flex gap-3 mt-0.5">
                        <span>🍺 {ps.trichter}×</span>
                        <span>🤮 {ps.vomits}×</span>
                        <span>✅ {ps.points}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-yellow-400 text-lg">{ps.championScore.toFixed(0)}</div>
                      <div className="text-xs text-white/30">Pkt</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── SPIELER ─── */}
        {activeTab === "spieler" && (
          <div className="space-y-3">
            <p className="text-white/50 text-sm">Tippe auf einen Spieler für die vollständige Auswertung</p>
            {profiles.map((p) => {
              const ps = profileStats.find((s) => s.profile.id === p.id)!;
              return (
                <button key={p.id}
                  onClick={() => router.push(`/${tournamentId}/auswertung/spieler/${p.id}`)}
                  className="card w-full text-left active:scale-95 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black"
                      style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                      {p.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg">{p.nickname}</div>
                      <div className="flex gap-3 text-xs text-white/50 mt-0.5">
                        <span>🍺 {ps?.trichter ?? 0}× Trichter</span>
                        <span>🤮 {ps?.vomits ?? 0}× Kotzen</span>
                        <span>✅ {ps?.points ?? 0} Punkte</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-yellow-400 font-black">{ps?.championScore.toFixed(0) ?? 0}</div>
                      <div className="text-xs text-white/30">Score</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-white/30 ml-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── TIMELINE ─── */}
        {activeTab === "timeline" && (
          <>
            {DayFilter}

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { key: "all",      label: "Alle" },
                { key: "trichter", label: "🍺 Trichter" },
                { key: "drink",    label: "🥤 Getränke" },
                { key: "vomit",    label: "🤮 Kotzen" },
                { key: "game",     label: "🏐 Spiel" },
              ].map((f) => (
                <button key={f.key} onClick={() => setTimelineFilter(f.key)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0",
                    timelineFilter === f.key ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#1A2F45] text-white/50 border border-white/10")}>
                  {f.label}
                </button>
              ))}
            </div>

            {filteredTimeline.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <p className="text-4xl mb-3">📅</p>
                <p>Keine Events gefunden</p>
              </div>
            ) : (
              Object.entries(timelineByDay).map(([day, items]) => (
                <div key={day}>
                  <div className="text-sm font-bold text-white/50 mb-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/10" />
                    {dayLabel(day + "T12:00:00")}
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id}
                        className={cn("card flex items-start gap-3",
                          item.type === "trichter" && "border-yellow-400/30 bg-yellow-900/10",
                          item.type === "vomit" && "border-purple-500/30 bg-purple-900/10")}>
                        <span className="text-2xl flex-shrink-0">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm" style={{ color: item.profile.avatarColor }}>
                              {item.profile.nickname}
                            </span>
                            <span className="text-white/80 text-sm truncate">{item.label}</span>
                          </div>
                          {item.sub && <div className="text-xs text-white/40 mt-0.5">{item.sub}</div>}
                        </div>
                        <span className="text-xs text-white/30 flex-shrink-0 mt-0.5">
                          {new Date(item.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
