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
  timekeeperId?: string | null;
};
type VomitEntry = { id: string; profileId: string; profile: Profile; notes?: string; recordedAt: string };
type GameStat = { id: string; profileId: string; profile: Profile; statType: string; gameId: string; recordedAt: string };
type GameLineup = { id: string; profileId: string; profile: Profile; position: string; leftAt: string | null };
type GameAttendee = { id: string; profileId: string; profile: Profile };
type GameTimeout = { id: string; type: string; recordedAt: string };
type Game = {
  id: string; name: string; opponentName: string; scoreUs: number; scoreThem: number;
  status: string; createdAt: string; startedAt?: string; endedAt?: string;
  lineups?: GameLineup[];
  stats?: GameStat[];
  attendees?: GameAttendee[];
  timeouts?: GameTimeout[];
};

const TABS = [
  { key: "trinken",   label: "🍺 Trinken"   },
  { key: "trichter",  label: "🏆 Trichter"  },
  { key: "spielen",   label: "🏐 Spielen"   },
  { key: "gesamt",    label: "🎖 Gesamt"    },
  { key: "rekorde",   label: "📊 Rekorde"   },
  { key: "spieler",   label: "👤 Spieler"   },
  { key: "timeline",  label: "📅 Timeline"  },
];

const STAT_DEFS = [
  { type: "point",     emoji: "✅", value:  1 },
  { type: "error",     emoji: "❌", value: -1 },
  { type: "trichter",  emoji: "🍺", value:  3 },
  { type: "nosebleed", emoji: "🩸", value: -3 },
];

function formatDur(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2,"0")}.${cs.toString().padStart(2,"0")}`;
}
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
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

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

  // Position stats across all games for a given profileId
  function positionStats(profileId: string) {
    const counts: Record<string, number> = {};
    games.forEach((g) => {
      (g.lineups ?? []).forEach((l) => {
        if (l.profileId === profileId) {
          counts[l.position] = (counts[l.position] ?? 0) + 1;
        }
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

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

            {/* Per-day trichter comparison (multi-day only) */}
            {allDays.length > 1 && (
              <div className="card">
                <h2 className="font-bold mb-3">📅 Trichter pro Tag</h2>
                <div className="space-y-2">
                  {allDays.map((day) => {
                    const count = drinkEntries.filter((e) => e.isTrichter && dayKey(e.consumedAt) === day).length;
                    const max = Math.max(...allDays.map((d) => drinkEntries.filter((e) => e.isTrichter && dayKey(e.consumedAt) === d).length), 1);
                    return (
                      <div key={day} className="flex items-center gap-3">
                        <span className="text-xs text-white/50 w-20 flex-shrink-0">{dayLabel(day + "T12:00:00")}</span>
                        <div className="flex-1 h-6 bg-[#0D1B2A] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-yellow-400 transition-all"
                            style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                        <span className="text-yellow-400 font-bold text-sm w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
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

        {/* ─── TRICHTER ─── */}
        {activeTab === "trichter" && (() => {
          // allTrichter = unfiltered, used only for the Pro-Tag comparison table
          const allTrichter = drinkEntries.filter((e) => e.isTrichter);
          // ft = respects the day filter at the top
          const ft = filteredDrinks.filter((e) => e.isTrichter);
          const timedT = ft.filter((e) => (e.durationSeconds ?? 0) >= 100);

          // Per-player (day-filtered)
          const byPlayer = profiles.map((p) => {
            const pt = ft.filter((e) => e.profileId === p.id);
            const timed = pt.filter((e) => (e.durationSeconds ?? 0) >= 100);
            const times = timed.map((e) => e.durationSeconds!);
            const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
            const bestTime = times.length ? Math.min(...times) : null;
            const worstTime = times.length ? Math.max(...times) : null;
            const klein  = pt.filter((e) => e.volumeMl <= 330).length;
            const normal = pt.filter((e) => e.volumeMl > 330 && e.volumeMl <= 500).length;
            const gross  = pt.filter((e) => e.volumeMl > 500).length;
            const perDay: Record<string, number> = {};
            allDays.forEach((d) => { perDay[d] = pt.filter((e) => dayKey(e.consumedAt) === d).length; });
            return { profile: p, count: pt.length, timed: timed.length, avgTime, bestTime, worstTime, klein, normal, gross, perDay };
          }).filter((r) => r.count > 0).sort((a, b) => b.count - a.count);

          // Team totals (day-filtered)
          const teamAvgTime = timedT.length ? timedT.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) / timedT.length : null;
          const teamBest = timedT.length ? Math.min(...timedT.map((e) => e.durationSeconds!)) : null;

          // Hourly (day-filtered)
          const hourly = Array.from({ length: 24 }, (_, h) => ({
            hour: `${h}h`,
            count: ft.filter((e) => new Date(e.consumedAt).getHours() === h).length,
          }));
          const peakHour = hourly.reduce((m, h) => h.count > m.count ? h : m, hourly[0]);

          // Sizes (day-filtered)
          const kleinTotal  = ft.filter((e) => e.volumeMl <= 330).length;
          const normalTotal = ft.filter((e) => e.volumeMl > 330 && e.volumeMl <= 500).length;
          const grossTotal  = ft.filter((e) => e.volumeMl > 500).length;
          const sizeMax = Math.max(kleinTotal, normalTotal, grossTotal, 1);

          // Timekeeper ranking (day-filtered)
          const tkCounts: Record<string, number> = {};
          ft.forEach((e) => { if (e.timekeeperId) tkCounts[e.timekeeperId] = (tkCounts[e.timekeeperId] || 0) + 1; });
          const tkRanking = Object.entries(tkCounts)
            .map(([id, c]) => ({ profile: profiles.find((p) => p.id === id), count: c }))
            .filter((r) => r.profile).sort((a, b) => b.count - a.count);

          if (allTrichter.length === 0) {
            return (
              <div className="text-center py-16 text-white/30">
                <p className="text-5xl mb-3">🍺</p>
                <p>Noch keine Trichter eingetragen</p>
              </div>
            );
          }

          return (
            <>
              {DayFilter}

              {/* Team-Übersicht */}
              <div className="card">
                <h2 className="font-bold text-lg mb-3">🍺 Team Gesamt</h2>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Trichter", value: `${ft.length}×`, color: "text-yellow-400" },
                    { label: "Ø Zeit", value: teamAvgTime ? formatDur(teamAvgTime) : "–", color: "text-green-400" },
                    { label: "Rekord", value: teamBest ? formatDur(teamBest) : "–", color: "text-blue-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                      <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-white/40 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gesamttabelle */}
              <div className="card">
                <h2 className="font-bold text-lg mb-3">📋 Gesamttabelle</h2>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm min-w-[480px] px-2">
                    <thead>
                      <tr className="text-white/30 text-xs border-b border-white/10">
                        <th className="text-left py-2 px-2 font-semibold">Spieler</th>
                        <th className="text-center py-2 px-2 font-semibold">Anz.</th>
                        <th className="text-center py-2 px-2 font-semibold">Ø Zeit</th>
                        <th className="text-center py-2 px-2 font-semibold">Best</th>
                        <th className="text-center py-2 px-2 font-semibold">Worst</th>
                        <th className="text-center py-2 px-1 font-semibold">🍺S</th>
                        <th className="text-center py-2 px-1 font-semibold">🍺🍺N</th>
                        <th className="text-center py-2 px-1 font-semibold">🍺🍺🍺D</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {byPlayer.map((r, i) => (
                        <tr key={r.profile.id} className={i === 0 ? "bg-yellow-400/5" : ""}>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                style={{ backgroundColor: r.profile.avatarColor + "33", color: r.profile.avatarColor }}>
                                {r.profile.nickname[0].toUpperCase()}
                              </div>
                              <span className="font-medium truncate max-w-[80px]">{r.profile.nickname}</span>
                            </div>
                          </td>
                          <td className="text-center py-2.5 px-2 font-black text-yellow-400 text-base">{r.count}</td>
                          <td className="text-center py-2.5 px-2 text-green-400 font-mono">{r.avgTime ? formatDur(r.avgTime) : "–"}</td>
                          <td className="text-center py-2.5 px-2 text-blue-400 font-mono">{r.bestTime ? formatDur(r.bestTime) : "–"}</td>
                          <td className="text-center py-2.5 px-2 text-red-400/70 font-mono">{r.worstTime ? formatDur(r.worstTime) : "–"}</td>
                          <td className="text-center py-2.5 px-1 text-white/50">{r.klein || "–"}</td>
                          <td className="text-center py-2.5 px-1 text-white/50">{r.normal || "–"}</td>
                          <td className="text-center py-2.5 px-1 text-white/50">{r.gross || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-white/20 mt-2 text-right">S=Klein 330ml · N=Normal 500ml · D=Doppelt 1L</p>
              </div>

              {/* Pro Tag (multi-day) */}
              {allDays.length > 1 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">📅 Pro Tag</h2>
                  {/* Day totals bar */}
                  <div className="space-y-2 mb-4">
                    {allDays.map((day) => {
                      const cnt = allTrichter.filter((e) => dayKey(e.consumedAt) === day).length;
                      const max = Math.max(...allDays.map((d) => allTrichter.filter((e) => dayKey(e.consumedAt) === d).length), 1);
                      return (
                        <div key={day} className="flex items-center gap-3">
                          <span className="text-xs text-white/50 w-20 flex-shrink-0 font-medium">{dayLabel(day + "T12:00:00")}</span>
                          <div className="flex-1 h-7 bg-[#0D1B2A] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-yellow-400 flex items-center px-2 transition-all"
                              style={{ width: `${(cnt / max) * 100}%` }}>
                              {cnt > 0 && <span className="text-[#0D1B2A] text-xs font-black">{cnt}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Per-player per-day grid */}
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[320px]">
                      <thead>
                        <tr className="text-white/30 text-xs border-b border-white/10">
                          <th className="text-left py-1 px-2">Spieler</th>
                          {allDays.map((d) => (
                            <th key={d} className="text-center py-1 px-2 font-semibold whitespace-nowrap">
                              {dayLabel(d + "T12:00:00")}
                            </th>
                          ))}
                          <th className="text-center py-1 px-2 font-semibold text-yellow-400">Ges.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {byPlayer.map((r) => (
                          <tr key={r.profile.id}>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                  style={{ backgroundColor: r.profile.avatarColor + "33", color: r.profile.avatarColor }}>
                                  {r.profile.nickname[0].toUpperCase()}
                                </div>
                                <span className="truncate max-w-[70px] text-xs">{r.profile.nickname}</span>
                              </div>
                            </td>
                            {allDays.map((d) => (
                              <td key={d} className="text-center py-2 px-2">
                                {r.perDay[d] ? (
                                  <span className="text-yellow-400 font-bold">{r.perDay[d]}</span>
                                ) : (
                                  <span className="text-white/20">–</span>
                                )}
                              </td>
                            ))}
                            <td className="text-center py-2 px-2 font-black text-yellow-400">{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Nach Uhrzeit */}
              <div className="card">
                <h2 className="font-bold mb-1">⏰ Nach Uhrzeit</h2>
                {peakHour.count > 0 && (
                  <p className="text-xs text-white/40 mb-3">
                    Peak: <span className="text-yellow-400 font-bold">{peakHour.hour}</span> — {peakHour.count} Trichter
                  </p>
                )}
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={hourly.filter((_, i) => i >= 8)} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                    <XAxis dataKey="hour" tick={{ fill: "#ffffff50", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#ffffff50", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "#1A2F45", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "white" }}
                      formatter={(v: number) => [`${v} Trichter`]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {hourly.filter((_, i) => i >= 8).map((entry, i) => (
                        <Cell key={i} fill={entry.hour === peakHour.hour ? "#F5C518" : "#F5C51850"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Zeiten — Hall of Fame */}
              {timedT.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-1">⚡ Zeiten-Auswertung</h2>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { label: "Rekord", value: teamBest ? formatDur(teamBest) : "–", color: "text-yellow-400" },
                      { label: "Ø Team", value: teamAvgTime ? formatDur(teamAvgTime) : "–", color: "text-green-400" },
                      { label: "Gemessen", value: `${timedT.length}/${ft.length}`, color: "text-blue-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                        <div className={`font-black text-lg ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-white/30 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Per-player time ranking */}
                  <div className="space-y-2">
                    {byPlayer.filter((r) => r.avgTime !== null).sort((a, b) => (a.avgTime ?? 999) - (b.avgTime ?? 999)).map((r, i) => (
                      <div key={r.profile.id} className="flex items-center gap-2 bg-[#0D1B2A] rounded-xl px-3 py-2.5">
                        <span className="text-sm w-6 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: r.profile.avatarColor + "33", color: r.profile.avatarColor }}>
                          {r.profile.nickname[0].toUpperCase()}
                        </div>
                        <span className="flex-1 font-medium text-sm">{r.profile.nickname}</span>
                        <div className="text-right text-xs space-y-0.5">
                          <div className="text-green-400 font-mono font-bold">Ø {formatDur(r.avgTime!)}</div>
                          <div className="text-white/30">
                            Best <span className="text-blue-400">{formatDur(r.bestTime!)}</span>
                            {" · "}Worst <span className="text-red-400/60">{formatDur(r.worstTime!)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Full list of timed trichters */}
                  <details className="mt-4">
                    <summary className="text-xs text-white/30 cursor-pointer py-1">Alle {timedT.length} gemessenen Trichter anzeigen ▼</summary>
                    <div className="space-y-1 mt-2">
                      {[...timedT].sort((a, b) => (a.durationSeconds ?? 999) - (b.durationSeconds ?? 999)).map((e, i) => {
                        const p = profiles.find((pr) => pr.id === e.profileId);
                        return (
                          <div key={e.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-white/5">
                            <span className="text-white/20 w-5">{i + 1}.</span>
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                              style={{ backgroundColor: (p?.avatarColor ?? "#888") + "33", color: p?.avatarColor ?? "#888" }}>
                              {p?.nickname[0].toUpperCase() ?? "?"}
                            </div>
                            <span className="flex-1 text-white/70">{p?.nickname}</span>
                            <span className="text-white/30">{formatVolume(e.volumeMl)} · {dayLabel(e.consumedAt)}</span>
                            <span className="text-yellow-400 font-bold font-mono ml-2">{formatDur(e.durationSeconds!)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              )}

              {/* Größen */}
              <div className="card">
                <h2 className="font-bold text-lg mb-3">📐 Größen-Verteilung</h2>
                <div className="space-y-3">
                  {[
                    { label: "Klein 🍺 (330ml)", count: kleinTotal, color: "bg-blue-500" },
                    { label: "Normal 🍺🍺 (500ml)", count: normalTotal, color: "bg-yellow-400" },
                    { label: "Doppelt 🍺🍺🍺 (1L)", count: grossTotal, color: "bg-orange-500" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-sm text-white/60 w-36 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 h-6 bg-[#0D1B2A] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.color} transition-all`}
                          style={{ width: `${(s.count / sizeMax) * 100}%` }} />
                      </div>
                      <span className="text-white font-bold text-sm w-6 text-right">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timekeeper */}
              {tkRanking.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">🎯 Häufigster Timekeeper</h2>
                  <div className="space-y-2">
                    {tkRanking.map((r, i) => (
                      <div key={r.profile!.id} className="flex items-center gap-3">
                        <span className="text-lg w-7">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: r.profile!.avatarColor + "33", color: r.profile!.avatarColor }}>
                          {r.profile!.nickname[0].toUpperCase()}
                        </div>
                        <span className="flex-1 font-semibold">{r.profile!.nickname}</span>
                        <span className="text-yellow-400 font-black">{r.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ─── SPIELEN ─── */}
        {activeTab === "spielen" && (
          <>
            {/* Full game breakdown */}
            <div className="space-y-3">
              {games.length === 0 ? (
                <div className="card text-center py-8 text-white/30">Noch keine Spiele</div>
              ) : (
                games.map((g) => {
                  const isExpanded = expandedGameId === g.id;
                  const gStats = g.stats ?? gameStats.filter((s) => s.gameId === g.id);
                  const gTimeouts = g.timeouts ?? [];
                  const won = g.scoreUs > g.scoreThem;
                  const lost = g.scoreUs < g.scoreThem;

                  // Per-player stats for this game
                  const playerRows = profiles.map((p) => {
                    const ps = gStats.filter((s) => s.profileId === p.id);
                    const pts = ps.filter((s) => s.statType === "point").length;
                    const err = ps.filter((s) => s.statType === "error").length;
                    const tri = ps.filter((s) => s.statType === "trichter").length;
                    const nos = ps.filter((s) => s.statType === "nosebleed").length;
                    const score = pts - err + tri * 3 - nos * 3;
                    return { profile: p, pts, err, tri, nos, score, total: ps.length };
                  }).filter((r) => r.total > 0);

                  return (
                    <div key={g.id} className="card overflow-hidden">
                      {/* Game header — tappable */}
                      <button className="w-full text-left" onClick={() => setExpandedGameId(isExpanded ? null : g.id)}>
                        <div className="flex items-center gap-3">
                          <div className={cn("w-2 h-12 rounded-full flex-shrink-0",
                            won ? "bg-green-500" : lost ? "bg-red-500" : "bg-white/20")} />
                          <div className="flex-1">
                            <div className="font-bold">{g.name}</div>
                            <div className="text-xs text-white/50">vs. {g.opponentName}</div>
                          </div>
                          <div className="text-right mr-2">
                            <div className="text-2xl font-black">
                              <span className={won ? "text-yellow-400" : "text-white"}>{g.scoreUs}</span>
                              <span className="text-white/20 mx-1">:</span>
                              <span>{g.scoreThem}</span>
                            </div>
                            <div className="text-xs text-white/30">
                              {gStats.length} Aktionen · {gTimeouts.length} Auszeiten
                            </div>
                          </div>
                          <span className="text-white/30 text-lg">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                          {/* Attendance */}
                          {(g.attendees ?? []).length > 0 && (
                            <div>
                              <div className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Anwesend</div>
                              <div className="flex flex-wrap gap-1.5">
                                {(g.attendees ?? []).map((a) => (
                                  <div key={a.id} className="flex items-center gap-1 bg-[#0D1B2A] px-2 py-1 rounded-lg">
                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                                      style={{ backgroundColor: a.profile.avatarColor + "33", color: a.profile.avatarColor }}>
                                      {a.profile.nickname[0].toUpperCase()}
                                    </div>
                                    <span className="text-xs">{a.profile.nickname}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Per-player stats */}
                          {playerRows.length > 0 && (
                            <div>
                              <div className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Spieler-Stats</div>
                              <div className="space-y-1">
                                {playerRows.sort((a, b) => b.score - a.score).map((r) => (
                                  <div key={r.profile.id} className="flex items-center gap-2 bg-[#0D1B2A] rounded-xl px-3 py-2">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                      style={{ backgroundColor: r.profile.avatarColor + "33", color: r.profile.avatarColor }}>
                                      {r.profile.nickname[0].toUpperCase()}
                                    </div>
                                    <span className="flex-1 text-sm font-medium truncate">{r.profile.nickname}</span>
                                    <div className="flex items-center gap-2 text-xs">
                                      {r.pts > 0 && <span className="text-green-400">✅{r.pts}</span>}
                                      {r.tri > 0 && <span className="text-yellow-400">🍺{r.tri}</span>}
                                      {r.err > 0 && <span className="text-red-400">❌{r.err}</span>}
                                      {r.nos > 0 && <span className="text-red-300">🩸{r.nos}</span>}
                                    </div>
                                    <span className={cn("text-sm font-black min-w-[32px] text-right",
                                      r.score > 0 ? "text-green-400" : r.score < 0 ? "text-red-400" : "text-white/30")}>
                                      {r.score > 0 ? "+" : ""}{r.score}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Timeouts */}
                          {gTimeouts.length > 0 && (
                            <div>
                              <div className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Auszeiten</div>
                              <div className="flex gap-3">
                                <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl px-3 py-2 text-center">
                                  <div className="text-blue-400 font-black text-xl">{gTimeouts.filter((t) => t.type === "tactical").length}</div>
                                  <div className="text-xs text-white/40">🤲 Taktisch</div>
                                </div>
                                <div className="bg-orange-900/30 border border-orange-500/30 rounded-xl px-3 py-2 text-center">
                                  <div className="text-orange-400 font-black text-xl">{gTimeouts.filter((t) => t.type === "technical").length}</div>
                                  <div className="text-xs text-white/40">🍺 Technisch</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Lineup */}
                          {(g.lineups ?? []).filter((l) => !l.leftAt).length > 0 && (
                            <div>
                              <div className="text-xs text-white/40 font-semibold mb-2 uppercase tracking-wider">Aufstellung (Ende)</div>
                              <div className="grid grid-cols-2 gap-1">
                                {(g.lineups ?? []).filter((l) => !l.leftAt).map((l) => (
                                  <div key={l.id} className="flex items-center gap-2 bg-[#0D1B2A] rounded-lg px-2 py-1.5">
                                    <span className="text-[10px] text-white/30 w-14 truncate">{l.position}</span>
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                      style={{ backgroundColor: l.profile.avatarColor + "33", color: l.profile.avatarColor }}>
                                      {l.profile.nickname[0].toUpperCase()}
                                    </div>
                                    <span className="text-xs truncate">{l.profile.nickname}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Player ranking across all games */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">📊 Spieler Rankings</h2>
              {profileStats.every((p) => p.points === 0 && p.errors === 0) ? (
                <p className="text-white/30 text-center py-6">Noch keine Spiel-Stats</p>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: "✅ Punkte", key: "points" as const, color: "text-green-400" },
                    { label: "🍺 Trichter-Aktionen", key: "trichterActions" as const, color: "text-yellow-400" },
                    { label: "❌ Fehler", key: "errors" as const, color: "text-red-400" },
                    { label: "🩸 Nasenbluten", key: "nosebleeds" as const, color: "text-red-300" },
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

            {/* Position stats */}
            {games.some((g) => (g.lineups ?? []).length > 0) && (
              <div className="card">
                <h2 className="font-bold text-lg mb-3">📍 Positionsstatistik</h2>
                <div className="space-y-4">
                  {profiles.map((p) => {
                    const pos = positionStats(p.id);
                    if (pos.length === 0) return null;
                    return (
                      <div key={p.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                            {p.nickname[0].toUpperCase()}
                          </div>
                          <span className="font-semibold text-sm">{p.nickname}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pl-9">
                          {pos.map(([position, count]) => (
                            <span key={position} className="bg-[#0D1B2A] text-white/70 text-xs px-2 py-1 rounded-lg">
                              {position} <span className="text-yellow-400 font-bold">{count}×</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              </div>
            )}
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
              <p className="text-xs text-white/30 text-center">Score = Spiel + Trichter×2 + Alkohol/10 + Kotzen×2</p>
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

        {/* ─── REKORDE ─── */}
        {activeTab === "rekorde" && (() => {
          // All trichter with times
          const timedTrichter = drinkEntries.filter((e) => e.isTrichter && e.durationSeconds != null && e.durationSeconds >= 100)
            .sort((a, b) => (a.durationSeconds ?? 999) - (b.durationSeconds ?? 999));

          // Per-player avg trichter time
          const perPlayerTrichter = profiles.map((p) => {
            const timed = timedTrichter.filter((e) => e.profileId === p.id);
            const all = drinkEntries.filter((e) => e.isTrichter && e.profileId === p.id);
            const avg = timed.length > 0 ? timed.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) / timed.length : null;
            const best = timed[0]?.durationSeconds ?? null;
            return { profile: p, count: all.length, timedCount: timed.length, avg, best };
          }).filter((p) => p.count > 0);

          // Timekeeper stats
          const tkCounts: Record<string, number> = {};
          drinkEntries.forEach((e) => { if (e.timekeeperId) tkCounts[e.timekeeperId] = (tkCounts[e.timekeeperId] || 0) + 1; });
          const timekeeperRanking = Object.entries(tkCounts)
            .map(([id, count]) => ({ profile: profiles.find((p) => p.id === id), count }))
            .filter((e) => e.profile)
            .sort((a, b) => b.count - a.count);

          // Team totals
          const totalTrichter = drinkEntries.filter((e) => e.isTrichter).length;
          const totalAlcohol = drinkEntries.reduce((s, e) => s + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0);
          const totalVolume = drinkEntries.reduce((s, e) => s + e.volumeMl, 0);
          const totalVomits = vomitEntries.length;
          const avgTrichterTime = timedTrichter.length > 0
            ? timedTrichter.reduce((s, e) => s + (e.durationSeconds ?? 0), 0) / timedTrichter.length
            : null;

          // Most active day
          const drinksByDay: Record<string, number> = {};
          drinkEntries.forEach((e) => { const d = dayKey(e.consumedAt); drinksByDay[d] = (drinksByDay[d] || 0) + 1; });
          const busiestDay = Object.entries(drinksByDay).sort((a, b) => b[1] - a[1])[0];

          // Drink type breakdown
          const drinkTypeCounts: Record<string, number> = {};
          drinkEntries.forEach((e) => {
            const name = e.isTrichter ? "Trichter 🍺" : e.drink.name;
            drinkTypeCounts[name] = (drinkTypeCounts[name] || 0) + 1;
          });
          const topDrinks = Object.entries(drinkTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

          return (
            <>
              {/* Team Zahlen */}
              <div className="card">
                <h2 className="font-bold text-lg mb-3">📊 Team Zahlen</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Trichter gesamt", value: `${totalTrichter}×`, color: "text-yellow-400" },
                    { label: "Alkohol gesamt", value: formatAlcohol(totalAlcohol), color: "text-orange-400" },
                    { label: "Getränke gesamt", value: `${drinkEntries.length}×`, color: "text-blue-400" },
                    { label: "Gesamtvolumen", value: formatVolume(totalVolume), color: "text-cyan-400" },
                    { label: "Kotz-Events", value: `${totalVomits}×`, color: "text-purple-400" },
                    {
                      label: "Ø Trichter-Zeit",
                      value: avgTrichterTime ? formatDur(avgTrichterTime) : "–",
                      color: "text-green-400",
                    },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#0D1B2A] rounded-xl p-3 text-center">
                      <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-white/50 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                {busiestDay && (
                  <div className="mt-3 bg-[#0D1B2A] rounded-xl p-3 text-center">
                    <div className="text-white font-bold">
                      Aktivster Tag: {dayLabel(busiestDay[0] + "T12:00:00")} · {busiestDay[1]} Getränke
                    </div>
                  </div>
                )}
              </div>

              {/* Trichter Hall of Fame */}
              {timedTrichter.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">⚡ Trichter Hall of Fame</h2>
                  <div className="space-y-2">
                    {timedTrichter.slice(0, 10).map((e, i) => {
                      const p = profiles.find((pr) => pr.id === e.profileId);
                      const medals = ["🥇", "🥈", "🥉"];
                      return (
                        <div key={e.id} className={`flex items-center gap-3 p-2 rounded-xl ${i === 0 ? "bg-yellow-400/10 border border-yellow-400/30" : ""}`}>
                          <span className="text-lg w-8 text-center">{medals[i] || `${i + 1}.`}</span>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: (p?.avatarColor ?? "#888") + "33", color: p?.avatarColor ?? "#888" }}>
                            {p?.nickname[0].toUpperCase() ?? "?"}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{p?.nickname ?? "?"}</div>
                            <div className="text-xs text-white/40">
                              {formatVolume(e.volumeMl)} · {dayLabel(e.consumedAt)}
                            </div>
                          </div>
                          <div className="text-yellow-400 font-black text-lg">{formatDur(e.durationSeconds!)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Durchschnittszeiten */}
              {perPlayerTrichter.some((p) => p.avg !== null) && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">⏱️ Durchschnittszeiten</h2>
                  <div className="space-y-3">
                    {[...perPlayerTrichter]
                      .filter((p) => p.avg !== null)
                      .sort((a, b) => (a.avg ?? 999) - (b.avg ?? 999))
                      .map((p, i) => (
                        <div key={p.profile.id} className="flex items-center gap-3">
                          <span className="text-white/30 text-sm w-5 text-center font-bold">{i + 1}</span>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: p.profile.avatarColor + "33", color: p.profile.avatarColor }}>
                            {p.profile.nickname[0].toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{p.profile.nickname}</div>
                            <div className="text-xs text-white/40">
                              {p.timedCount} gemessen · Best: {p.best != null ? formatDur(p.best) : "–"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-yellow-400 font-bold">{formatDur(p.avg!)}</div>
                            <div className="text-xs text-white/30">Ø</div>
                          </div>
                        </div>
                      ))}
                    {perPlayerTrichter.filter((p) => p.avg === null).map((p) => (
                      <div key={p.profile.id} className="flex items-center gap-3 opacity-40">
                        <span className="text-white/30 text-sm w-5 text-center">–</span>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: p.profile.avatarColor + "33", color: p.profile.avatarColor }}>
                          {p.profile.nickname[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{p.profile.nickname}</div>
                          <div className="text-xs text-white/40">{p.count}× ohne Zeit</div>
                        </div>
                        <div className="text-white/30 text-sm">keine Zeit</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Häufigster Timekeeper */}
              {timekeeperRanking.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">🎯 Häufigster Timekeeper</h2>
                  <div className="space-y-2">
                    {timekeeperRanking.map((tk, i) => (
                      <div key={tk.profile!.id} className="flex items-center gap-3">
                        <span className="text-lg w-8 text-center">{["🥇", "🥈", "🥉"][i] || `${i + 1}.`}</span>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: tk.profile!.avatarColor + "33", color: tk.profile!.avatarColor }}>
                          {tk.profile!.nickname[0].toUpperCase()}
                        </div>
                        <span className="flex-1 font-semibold">{tk.profile!.nickname}</span>
                        <div className="text-right">
                          <div className="text-yellow-400 font-black">{tk.count}×</div>
                          <div className="text-xs text-white/30">Timekeeper</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auszeit-Stats */}
              {games.some((g) => (g.timeouts ?? []).length > 0) && (() => {
                const allTimeouts = games.flatMap((g) => (g.timeouts ?? []).map((t) => ({ ...t, gameName: g.name, opponent: g.opponentName })));
                const tactical = allTimeouts.filter((t) => t.type === "tactical").length;
                const technical = allTimeouts.filter((t) => t.type === "technical").length;
                return (
                  <div className="card">
                    <h2 className="font-bold text-lg mb-3">⏸️ Auszeit-Statistik</h2>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-blue-900/30 border border-blue-500/30 rounded-2xl p-4 text-center">
                        <div className="text-3xl mb-1">🤲</div>
                        <div className="text-blue-400 font-black text-2xl">{tactical}</div>
                        <div className="text-xs text-white/40 mt-1">Taktische Auszeiten</div>
                      </div>
                      <div className="bg-orange-900/30 border border-orange-500/30 rounded-2xl p-4 text-center">
                        <div className="text-3xl mb-1">🍺</div>
                        <div className="text-orange-400 font-black text-2xl">{technical}</div>
                        <div className="text-xs text-white/40 mt-1">Technische Auszeiten</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {games.filter((g) => (g.timeouts ?? []).length > 0).map((g) => (
                        <div key={g.id} className="flex items-center gap-3 bg-[#0D1B2A] rounded-xl px-3 py-2">
                          <span className="flex-1 text-sm font-medium truncate">vs. {g.opponentName}</span>
                          <span className="text-blue-400 text-xs font-bold">🤲 {(g.timeouts ?? []).filter((t) => t.type === "tactical").length}</span>
                          <span className="text-orange-400 text-xs font-bold">🍺 {(g.timeouts ?? []).filter((t) => t.type === "technical").length}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Top Getränke */}
              {topDrinks.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">🏅 Beliebteste Getränke</h2>
                  <div className="space-y-2">
                    {topDrinks.map(([name, count], i) => {
                      const max = topDrinks[0][1];
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-sm text-white/30 w-5 text-center">{i + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-white font-medium">{name}</span>
                              <span className="text-yellow-400 font-bold">{count}×</span>
                            </div>
                            <div className="h-2 bg-[#0D1B2A] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#F5C518] transition-all" style={{ width: `${(count / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-Spieler Trichter-Ranking */}
              {perPlayerTrichter.length > 0 && (
                <div className="card">
                  <h2 className="font-bold text-lg mb-3">🍺 Trichter-Anzahl Ranking</h2>
                  <div className="space-y-2">
                    {[...perPlayerTrichter].sort((a, b) => b.count - a.count).map((p, i) => (
                      <div key={p.profile.id} className="flex items-center gap-3">
                        <span className="text-lg w-8 text-center">{["🥇", "🥈", "🥉"][i] || `${i + 1}.`}</span>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: p.profile.avatarColor + "33", color: p.profile.avatarColor }}>
                          {p.profile.nickname[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold">{p.profile.nickname}</div>
                          {p.best != null && <div className="text-xs text-yellow-400/60">⚡ Best: {formatDur(p.best)}</div>}
                        </div>
                        <div className="text-yellow-400 font-black text-xl">{p.count}×</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          );
        })()}

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
