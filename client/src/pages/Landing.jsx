import React, { useState, useMemo } from 'react';
import { ShieldCheck, Zap, Users, ChevronRight, Terminal, Lock, Cpu, KeyRound } from 'lucide-react';
import { registerTeam } from '../api';

function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${60 + Math.random() * 40}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${6 + Math.random() * 6}s`,
      size: `${1 + Math.random() * 2}px`,
      opacity: 0.2 + Math.random() * 0.4,
    })),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div key={p.id} className="particle" style={{
          left: p.left, bottom: '0',
          animationDelay: p.delay, animationDuration: p.duration,
          width: p.size, height: p.size, opacity: p.opacity,
        }} />
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: Terminal, label: '10 Rooms', desc: 'Progressive difficulty', color: 'text-purple-400' },
  { icon: Zap, label: '3,650 pts', desc: 'Total available', color: 'text-yellow-400' },
  { icon: Users, label: 'Teams', desc: 'Admin-managed', color: 'text-green-400' },
];

const RULES = [
  { icon: Cpu, text: 'Each room has an AI guarding a secret' },
  { icon: Lock, text: 'Use prompt engineering to extract it' },
  { icon: Zap, text: '20 attempts per room — make them count' },
];

export default function Landing({ onRegister }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Team name required');
    if (!password.trim()) return setError('Password required');
    setLoading(true); setError('');
    try { const d = await registerTeam(name.trim(), password.trim()); onRegister(d); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#06060b] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="bg-grid" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <Particles />

      {/* Content */}
      <div className="relative z-10 max-w-xl w-full">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex w-20 h-20 rounded-2xl bg-gradient-to-br from-[#7c6ff7] via-purple-600 to-indigo-800 items-center justify-center mb-6 glow-accent float-badge">
            <ShieldCheck className="w-10 h-10 text-white drop-shadow-lg" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-sora mb-3 tracking-tight">
            <span className="text-gradient glitch-text" data-text="SecureBot">SecureBot</span>
            <br />
            <span className="text-white">Challenge</span>
          </h1>
          <p className="text-gray-400 text-lg font-medium">Jain University Tech Fest 2026</p>
          <p className="text-gray-600 text-sm mt-2 font-mono">// 10 AI bots. 10 secrets. Can you crack them all?</p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {FEATURES.map((f, i) => (
            <div key={i} className="glass rounded-xl p-4 text-center group hover:border-accent/30 transition-all duration-300 hover:scale-[1.03]">
              <div className="w-10 h-10 rounded-xl bg-dark-600/80 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <f.icon className={`w-5 h-5 ${f.color}`} />
              </div>
              <p className="text-white text-sm font-semibold font-sora">{f.label}</p>
              <p className="text-gray-500 text-[11px] mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Rules */}
        <div className="glass rounded-xl p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-4 h-0.5 bg-accent/40 rounded" />How It Works
          </p>
          <div className="space-y-2.5">
            {RULES.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <r.icon className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="text-gray-300">{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={submit} className="glass-strong rounded-2xl p-6 relative">
          <div className="scanlines absolute inset-0 rounded-2xl pointer-events-none" />
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 font-sora">Team Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your team name..."
                className="w-full px-4 py-3.5 bg-dark-800/80 border border-dark-400/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all font-sora text-sm"
                maxLength={30}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 font-sora flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-accent" /> Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter team password..."
                className="w-full px-4 py-3.5 bg-dark-800/80 border border-dark-400/50 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all font-sora text-sm"
                maxLength={50}
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm mt-3 flex items-center gap-1.5">⚠ {error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-glow breathe w-full py-3.5 mt-4 bg-gradient-to-r from-[#7c6ff7] via-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 text-sm font-sora flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>Enter Challenge <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
          <p className="text-gray-600 text-[10px] mt-3 text-center font-mono">
            Credentials provided by event organizers
          </p>
        </form>
      </div>
    </div>
  );
}
