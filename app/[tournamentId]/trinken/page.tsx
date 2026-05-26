"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Clock, Timer } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { cn } from "@/lib/cn";

type Profile = { id: string; nickname: string; avatarColor: string };
type Drink = { id: string; name: string; defaultVolumeMl: number; alcoholPercent: number; category: string };
type DrinkEntry = {
  id: string;
  profile: Profile;
  drink: Drink;
  volumeMl: number;
  alcoholPercent: number;
  consumedAt: string;
  isTrichter: boolean;
  durationSeconds?: number | null;
  timekeeperId?: string | null;
};
type VomitEntry = {
  id: string;
  profile: Profile;
  notes?: string;
  recordedAt: string;
};
type FeedItem = ({ type: "drink" } & DrinkEntry) | ({ type: "vomit" } & VomitEntry);

const CATEGORIES = ["Bier", "Wein", "Sekt", "Schnaps", "Longdrink", "Softdrink"];

const TRICHTER_SIZES = [
  { label: "Klein", ml: 330, emoji: "🍺" },
  { label: "Normal", ml: 500, emoji: "🍺🍺" },
  { label: "Doppelt", ml: 1000, emoji: "🍺🍺🍺" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseDuration(input: string): number {
  if (input.includes(":")) {
    const [m, s] = input.split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  }
  return parseInt(input) || 0;
}

export default function TrinkenPage() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [drinkEntries, setDrinkEntries] = useState<DrinkEntry[]>([]);
  const [vomitEntries, setVomitEntries] = useState<VomitEntry[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [vomitOpen, setVomitOpen] = useState(false);
  const [trichterOpen, setTrichterOpen] = useState(false);
  const [trichterStep, setTrichterStep] = useState<"person" | "details">("person");
  const [trichterQuickVolume, setTrichterQuickVolume] = useState("500");
  const [step, setStep] = useState<"person" | "drink" | "amount">("person");
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Drink | null>(null);
  const [activeCategory, setActiveCategory] = useState("Bier");
  const [volume, setVolume] = useState("");
  const [alcoholPct, setAlcoholPct] = useState("");
  const [isTrichter, setIsTrichter] = useState(false);
  const [trichterDuration, setTrichterDuration] = useState("");
  const [timekeeperId, setTimekeeperId] = useState<string | null>(null);
  const [vomitProfile, setVomitProfile] = useState<Profile | null>(null);
  const [vomitNote, setVomitNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Stopwatch state
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(`profile_${tournamentId}`);
    if (saved) setCurrentProfile(JSON.parse(saved));

    const safe = (p: Promise<Response>) => p.then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([
      safe(fetch(`/api/drinks?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/drink-entries?tournamentId=${tournamentId}`)),
      safe(fetch(`/api/vomit-entries?tournamentId=${tournamentId}`)),
    ]).then(([d, de, ve]) => {
      setDrinks(Array.isArray(d) ? d : []);
      setDrinkEntries(Array.isArray(de) ? de : []);
      setVomitEntries(Array.isArray(ve) ? ve : []);
    });
    fetch(`/api/tournaments/${tournamentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => { if (t?.profiles) setProfiles(t.profiles); })
      .catch(() => {});
  }, [tournamentId]);

  // Stopwatch timer
  useEffect(() => {
    if (!stopwatchRunning) return;
    const interval = setInterval(() => setStopwatchSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [stopwatchRunning]);

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`tournament-${tournamentId}`);
    channel.bind("new_drink_entry", (data: DrinkEntry) => setDrinkEntries((prev) => [data, ...prev]));
    channel.bind("new_vomit_entry", (data: VomitEntry) => setVomitEntries((prev) => [data, ...prev]));
    return () => { channel.unbind_all(); pusher.unsubscribe(`tournament-${tournamentId}`); };
  }, [tournamentId]);

  function openWizard() {
    setStep("person");
    setSelectedProfile(currentProfile);
    setSelectedDrink(null);
    setVolume("");
    setAlcoholPct("");
    setIsTrichter(false);
    setTrichterDuration("");
    setTimekeeperId(null);
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    setWizardOpen(true);
  }

  function openTrichterWizard() {
    setTrichterStep("person");
    setSelectedProfile(currentProfile);
    setTrichterQuickVolume("500");
    setTrichterDuration("");
    setTimekeeperId(null);
    setStopwatchRunning(false);
    setStopwatchSeconds(0);
    setTrichterOpen(true);
  }

  async function submitTrichterOnly() {
    if (!selectedProfile) return;
    // Auto-pick first Bier, then first available drink
    const bierDrink = drinks.find((d) => d.category === "Bier") ?? drinks[0];
    if (!bierDrink) { toast.error("Kein Getränk verfügbar"); return; }
    setSubmitting(true);
    try {
      const durationSeconds = trichterDuration ? parseDuration(trichterDuration) : null;
      await fetch("/api/drink-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          drinkId: bierDrink.id,
          volumeMl: parseInt(trichterQuickVolume),
          alcoholPercent: bierDrink.alcoholPercent,
          isTrichter: true,
          durationSeconds,
          timekeeperId: timekeeperId || null,
          tournamentId,
        }),
      });
      toast.success("🍺 Trichter eingetragen!");
      setTrichterOpen(false);
    } catch {
      toast.error("Fehler beim Eintragen");
    }
    setSubmitting(false);
  }

  function selectDrink(drink: Drink) {
    setSelectedDrink(drink);
    setVolume(String(drink.defaultVolumeMl));
    setAlcoholPct(String(drink.alcoholPercent));
    setStep("amount");
  }

  function toggleStopwatch() {
    if (stopwatchRunning) {
      setStopwatchRunning(false);
      setTrichterDuration(formatDuration(stopwatchSeconds));
    } else {
      setStopwatchSeconds(0);
      setStopwatchRunning(true);
      setTrichterDuration("");
    }
  }

  async function submitDrink() {
    if (!selectedProfile || !selectedDrink || !volume) return;
    setSubmitting(true);
    try {
      const durationSeconds = trichterDuration ? parseDuration(trichterDuration) : null;
      await fetch("/api/drink-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: selectedProfile.id,
          drinkId: selectedDrink.id,
          volumeMl: parseInt(volume),
          alcoholPercent: parseFloat(alcoholPct),
          isTrichter,
          durationSeconds: isTrichter ? durationSeconds : null,
          timekeeperId: isTrichter ? timekeeperId : null,
          tournamentId,
        }),
      });
      toast.success(isTrichter ? "🍺 Trichter eingetragen!" : "Getränk eingetragen!");
      setWizardOpen(false);
    } catch {
      toast.error("Fehler beim Eintragen");
    }
    setSubmitting(false);
  }

  async function submitVomit() {
    if (!vomitProfile) return;
    setSubmitting(true);
    try {
      await fetch("/api/vomit-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: vomitProfile.id, tournamentId, notes: vomitNote || undefined }),
      });
      toast.success("🤮 Kotzen eingetragen!");
      setVomitOpen(false);
      setVomitNote("");
    } catch { toast.error("Fehler"); }
    setSubmitting(false);
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/drink-entries?id=${id}`, { method: "DELETE" });
    setDrinkEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Gelöscht");
  }

  const feed: FeedItem[] = [
    ...drinkEntries.map((e) => ({ ...e, type: "drink" as const })),
    ...vomitEntries.map((e) => ({ ...e, type: "vomit" as const })),
  ].sort((a, b) => {
    const aTime = a.type === "drink" ? a.consumedAt : a.recordedAt;
    const bTime = b.type === "drink" ? b.consumedAt : b.recordedAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  const categoryDrinks = drinks.filter((d) => d.category === activeCategory);
  const timekeeperProfile = profiles.find((p) => p.id === timekeeperId);

  return (
    <div className="min-h-screen bg-navy">
      <div className="sticky top-0 bg-navy/95 backdrop-blur border-b border-white/10 z-10 px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <h1 className="text-xl font-black text-yellow-400">🍺 Trinken</h1>
          <button
            onClick={() => { setVomitProfile(currentProfile); setVomitOpen(true); }}
            className="bg-purple-700/40 text-purple-300 border border-purple-500/40 px-3 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform"
          >
            🤮 Kotzen
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-3 space-y-2">
        {feed.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🦁</p>
            <p>Noch nichts getrunken?!</p>
            <p className="text-sm mt-1">Drück den + Button!</p>
          </div>
        )}
        {feed.map((item) => {
          if (item.type === "vomit") {
            return (
              <div key={item.id} className="card border-purple-500/30 bg-purple-900/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: item.profile.avatarColor + "33", color: item.profile.avatarColor }}>
                    {item.profile.nickname[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">
                      <span style={{ color: item.profile.avatarColor }}>{item.profile.nickname}</span>
                      <span className="text-white"> hat gekotzt 🤮</span>
                    </div>
                    {item.notes && <p className="text-sm text-white/50 mt-0.5">{item.notes}</p>}
                    <p className="text-xs text-white/30 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {new Date(item.recordedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </div>
            );
          }
          const isOwn = item.profile.id === currentProfile?.id;
          const keeper = item.timekeeperId ? profiles.find((p) => p.id === item.timekeeperId) : null;
          return (
            <div key={item.id} className={cn("card", item.isTrichter && "border-yellow-400/40 bg-yellow-900/10")}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: item.profile.avatarColor + "33", color: item.profile.avatarColor }}>
                  {item.profile.nickname[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">
                    <span style={{ color: item.profile.avatarColor }}>{item.profile.nickname}</span>
                    {item.isTrichter && <span className="ml-1 text-yellow-400">🍺 Trichter!</span>}
                  </div>
                  <div className="text-white/80 text-sm">
                    {item.drink.name} · {item.volumeMl}ml · {item.alcoholPercent}%
                  </div>
                  {item.isTrichter && item.durationSeconds && (
                    <div className="text-xs text-yellow-400/80 flex items-center gap-1 mt-0.5">
                      <Timer className="w-3 h-3" />
                      {formatDuration(item.durationSeconds)}
                      {keeper && <span className="text-white/40 ml-1">· Timekeeper: {keeper.nickname}</span>}
                    </div>
                  )}
                  <p className="text-xs text-white/30 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(item.consumedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {isOwn && (
                  <button onClick={() => deleteEntry(item.id)} className="text-white/20 hover:text-red-400 p-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FABs — Trichter above, Drink below */}
      <div className="fixed right-4 z-30 flex flex-col items-end gap-3"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom) + 16px)" }}>
        {/* Trichter FAB */}
        <button onClick={openTrichterWizard}
          className="w-14 h-14 bg-[#1A2F45] border-2 border-yellow-400 text-yellow-400 rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform text-2xl">
          🍺
        </button>
        {/* Getränk FAB */}
        <button onClick={openWizard}
          className="w-16 h-16 bg-yellow-400 text-[#0D1B2A] rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform">
          <Plus className="w-8 h-8" strokeWidth={3} />
        </button>
      </div>

      {/* ─── TRICHTER QUICK WIZARD ─── */}
      {trichterOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setTrichterOpen(false)}>
          <div className="bg-[#1A2F45] w-full rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* Person step */}
            {trichterStep === "person" && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">🍺 Wer trichtert?</h2>
                  <button onClick={() => setTrichterOpen(false)} className="text-white/30 p-1"><Plus className="w-5 h-5 rotate-45" /></button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {profiles.map((p) => (
                    <button key={p.id}
                      onClick={() => { setSelectedProfile(p); setTrichterStep("details"); }}
                      className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95",
                        selectedProfile?.id === p.id ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                        style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                        {p.nickname[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-center leading-tight">{p.nickname}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Details step */}
            {trichterStep === "details" && selectedProfile && (
              <div className="p-6">
                <button onClick={() => setTrichterStep("person")} className="text-white/40 text-sm mb-4 flex items-center gap-1">
                  ← {selectedProfile.nickname}
                </button>
                <h2 className="text-xl font-bold mb-5">🍺 Trichter Details</h2>
                <div className="space-y-5">
                  {/* Size */}
                  <div>
                    <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Größe</label>
                    <div className="grid grid-cols-3 gap-2">
                      {TRICHTER_SIZES.map((size) => (
                        <button key={size.ml} onClick={() => setTrichterQuickVolume(String(size.ml))}
                          className={cn("py-4 rounded-2xl text-center border-2 transition-all active:scale-95",
                            trichterQuickVolume === String(size.ml)
                              ? "bg-yellow-400 text-[#0D1B2A] border-yellow-400"
                              : "bg-[#0D1B2A] border-white/10 text-white/70")}>
                          <div className="text-2xl">{size.emoji}</div>
                          <div className="font-bold text-sm mt-1">{size.label}</div>
                          <div className="text-xs opacity-70">{size.ml}ml</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stopwatch + manual time */}
                  <div>
                    <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Zeit (optional)</label>
                    <div className="flex gap-2">
                      <button onClick={toggleStopwatch}
                        className={cn("flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2",
                          stopwatchRunning ? "bg-red-600 text-white" : "bg-[#0D1B2A] border border-white/20 text-white/70")}>
                        <Timer className="w-4 h-4" />
                        {stopwatchRunning ? `⏱ ${formatDuration(stopwatchSeconds)}` : "Stoppuhr"}
                      </button>
                      <input
                        className="w-24 bg-[#0D1B2A] border border-white/20 rounded-xl p-3 text-white text-lg text-center focus:border-yellow-400 focus:outline-none"
                        placeholder="1:30"
                        value={trichterDuration}
                        onChange={(e) => setTrichterDuration(e.target.value)}
                      />
                    </div>
                    {trichterDuration && (
                      <p className="text-xs text-yellow-400/60 mt-1">= {parseDuration(trichterDuration)} Sek.</p>
                    )}
                  </div>

                  {/* Timekeeper */}
                  <div>
                    <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Timekeeper (optional)</label>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {profiles.filter((p) => p.id !== selectedProfile?.id).map((p) => (
                        <button key={p.id} onClick={() => setTimekeeperId(timekeeperId === p.id ? null : p.id)}
                          className={cn("flex flex-col items-center gap-1 p-2 rounded-xl border-2 flex-shrink-0 transition-all",
                            timekeeperId === p.id ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                            {p.nickname[0].toUpperCase()}
                          </div>
                          <span className="text-xs">{p.nickname}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={submitTrichterOnly} disabled={submitting}
                    className="w-full py-5 bg-yellow-400 text-[#0D1B2A] font-black text-xl rounded-2xl active:scale-95 transition-transform disabled:opacity-50">
                    {submitting ? "..." : "🍺 Trichter eintragen!"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drink Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setWizardOpen(false)}>
          <div className="bg-[#1A2F45] w-full rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* Step: Person */}
            {step === "person" && (
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Wer trinkt? 🦁</h2>
                <div className="grid grid-cols-3 gap-3">
                  {profiles.map((p) => (
                    <button key={p.id} onClick={() => { setSelectedProfile(p); setStep("drink"); }}
                      className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95",
                        selectedProfile?.id === p.id ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
                        style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                        {p.nickname[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-center leading-tight">{p.nickname}</span>
                    </button>
                  ))}
                </div>
                {profiles.length === 0 && <p className="text-white/40 text-center py-8">Noch keine Spieler</p>}
              </div>
            )}

            {/* Step: Drink */}
            {step === "drink" && (
              <div className="p-6">
                <button onClick={() => setStep("person")} className="text-white/40 text-sm mb-4 flex items-center gap-1">
                  ← {selectedProfile?.nickname}
                </button>
                <h2 className="text-xl font-bold mb-4">Was wird getrunken? 🍺</h2>
                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={cn("px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors",
                        activeCategory === cat ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#0D1B2A] text-white/60 border border-white/10")}>
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {categoryDrinks.map((d) => (
                    <button key={d.id} onClick={() => selectDrink(d)}
                      className="card text-left active:scale-95 transition-transform">
                      <div className="font-semibold text-sm">{d.name}</div>
                      <div className="text-white/50 text-xs mt-1">{d.defaultVolumeMl}ml · {d.alcoholPercent}%</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step: Amount */}
            {step === "amount" && selectedDrink && (
              <div className="p-6">
                <button onClick={() => setStep("drink")} className="text-white/40 text-sm mb-4 flex items-center gap-1">
                  ← {selectedDrink.name}
                </button>
                <h2 className="text-xl font-bold mb-6">Menge & Details</h2>
                <div className="space-y-5">

                  {/* Trichter toggle — prominent */}
                  <button onClick={() => { setIsTrichter(!isTrichter); if (!isTrichter) { setVolume("500"); } }}
                    className={cn("w-full py-4 rounded-2xl border-2 font-bold text-lg transition-all active:scale-95",
                      isTrichter ? "bg-yellow-400/20 border-yellow-400 text-yellow-400" : "bg-[#0D1B2A] border-white/20 text-white/60")}>
                    🍺 War ein Trichter!
                  </button>

                  {/* Trichter-specific: size + timing */}
                  {isTrichter && (
                    <div className="space-y-4 bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-4">
                      <div>
                        <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Trichter Größe</label>
                        <div className="grid grid-cols-3 gap-2">
                          {TRICHTER_SIZES.map((size) => (
                            <button key={size.ml} onClick={() => setVolume(String(size.ml))}
                              className={cn("py-3 rounded-xl text-center transition-all active:scale-95 border-2",
                                volume === String(size.ml)
                                  ? "bg-yellow-400 text-[#0D1B2A] border-yellow-400"
                                  : "bg-[#0D1B2A] border-white/10 text-white/70")}>
                              <div className="text-xl">{size.emoji}</div>
                              <div className="font-bold text-sm mt-1">{size.label}</div>
                              <div className="text-xs opacity-70">{size.ml}ml</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Stopwatch + manual time */}
                      <div>
                        <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Zeit (optional)</label>
                        <div className="flex gap-2">
                          <button onClick={toggleStopwatch}
                            className={cn("flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                              stopwatchRunning ? "bg-red-600 text-white" : "bg-[#0D1B2A] border border-white/20 text-white/70")}>
                            <Timer className="w-4 h-4" />
                            {stopwatchRunning ? `⏱ ${formatDuration(stopwatchSeconds)}` : "Stoppuhr starten"}
                          </button>
                          <input
                            className="w-28 bg-[#0D1B2A] border border-white/20 rounded-xl p-3 text-white text-lg text-center focus:border-yellow-400 focus:outline-none"
                            placeholder="1:30"
                            value={trichterDuration}
                            onChange={(e) => setTrichterDuration(e.target.value)}
                          />
                        </div>
                        {trichterDuration && (
                          <p className="text-xs text-yellow-400/60 mt-1">
                            = {parseDuration(trichterDuration)} Sekunden
                          </p>
                        )}
                      </div>

                      {/* Timekeeper */}
                      <div>
                        <label className="text-sm text-yellow-400/80 mb-2 block font-semibold">Timekeeper (optional)</label>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {profiles.filter((p) => p.id !== selectedProfile?.id).map((p) => (
                            <button key={p.id} onClick={() => setTimekeeperId(timekeeperId === p.id ? null : p.id)}
                              className={cn("flex flex-col items-center gap-1 p-2 rounded-xl border-2 flex-shrink-0 transition-all",
                                timekeeperId === p.id ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                                style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                                {p.nickname[0].toUpperCase()}
                              </div>
                              <span className="text-xs">{p.nickname}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Regular volume (shown if NOT trichter) */}
                  {!isTrichter && (
                    <div>
                      <label className="text-sm text-white/60 mb-2 block">Menge (ml)</label>
                      <div className="flex gap-2 flex-wrap">
                        {[100, 200, 250, 300, 330, 400, 500, 750].map((ml) => (
                          <button key={ml} onClick={() => setVolume(String(ml))}
                            className={cn("px-3 py-2 rounded-xl text-sm font-bold transition-colors",
                              volume === String(ml) ? "bg-yellow-400 text-[#0D1B2A]" : "bg-[#0D1B2A] border border-white/10 text-white/70")}>
                            {ml}ml
                          </button>
                        ))}
                      </div>
                      <input type="number" inputMode="numeric"
                        className="mt-2 w-full bg-[#0D1B2A] border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                        placeholder="Oder eigene Menge eingeben"
                        value={volume} onChange={(e) => setVolume(e.target.value)} />
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-white/60 mb-1 block">Alkohol %</label>
                    <input type="number" inputMode="decimal" step="0.1"
                      className="w-full bg-[#0D1B2A] border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                      value={alcoholPct} onChange={(e) => setAlcoholPct(e.target.value)} />
                  </div>

                  <button onClick={submitDrink} disabled={submitting} className="btn-primary">
                    {submitting ? "Eingetragen..." : "Eintragen! 🦁"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vomit Modal */}
      {vomitOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setVomitOpen(false)}>
          <div className="bg-[#1A2F45] w-full rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">🤮 Kotzen eintragen</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-2 block">Wer hat gekotzt?</label>
                <div className="grid grid-cols-3 gap-2">
                  {profiles.map((p) => (
                    <button key={p.id} onClick={() => setVomitProfile(p)}
                      className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all active:scale-95",
                        vomitProfile?.id === p.id ? "border-purple-400 bg-purple-400/10" : "border-white/10 bg-[#0D1B2A]")}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
                        style={{ backgroundColor: p.avatarColor + "33", color: p.avatarColor }}>
                        {p.nickname[0].toUpperCase()}
                      </div>
                      <span className="text-xs">{p.nickname}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Notiz (optional)</label>
                <input className="w-full bg-[#0D1B2A] border border-white/20 rounded-xl p-3 text-white focus:border-purple-400 focus:outline-none"
                  placeholder="z.B. nach dem 10. Trichter..."
                  value={vomitNote} onChange={(e) => setVomitNote(e.target.value)} />
              </div>
              <button onClick={submitVomit} disabled={!vomitProfile || submitting}
                className="w-full py-4 bg-purple-700 text-white font-bold text-lg rounded-2xl active:scale-95 transition-transform disabled:opacity-50">
                {submitting ? "..." : "Eintragen 🤮"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
