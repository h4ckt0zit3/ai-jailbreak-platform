require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

// ── Connection with retry logic ──
let isConnected = false;
const MAX_CONNECT_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function connectWithRetry() {
  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 30000,
      });
      isConnected = true;
      console.log('✅ MongoDB connected');

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected — will auto-reconnect');
        isConnected = false;
      });
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
        isConnected = true;
      });
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
      });
      return;
    } catch (err) {
      console.error(`❌ MongoDB connect attempt ${attempt}/${MAX_CONNECT_RETRIES} failed:`, err.message);
      if (attempt < MAX_CONNECT_RETRIES) {
        console.log(`   Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      } else {
        throw new Error('MongoDB connection failed after all retries');
      }
    }
  }
}

// ── Schemas ──
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
chatLogSchema.index({ team_id: 1, room_number: 1, timestamp: 1 });

const gameStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

const apiRequestSchema = new mongoose.Schema({
  team_id: { type: String },
  room_number: { type: Number },
  requested_at: { type: Date, default: Date.now }
});
apiRequestSchema.index({ requested_at: 1 });

const Team = mongoose.model('Team', teamSchema);
const RoomProgress = mongoose.model('RoomProgress', roomProgressSchema);
const ChatLog = mongoose.model('ChatLog', chatLogSchema);
const GameState = mongoose.model('GameState', gameStateSchema);
const ApiRequest = mongoose.model('ApiRequest', apiRequestSchema);

// ── Init ──
async function getDbAsync() {
  await connectWithRetry();
  const state = await GameState.findOne({ key: 'game_active' });
  if (!state) {
    await GameState.create({ key: 'game_active', value: 'true' });
  }
}

// ── Team CRUD ──
async function createTeam(id, name, password = '') {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await Team.create([{ id, team_name: name, password }], { session });
    const progressDocs = [];
    for (let i = 1; i <= 10; i++) {
      progressDocs.push({ team_id: id, room_number: i });
    }
    await RoomProgress.insertMany(progressDocs, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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

// ── Room Progress ──
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

// ── CRITICAL FIX: Atomic solveRoom — prevents double-scoring race condition ──
async function solveRoom(teamId, room, score, prompt) {
  // Atomically mark solved ONLY if not already solved (prevents double-score)
  const result = await RoomProgress.updateOne(
    { team_id: teamId, room_number: room, solved: { $ne: true } },
    { solved: true, score_earned: score, solved_at: new Date(), winning_prompt: prompt }
  );

  // If modifiedCount === 0, the room was already solved (race condition blocked)
  if (result.modifiedCount === 0) {
    console.warn(`⚠️ solveRoom race blocked: team=${teamId} room=${room} already solved`);
    return false;
  }

  await Team.updateOne(
    { id: teamId },
    { $inc: { total_score: score }, $max: { current_room: room + 1 } }
  );
  return true;
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

// ── Chat ──
async function saveChat(teamId, room, role, message) {
  await ChatLog.create({ team_id: teamId, room_number: room, role, message });
}

async function getChatHistory(teamId, room) {
  const logs = await ChatLog.find({ team_id: teamId, room_number: room }).sort({ timestamp: 1 }).lean();
  return logs.map(l => ({ role: l.role, content: l.message }));
}

// ── CRITICAL FIX: Leaderboard — aggregation pipeline instead of N+1 queries ──
async function getLeaderboard(limit = 10) {
  const results = await Team.aggregate([
    { $sort: { total_score: -1, current_room: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'roomprogresses',
        let: { teamId: '$id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$team_id', '$$teamId'] }, { $eq: ['$solved', true] }] } } },
          { $count: 'count' }
        ],
        as: 'solved_info'
      }
    },
    {
      $addFields: {
        rooms_solved: {
          $ifNull: [{ $arrayElemAt: ['$solved_info.count', 0] }, 0]
        }
      }
    },
    { $project: { solved_info: 0, _id: 0, __v: 0 } }
  ]);
  return results;
}

// ── CRITICAL FIX: getAllTeams — aggregation pipeline instead of N+1 queries ──
async function getAllTeams() {
  const results = await Team.aggregate([
    { $sort: { total_score: -1 } },
    {
      $lookup: {
        from: 'roomprogresses',
        let: { teamId: '$id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$team_id', '$$teamId'] } } },
          {
            $group: {
              _id: null,
              rooms_solved: { $sum: { $cond: ['$solved', 1, 0] } },
              total_attempts: { $sum: '$attempts' }
            }
          }
        ],
        as: 'progress_info'
      }
    },
    {
      $addFields: {
        rooms_solved: { $ifNull: [{ $arrayElemAt: ['$progress_info.rooms_solved', 0] }, 0] },
        total_attempts: { $ifNull: [{ $arrayElemAt: ['$progress_info.total_attempts', 0] }, 0] }
      }
    },
    { $project: { progress_info: 0, _id: 0, __v: 0 } }
  ]);
  return results;
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

// ── Game State ──
async function getGameState(k) {
  const r = await GameState.findOne({ key: k }).lean();
  return r ? r.value : null;
}

async function setGameState(k, v) {
  await GameState.updateOne({ key: k }, { value: v }, { upsert: true });
}

// ── API Request Logging ──
async function logApiRequest(teamId, roomNumber) {
  await ApiRequest.create({ team_id: teamId, room_number: roomNumber });
}

async function getApiRequestStats() {
  const total = await ApiRequest.countDocuments();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
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
    {
      $group: {
        _id: { $hour: "$requested_at" },
        count: { $sum: 1 }
      }
    },
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

// ── Graceful Shutdown — close MongoDB connection properly ──
function flushSync() {
  // Close mongoose connection gracefully
  try {
    mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed');
  } catch (e) {
    console.error('MongoDB close error:', e.message);
  }
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
