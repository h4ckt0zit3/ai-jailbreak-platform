import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trophy, ArrowLeft, Crown, Medal, Award, Shield, Zap, Users, Lock } from 'lucide-react';
import { getLeaderboard, adminGameState } from '../api';

const PODIUM_CONFIG = [
  { rank: 2, icon: Medal, color: 'text-gray-300', bg: 'from-gray-400/15 to-gray-500/5', border: 'border-gray-400/20', glow: '', height: 'h-28', order: 'order-1', mt: 'mt-8' },
  { rank: 1, icon: Crown, color: 'text-yellow-400', bg: 'from-yellow-500/20 to-yellow-600/5', border: 'border-yellow-500/25', glow: 'shadow-[0_0_30px_rgba(234,179,8,0.12)]', height: 'h-36', order: 'order-2', mt: 'mt-0' },
  { rank: 3, icon: Award, color: 'text-amber-600', bg: 'from-amber-600/15 to-amber-700/5', border: 'border-amber-600/20', glow: '', height: 'h-24', order: 'order-3', mt: 'mt-10' },
];

export default function LeaderboardPage() {
  const [sp] = useSearchParams();
  const adminKey = sp.get('key') || '';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!adminKey) { setLoading(false); return; }
    // Validate key by calling an admin endpoint
    adminGameState(adminKey)
      .then(() => { setAuthorized(true); })
      .catch(() => { setLoading(false); });
  }, [adminKey]);

  useEffect(() => {
    if (!authorized) return;
    const f = () => getLeaderboard().then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    f();
    const i = setInterval(f, 10000);
    return () => clearInterval(i);
  }, [authorized]);

  if (!adminKey || (!authorized && !loading)) return (
    <div className="flex items-center justify-center h-screen bg-[#06060b]">
      <div className="glass rounded-2xl p-8 max-w-md text-center border border-red-500/15">
        <Lock className="w-14 h-14 text-red-400/60 mx-auto mb-4" />
        <h2 className="text-white text-lg font-bold font-sora mb-2">Access Denied</h2>
        <p className="text-gray-400 text-sm mb-5 font-mono">Leaderboard is admin-only. Contact your event organizer.</p>
        <Link to="/" className="text-accent text-sm hover:underline font-mono">← Back to Challenge</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#06060b] relative">
      <div className="bg-grid" />

      {/* Header */}
      <div className="glass-strong border-b border-dark-400/30 sticky top-0 z-10 relative">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/admin?key=${adminKey}`} className="w-9 h-9 rounded-xl bg-dark-600/80 hover:bg-dark-500 flex items-center justify-center text-gray-400 hover:text-white transition-all">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h1 className="text-white font-bold font-sora text-sm">Leaderboard</h1>
                <p className="text-gray-500 text-[10px]">Live Rankings</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="live-dot" />
            <span>Updates every 10s</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 relative z-[1]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-dark-600 to-dark-700 flex items-center justify-center mb-6 float-badge">
              <Trophy className="w-12 h-12 text-gray-600" />
            </div>
            <h2 className="text-white font-bold text-xl font-sora mb-2">No Teams Yet</h2>
            <p className="text-gray-500 text-sm mb-6 text-center max-w-sm">Be the first to register and start cracking SecureBot's secrets!</p>
            <Link to="/" className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-accent to-purple-600 text-white text-sm font-medium hover:opacity-90 transition-all glow-accent">
              Join Challenge
            </Link>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Users, label: 'Teams', value: data.length, color: 'text-accent' },
                { icon: Trophy, label: 'Top Score', value: data[0]?.total_score || 0, color: 'text-yellow-400' },
                { icon: Zap, label: 'Rooms Cleared', value: data.reduce((a, t) => a + (t.rooms_solved || 0), 0), color: 'text-green-400' },
              ].map((s, i) => (
                <div key={i} className="glass rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                    <span className="text-gray-500 text-[11px]">{s.label}</span>
                  </div>
                  <p className="text-white text-xl font-bold font-sora">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Top 3 Podium */}
            {data.length >= 3 && (
              <div className="grid grid-cols-3 gap-4 mb-8 items-end">
                {PODIUM_CONFIG.map((cfg) => {
                  const t = data[cfg.rank - 1];
                  if (!t) return null;
                  return (
                    <div key={cfg.rank} className={`${cfg.order} ${cfg.mt} flex flex-col items-center`}>
                      <div className={`glass rounded-2xl p-5 w-full text-center border ${cfg.border} ${cfg.glow} transition-all hover:scale-[1.02]`}>
                        <div className={`w-14 h-14 mx-auto rounded-xl bg-gradient-to-br ${cfg.bg} flex items-center justify-center mb-3 rank-badge`}>
                          <cfg.icon className={`w-7 h-7 ${cfg.color}`} />
                        </div>
                        <p className="text-white font-semibold text-sm font-sora truncate">{t.team_name}</p>
                        <p className="text-accent text-2xl font-bold font-sora mt-1">{t.total_score}</p>
                        <p className="text-gray-500 text-xs mt-1">{t.rooms_solved}/10 rooms</p>

                      </div>
                      {/* Podium Bar */}
                      <div className={`w-full ${cfg.height} rounded-t-xl bg-gradient-to-t ${cfg.bg} mt-2 border-x ${cfg.border} border-t ${cfg.border} flex items-center justify-center`}>
                        <span className={`text-2xl font-bold font-sora ${cfg.color} opacity-50`}>#{cfg.rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full Table */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="p-4 border-b border-dark-400/20 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm font-sora flex items-center gap-2">
                  <Shield className="w-4 h-4 text-accent" /> All Teams
                </h3>
                <span className="text-gray-600 text-xs font-mono">{data.length} registered</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-400/20">
                    <th className="text-left text-gray-500 text-xs font-medium p-3 pl-4 w-16">Rank</th>
                    <th className="text-left text-gray-500 text-xs font-medium p-3">Team</th>
                    <th className="text-right text-gray-500 text-xs font-medium p-3">Rooms</th>
                    <th className="text-right text-gray-500 text-xs font-medium p-3 pr-4">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((t, i) => {
                    return (
                      <tr
                        key={i}
                        className="lb-row border-b border-dark-400/10"
                      >
                        <td className="p-3 pl-4">
                          <span className={`inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-bold rank-badge ${
                            i === 0 ? 'bg-yellow-500/15 text-yellow-400'
                              : i === 1 ? 'bg-gray-400/15 text-gray-300'
                                : i === 2 ? 'bg-amber-600/15 text-amber-500'
                                  : 'bg-dark-600/80 text-gray-500'
                          }`}>{i + 1}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-white font-medium">{t.team_name}</span>

                        </td>
                        <td className="p-3 text-right text-gray-400 font-mono text-xs">{t.rooms_solved}/10</td>
                        <td className="p-3 pr-4 text-right text-accent font-bold font-sora">{t.total_score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
