import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Rooms from './pages/Rooms';
import Room from './pages/Room';
import LeaderboardPage from './pages/LeaderboardPage';
import Admin from './pages/Admin';
import { getProgress } from './api';

export default function App() {
  const [team, setTeam] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem('jb_team_id');
    const name = localStorage.getItem('jb_team_name');
    if (id && name) {
      setTeam({ teamId: id, teamName: name });
      getProgress(id).then(setProgress).catch(() => {
        localStorage.removeItem('jb_team_id');
        localStorage.removeItem('jb_team_name');
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleRegister = (data) => {
    localStorage.setItem('jb_team_id', data.teamId);
    localStorage.setItem('jb_team_name', data.teamName);
    setTeam(data);
    getProgress(data.teamId).then(setProgress);
  };

  const refreshProgress = async () => {
    if (team) {
      const p = await getProgress(team.teamId);
      setProgress(p);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-dark-900">
      <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={!team ? <Landing onRegister={handleRegister} /> : <Navigate to="/rooms" />} />
      <Route path="/rooms" element={team ? <Rooms team={team} progress={progress} refreshProgress={refreshProgress} /> : <Navigate to="/" />} />
      <Route path="/room/:id" element={team ? <Room team={team} progress={progress} refreshProgress={refreshProgress} /> : <Navigate to="/" />} />
      <Route path="/leaderboard" element={<LeaderboardPage team={team} />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
