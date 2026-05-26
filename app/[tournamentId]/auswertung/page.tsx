"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { calcAlcoholGrams, calcChampionScore, formatAlcohol, formatVolume } from "@/lib/calculations";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/cn";

type Profile = { id: string; nickname: string; avatarColor: string };
type DrinkEntry = {
  id: string;
  profileId: string;
  profile: Profile;
  drink: { name: string; category: string };
  volumeMl: number;
  alcoholPercent: number;
  consumedAt: string;
  isTrichter: boolean;
};
type VomitEntry = {
  id: string;
  profileId: string;
  profile: Profile;
  notes?: string;
  recordedAt: string;
};
type GameStat = {
  id: string;
  profileId: string;
  profile: Profile;
  statType: string;
  gameId: string;
};

const TABS = [
  { key: "trinken", label: "🍺 Trinken" },
  { key: "spielen", label: "🏐 Spielen" },
  { key: "gesamt", label: "🏆 Gesamt" },
];

export default function AuswertungPage() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;

  const [activeTab, setActiveTab] = useState("trinken");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drinkEntries, setDrinkEntries] = useState<DrinkEntry[]>([]);
  const [vomitEntries, setVomitEntries] = useState<VomitEntry[]>([]);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${tournamentId}`).then((r) => r.json()),
      fetch(`/api/drink-entries?tournamentId=${tournamentId}`).then((r) => r.json()),
      fetch(`/api/vomit-entries?tournamentId=${tournamentId}`).then((r) => r.json()),
      fetch(`/api/game-stats?tournamentId=${tournamentId}`).then((r) => r.json()).catch(() => []),
    ]).then(([t, de, ve, gs]) => {
      if (t.profiles) setProfiles(t.profiles);
      setDrinkEntries(de);
      setVomitEntries(ve);
      setGameStats(Array.isArray(gs) ? gs : []);
    }).finally(() => setLoading(false));
  }, [tournamentId]);

  // Computed stats per profile
  const profileStats = profiles.map((p) => {
    const drinks = drinkEntries.filter((e) => e.profileId === p.id);
    const vomits = vomitEntries.filter((e) => e.profileId === p.id);
    const trichter = drinks.filter((e) => e.isTrichter);
    const alcoholGrams = drinks.reduce((sum, e) => sum + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0);
    const totalVolume = drinks.reduce((sum, e) => sum + e.volumeMl, 0);

    // Game stats
    const gStats = gameStats.filter((s) => s.profileId === p.id);
    const points = gStats.filter((s) => s.statType === "point").length;
    const errors = gStats.filter((s) => s.statType === "error").length;
    const trichterActions = gStats.filter((s) => s.statType === "trichter").length;
    const nosebleeds = gStats.filter((s) => s.statType === "nosebleed").length;
    const gameScore = points * 1 + trichterActions * 3 - errors * 1 - nosebleeds * 3;

    const championScore = calcChampionScore({
      gameScore,
      trichterCount: trichter.length,
      alcoholGrams,
      vomitCount: vomits.length,
    });

    return {
      profile: p,
      drinks: drinks.length,
      trichter: trichter.length,
      alcoholGrams,
      totalVolume,
      vomits: vomits.length,
      gameScore,
      points,
      errors,
      trichterActions,
      nosebleeds,
      championScore,
    };
  });

  // Trichter timeline by hour
  const trichterByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    count: drinkEntries.filter((e) => e.isTrichter && new Date(e.consumedAt).getHours() === h).length,
  })).filter((_, i) => i >= 8);

  // Vomit ranking
  const vomitRanking = [...profileStats].sort((a, b) => b.vomits - a.vomits);

  // Champion ranking
  const championRanking = [...profileStats].sort((a, b) => b.championScore - a.championScore);

  // Drink ranking
  const drinkRanking = [...profileStats].sort((a, b) => b.alcoholGrams - a.alcoholGrams);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-white/40">Lade Auswertung...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      <div className="sticky top-0 bg-navy/95 backdrop-blur border-b border-white/10 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-xl font-black text-yellow-400 mb-3">🏆 Auswertung</h1>
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                  activeTab === tab.key ? "bg-yellow-400 text-navy" : "bg-navy text-white/50 border border-white/10"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-4 space-y-6">
        {/* TRINKEN TAB */}
        {activeTab === "trinken" && (
          <>
            {/* Trichter Team Stats */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">🍺 Trichter Team</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-navy rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-yellow-400">
                    {drinkEntries.filter((e) => e.isTrichter).length}
                  </div>
                  <div className="text-xs text-white/50 mt-1">Gesamt</div>
                </div>
                <div className="bg-navy rounded-xl p-3 text-center">
                  <div className="text-3xl font-black text-yellow-400">
                    {formatAlcohol(drinkEntries.reduce((s, e) => s + calcAlcoholGrams(e.volumeMl, e.alcoholPercent), 0))}
                  </div>
                  <div className="text-xs text-white/50 mt-1">Alkohol gesamt</div>
                </div>
              </div>
            </div>

            {/* Trichter Timeline */}
            {trichterByHour.some((h) => h.count > 0) && (
              <div className="card">
                <h2 className="font-bold mb-3">Trichter nach Uhrzeit</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={trichterByHour} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                    <XAxis dataKey="hour" tick={{ fill: "#ffffff60", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#ffffff60", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "#1A2F45", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                      labelStyle={{ color: "white" }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {trichterByHour.map((entry, i) => (
                        <Cell key={i} fill={entry.count === Math.max(...trichterByHour.map((h) => h.count)) ? "#F5C518" : "#F5C51860"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Trichter per Person */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">Trichter pro Person</h2>
              <div className="space-y-3">
                {[...profileStats].sort((a, b) => b.trichter - a.trichter).map((ps, i) => (
                  <div key={ps.profile.id} className="flex items-center gap-3">
                    <span className="text-white/30 text-sm w-5 text-center font-bold">{i + 1}</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                    >
                      {ps.profile.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{ps.profile.nickname}</div>
                      <div className="text-xs text-white/40">{formatAlcohol(ps.alcoholGrams)} Alkohol</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-yellow-400">{ps.trichter}</div>
                      <div className="text-xs text-white/40">Trichter</div>
                    </div>
                    <div className="w-20 bg-navy rounded-full h-2">
                      <div
                        className="bg-yellow-400 h-2 rounded-full"
                        style={{ width: `${profileStats.length ? (ps.trichter / Math.max(...profileStats.map((x) => x.trichter), 1)) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fun Facts */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">🎉 Fun Facts</h2>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const trichterKing = profileStats.reduce((a, b) => a.trichter > b.trichter ? a : b, profileStats[0]);
                  const vomitKing = profileStats.reduce((a, b) => a.vomits > b.vomits ? a : b, profileStats[0]);
                  const alcoholKing = profileStats.reduce((a, b) => a.alcoholGrams > b.alcoholGrams ? a : b, profileStats[0]);
                  return [
                    { icon: "🥇", label: "Trichter-König", value: trichterKing?.profile.nickname, sub: `${trichterKing?.trichter}x` },
                    { icon: "🤮", label: "Shame-König", value: vomitKing?.profile.nickname, sub: `${vomitKing?.vomits}x` },
                    { icon: "🍺", label: "Alkohol-König", value: alcoholKing?.profile.nickname, sub: formatAlcohol(alcoholKing?.alcoholGrams || 0) },
                    { icon: "🏆", label: "Gesamt Trichter", value: `${drinkEntries.filter((e) => e.isTrichter).length}`, sub: "Team" },
                  ].map((fact) => (
                    <div key={fact.label} className="bg-navy rounded-xl p-3">
                      <div className="text-2xl">{fact.icon}</div>
                      <div className="text-xs text-white/50 mt-1">{fact.label}</div>
                      <div className="font-bold text-sm mt-0.5 truncate">{fact.value}</div>
                      <div className="text-xs text-yellow-400">{fact.sub}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Kotz Ranking */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">🤮 Kotz-Ranking</h2>
              {vomitRanking.filter((p) => p.vomits > 0).length === 0 ? (
                <p className="text-white/30 text-center py-4">Niemand hat gekotzt! 💪</p>
              ) : (
                <div className="space-y-2">
                  {vomitRanking.filter((p) => p.vomits > 0).map((ps, i) => (
                    <div key={ps.profile.id} className="flex items-center gap-3">
                      <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                      >
                        {ps.profile.nickname[0].toUpperCase()}
                      </div>
                      <span className="flex-1 font-semibold">{ps.profile.nickname}</span>
                      <span className="text-xl font-black text-purple-400">{ps.vomits}x 🤮</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drink Performance */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">🍹 Trinkleistung</h2>
              <div className="space-y-2">
                {drinkRanking.map((ps, i) => (
                  <div key={ps.profile.id} className="flex items-center gap-3">
                    <span className="text-white/30 text-sm w-5 text-center">{i + 1}</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                    >
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

        {/* SPIELEN TAB */}
        {activeTab === "spielen" && (
          <>
            <div className="card">
              <h2 className="font-bold text-lg mb-3">📊 Spieler Rankings</h2>
              {profileStats.every((p) => p.points === 0 && p.errors === 0) ? (
                <p className="text-white/30 text-center py-6">Noch keine Spiel-Stats</p>
              ) : (
                <div className="space-y-4">
                  {/* Points */}
                  <div>
                    <h3 className="text-sm text-white/50 mb-2">✅ Punkte-König</h3>
                    <div className="space-y-1">
                      {[...profileStats].sort((a, b) => b.points - a.points).slice(0, 5).map((ps) => (
                        <div key={ps.profile.id} className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                          >
                            {ps.profile.nickname[0].toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm">{ps.profile.nickname}</span>
                          <span className="font-bold text-green-400">{ps.points}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trichter Actions */}
                  <div>
                    <h3 className="text-sm text-white/50 mb-2">🍺 Trichter-Aktionen</h3>
                    <div className="space-y-1">
                      {[...profileStats].sort((a, b) => b.trichterActions - a.trichterActions).slice(0, 5).map((ps) => (
                        <div key={ps.profile.id} className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                          >
                            {ps.profile.nickname[0].toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm">{ps.profile.nickname}</span>
                          <span className="font-bold text-yellow-400">{ps.trichterActions}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Errors Shame */}
                  <div>
                    <h3 className="text-sm text-white/50 mb-2">❌ Fehler-Shame</h3>
                    <div className="space-y-1">
                      {[...profileStats].sort((a, b) => b.errors - a.errors).filter((p) => p.errors > 0).slice(0, 5).map((ps) => (
                        <div key={ps.profile.id} className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                          >
                            {ps.profile.nickname[0].toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm">{ps.profile.nickname}</span>
                          <span className="font-bold text-red-400">{ps.errors}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Nosebleed Shame */}
                  <div>
                    <h3 className="text-sm text-white/50 mb-2">🩸 Nasenbluten-Shame</h3>
                    <div className="space-y-1">
                      {[...profileStats].sort((a, b) => b.nosebleeds - a.nosebleeds).filter((p) => p.nosebleeds > 0).slice(0, 5).map((ps) => (
                        <div key={ps.profile.id} className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                          >
                            {ps.profile.nickname[0].toUpperCase()}
                          </div>
                          <span className="flex-1 text-sm">{ps.profile.nickname}</span>
                          <span className="font-bold text-red-900">{ps.nosebleeds}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* GESAMT TAB */}
        {activeTab === "gesamt" && (
          <>
            {/* Champion Podium */}
            <div className="card">
              <h2 className="font-bold text-xl mb-4 text-center">🦁 Banklöwen Champions</h2>
              <div className="flex items-end justify-center gap-3 mb-6">
                {/* 2nd */}
                {championRanking[1] && (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black border-4 border-gray-400"
                      style={{ backgroundColor: championRanking[1].profile.avatarColor + "33", color: championRanking[1].profile.avatarColor }}
                    >
                      {championRanking[1].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-center">{championRanking[1].profile.nickname}</span>
                    <div className="bg-gray-500/30 text-gray-300 rounded-xl px-2 py-1 text-xs font-bold">
                      {championRanking[1].championScore.toFixed(0)} Pkt
                    </div>
                    <div className="bg-gray-500 h-16 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥈</div>
                  </div>
                )}

                {/* 1st */}
                {championRanking[0] && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-3xl">👑</div>
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4 border-yellow-400"
                      style={{ backgroundColor: championRanking[0].profile.avatarColor + "33", color: championRanking[0].profile.avatarColor }}
                    >
                      {championRanking[0].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-center text-yellow-400">{championRanking[0].profile.nickname}</span>
                    <div className="bg-yellow-400/20 text-yellow-400 rounded-xl px-2 py-1 text-sm font-black">
                      {championRanking[0].championScore.toFixed(0)} Pkt
                    </div>
                    <div className="bg-yellow-500 h-24 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥇</div>
                  </div>
                )}

                {/* 3rd */}
                {championRanking[2] && (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black border-4 border-amber-700"
                      style={{ backgroundColor: championRanking[2].profile.avatarColor + "33", color: championRanking[2].profile.avatarColor }}
                    >
                      {championRanking[2].profile.nickname[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-center">{championRanking[2].profile.nickname}</span>
                    <div className="bg-amber-700/30 text-amber-600 rounded-xl px-2 py-1 text-xs font-bold">
                      {championRanking[2].championScore.toFixed(0)} Pkt
                    </div>
                    <div className="bg-amber-700 h-10 w-16 rounded-t-xl flex items-end justify-center pb-1 text-2xl">🥉</div>
                  </div>
                )}
              </div>

              <p className="text-xs text-white/30 text-center">
                Score = Spiel + Trichter×5 + Alkohol/10 − Kotzen×10
              </p>
            </div>

            {/* Full Ranking */}
            <div className="card">
              <h2 className="font-bold text-lg mb-3">Vollständige Rangliste</h2>
              <div className="space-y-3">
                {championRanking.map((ps, i) => (
                  <div key={ps.profile.id} className={cn("flex items-center gap-3 p-2 rounded-xl", i < 3 && "bg-yellow-400/5")}>
                    <span className="text-lg w-6 text-center">{["🥇", "🥈", "🥉"][i] || `${i + 1}.`}</span>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-black"
                      style={{ backgroundColor: ps.profile.avatarColor + "33", color: ps.profile.avatarColor }}
                    >
                      {ps.profile.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{ps.profile.nickname}</div>
                      <div className="text-xs text-white/40 flex gap-3 mt-0.5">
                        <span>🍺 {ps.trichter}x</span>
                        <span>🤮 {ps.vomits}x</span>
                        <span>⚽ +{ps.points}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-yellow-400 text-lg">{ps.championScore.toFixed(0)}</div>
                      <div className="text-xs text-white/30">Punkte</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
