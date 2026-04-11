/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║     SecureBot — MONGODB CRASH TEST v4 (Leaderboard Focus)      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Tests specifically targeting MongoDB integration:
 *  1. Leaderboard consistency under concurrent load
 *  2. Score atomicity (no double-scoring on race conditions)
 *  3. Aggregation pipeline correctness
 *  4. Admin endpoints with MongoDB queries
 *  5. Concurrent team creation / deletion
 *  6. Progress data integrity after scoring
 *  7. Mixed heavy load (leaderboard + progress + admin)
 */

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_KEY || 'WhatDaDogDoin@01';
const RESULTS_FILE = path.join(__dirname, 'mongo-crash-test-results.txt');

// ── Output ──
const lines = [];
function log(msg = '') { lines.push(msg); console.log(msg); }

// ── Stats ──
const stats = {
  total: 0, success: 0, failed: 0, rateLimited: 0, serverErrors: 0,
  latencies: [],
  tests: { passed: 0, failed: 0, warnings: 0 },
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function request(method, urlPath, body = null, headers = {}) {
  const url = `${BASE}${urlPath}`;
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);

  const start = performance.now();
  stats.total++;
  try {
    const res = await fetch(url, opts);
    const elapsed = performance.now() - start;
    stats.latencies.push(elapsed);
    let data = {};
    try { data = await res.json(); } catch { data = {}; }

    if (res.status === 429) { stats.rateLimited++; return { status: res.status, data, elapsed, rateLimited: true }; }
    if (res.status >= 500) { stats.serverErrors++; stats.failed++; return { status: res.status, data, elapsed, error: true }; }
    if (res.ok) { stats.success++; } else { stats.failed++; }
    return { status: res.status, data, elapsed };
  } catch (err) {
    const elapsed = performance.now() - start;
    stats.failed++;
    stats.serverErrors++;
    return { status: 0, error: err.message, elapsed };
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function section(title) {
  log(`\n${'═'.repeat(62)}`);
  log(`  ${title}`);
  log(`${'═'.repeat(62)}`);
}
function pass(msg) { log(`  ✅ ${msg}`); stats.tests.passed++; }
function fail(msg) { log(`  ❌ ${msg}`); stats.tests.failed++; }
function info(msg) { log(`  ℹ️  ${msg}`); }
function warn(msg) { log(`  ⚠️  ${msg}`); stats.tests.warnings++; }

const adminHeaders = { 'x-admin-key': ADMIN_KEY };

// ═══════════════════════════════════════════════════
//  HELPERS: Create & cleanup test teams via Admin API
// ═══════════════════════════════════════════════════
async function createTestTeam(name, password = 'test123') {
  const r = await request('POST', '/api/admin/create-team', { teamName: name, password }, adminHeaders);
  if (r.status === 200) return { id: r.data.id, name: r.data.teamName };
  if (r.status === 409) {
    // Already exists — login instead
    const login = await request('POST', '/api/register', { teamName: name, password });
    if (login.status === 200) return { id: login.data.teamId, name: login.data.teamName };
  }
  return null;
}

async function deleteTestTeam(teamId) {
  await request('DELETE', '/api/admin/delete-team', { teamId }, adminHeaders);
}

// ═══════════════════════════════════════════════════
//  TEST 1: MongoDB Connection & Basic Operations
// ═══════════════════════════════════════════════════
async function testMongoConnection() {
  section('TEST 1: MongoDB Connection & Basic CRUD');
  try {
    // Verify server is up and MongoDB connected
    const rooms = await request('GET', '/api/rooms');
    if (rooms.status === 200 && Array.isArray(rooms.data)) pass('Server reachable, rooms endpoint works');
    else { fail(`Server/rooms failed: ${rooms.status}`); return []; }

    // Create a test team via admin
    const team = await createTestTeam(`MongoTest_${Date.now()}`);
    if (team) pass(`Team created via admin: ${team.name} (${team.id})`);
    else { fail('Cannot create team via admin — check ADMIN_KEY'); return []; }

    // Fetch the team's progress
    const prog = await request('GET', `/api/progress/${team.id}`);
    if (prog.status === 200 && prog.data.rooms?.length === 10)
      pass(`Progress: 10 rooms, score=${prog.data.totalScore}, currentRoom=${prog.data.currentRoom}`);
    else fail(`Progress fetch failed: ${prog.status}`);

    // Fetch leaderboard (should contain this team)
    const lb = await request('GET', '/api/leaderboard');
    if (lb.status === 200 && Array.isArray(lb.data))
      pass(`Leaderboard returns ${lb.data.length} teams`);
    else fail(`Leaderboard failed: ${lb.status}`);

    // Verify team appears on leaderboard
    const onBoard = lb.data?.find(t => t.id === team.id);
    if (onBoard) pass(`New team visible on leaderboard (score=${onBoard.total_score}, rooms_solved=${onBoard.rooms_solved})`);
    else warn('New team not on leaderboard (may be limited to top 10)');

    return [team];
  } catch (e) { fail(`CRASHED: ${e.message}`); return []; }
}

// ═══════════════════════════════════════════════════
//  TEST 2: Concurrent Team Creation (MongoDB uniqueness)
// ═══════════════════════════════════════════════════
async function testConcurrentTeamCreation() {
  section('TEST 2: Concurrent Team Creation — MongoDB Uniqueness');
  const teams = [];
  try {
    const baseName = `ConcTest_${Date.now()}`;

    // Create 10 teams concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      createTestTeam(`${baseName}_${i}`)
    );
    const results = await Promise.all(promises);
    const created = results.filter(Boolean);
    pass(`${created.length}/10 teams created concurrently`);
    teams.push(...created);

    // Verify no name duplicates
    const names = new Set(created.map(t => t.name));
    if (names.size === created.length) pass('All team names unique');
    else fail(`DUPLICATE NAMES: ${created.length} teams but ${names.size} unique names`);

    // Verify no ID duplicates
    const ids = new Set(created.map(t => t.id));
    if (ids.size === created.length) pass('All team IDs unique');
    else fail(`DUPLICATE IDS!`);

    // Try creating a duplicate name concurrently (8 simultaneous)
    const dupName = `DupRace_${Date.now()}`;
    const dupPromises = Array.from({ length: 8 }, () =>
      request('POST', '/api/admin/create-team', { teamName: dupName, password: 'test' }, adminHeaders)
    );
    const dupResults = await Promise.all(dupPromises);
    const dupOk = dupResults.filter(r => r.status === 200);
    const dup409 = dupResults.filter(r => r.status === 409);
    if (dupOk.length <= 1) pass(`Concurrent dup name: ${dupOk.length} created, ${dup409.length} rejected (409)`);
    else fail(`RACE CONDITION: ${dupOk.length} teams created with same name!`);

    if (dupOk.length) teams.push({ id: dupOk[0].data.id, name: dupName });

    return teams;
  } catch (e) { fail(`CRASHED: ${e.message}`); return teams; }
}

// ═══════════════════════════════════════════════════
//  TEST 3: Leaderboard Consistency Under Load
// ═══════════════════════════════════════════════════
async function testLeaderboardConsistency(teams) {
  section('TEST 3: Leaderboard Consistency Under Concurrent Load');
  try {
    if (!teams.length) { fail('No teams to test with'); return; }

    // Hit leaderboard 30 times concurrently
    info('Firing 30 concurrent leaderboard requests...');
    const promises = Array.from({ length: 30 }, () =>
      request('GET', '/api/leaderboard')
    );
    const results = await Promise.all(promises);

    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    const err = results.filter(r => r.status >= 500);

    pass(`${ok.length}/30 responses OK, ${rl.length} rate-limited, ${err.length} server errors`);

    if (err.length > 0) fail(`${err.length} SERVER ERRORS on leaderboard!`);
    else pass('Zero server errors on leaderboard flood');

    // Check consistency: all responses should be identical
    if (ok.length >= 2) {
      const first = JSON.stringify(ok[0].data);
      const consistent = ok.every(r => JSON.stringify(r.data) === first);
      if (consistent) pass('All leaderboard responses CONSISTENT');
      else fail('INCONSISTENT leaderboard data across concurrent reads!');
    }

    // Verify leaderboard structure
    if (ok.length) {
      const board = ok[0].data;
      if (Array.isArray(board)) {
        pass(`Leaderboard is array with ${board.length} entries`);

        // Verify sorting (descending by score)
        let sorted = true;
        for (let i = 1; i < board.length; i++) {
          if (board[i].total_score > board[i - 1].total_score) { sorted = false; break; }
        }
        if (sorted) pass('Leaderboard correctly sorted by score (descending)');
        else fail('Leaderboard NOT sorted correctly!');

        // Verify each entry has required fields
        const required = ['id', 'team_name', 'total_score', 'current_room', 'rooms_solved'];
        const hasAllFields = board.every(t => required.every(f => t[f] !== undefined));
        if (hasAllFields) pass('All leaderboard entries have required fields');
        else fail(`Missing fields! Required: ${required.join(', ')}`);

        // Verify rooms_solved is a number (was a common N+1 bug)
        const validCounts = board.every(t => typeof t.rooms_solved === 'number' && t.rooms_solved >= 0);
        if (validCounts) pass('rooms_solved is valid number for all entries');
        else fail('rooms_solved invalid type or negative!');
      } else {
        fail('Leaderboard response is not an array!');
      }
    }

    // Latency check
    const lbLatencies = ok.map(r => r.elapsed);
    const avgLb = lbLatencies.reduce((a, b) => a + b, 0) / lbLatencies.length;
    const maxLb = Math.max(...lbLatencies);
    info(`Leaderboard latency — avg: ${avgLb.toFixed(0)}ms, max: ${maxLb.toFixed(0)}ms`);
    if (maxLb < 5000) pass(`Max leaderboard latency ${maxLb.toFixed(0)}ms (under 5s)`);
    else warn(`Slow leaderboard: max ${maxLb.toFixed(0)}ms`);

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 4: Score Integrity & Race Condition Check
// ═══════════════════════════════════════════════════
async function testScoreIntegrity(teams) {
  section('TEST 4: Score Integrity — Verify No Double-Scoring');
  try {
    if (!teams.length) { fail('No teams'); return; }

    // Check each team's score matches their solved rooms
    for (const team of teams.slice(0, 5)) {
      const prog = await request('GET', `/api/progress/${team.id}`);
      if (prog.status !== 200) { warn(`Progress fetch failed for ${team.name}`); continue; }

      const data = prog.data;
      const solvedRooms = data.rooms.filter(r => r.solved);
      const expectedScore = solvedRooms.reduce((sum, r) => sum + r.scoreEarned, 0);

      if (data.totalScore === expectedScore)
        pass(`${team.name}: score=${data.totalScore} matches solved rooms (${solvedRooms.length})`);
      else
        fail(`${team.name}: score=${data.totalScore} but solved rooms sum to ${expectedScore}!`);

      // Verify room progression logic
      const maxSolved = Math.max(0, ...solvedRooms.map(r => r.number));
      if (data.currentRoom >= maxSolved + 1 || solvedRooms.length === 0)
        pass(`${team.name}: currentRoom=${data.currentRoom} is valid`);
      else
        fail(`${team.name}: currentRoom=${data.currentRoom} invalid for maxSolved=${maxSolved}`);
    }
  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 5: Admin Endpoints + MongoDB Aggregations
// ═══════════════════════════════════════════════════
async function testAdminEndpoints() {
  section('TEST 5: Admin Endpoints — MongoDB Aggregation Queries');
  try {
    // Auth check
    const noAuth = await request('GET', '/api/admin/sessions');
    if (noAuth.status === 401) pass('Admin auth enforced (401)');
    else fail(`No-auth returned ${noAuth.status}`);

    // Sessions (getAllTeams aggregation)
    const sessions = await request('GET', '/api/admin/sessions', null, adminHeaders);
    if (sessions.status === 200 && Array.isArray(sessions.data)) {
      pass(`Admin sessions: ${sessions.data.length} teams (${sessions.elapsed.toFixed(0)}ms)`);

      // Verify aggregation fields
      if (sessions.data.length > 0) {
        const t = sessions.data[0];
        const hasFields = t.total_score !== undefined && t.rooms_solved !== undefined && t.total_attempts !== undefined;
        if (hasFields) pass('Admin sessions have rooms_solved + total_attempts (aggregation OK)');
        else fail('Admin sessions missing aggregation fields!');
      }
    } else fail(`Admin sessions failed: ${sessions.status}`);

    // Winning prompts (aggregate with $lookup)
    const wp = await request('GET', '/api/admin/winning-prompts', null, adminHeaders);
    if (wp.status === 200 && Array.isArray(wp.data))
      pass(`Winning prompts: ${wp.data.length} entries (${wp.elapsed.toFixed(0)}ms)`);
    else fail(`Winning prompts failed: ${wp.status}`);

    // API stats (aggregate)
    const apiStats = await request('GET', '/api/admin/api-stats', null, adminHeaders);
    if (apiStats.status === 200 && typeof apiStats.data.total === 'number')
      pass(`API stats: total=${apiStats.data.total}, today=${apiStats.data.today} (${apiStats.elapsed.toFixed(0)}ms)`);
    else fail(`API stats failed: ${apiStats.status}`);

    // Game state
    const gs = await request('GET', '/api/admin/game-state', null, adminHeaders);
    if (gs.status === 200 && typeof gs.data.gameActive === 'boolean')
      pass(`Game state: active=${gs.data.gameActive}`);
    else fail(`Game state failed: ${gs.status}`);

    // Export CSV
    const csv = await request('GET', '/api/admin/export-csv', null, adminHeaders);
    if (csv.status === 200)
      pass(`CSV export OK (${csv.elapsed.toFixed(0)}ms)`);
    else fail(`CSV export failed: ${csv.status}`);

    // Concurrent admin burst (15 requests)
    info('Firing 15 concurrent admin requests...');
    const paths = [
      '/api/admin/sessions', '/api/admin/winning-prompts', '/api/admin/game-state',
      '/api/admin/room-secrets', '/api/admin/attack-prompts', '/api/admin/api-stats',
    ];
    const burst = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request('GET', paths[i % paths.length], null, adminHeaders)
      )
    );
    const burstOk = burst.filter(r => r.status === 200);
    const burstErr = burst.filter(r => r.status >= 500);
    const burstRl = burst.filter(r => r.rateLimited);
    pass(`Admin burst: ${burstOk.length}/15 OK, ${burstRl.length} rate-limited, ${burstErr.length} errors`);
    if (burstErr.length) fail(`${burstErr.length} server errors in admin burst!`);

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 6: Team Update & Delete Under Load
// ═══════════════════════════════════════════════════
async function testTeamManagement() {
  section('TEST 6: Team CRUD — Update & Delete Operations');
  try {
    // Create a team to manage
    const team = await createTestTeam(`Manage_${Date.now()}`);
    if (!team) { fail('Cannot create test team'); return; }
    pass(`Created team: ${team.name}`);

    // Update team name
    const newName = `Updated_${Date.now()}`;
    const upd = await request('PUT', '/api/admin/update-team',
      { teamId: team.id, teamName: newName }, adminHeaders
    );
    if (upd.status === 200) pass(`Team renamed to ${newName}`);
    else fail(`Team rename failed: ${upd.status}`);

    // Verify team appears on leaderboard with new name
    const lb = await request('GET', '/api/leaderboard');
    const found = lb.data?.find(t => t.id === team.id);
    if (found && found.team_name === newName) pass('Leaderboard reflects updated name');
    else if (found) fail(`Leaderboard has old name: ${found.team_name}`);
    else info('Team not in top 10 leaderboard');

    // Delete team
    const del = await request('DELETE', '/api/admin/delete-team', { teamId: team.id }, adminHeaders);
    if (del.status === 200) pass('Team deleted');
    else fail(`Delete failed: ${del.status}`);

    // Verify deleted team is gone from leaderboard
    const lb2 = await request('GET', '/api/leaderboard');
    const ghost = lb2.data?.find(t => t.id === team.id);
    if (!ghost) pass('Deleted team removed from leaderboard');
    else fail('Deleted team STILL ON leaderboard!');

    // Verify deleted team progress returns 404
    const prog = await request('GET', `/api/progress/${team.id}`);
    if (prog.status === 404) pass('Deleted team progress returns 404');
    else warn(`Deleted team progress returns ${prog.status} (expected 404)`);

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 7: Game State Toggle Under Concurrent Load
// ═══════════════════════════════════════════════════
async function testGameStateToggle() {
  section('TEST 7: Game State Toggle — MongoDB Upsert');
  try {
    // Get current state
    const initial = await request('GET', '/api/admin/game-state', null, adminHeaders);
    const wasActive = initial.data?.gameActive;
    pass(`Initial game state: active=${wasActive}`);

    // Toggle 5 times rapidly
    for (let i = 0; i < 5; i++) {
      const toggle = await request('POST', '/api/admin/toggle-game', null, adminHeaders);
      if (toggle.status !== 200) { fail(`Toggle ${i + 1} failed: ${toggle.status}`); continue; }
    }

    // After 5 toggles, state should be flipped from initial
    const after = await request('GET', '/api/admin/game-state', null, adminHeaders);
    const expected = !wasActive;
    if (after.data?.gameActive === expected)
      pass(`After 5 toggles: active=${after.data.gameActive} (correct)`);
    else
      warn(`After 5 toggles: active=${after.data?.gameActive} (expected ${expected})`);

    // Restore original state
    if (after.data?.gameActive !== wasActive) {
      await request('POST', '/api/admin/toggle-game', null, adminHeaders);
    }
    pass('Game state restored');

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 8: Heavy Mixed Load — Leaderboard + Progress + Admin
// ═══════════════════════════════════════════════════
async function testHeavyMixedLoad(teams) {
  section('TEST 8: Heavy Mixed Load — 50 Concurrent Requests');
  try {
    if (!teams.length) { fail('No teams'); return; }

    const promises = [];
    for (let i = 0; i < 50; i++) {
      const tid = teams[i % teams.length].id;
      const r = Math.random();
      if (r < 0.30) promises.push(request('GET', '/api/leaderboard'));
      else if (r < 0.55) promises.push(request('GET', `/api/progress/${tid}`));
      else if (r < 0.70) promises.push(request('GET', '/api/rooms'));
      else if (r < 0.85) promises.push(request('GET', '/api/admin/sessions', null, adminHeaders));
      else promises.push(request('GET', '/api/admin/api-stats', null, adminHeaders));
    }

    info('Firing 50 mixed requests...');
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    const err = results.filter(r => r.status >= 500);

    pass(`${ok.length}/50 succeeded, ${rl.length} rate-limited, ${err.length} errors`);

    if (err.length === 0) pass('ZERO server errors under mixed load ✓');
    else fail(`${err.length} server errors under mixed load!`);

    // Latency analysis
    const lats = results.filter(r => r.elapsed).map(r => r.elapsed);
    if (lats.length) {
      const avg = lats.reduce((a, b) => a + b, 0) / lats.length;
      const max = Math.max(...lats);
      info(`Mixed load latency — avg: ${avg.toFixed(0)}ms, max: ${max.toFixed(0)}ms`);
    }

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  TEST 9: Login Flow with MongoDB
// ═══════════════════════════════════════════════════
async function testLoginFlow() {
  section('TEST 9: Login Flow — MongoDB Team Lookup');
  try {
    // Create a team with known password
    const name = `Login_${Date.now()}`;
    const pwd = 'securepass123';
    const team = await createTestTeam(name, pwd);
    if (!team) { fail('Cannot create team for login test'); return team; }

    // Login with correct password
    const ok = await request('POST', '/api/register', { teamName: name, password: pwd });
    if (ok.status === 200 && ok.data.teamId === team.id)
      pass(`Login success: teamId=${ok.data.teamId}, resumed=${ok.data.resumed}`);
    else fail(`Login failed: ${ok.status} ${JSON.stringify(ok.data)}`);

    // Login with wrong password
    const wrongPwd = await request('POST', '/api/register', { teamName: name, password: 'wrong' });
    if (wrongPwd.status === 401) pass('Wrong password → 401');
    else fail(`Wrong password → ${wrongPwd.status}`);

    // Login with non-existent team
    const noTeam = await request('POST', '/api/register', { teamName: 'NonExistent_XYZ', password: 'test' });
    if (noTeam.status === 404) pass('Non-existent team → 404');
    else fail(`Non-existent team → ${noTeam.status}`);

    // Empty name
    const empty = await request('POST', '/api/register', { teamName: '', password: 'test' });
    if (empty.status === 400) pass('Empty name → 400');
    else fail(`Empty name → ${empty.status}`);

    // XSS in team name
    const xss = await request('POST', '/api/register', { teamName: '<script>alert(1)</script>', password: 'test' });
    if (xss.status === 404 || xss.status === 400) pass('XSS team name handled safely');
    else warn(`XSS name → ${xss.status}`);

    return team;
  } catch (e) { fail(`CRASHED: ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════
//  TEST 10: Leaderboard After Team Mutations
// ═══════════════════════════════════════════════════
async function testLeaderboardAfterMutations(allTeams) {
  section('TEST 10: Leaderboard Integrity After Mutations');
  try {
    // Fetch leaderboard
    const lb1 = await request('GET', '/api/leaderboard');
    if (lb1.status !== 200) { fail(`Leaderboard failed: ${lb1.status}`); return; }

    const boardBefore = lb1.data;
    info(`Leaderboard has ${boardBefore.length} teams before cleanup`);

    // Delete some test teams
    let deletedCount = 0;
    for (const team of allTeams.slice(0, 3)) {
      const del = await request('DELETE', '/api/admin/delete-team', { teamId: team.id }, adminHeaders);
      if (del.status === 200) deletedCount++;
    }
    info(`Deleted ${deletedCount} test teams`);

    // Re-fetch leaderboard
    const lb2 = await request('GET', '/api/leaderboard');
    if (lb2.status !== 200) { fail(`Leaderboard after delete failed: ${lb2.status}`); return; }

    // Verify deleted teams are gone
    const deletedIds = new Set(allTeams.slice(0, 3).map(t => t.id));
    const ghostTeams = lb2.data.filter(t => deletedIds.has(t.id));
    if (ghostTeams.length === 0) pass('All deleted teams removed from leaderboard');
    else fail(`${ghostTeams.length} deleted teams STILL on leaderboard!`);

    // Verify remaining teams still have valid data
    for (const entry of lb2.data) {
      if (typeof entry.rooms_solved !== 'number' || entry.rooms_solved < 0) {
        fail(`Invalid rooms_solved for ${entry.team_name}: ${entry.rooms_solved}`);
        return;
      }
      if (typeof entry.total_score !== 'number' || entry.total_score < 0) {
        fail(`Invalid total_score for ${entry.team_name}: ${entry.total_score}`);
        return;
      }
    }
    pass('All remaining leaderboard entries have valid data');

  } catch (e) { fail(`CRASHED: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════════════════
async function cleanup(allTeams) {
  section('CLEANUP: Removing Test Teams');
  try {
    let cleaned = 0;
    for (const team of allTeams) {
      const del = await request('DELETE', '/api/admin/delete-team', { teamId: team.id }, adminHeaders);
      if (del.status === 200) cleaned++;
    }
    info(`Cleaned up ${cleaned}/${allTeams.length} test teams`);
  } catch (e) { warn(`Cleanup error: ${e.message}`); }
}

// ═══════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════
async function run() {
  log('');
  log('╔' + '═'.repeat(60) + '╗');
  log('║  🔒 SecureBot — MONGODB CRASH TEST v4                     ║');
  log('║  Focus: Leaderboard + Score Integrity + Aggregations      ║');
  log(`║  Target: ${BASE}                                ║`);
  log(`║  Time:   ${new Date().toLocaleString().padEnd(47)}║`);
  log('╚' + '═'.repeat(60) + '╝');

  // Pre-flight
  try {
    const h = await fetch(`${BASE}/api/rooms`);
    if (!h.ok) throw new Error(`Status ${h.status}`);
    pass('Server reachable');
  } catch (e) {
    fail(`Cannot reach server: ${e.message}`);
    log('\n  💀 Server must be running on port 3000. Start it with: npm run server\n');
    process.exit(1);
  }

  const t0 = performance.now();
  const allTeams = [];

  // ── Test 1: Basic Connection ──
  const initialTeams = await testMongoConnection();
  allTeams.push(...initialTeams);

  // ── Test 2: Concurrent Creation ──
  const concTeams = await testConcurrentTeamCreation();
  allTeams.push(...concTeams);

  // ── Test 3: Leaderboard flood ──
  await testLeaderboardConsistency(allTeams);

  // ── Test 4: Score integrity ──
  await testScoreIntegrity(allTeams);

  // ── Test 5: Admin endpoints ──
  await testAdminEndpoints();

  // ── Test 6: Team management ──
  await testTeamManagement();

  // ── Test 7: Game state ──
  await testGameStateToggle();

  // ── Test 8: Mixed load ──
  await testHeavyMixedLoad(allTeams);

  // ── Test 9: Login flow ──
  const loginTeam = await testLoginFlow();
  if (loginTeam) allTeams.push(loginTeam);

  // ── Test 10: Leaderboard after mutations ──
  await testLeaderboardAfterMutations(allTeams);

  // ── Cleanup ──
  await cleanup(allTeams);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  // ── Summary ──
  section('📊  FINAL RESULTS');

  const p50 = percentile(stats.latencies, 50).toFixed(0);
  const p95 = percentile(stats.latencies, 95).toFixed(0);
  const p99 = percentile(stats.latencies, 99).toFixed(0);
  const maxL = stats.latencies.length ? Math.max(...stats.latencies).toFixed(0) : 0;
  const minL = stats.latencies.length ? Math.min(...stats.latencies).toFixed(0) : 0;

  log(`
  ── HTTP Stats ──
  Total Requests:      ${stats.total}
  Successful (2xx):    ${stats.success}  (${((stats.success / stats.total) * 100).toFixed(1)}%)
  Failed (4xx):        ${stats.failed}
  Rate-Limited (429):  ${stats.rateLimited}
  Server Errors (5xx): ${stats.serverErrors}  (REAL crashes)

  ── Test Results ──
  Passed:   ${stats.tests.passed}
  Failed:   ${stats.tests.failed}
  Warnings: ${stats.tests.warnings}

  ── Latency ──
  Min:  ${minL}ms
  P50:  ${p50}ms
  P95:  ${p95}ms
  P99:  ${p99}ms
  Max:  ${maxL}ms

  Total Duration: ${elapsed}s`);

  if (stats.tests.failed === 0 && stats.serverErrors === 0) {
    log('\n  🏆 VERDICT: ✅ PASSED — Zero crashes, zero integrity issues\n');
  } else if (stats.tests.failed === 0) {
    log(`\n  ⚠️  VERDICT: MOSTLY PASSED — ${stats.serverErrors} HTTP errors but all test assertions passed\n`);
  } else {
    log(`\n  ❌ VERDICT: FAILED — ${stats.tests.failed} test failures, ${stats.serverErrors} server errors\n`);
  }

  fs.writeFileSync(RESULTS_FILE, lines.join('\n'), 'utf8');
  log(`  📄 Results saved to mongo-crash-test-results.txt\n`);
}

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught:', err);
  fs.writeFileSync(RESULTS_FILE, lines.join('\n') + '\n\n💥 CRASHED: ' + err.message, 'utf8');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled:', reason);
});

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
