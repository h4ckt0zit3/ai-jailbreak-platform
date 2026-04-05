import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Shield, Users, Trophy, RotateCcw, Download, Power, PowerOff, ArrowLeft, RefreshCw,
  Eye, Terminal, Zap, Activity, Key, Lock, ChevronDown, ChevronUp, AlertTriangle,
  Hash, Star, Lightbulb, BarChart3, Clock, Trash2
} from 'lucide-react';
import {
  getAdminSessions, getAdminWinningPrompts, adminReset, adminToggleGame,
  adminGameState, exportCsvUrl, getLeaderboard,
  getAdminRoomSecrets, getAdminAttackPrompts, getAdminApiStats, adminResetApiCounter
} from '../api';

const DIFF_COLORS = { 1: 'text-green-400', 2: 'text-green-400', 3: 'text-yellow-400', 4: 'text-orange-400', 5: 'text-red-400' };
const DIFF_BG = { 1: 'bg-green-500/10', 2: 'bg-green-500/10', 3: 'bg-yellow-500/10', 4: 'bg-orange-500/10', 5: 'bg-red-500/10' };
const DIFF_LABEL = { 1: 'Easy', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Expert' };
const API_DAILY_LIMIT = 6000;

export default function Admin() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const key = sp.get('key') || '';
  const [sessions, setSessions] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [gameActive, setGameActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showPrompts, setShowPrompts] = useState(false);

  // New state
  const [roomSecrets, setRoomSecrets] = useState([]);
  const [attackPrompts, setAttackPrompts] = useState([]);
  const [apiStats, setApiStats] = useState(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showAttacks, setShowAttacks] = useState(false);
  const [showApiStats, setShowApiStats] = useState(true);
  const [expandedRoom, setExpandedRoom] = useState(null);

  useEffect(() => {
    if (!key) { setError('No admin key. Add ?key=YOUR_KEY'); setLoading(false); return; }
    fetchAll();
    const i = setInterval(fetchAll, 10000);
    return () => clearInterval(i);
  }, [key]);

  const fetchAll = async () => {
    try {
      const [s, wp, gs, secrets, attacks, stats] = await Promise.all([
        getAdminSessions(key), getAdminWinningPrompts(key), adminGameState(key),
        getAdminRoomSecrets(key), getAdminAttackPrompts(key), getAdminApiStats(key),
      ]);
      setSessions(s); setPrompts(wp); setGameActive(gs.gameActive);
      setRoomSecrets(secrets); setAttackPrompts(attacks); setApiStats(stats);
      setError('');
    } catch { setError('Unauthorized'); }
    finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!confirm('⚠ Reset ALL data? This cannot be undone.')) return;
    try { await adminReset(key); setMsg('✓ All data reset'); fetchAll(); setTimeout(() => setMsg(''), 3000); } catch { setMsg('Failed'); }
  };
  const handleToggle = async () => {
    try { const r = await adminToggleGame(key); setGameActive(r.gameActive); setMsg(r.gameActive ? '✓ Game activated' : '⏸ Game paused'); setTimeout(() => setMsg(''), 3000); } catch { setMsg('Failed'); }
  };
  const handleResetApiCounter = async () => {
    if (!confirm('Reset the API request counter? This only clears the counter, not actual API usage.')) return;
    try { await adminResetApiCounter(key); setMsg('✓ API counter reset'); fetchAll(); setTimeout(() => setMsg(''), 3000); } catch { setMsg('Failed'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#06060b]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-xs font-mono">Loading admin panel...</p>
      </div>
    </div>
  );

  if (error && !sessions.length) return (
    <div className="flex items-center justify-center h-screen bg-[#06060b]">
      <div className="glass rounded-2xl p-8 max-w-md text-center border border-red-500/15">
        <Shield className="w-14 h-14 text-red-400/60 mx-auto mb-4" />
        <h2 className="text-white text-lg font-bold font-sora mb-2">Access Denied</h2>
        <p className="text-gray-400 text-sm mb-5 font-mono">{error}</p>
        <button onClick={() => nav('/')} className="text-accent text-sm hover:underline font-mono">← Back to Challenge</button>
      </div>
    </div>
  );

  const totalTeams = sessions.length;
  const solvedRooms = prompts.length;
  const totalAttempts = sessions.reduce((a, s) => a + (s.total_attempts || 0), 0);
  const roomCounts = {};
  prompts.forEach((p) => { roomCounts[p.room_number] = (roomCounts[p.room_number] || 0) + 1; });
  const mostCracked = Object.entries(roomCounts).sort((a, b) => b[1] - a[1])[0];

  const apiUsagePct = apiStats ? Math.min((apiStats.today / API_DAILY_LIMIT) * 100, 100) : 0;
  const apiDanger = apiUsagePct > 80;
  const apiWarning = apiUsagePct > 50;

  return (
    <div className="min-h-screen bg-[#06060b] overflow-y-auto relative">
      <div className="bg-grid" />

      {/* Header */}
      <div className="glass-strong border-b border-dark-400/20 sticky top-0 z-10 relative">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/')} className="w-9 h-9 rounded-xl bg-dark-600/80 hover:bg-dark-500 flex items-center justify-center text-gray-400 hover:text-white transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h1 className="text-white font-bold font-sora text-sm">Admin Dashboard</h1>
                <p className="text-gray-600 text-[10px] font-mono">CONTROL PANEL</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchAll} className="w-9 h-9 rounded-xl bg-dark-600/80 hover:bg-dark-500 flex items-center justify-center text-gray-400 hover:text-white transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${gameActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${gameActive ? 'bg-green-400' : 'bg-red-400'}`} />
              {gameActive ? 'Live' : 'Paused'}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 relative z-[1]">
        {msg && <div className="glass rounded-xl p-3 text-center text-accent text-sm border border-accent/15 font-mono">{msg}</div>}

        {/* ═══════════════════════════════════════════════
            SECTION 1: API USAGE MONITOR
        ═══════════════════════════════════════════════ */}
        <div className={`glass rounded-xl overflow-hidden border ${apiDanger ? 'border-red-500/25' : apiWarning ? 'border-yellow-500/15' : 'border-dark-400/15'}`}>
          <button onClick={() => setShowApiStats(!showApiStats)} className="w-full p-4 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2 font-sora">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${apiDanger ? 'bg-red-500/15' : 'bg-accent/10'}`}>
                <BarChart3 className={`w-4 h-4 ${apiDanger ? 'text-red-400' : 'text-accent'}`} />
              </div>
              Groq API Usage Monitor
              {apiDanger && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-mono animate-pulse">⚠ HIGH USAGE</span>}
            </h3>
            {showApiStats ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {showApiStats && apiStats && (
            <div className="px-4 pb-4 space-y-4">
              {/* Usage Bar */}
              <div className="bg-dark-800/60 rounded-xl p-4 border border-dark-400/15">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-xs font-mono">Today's Usage</span>
                  <span className={`text-sm font-bold font-sora ${apiDanger ? 'text-red-400' : apiWarning ? 'text-yellow-400' : 'text-green-400'}`}>
                    {apiStats.today.toLocaleString()} / {API_DAILY_LIMIT.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-4 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${apiDanger ? 'bg-gradient-to-r from-red-500 to-red-400' : apiWarning ? 'bg-gradient-to-r from-yellow-500 to-orange-400' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`}
                    style={{ width: `${apiUsagePct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-gray-600 text-[10px] font-mono">{Math.round(apiUsagePct)}% used</span>
                  <span className="text-gray-600 text-[10px] font-mono">{(API_DAILY_LIMIT - apiStats.today).toLocaleString()} remaining</span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-400/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="w-3 h-3 text-accent" />
                    <span className="text-gray-500 text-[10px] font-mono">TOTAL ALL TIME</span>
                  </div>
                  <p className="text-white text-xl font-bold font-sora">{apiStats.total.toLocaleString()}</p>
                </div>
                <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-400/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-yellow-400" />
                    <span className="text-gray-500 text-[10px] font-mono">TODAY</span>
                  </div>
                  <p className={`text-xl font-bold font-sora ${apiDanger ? 'text-red-400' : 'text-white'}`}>{apiStats.today.toLocaleString()}</p>
                </div>
                <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-400/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3 h-3 text-green-400" />
                    <span className="text-gray-500 text-[10px] font-mono">LAST HOUR</span>
                  </div>
                  <p className="text-white text-xl font-bold font-sora">{apiStats.lastHour.toLocaleString()}</p>
                </div>
              </div>

              {/* Per-Room Breakdown */}
              {apiStats.byRoom.length > 0 && (
                <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-400/10">
                  <p className="text-gray-500 text-[10px] font-mono mb-2">REQUESTS PER ROOM</p>
                  <div className="space-y-1.5">
                    {apiStats.byRoom.map((r) => {
                      const pct = apiStats.total > 0 ? (r.count / apiStats.total) * 100 : 0;
                      return (
                        <div key={r.room_number} className="flex items-center gap-2">
                          <span className="text-gray-400 text-[10px] font-mono w-12 shrink-0">R{r.room_number}</span>
                          <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                            <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-gray-400 text-[10px] font-mono w-10 text-right">{r.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hourly Breakdown (Today) */}
              {apiStats.byHour.length > 0 && (
                <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-400/10">
                  <p className="text-gray-500 text-[10px] font-mono mb-2">TODAY'S HOURLY DISTRIBUTION</p>
                  <div className="flex items-end gap-1 h-16">
                    {apiStats.byHour.map((h) => {
                      const maxCount = Math.max(...apiStats.byHour.map((x) => x.count));
                      const barH = maxCount > 0 ? (h.count / maxCount) * 100 : 0;
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5" title={`${h.hour}: ${h.count} reqs`}>
                          <span className="text-accent text-[8px] font-mono">{h.count}</span>
                          <div className="w-full bg-accent/20 rounded-t" style={{ height: `${barH}%`, minHeight: '2px' }} />
                          <span className="text-gray-600 text-[7px] font-mono">{h.hour.replace(':00', 'h')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Estimation */}
              <div className={`rounded-xl p-3 flex items-start gap-3 ${apiDanger ? 'bg-red-500/5 border border-red-500/15' : 'bg-dark-800/40 border border-dark-400/10'}`}>
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${apiDanger ? 'text-red-400' : 'text-yellow-500'}`} />
                <div>
                  <p className={`text-xs font-medium ${apiDanger ? 'text-red-300' : 'text-gray-300'}`}>
                    {apiDanger
                      ? `Warning: You've used ${Math.round(apiUsagePct)}% of today's free tier. Consider reducing max attempts per room.`
                      : `At current rate, you can handle ~${Math.floor((API_DAILY_LIMIT - apiStats.today) / Math.max(totalTeams, 1))} more requests per team today.`}
                  </p>
                  <p className="text-gray-600 text-[10px] font-mono mt-1">
                    Groq free tier: {API_DAILY_LIMIT.toLocaleString()} requests/day • Current max attempts/room: 20
                  </p>
                </div>
              </div>

              <button onClick={handleResetApiCounter} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-600/50 text-gray-400 text-xs hover:text-red-400 hover:bg-red-500/10 transition-all font-mono border border-dark-400/20">
                <Trash2 className="w-3 h-3" /> Reset API Counter
              </button>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Teams', value: totalTeams, icon: Users, color: 'text-accent', bg: 'from-accent/10 to-accent/5' },
            { label: 'Rooms Cracked', value: solvedRooms, icon: Trophy, color: 'text-green-400', bg: 'from-green-500/10 to-green-500/5' },
            { label: 'Total Attempts', value: totalAttempts, icon: Activity, color: 'text-yellow-400', bg: 'from-yellow-500/10 to-yellow-500/5' },
            { label: 'Most Cracked', value: mostCracked ? `Room ${mostCracked[0]}` : '—', icon: Zap, color: 'text-purple-400', bg: 'from-purple-500/10 to-purple-500/5' },
          ].map((s, i) => (
            <div key={i} className="glass rounded-xl p-5 hover:scale-[1.02] transition-transform">
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <span className="text-gray-500 text-xs font-mono">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-white font-sora">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <button onClick={handleToggle} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${gameActive ? 'bg-red-500/8 text-red-400 border border-red-500/20 hover:bg-red-500/15' : 'bg-green-500/8 text-green-400 border border-green-500/20 hover:bg-green-500/15'}`}>
            {gameActive ? <><PowerOff className="w-4 h-4" /> Pause Game</> : <><Power className="w-4 h-4" /> Activate Game</>}
          </button>
          <button onClick={handleReset} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500/8 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all">
            <RotateCcw className="w-4 h-4" /> Reset All
          </button>
          <a href={exportCsvUrl(key)} download className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-accent/8 text-accent border border-accent/20 hover:bg-accent/15 transition-all">
            <Download className="w-4 h-4" /> Export CSV
          </a>
          <button onClick={() => setShowPrompts(!showPrompts)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-purple-500/8 text-purple-400 border border-purple-500/20 hover:bg-purple-500/15 transition-all">
            <Eye className="w-4 h-4" /> {showPrompts ? 'Hide' : 'Show'} Winning Prompts
          </button>
          <button onClick={() => setShowSecrets(!showSecrets)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-yellow-500/8 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/15 transition-all">
            <Key className="w-4 h-4" /> {showSecrets ? 'Hide' : 'Show'} Room Answers
          </button>
          <button onClick={() => setShowAttacks(!showAttacks)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-cyan-500/8 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-all">
            <Hash className="w-4 h-4" /> {showAttacks ? 'Hide' : 'Show'} Attack Prompts
          </button>
        </div>

        {/* ═══════════════════════════════════════════════
            SECTION 2: ROOM SECRETS & ANSWERS
        ═══════════════════════════════════════════════ */}
        {showSecrets && roomSecrets.length > 0 && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-dark-400/20">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2 font-sora">
                <Key className="w-4 h-4 text-yellow-400" /> Room Answers & System Prompts
                <span className="text-gray-600 text-xs font-mono ml-auto">{roomSecrets.length} rooms</span>
              </h3>
            </div>
            <div className="divide-y divide-dark-400/15">
              {roomSecrets.map((room) => {
                const isExpanded = expandedRoom === room.number;
                return (
                  <div key={room.number} className="hover:bg-dark-700/15 transition-colors">
                    <button onClick={() => setExpandedRoom(isExpanded ? null : room.number)} className="w-full p-4 flex items-center gap-4 text-left">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg font-mono ${DIFF_BG[room.difficulty]} ${DIFF_COLORS[room.difficulty]}`}>
                        #{String(room.number).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{room.name}</p>
                        <p className="text-gray-500 text-xs truncate">{room.description}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs font-mono ${DIFF_COLORS[room.difficulty]}`}>{DIFF_LABEL[room.difficulty]}</span>
                        <span className="text-accent font-mono text-xs font-bold">{room.points} pts</span>
                        <div className="px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                          <span className="text-yellow-400 font-mono font-bold text-sm">{room.secret}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 ml-12">
                        {/* System Prompt */}
                        <div>
                          <p className="text-gray-500 text-[10px] font-mono uppercase mb-1.5 flex items-center gap-1.5">
                            <Lock className="w-3 h-3" /> System Prompt (sent to AI)
                          </p>
                          <pre className="text-gray-300 text-xs font-mono bg-dark-800/80 rounded-lg p-3 border border-dark-400/15 whitespace-pre-wrap leading-relaxed">{room.systemPrompt}</pre>
                        </div>
                        {/* Hints */}
                        <div>
                          <p className="text-gray-500 text-[10px] font-mono uppercase mb-1.5 flex items-center gap-1.5">
                            <Lightbulb className="w-3 h-3 text-yellow-400" /> Hints
                          </p>
                          <div className="space-y-1.5">
                            {room.hints.map((hint, i) => (
                              <div key={i} className="text-yellow-300/80 text-xs bg-yellow-500/5 rounded-lg px-3 py-2 border border-yellow-500/10 font-mono">
                                💡 Hint {i + 1}: {hint}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            SECTION 3: ATTACK PROMPTS REFERENCE
        ═══════════════════════════════════════════════ */}
        {showAttacks && attackPrompts.length > 0 && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-dark-400/20">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2 font-sora">
                <Hash className="w-4 h-4 text-cyan-400" /> Attack Prompts (Available to Players)
                <span className="text-gray-600 text-xs font-mono ml-auto">{attackPrompts.length} techniques</span>
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
              {attackPrompts.map((a, i) => (
                <div key={i} className="bg-dark-800/50 rounded-xl p-4 border border-dark-400/15 hover:border-cyan-500/20 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{a.icon}</span>
                    <span className="text-white text-sm font-semibold">{a.label}</span>
                  </div>
                  <p className="text-gray-400 text-xs font-mono leading-relaxed bg-dark-700/50 rounded-lg p-2.5 border border-dark-400/10">{a.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Winning Prompts */}
        {showPrompts && prompts.length > 0 && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-4 border-b border-dark-400/20">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2 font-sora">
                <Eye className="w-4 h-4 text-purple-400" /> Winning Prompts
                <span className="text-gray-600 text-xs font-mono ml-auto">{prompts.length} found</span>
              </h3>
            </div>
            <div className="divide-y divide-dark-400/15">
              {prompts.map((p, i) => (
                <div key={i} className="p-4 hover:bg-dark-700/20 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-mono font-bold">R{p.room_number}</span>
                    <span className="text-gray-400 text-xs">{p.team_name}</span>
                  </div>
                  <p className="text-gray-300 text-xs font-mono bg-dark-800/60 rounded-lg p-3 border border-dark-400/15 leading-relaxed">{p.winning_prompt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teams Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-dark-400/20 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2 font-sora">
              <Users className="w-4 h-4 text-accent" /> All Teams
            </h3>
            <span className="text-gray-600 text-xs font-mono">{totalTeams} registered</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-400/20">
                  <th className="text-left text-gray-500 text-xs font-medium p-3 pl-4 font-mono">Team</th>
                  <th className="text-right text-gray-500 text-xs font-medium p-3 font-mono">Score</th>
                  <th className="text-right text-gray-500 text-xs font-medium p-3 font-mono">Room</th>
                  <th className="text-right text-gray-500 text-xs font-medium p-3 font-mono">Solved</th>
                  <th className="text-right text-gray-500 text-xs font-medium p-3 font-mono">Attempts</th>
                  <th className="text-right text-gray-500 text-xs font-medium p-3 pr-4 font-mono">Joined</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i} className="lb-row border-b border-dark-400/10">
                    <td className="p-3 pl-4 text-white font-medium">{s.team_name}</td>
                    <td className="p-3 text-right text-accent font-bold font-sora">{s.total_score}</td>
                    <td className="p-3 text-right text-gray-400 font-mono">{s.current_room}</td>
                    <td className="p-3 text-right text-green-400 font-mono">{s.rooms_solved}</td>
                    <td className="p-3 text-right text-gray-400 font-mono">{s.total_attempts || 0}</td>
                    <td className="p-3 pr-4 text-right text-gray-600 text-xs font-mono">{new Date(s.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!sessions.length && (
                  <tr><td colSpan={6} className="p-10 text-center text-gray-600 font-mono">No teams registered yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
