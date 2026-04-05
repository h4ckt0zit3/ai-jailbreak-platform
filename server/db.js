const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'jailbreak.db');
let db = null;
let initPromise = null;

function getDbAsync() {
  if (!initPromise) {
    initPromise = (async () => {
      const SQL = await initSqlJs();
      let buf = null;
      if (fs.existsSync(DB_PATH)) buf = fs.readFileSync(DB_PATH);
      db = buf ? new SQL.Database(buf) : new SQL.Database();
      initSchema();
      return db;
    })();
  }
  return initPromise;
}

function save() {
  if (db) fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY, team_name TEXT UNIQUE, total_score INTEGER DEFAULT 0,
    current_room INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS room_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, room_number INTEGER,
    solved BOOLEAN DEFAULT 0, attempts INTEGER DEFAULT 0, score_earned INTEGER DEFAULT 0,
    hints_used TEXT DEFAULT '[]', solved_at DATETIME, winning_prompt TEXT,
    UNIQUE(team_id, room_number)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, room_number INTEGER,
    role TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS game_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS api_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT, room_number INTEGER,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const gs = qAll("SELECT value FROM game_state WHERE key='game_active'");
  if (!gs.length) { db.run("INSERT INTO game_state (key,value) VALUES ('game_active','true')"); save(); }
}

function qAll(sql, p = []) {
  const st = db.prepare(sql);
  if (p.length) st.bind(p);
  const r = [];
  while (st.step()) r.push(st.getAsObject());
  st.free();
  return r;
}
function qOne(sql, p = []) { const r = qAll(sql, p); return r[0] || null; }

function createTeam(id, name) {
  db.run("INSERT INTO teams (id, team_name) VALUES (?, ?)", [id, name]);
  for (let i = 1; i <= 10; i++)
    db.run("INSERT INTO room_progress (team_id, room_number) VALUES (?, ?)", [id, i]);
  save();
}
function getTeam(id) { return qOne("SELECT * FROM teams WHERE id=?", [id]); }
function getTeamByName(n) { return qOne("SELECT * FROM teams WHERE team_name=?", [n]); }

function getRoomProgress(teamId, room) {
  return qOne("SELECT * FROM room_progress WHERE team_id=? AND room_number=?", [teamId, room]);
}
function getAllProgress(teamId) {
  return qAll("SELECT * FROM room_progress WHERE team_id=? ORDER BY room_number", [teamId]);
}

function incrementAttempts(teamId, room) {
  db.run("UPDATE room_progress SET attempts=attempts+1 WHERE team_id=? AND room_number=?", [teamId, room]);
  save();
}
function solveRoom(teamId, room, score, prompt) {
  db.run("UPDATE room_progress SET solved=1, score_earned=?, solved_at=datetime('now'), winning_prompt=? WHERE team_id=? AND room_number=?",
    [score, prompt, teamId, room]);
  db.run("UPDATE teams SET total_score=total_score+?, current_room=MAX(current_room,?) WHERE id=?",
    [score, room + 1, teamId]);
  save();
}
function deductScore(teamId, amount) {
  db.run("UPDATE teams SET total_score=MAX(0,total_score-?) WHERE id=?", [amount, teamId]);
  save();
}
function updateHintsUsed(teamId, room, hints) {
  db.run("UPDATE room_progress SET hints_used=? WHERE team_id=? AND room_number=?",
    [JSON.stringify(hints), teamId, room]);
  save();
}
function skipRoom(teamId, room) {
  db.run("UPDATE room_progress SET solved=0 WHERE team_id=? AND room_number=?", [teamId, room]);
  db.run("UPDATE teams SET current_room=MAX(current_room,?) WHERE id=?", [room + 1, teamId]);
  save();
}

function saveChat(teamId, room, role, message) {
  db.run("INSERT INTO chat_logs (team_id, room_number, role, message) VALUES (?,?,?,?)",
    [teamId, room, role, message]);
  save();
}
function getChatHistory(teamId, room) {
  return qAll("SELECT role, message as content FROM chat_logs WHERE team_id=? AND room_number=? ORDER BY timestamp", [teamId, room]);
}

function getLeaderboard(limit = 10) {
  return qAll(`SELECT t.team_name, t.total_score, t.current_room,
    (SELECT COUNT(*) FROM room_progress WHERE team_id=t.id AND solved=1) as rooms_solved
    FROM teams t ORDER BY t.total_score DESC, t.current_room DESC LIMIT ?`, [limit]);
}
function getAllTeams() {
  return qAll(`SELECT t.*, (SELECT COUNT(*) FROM room_progress WHERE team_id=t.id AND solved=1) as rooms_solved,
    (SELECT SUM(attempts) FROM room_progress WHERE team_id=t.id) as total_attempts FROM teams t ORDER BY t.total_score DESC`);
}
function getWinningPrompts() {
  return qAll("SELECT rp.room_number, rp.winning_prompt, t.team_name FROM room_progress rp JOIN teams t ON rp.team_id=t.id WHERE rp.solved=1 AND rp.winning_prompt IS NOT NULL ORDER BY rp.room_number");
}
function resetAll() { db.run("DELETE FROM chat_logs"); db.run("DELETE FROM room_progress"); db.run("DELETE FROM teams"); save(); }
function getGameState(k) { const r = qOne("SELECT value FROM game_state WHERE key=?", [k]); return r ? r.value : null; }
function setGameState(k, v) { db.run("INSERT OR REPLACE INTO game_state (key,value) VALUES (?,?)", [k, v]); save(); }

// ── API Request Tracking ──
function logApiRequest(teamId, roomNumber) {
  db.run("INSERT INTO api_requests (team_id, room_number) VALUES (?, ?)", [teamId, roomNumber]);
  save();
}
function getApiRequestStats() {
  const total = qOne("SELECT COUNT(*) as count FROM api_requests");
  const today = qOne("SELECT COUNT(*) as count FROM api_requests WHERE date(requested_at) = date('now')");
  const lastHour = qOne("SELECT COUNT(*) as count FROM api_requests WHERE requested_at >= datetime('now', '-1 hour')");
  const byRoom = qAll("SELECT room_number, COUNT(*) as count FROM api_requests GROUP BY room_number ORDER BY room_number");
  const byHour = qAll(`SELECT strftime('%H:00', requested_at) as hour, COUNT(*) as count
    FROM api_requests WHERE date(requested_at) = date('now')
    GROUP BY strftime('%H', requested_at) ORDER BY hour`);
  return {
    total: total?.count || 0,
    today: today?.count || 0,
    lastHour: lastHour?.count || 0,
    byRoom, byHour,
  };
}
function resetApiRequests() { db.run("DELETE FROM api_requests"); save(); }

module.exports = {
  getDbAsync, createTeam, getTeam, getTeamByName, getRoomProgress, getAllProgress,
  incrementAttempts, solveRoom, deductScore, updateHintsUsed, skipRoom,
  saveChat, getChatHistory, getLeaderboard, getAllTeams, getWinningPrompts,
  resetAll, getGameState, setGameState,
  logApiRequest, getApiRequestStats, resetApiRequests,
};
