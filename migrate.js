const fs = require('fs');
const path = require('path');

const dbJsContent = `require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const teamSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  team_name: { type: String, required: true, unique: true },
  password: { type: String, default: '' },
  total_score: { type: Number, default: 0 },
  current_room: { type: Number, default: 1 },
  created_at: { type: Date, default: Date.now }
});

const roomProgressSchema = new mongoose.Schema({
  team_id: { type: String },
  room_number: { type: Number },
  solved: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  score_earned: { type: Number, default: 0 },
  hints_used: { type: String, default: '[]' },
  solved_at: { type: Date },
  winning_prompt: { type: String }
});
roomProgressSchema.index({ team_id: 1, room_number: 1 }, { unique: true });

const chatLogSchema = new mongoose.Schema({
  team_id: { type: String },
  room_number: { type: Number },
  role: { type: String },
  message: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const gameStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

const apiRequestSchema = new mongoose.Schema({
  team_id: { type: String },
  room_number: { type: Number },
  requested_at: { type: Date, default: Date.now }
});

const Team = mongoose.model('Team', teamSchema);
const RoomProgress = mongoose.model('RoomProgress', roomProgressSchema);
const ChatLog = mongoose.model('ChatLog', chatLogSchema);
const GameState = mongoose.model('GameState', gameStateSchema);
const ApiRequest = mongoose.model('ApiRequest', apiRequestSchema);

async function getDbAsync() {
  const state = await GameState.findOne({ key: 'game_active' });
  if (!state) {
    await GameState.create({ key: 'game_active', value: 'true' });
  }
}

async function createTeam(id, name, password = '') {
  await Team.create({ id, team_name: name, password });
  const progressDocs = [];
  for (let i = 1; i <= 10; i++) {
    progressDocs.push({ team_id: id, room_number: i });
  }
  await RoomProgress.insertMany(progressDocs);
}

async function getTeam(id) {
  return await Team.findOne({ id }).lean();
}

async function getTeamByName(n) {
  return await Team.findOne({ team_name: n }).lean();
}

async function updateTeam(teamId, newName, newPassword) {
  await Team.updateOne({ id: teamId }, { team_name: newName, password: newPassword });
}

async function deleteTeam(teamId) {
  await ChatLog.deleteMany({ team_id: teamId });
  await RoomProgress.deleteMany({ team_id: teamId });
  await ApiRequest.deleteMany({ team_id: teamId });
  await Team.deleteOne({ id: teamId });
}

async function getRoomProgress(teamId, room) {
  const p = await RoomProgress.findOne({ team_id: teamId, room_number: room }).lean();
  return p || { solved: false, attempts: 0, score_earned: 0, hints_used: '[]' };
}

async function getAllProgress(teamId) {
  return await RoomProgress.find({ team_id: teamId }).sort({ room_number: 1 }).lean();
}

async function incrementAttempts(teamId, room) {
  await RoomProgress.updateOne(
    { team_id: teamId, room_number: room },
    { $inc: { attempts: 1 } }
  );
}

async function solveRoom(teamId, room, score, prompt) {
  await RoomProgress.updateOne(
    { team_id: teamId, room_number: room },
    { solved: true, score_earned: score, solved_at: new Date(), winning_prompt: prompt }
  );
  await Team.updateOne(
    { id: teamId },
    { $inc: { total_score: score }, $max: { current_room: room + 1 } }
  );
}

async function deductScore(teamId, amount) {
  const team = await Team.findOne({ id: teamId });
  if (team) {
    team.total_score = Math.max(0, team.total_score - amount);
    await team.save();
  }
}

async function updateHintsUsed(teamId, room, hints) {
  await RoomProgress.updateOne(
    { team_id: teamId, room_number: room },
    { hints_used: JSON.stringify(hints) }
  );
}

async function skipRoom(teamId, room) {
  await RoomProgress.updateOne(
    { team_id: teamId, room_number: room },
    { solved: false }
  );
  await Team.updateOne(
    { id: teamId },
    { $max: { current_room: room + 1 } }
  );
}

async function saveChat(teamId, room, role, message) {
  await ChatLog.create({ team_id: teamId, room_number: room, role, message });
}

async function getChatHistory(teamId, room) {
  const logs = await ChatLog.find({ team_id: teamId, room_number: room }).sort({ timestamp: 1 }).lean();
  return logs.map(l => ({ role: l.role, content: l.message }));
}

async function getLeaderboard(limit = 10) {
  const teams = await Team.find().sort({ total_score: -1, current_room: -1 }).limit(limit).lean();
  for (const t of teams) {
    t.rooms_solved = await RoomProgress.countDocuments({ team_id: t.id, solved: true });
  }
  return teams;
}

async function getAllTeams() {
  const teams = await Team.find().sort({ total_score: -1 }).lean();
  for (const t of teams) {
    t.rooms_solved = await RoomProgress.countDocuments({ team_id: t.id, solved: true });
    
    const rp = await RoomProgress.find({ team_id: t.id });
    t.total_attempts = rp.reduce((sum, p) => sum + p.attempts, 0);
  }
  return teams;
}

async function getWinningPrompts() {
  const results = await RoomProgress.aggregate([
    { $match: { solved: true, winning_prompt: { $ne: null } } },
    { $lookup: { from: 'teams', localField: 'team_id', foreignField: 'id', as: 'team' } },
    { $unwind: '$team' },
    { $project: { room_number: 1, winning_prompt: 1, team_name: '$team.team_name' } },
    { $sort: { room_number: 1 } }
  ]);
  return results;
}

async function resetAll() {
  await ChatLog.deleteMany({});
  await RoomProgress.deleteMany({});
  await Team.deleteMany({});
}

async function getGameState(k) {
  const r = await GameState.findOne({ key: k }).lean();
  return r ? r.value : null;
}

async function setGameState(k, v) {
  await GameState.updateOne({ key: k }, { value: v }, { upsert: true });
}

async function logApiRequest(teamId, roomNumber) {
  await ApiRequest.create({ team_id: teamId, room_number: roomNumber });
}

async function getApiRequestStats() {
  const total = await ApiRequest.countDocuments();
  
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const today = await ApiRequest.countDocuments({ requested_at: { $gte: startOfDay } });
  
  const hAgo = new Date(Date.now() - 3600000);
  const lastHour = await ApiRequest.countDocuments({ requested_at: { $gte: hAgo } });
  
  const byRoomAggr = await ApiRequest.aggregate([
    { $group: { _id: '$room_number', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const byRoom = byRoomAggr.map(b => ({ room_number: b._id, count: b.count }));
  
  const byHourAggr = await ApiRequest.aggregate([
    { $match: { requested_at: { $gte: startOfDay } } },
    { $group: {
        _id: { $hour: "$requested_at" },
        count: { $sum: 1 }
    }},
    { $sort: { _id: 1 } }
  ]);
  
  const byHour = byHourAggr.map(b => {
    const hh = String(b._id).padStart(2, '0') + ':00';
    return { hour: hh, count: b.count };
  });

  return { total, today, lastHour, byRoom, byHour };
}

async function resetApiRequests() {
  await ApiRequest.deleteMany({});
}

function flushSync() {
  // No-op for Mongoose, connections handle graceful exit natively
}

module.exports = {
  getDbAsync, createTeam, getTeam, getTeamByName, updateTeam, deleteTeam,
  getRoomProgress, getAllProgress,
  incrementAttempts, solveRoom, deductScore, updateHintsUsed, skipRoom,
  saveChat, getChatHistory, getLeaderboard, getAllTeams, getWinningPrompts,
  resetAll, getGameState, setGameState,
  logApiRequest, getApiRequestStats, resetApiRequests,
  flushSync,
};
`;

const indexJsPath = path.join(__dirname, 'server', 'index.js');
let indexJsContent = fs.readFileSync(indexJsPath, 'utf8');

// Replace synchronous db calls with await
indexJsContent = indexJsContent.replace(/app\.post\('\/api\/register',\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/register', async (req, res) => {");
indexJsContent = indexJsContent.replace(/const existing = db\.getTeamByName\(safeName\);/g, "const existing = await db.getTeamByName(safeName);");

indexJsContent = indexJsContent.replace(/const gameActive = db\.getGameState\('game_active'\);/g, "const gameActive = await db.getGameState('game_active');");
indexJsContent = indexJsContent.replace(/const team = db\.getTeam\(teamId\);/g, "const team = await db.getTeam(teamId);");
indexJsContent = indexJsContent.replace(/const progress = db\.getRoomProgress\(teamId,\s*roomNumber\);/g, "const progress = await db.getRoomProgress(teamId, roomNumber);");
indexJsContent = indexJsContent.replace(/db\.saveChat\(/g, "await db.saveChat(");
indexJsContent = indexJsContent.replace(/const fullHistory = db\.getChatHistory\(/g, "const fullHistory = await db.getChatHistory(");
indexJsContent = indexJsContent.replace(/db\.incrementAttempts\(/g, "await db.incrementAttempts(");
indexJsContent = indexJsContent.replace(/db\.logApiRequest\(/g, "await db.logApiRequest(");
indexJsContent = indexJsContent.replace(/db\.solveRoom\(/g, "await db.solveRoom(");
indexJsContent = indexJsContent.replace(/const updatedTeam = db\.getTeam\(teamId\);/g, "const updatedTeam = await db.getTeam(teamId);");
indexJsContent = indexJsContent.replace(/const updatedProgress = db\.getRoomProgress\(/g, "const updatedProgress = await db.getRoomProgress(");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/progress\/:teamId',\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/progress/:teamId', async (req, res) => {");
indexJsContent = indexJsContent.replace(/const team = db\.getTeam\(req\.params\.teamId\);/g, "const team = await db.getTeam(req.params.teamId);");
indexJsContent = indexJsContent.replace(/const progress = db\.getAllProgress\(req\.params\.teamId\);/g, "const progress = await db.getAllProgress(req.params.teamId);");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/hint',\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/hint', async (req, res) => {");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/skip',\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/skip', async (req, res) => {");
indexJsContent = indexJsContent.replace(/db\.skipRoom\(/g, "await db.skipRoom(");
indexJsContent = indexJsContent.replace(/const updated = db\.getTeam\(teamId\);/g, "const updated = await db.getTeam(teamId);");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/leaderboard',\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/leaderboard', async (req, res) => {");
indexJsContent = indexJsContent.replace(/res\.json\(db\.getLeaderboard\(10\)\);/g, "res.json(await db.getLeaderboard(10));");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/admin\/sessions',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/admin/sessions', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/res\.json\(db\.getAllTeams\(\)\);/g, "res.json(await db.getAllTeams());");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/admin\/winning-prompts',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/admin/winning-prompts', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/res\.json\(db\.getWinningPrompts\(\)\);/g, "res.json(await db.getWinningPrompts());");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/admin\/reset',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/admin/reset', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/db\.resetAll\(\);/g, "await db.resetAll();");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/admin\/toggle-game',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/admin/toggle-game', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/const cur = db\.getGameState\('game_active'\);/g, "const cur = await db.getGameState('game_active');");
indexJsContent = indexJsContent.replace(/db\.setGameState\(/g, "await db.setGameState(");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/admin\/game-state',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/admin/game-state', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/res\.json\(\{\s*gameActive:\s*db\.getGameState\('game_active'\)\s*===\s*'true'\s*\}\);/g, "res.json({ gameActive: (await db.getGameState('game_active')) === 'true' });");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/admin\/export-csv',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/admin/export-csv', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/const teams = db\.getAllTeams\(\);/g, "const teams = await db.getAllTeams();");

indexJsContent = indexJsContent.replace(/app\.get\('\/api\/admin\/api-stats',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.get('/api/admin/api-stats', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/res\.json\(db\.getApiRequestStats\(\)\);/g, "res.json(await db.getApiRequestStats());");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/admin\/reset-api-counter',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/admin/reset-api-counter', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/db\.resetApiRequests\(\);/g, "await db.resetApiRequests();");

indexJsContent = indexJsContent.replace(/app\.post\('\/api\/admin\/create-team',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.post('/api/admin/create-team', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/db\.createTeam\(/g, "await db.createTeam(");

indexJsContent = indexJsContent.replace(/app\.put\('\/api\/admin\/update-team',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.put('/api/admin/update-team', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/const conflict = db\.getTeamByName\(newName\);/g, "const conflict = await db.getTeamByName(newName);");
indexJsContent = indexJsContent.replace(/db\.updateTeam\(/g, "await db.updateTeam(");

indexJsContent = indexJsContent.replace(/app\.delete\('\/api\/admin\/delete-team',\s*adminAuth,\s*\(req,\s*res\)\s*=>\s*\{/g, "app.delete('/api/admin/delete-team', adminAuth, async (req, res) => {");
indexJsContent = indexJsContent.replace(/db\.deleteTeam\(/g, "await db.deleteTeam(");

fs.writeFileSync(path.join(__dirname, 'server', 'db.js'), dbJsContent);
fs.writeFileSync(indexJsPath, indexJsContent);

console.log('Migration complete');
