// In production (Vercel), VITE_API_URL points to Render backend
// In development, falls back to '/api' (Vite proxy handles it)
const API = import.meta.env.VITE_API_URL || '/api';
const h = (o) => ({ 'Content-Type': 'application/json', ...o });

export async function registerTeam(teamName, password) {
  const r = await fetch(`${API}/register`, { method: 'POST', headers: h(), body: JSON.stringify({ teamName, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function sendMessage(teamId, roomNumber, message) {
  const r = await fetch(`${API}/chat`, { method: 'POST', headers: h(), body: JSON.stringify({ teamId, roomNumber, message }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function getProgress(teamId) {
  const r = await fetch(`${API}/progress/${teamId}`); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function getLeaderboard() {
  const r = await fetch(`${API}/leaderboard`); if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function getRooms() {
  const r = await fetch(`${API}/rooms`); if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function buyHint(teamId, roomNumber, hintIndex) {
  const r = await fetch(`${API}/hint`, { method: 'POST', headers: h(), body: JSON.stringify({ teamId, roomNumber, hintIndex }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function skipRoom(teamId, roomNumber) {
  const r = await fetch(`${API}/skip`, { method: 'POST', headers: h(), body: JSON.stringify({ teamId, roomNumber }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function getAdminSessions(key) {
  const r = await fetch(`${API}/admin/sessions`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Unauthorized'); return r.json();
}
export async function getAdminWinningPrompts(key) {
  const r = await fetch(`${API}/admin/winning-prompts`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function adminReset(key) {
  const r = await fetch(`${API}/admin/reset`, { method: 'POST', headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function adminToggleGame(key, timerMinutes = null) {
  const body = timerMinutes ? JSON.stringify({ timerMinutes }) : '{}';
  const r = await fetch(`${API}/admin/toggle-game`, {
    method: 'POST',
    headers: h({ 'x-admin-key': key }),
    body,
  });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function adminGameState(key) {
  const r = await fetch(`${API}/admin/game-state`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function getGameTimer() {
  const r = await fetch(`${API}/game-timer`);
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function getAdminRoomSecrets(key) {
  const r = await fetch(`${API}/admin/room-secrets`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function getAdminAttackPrompts(key) {
  const r = await fetch(`${API}/admin/attack-prompts`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function getAdminApiStats(key) {
  const r = await fetch(`${API}/admin/api-stats`, { headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export async function adminResetApiCounter(key) {
  const r = await fetch(`${API}/admin/reset-api-counter`, { method: 'POST', headers: { 'x-admin-key': key } });
  if (!r.ok) throw new Error('Failed'); return r.json();
}
export const exportCsvUrl = (key) => `${API}/admin/export-csv?key=${key}`;

// Admin Team Management
export async function adminCreateTeam(key, teamName, password) {
  const r = await fetch(`${API}/admin/create-team`, { method: 'POST', headers: h({ 'x-admin-key': key }), body: JSON.stringify({ teamName, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function adminUpdateTeam(key, teamId, teamName, password) {
  const r = await fetch(`${API}/admin/update-team`, { method: 'PUT', headers: h({ 'x-admin-key': key }), body: JSON.stringify({ teamId, teamName, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
export async function adminDeleteTeam(key, teamId) {
  const r = await fetch(`${API}/admin/delete-team`, { method: 'DELETE', headers: h({ 'x-admin-key': key }), body: JSON.stringify({ teamId }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
}
