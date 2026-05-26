"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trophy, MapPin, Calendar, Users } from "lucide-react";

type Tournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  pinCode: string;
  status: string;
  _count: { profiles: number; games: number };
};

export default function Home() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showJoin, setShowJoin] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", location: "", pinCode: "" });
  const [joinPin, setJoinPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/tournaments")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setTournaments)
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, []);

  async function createTournament() {
    if (!form.name || !form.date || !form.location || form.pinCode.length !== 4) {
      toast.error("Bitte alle Felder ausfüllen (PIN = 4 Stellen)");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const t = await res.json();
      setTournaments((prev) => [t, ...prev]);
      setShowNew(false);
      setForm({ name: "", date: "", location: "", pinCode: "" });
      toast.success("Turnier erstellt! 🦁");
    } catch {
      toast.error("Fehler beim Erstellen");
    }
    setCreating(false);
  }

  async function joinTournament(tournamentId: string) {
    if (!joinPin || !nickname.trim()) {
      toast.error("PIN und Spitzname eingeben");
      return;
    }
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (tournament?.pinCode !== joinPin) {
      toast.error("Falscher PIN!");
      return;
    }

    const colors = ["#F5C518", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57", "#FF9FF3", "#54A0FF"];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname.trim(), avatarColor: color, tournamentId }),
    });
    const profile = await res.json();

    localStorage.setItem(`profile_${tournamentId}`, JSON.stringify(profile));
    router.push(`/${tournamentId}/trinken`);
  }

  function handleTournamentClick(tournament: Tournament) {
    const savedProfile = localStorage.getItem(`profile_${tournament.id}`);
    if (savedProfile) {
      router.push(`/${tournament.id}/trinken`);
    } else {
      setShowJoin(tournament.id);
      setJoinPin("");
      setNickname("");
    }
  }

  return (
    <div className="min-h-screen bg-navy p-4 pb-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center py-8">
          <div className="text-6xl mb-2">🦁</div>
          <h1 className="text-3xl font-black text-yellow-400">Banklöwen</h1>
          <p className="text-white/60 mt-1">Volleyballfreizeit Tracker</p>
        </div>

        {/* Tournaments List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="card animate-pulse h-24" />
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            <Trophy className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Noch keine Turniere</p>
            <p className="text-sm mt-1">Erstelle dein erstes Turnier!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tournaments.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTournamentClick(t)}
                className="card w-full text-left active:scale-95 transition-transform"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{t.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          t.status === "active" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/50"
                        }`}
                      >
                        {t.status === "active" ? "Aktiv" : "Archiv"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-white/60">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {t.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(t.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-white/50">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {t._count.profiles}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* New Tournament Button */}
        <button
          onClick={() => setShowNew(true)}
          className="mt-6 btn-primary flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Neues Turnier erstellen
        </button>
      </div>

      {/* New Tournament Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowNew(false)}>
          <div className="bg-navy-lighter w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Neues Turnier
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-1 block">Turnier-Name</label>
                <input
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  placeholder="z.B. Freizeit 2025"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Datum</label>
                <input
                  type="date"
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Ort</label>
                <input
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  placeholder="z.B. Sportheim Musterstadt"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">PIN (4 Stellen)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-2xl tracking-widest text-center focus:border-yellow-400 focus:outline-none"
                  placeholder="1234"
                  value={form.pinCode}
                  onChange={(e) => setForm({ ...form, pinCode: e.target.value.slice(0, 4) })}
                />
              </div>
              <button onClick={createTournament} disabled={creating} className="btn-primary mt-2">
                {creating ? "Erstelle..." : "Turnier erstellen 🦁"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Tournament Modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/80 flex items-end z-50" onClick={() => setShowJoin(null)}>
          <div className="bg-navy-lighter w-full rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">Turnier beitreten 🦁</h2>
            <p className="text-white/60 text-sm mb-6">
              {tournaments.find((t) => t.id === showJoin)?.name}
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/60 mb-1 block">PIN</label>
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-2xl tracking-widest text-center focus:border-yellow-400 focus:outline-none"
                  placeholder="1234"
                  value={joinPin}
                  onChange={(e) => setJoinPin(e.target.value.slice(0, 4))}
                />
              </div>
              <div>
                <label className="text-sm text-white/60 mb-1 block">Dein Spitzname</label>
                <input
                  className="w-full bg-navy border border-white/20 rounded-xl p-3 text-white text-lg focus:border-yellow-400 focus:outline-none"
                  placeholder="z.B. Maximus"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoFocus
                />
              </div>
              <button onClick={() => joinTournament(showJoin)} className="btn-primary">
                Beitreten 🦁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
