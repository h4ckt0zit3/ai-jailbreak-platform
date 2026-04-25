import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Unlock, CheckCircle, Star, ArrowRight, Zap, Target, LogOut, BookOpen, Timer, AlertTriangle } from 'lucide-react';
import { getProgress, getGameTimer } from '../api';
import RulesModal from '../components/RulesModal';

const DIFF_COLORS = { 1: 'text-green-400', 2: 'text-green-400', 3: 'text-yellow-400', 4: 'text-orange-400', 5: 'text-red-400' };
const DIFF_BG = { 1: 'bg-green-500/10 border-green-500/20', 2: 'bg-green-500/10 border-green-500/20', 3: 'bg-yellow-500/10 border-yellow-500/20', 4: 'bg-orange-500/10 border-orange-500/20', 5: 'bg-red-500/10 border-red-500/20' };
const DIFF_LABEL = { 1: 'Easy', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Expert' };

function formatCountdown(ms) {
  if (!ms || ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

export default function Rooms({ team, progress, refreshProgress, onLogout }) {
  const nav = useNavigate();
  const [data, setData] = useState(progress);
  const [showRules, setShowRules] = useState(false);

  // Timer state
  const [gameActive, setGameActive] = useState(true);
  const [endTime, setEndTime] = useState(null);
  const [countdown, setCountdown] = useState(null);

  // Auto-show rules on first ever visit
  useEffect(() => {
    const seen = localStorage.getItem('jb_rules_seen');
    if (!seen) {
      setShowRules(true);
      localStorage.setItem('jb_rules_seen', '1');
    }
  }, []);

  useEffect(() => {
    getProgress(team.teamId).then(setData).catch(() => {});
  }, [team.teamId]);

  useEffect(() => { if (progress) setData(progress); }, [progress]);

  // Fetch timer from server every 30s
  const fetchTimer = useCallback(async () => {
    try {
      const t = await getGameTimer();
      setGameActive(t.gameActive);
      setEndTime(t.endTime || null);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTimer();
    const iv = setInterval(fetchTimer, 30000);
    return () => clearInterval(iv);
  }, [fetchTimer]);

  // Live countdown tick
  useEffect(() => {
    if (!endTime || !gameActive) { setCountdown(null); return; }
    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      if (remaining <= 0) {
        setCountdown(0);
        setGameActive(false);
        return;
      }
      setCountdown(remaining);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime, gameActive]);

  if (!data) return (
    <div className="flex items-center justify-center h-screen bg-[#06060b]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-xs font-mono">Loading rooms...</p>
      </div>
    </div>
  );

  const solvedCount = data.rooms.filter((r) => r.solved).length;
  const progressPct = (solvedCount / 10) * 100;
  const timerDanger = countdown !== null && countdown < 60000;
  const timerWarning = countdown !== null && countdown < 300000;

  return (
    <div className="min-h-screen bg-[#06060b] relative">
      <div className="bg-grid" />

      {/* Header */}
      <div className="glass-strong border-b border-dark-400/20 sticky top-0 z-20 relative">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7c6ff7] via-purple-600 to-indigo-700 flex items-center justify-center glow-accent">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold font-sora text-sm">SecureBot Challenge</h1>
              <p className="text-gray-500 text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                {team.teamName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Timer Display in Header */}
            {gameActive && countdown !== null && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                timerDanger ? 'bg-red-500/10 border-red-500/25' :
                timerWarning ? 'bg-orange-500/10 border-orange-500/20' :
                'bg-accent/8 border-accent/20'
              }`}>
                <Timer className={`w-4 h-4 ${timerDanger ? 'text-red-400 animate-pulse' : timerWarning ? 'text-orange-400' : 'text-accent'}`} />
                <span className={`text-sm font-bold font-sora tabular-nums ${
                  timerDanger ? 'text-red-400' : timerWarning ? 'text-orange-400' : 'text-accent'
                }`}>
                  {formatCountdown(countdown)}
                </span>
              </div>
            )}
            <div className="text-right">
              <p className="text-accent font-bold text-xl font-sora">{data.totalScore}</p>
              <p className="text-gray-600 text-[10px] font-mono">SCORE</p>
            </div>
            <button onClick={() => setShowRules(true)} title="How to Play" className="w-10 h-10 rounded-xl bg-accent/10 hover:bg-accent/20 flex items-center justify-center text-accent transition-all group border border-accent/20">
              <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            <button onClick={onLogout} title="Logout" className="w-10 h-10 rounded-xl bg-dark-600/80 hover:bg-red-500/15 flex items-center justify-center text-gray-400 hover:text-red-400 transition-all group">
              <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Game Paused Banner */}
      {!gameActive && (
        <div className="max-w-6xl mx-auto px-4 pt-4 relative z-[1]">
          <div className="rounded-xl p-4 bg-red-500/5 border border-red-500/20 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-400 text-sm font-semibold font-sora">Challenge Paused</p>
              <p className="text-gray-500 text-xs">The game is currently paused by the admin. Please wait for the next round to begin.</p>
            </div>
          </div>
        </div>
      )}

      {/* Timer Banner (large) - only when game is active with timer */}
      {gameActive && countdown !== null && (
        <div className="max-w-6xl mx-auto px-4 pt-4 relative z-[1]">
          <div className={`rounded-xl p-4 flex items-center justify-between border ${
            timerDanger ? 'bg-red-500/5 border-red-500/20' :
            timerWarning ? 'bg-orange-500/5 border-orange-500/15' :
            'bg-accent/5 border-accent/15'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                timerDanger ? 'bg-red-500/15' : 'bg-accent/10'
              }`}>
                <Timer className={`w-5 h-5 ${timerDanger ? 'text-red-400 animate-pulse' : 'text-accent'}`} />
              </div>
              <div>
                <p className="text-gray-400 text-[10px] font-mono uppercase">⏱ Time Remaining</p>
                <p className={`text-xl font-bold font-sora tabular-nums ${
                  timerDanger ? 'text-red-400' : timerWarning ? 'text-orange-400' : 'text-white'
                }`}>
                  {formatCountdown(countdown)}
                </p>
              </div>
            </div>
            {timerDanger && (
              <span className="text-red-400 text-xs font-mono animate-pulse">⚠ HURRY UP!</span>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2 relative z-[1]">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-white font-semibold text-sm font-sora">Mission Progress</p>
              <p className="text-gray-500 text-xs mt-0.5">{solvedCount}/10 rooms completed • {data.totalScore} pts earned</p>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              <span className="text-accent font-bold text-sm font-sora">{Math.round(progressPct)}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-dark-800/80 rounded-full overflow-hidden mb-3">
            <div className="progress-bar h-full rounded-full" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Room Dots */}
          <div className="flex gap-2">
            {data.rooms.map((r) => (
              <div key={r.number} className={`flex-1 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer hover:scale-105
                ${r.solved ? 'bg-green-500/15 text-green-400 border border-green-500/20' : r.locked ? 'bg-dark-700/60 text-gray-700 border border-dark-500/20' : 'bg-accent/10 text-accent border border-accent/15'}`}
                onClick={() => !r.locked && nav(`/room/${r.number}`)}
              >
                {r.solved ? '✓' : r.number}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Room Grid */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative z-[1]">
        {data.rooms.map((room) => {
          const isCurrent = room.number === data.currentRoom && !room.solved;
          const isLocked = room.locked;
          const isSolved = room.solved;

          return (
            <button
              key={room.number}
              onClick={() => !isLocked && nav(`/room/${room.number}`)}
              disabled={isLocked}
              className={`room-card text-left p-5 rounded-2xl border transition-all relative
                ${isSolved ? 'glass border-green-500/25 glow-success'
                  : isLocked ? 'locked bg-dark-800/40 border-dark-500/15 opacity-40 cursor-not-allowed'
                    : isCurrent ? 'glass border-accent/35 glow-accent room-pulse'
                      : 'glass border-dark-400/20 hover:border-accent/25'}`}
            >
              {/* Room Number Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg font-mono ${
                  isSolved ? 'bg-green-500/10 text-green-400'
                    : isLocked ? 'bg-dark-600 text-gray-600'
                      : isCurrent ? 'bg-accent/15 text-accent'
                        : 'bg-dark-600/80 text-gray-400'
                }`}>
                  #{String(room.number).padStart(2, '0')}
                </span>
                {isSolved
                  ? <CheckCircle className="w-5 h-5 text-green-400" />
                  : isLocked ? <Lock className="w-5 h-5 text-gray-700" />
                    : <Unlock className="w-5 h-5 text-accent/60" />}
              </div>

              <h3 className={`font-semibold font-sora mb-1 text-sm ${
                isSolved ? 'text-green-300' : isLocked ? 'text-gray-600' : 'text-white'
              }`}>{room.name}</h3>
              <p className="text-gray-500 text-xs mb-4 line-clamp-2 leading-relaxed">{room.description}</p>

              {/* Difficulty + Points */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < room.difficulty ? DIFF_COLORS[room.difficulty] : 'text-gray-800'}`} fill={i < room.difficulty ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  <span className={`text-[10px] font-medium ${DIFF_COLORS[room.difficulty]} opacity-60`}>{DIFF_LABEL[room.difficulty]}</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${DIFF_BG[room.difficulty]} ${DIFF_COLORS[room.difficulty]}`}>
                  {isSolved ? `+${room.scoreEarned}` : `${room.points} pts`}
                </span>
              </div>

              {/* Attempts Progress */}
              {room.attempts > 0 && !isLocked && (
                <div className="mt-4 pt-3 border-t border-dark-400/15">
                  <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1.5">
                    <span className="font-mono">{room.attempts}/20 attempts</span>
                    {isCurrent && (
                      <span className="text-accent flex items-center gap-1 font-semibold">
                        Continue <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1 bg-dark-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${room.attempts > 15 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'progress-bar'}`} style={{ width: `${(room.attempts / 20) * 100}%` }} />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Rules Modal */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
