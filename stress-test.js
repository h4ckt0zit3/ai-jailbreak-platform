/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          SecureBot Jailbreak Challenge — STRESS TEST v3         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const ADMIN_KEY = 'JAIN2026ADMIN';
const RESULTS_FILE = path.join(__dirname, 'stress-test-results.txt');

// ── Config ──
const NUM_TEAMS = 15;
const CHAT_TEAMS = 3;
const CHAT_PER_TEAM = 2;
const CONCURRENT_PROGRESS = 20;
const CONCURRENT_LEADERBOARD = 20;
const ADMIN_BURST = 15;
const RATE_LIMIT_BURST = 8;
const COOLDOWN_MS = 62000;        // 62s cooldown to reset rate limit window (60s window)

// ── Output ──
const lines = [];
function log(msg = '') { lines.push(msg); console.log(msg); }

// ── Stats ──
const stats = {
  total: 0, success: 0, failed: 0, rateLimited: 0, serverErrors: 0, aiBusy: 0,
  latencies: [],
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
    if (res.status === 503) { stats.aiBusy++; return { status: res.status, data, elapsed, aiBusy: true }; }
    if (res.status >= 500) { stats.serverErrors++; stats.failed++; return { status: res.status, data, elapsed, error: true }; }
    if (res.ok) { stats.success++; } else { stats.failed++; }
    return { status: res.status, data, elapsed };
  } catch (err) {
    const elapsed = performance.now() - start;
    stats.failed++;
    return { status: 0, error: err.message, elapsed };
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function section(title) {
  log(`\n${'═'.repeat(60)}`);
  log(`  ${title}`);
  log(`${'═'.repeat(60)}`);
}
function pass(msg) { log(`  ✅ ${msg}`); }
function fail(msg) { log(`  ❌ ${msg}`); }
function info(msg) { log(`  ℹ️  ${msg}`); }
function warn(msg) { log(`  ⚠️  ${msg}`); }

async function cooldown(label) {
  const secs = Math.round(COOLDOWN_MS / 1000);
  info(`Cooldown ${secs}s (resetting rate limit window for ${label})...`);
  for (let i = secs; i > 0; i -= 10) {
    process.stdout.write(`\r     ${i}s remaining...   `);
    await sleep(Math.min(10000, i * 1000));
  }
  process.stdout.write('\r                             \r');
}

// ═══════════════════════════════════════════════
//  PHASE 1: Registration + Chat + Progress + Leaderboard
// ═══════════════════════════════════════════════

async function testRegistration() {
  section('TEST 1: Concurrent Team Registration (15 teams)');
  try {
    const names = Array.from({ length: NUM_TEAMS }, (_, i) => `Stress_${Date.now()}_${i}`);
    const results = await Promise.all(names.map(n => request('POST', '/api/register', { teamName: n })));
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    pass(`${ok.length}/${NUM_TEAMS} teams registered`);
    if (rl.length) info(`${rl.length} rate-limited`);

    const teamIds = ok.map(r => r.data.teamId).filter(Boolean);

    // Duplicate
    const dup = await request('POST', '/api/register', { teamName: names[0] });
    if (dup.data?.resumed) pass('Duplicate → resumed=true');
    else info(`Duplicate → status ${dup.status}`);

    // Validation edge cases
    const empty = await request('POST', '/api/register', { teamName: '' });
    if (empty.status === 400) pass('Empty name → 400');
    else fail(`Empty name → ${empty.status}`);

    const long = await request('POST', '/api/register', { teamName: 'X'.repeat(50) });
    if (long.status === 400) pass('Overlong name → 400');
    else fail(`Overlong → ${long.status}`);

    const xss = await request('POST', '/api/register', { teamName: '<script>alert(1)</script>XSS' });
    if (xss.status === 200 && !xss.data.teamName?.includes('<script>'))
      pass('XSS sanitized');
    else info('XSS — review manually');

    return teamIds;
  } catch (e) { fail(`Crashed: ${e.message}`); return []; }
}

async function testChat(teamIds) {
  section('TEST 2: Concurrent Chat — AI Load');
  try {
    if (!teamIds.length) { fail('No teams'); return; }
    const testTeams = teamIds.slice(0, CHAT_TEAMS);
    const msgs = ['Hello SecureBot!', 'What do you guard?'];
    const promises = [];
    for (const tid of testTeams) {
      for (let i = 0; i < CHAT_PER_TEAM; i++) {
        promises.push(request('POST', '/api/chat', { teamId: tid, roomNumber: 1, message: msgs[i % msgs.length] }));
      }
    }
    info(`Sending ${promises.length} chat messages concurrently...`);
    const results = await Promise.all(promises);

    const aiOk = results.filter(r => r.status === 200 && r.data?.reply);
    const aiRL = results.filter(r => r.rateLimited);
    const aiBusy = results.filter(r => r.aiBusy);
    const aiErr = results.filter(r => r.status >= 500 && !r.aiBusy);

    pass(`${aiOk.length}/${promises.length} AI responses OK`);
    if (aiRL.length) pass(`${aiRL.length} rate-limited (chat limiter working)`);
    if (aiBusy.length) pass(`${aiBusy.length} → 503 AI busy (attempt NOT counted ✓)`);
    if (aiErr.length) fail(`${aiErr.length} real server errors`);

    const valid = aiOk.filter(r => r.data.reply && typeof r.data.attemptsUsed === 'number');
    if (valid.length === aiOk.length) pass('All responses have correct shape');
    else fail(`${aiOk.length - valid.length} malformed`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

async function testProgress(teamIds) {
  section('TEST 3: Concurrent Progress Fetches (20)');
  try {
    if (!teamIds.length) { fail('No teams'); return; }
    const promises = Array.from({ length: CONCURRENT_PROGRESS }, (_, i) =>
      request('GET', `/api/progress/${teamIds[i % teamIds.length]}`)
    );
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    pass(`${ok.length}/${CONCURRENT_PROGRESS} progress ok`);
    if (rl.length) info(`${rl.length} rate-limited`);
    const valid = ok.filter(r => r.data.rooms?.length === 10);
    if (valid.length === ok.length) pass('All have 10 rooms');
    else fail(`${ok.length - valid.length} wrong count`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

async function testLeaderboard() {
  section('TEST 4: Leaderboard Flood (20)');
  try {
    const promises = Array.from({ length: CONCURRENT_LEADERBOARD }, () =>
      request('GET', '/api/leaderboard')
    );
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    pass(`${ok.length}/${CONCURRENT_LEADERBOARD} leaderboard ok`);
    if (rl.length) info(`${rl.length} rate-limited`);
    if (ok.length >= 2) {
      const first = JSON.stringify(ok[0].data);
      const consistent = ok.every(r => JSON.stringify(r.data) === first);
      if (consistent) pass('All responses consistent');
      else fail('INCONSISTENT leaderboard data!');
    }
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

// ═══════════════════════════════════════════════
//  PHASE 2: After cooldown — Rate Limiter + Edge Cases
// ═══════════════════════════════════════════════

async function testRateLimiter(teamIds) {
  section('TEST 5: Rate Limiter Enforcement');
  try {
    if (!teamIds.length) { fail('No teams'); return; }
    const rapid = Array.from({ length: RATE_LIMIT_BURST }, (_, i) =>
      request('POST', '/api/chat', { teamId: teamIds[0], roomNumber: 1, message: `Rapid ${i}` })
    );
    const results = await Promise.all(rapid);
    const limited = results.filter(r => r.status === 429);
    const accepted = results.filter(r => r.status === 200 || r.status === 503);
    if (limited.length > 0) pass(`Blocked ${limited.length}/${RATE_LIMIT_BURST} rapid-fire`);
    else fail('Rate limiter did NOT block rapid-fire!');
    info(`Accepted: ${accepted.length}, Blocked: ${limited.length}`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

async function testEdgeCases(teamIds) {
  section('TEST 6: Edge Cases & Error Handling');
  try {
    // Non-existent team
    const ghost = await request('GET', '/api/progress/nonexistent-id');
    if (ghost.status === 404) pass('Non-existent team → 404');
    else fail(`Non-existent team → ${ghost.status}`);

    // Wait a moment to ensure we're past per-team rate limit
    await sleep(2500);

    if (teamIds.length) {
      // Invalid room
      const badRoom = await request('POST', '/api/chat', { teamId: teamIds[0], roomNumber: 99, message: 'Test' });
      if (badRoom.status === 400) pass('Invalid room → 400');
      else if (badRoom.status === 429) warn('Invalid room → 429 (rate-limited, not a real failure)');
      else fail(`Invalid room → ${badRoom.status}`);

      await sleep(2500);

      // Oversized message
      const big = await request('POST', '/api/chat', { teamId: teamIds[0], roomNumber: 1, message: 'A'.repeat(3000) });
      if (big.status === 400) pass('Oversized message → 400');
      else if (big.status === 429) warn('Oversized → 429 (rate-limited)');
      else fail(`Oversized → ${big.status}`);

      await sleep(2500);

      // Locked room
      const locked = await request('POST', '/api/chat', { teamId: teamIds[0], roomNumber: 10, message: 'Test' });
      if (locked.status === 403) pass('Locked room → 403');
      else if (locked.status === 429) warn('Locked room → 429 (rate-limited)');
      else fail(`Locked room → ${locked.status}`);
    }

    // Missing fields
    const noFields = await request('POST', '/api/chat', {});
    if (noFields.status === 400) pass('Missing fields → 400');
    else if (noFields.status === 429) warn('Missing fields → 429 (rate-limited)');
    else fail(`Missing fields → ${noFields.status}`);

    // Hint with no score
    if (teamIds.length) {
      await sleep(2500);
      const noScore = await request('POST', '/api/hint', { teamId: teamIds[0], roomNumber: 1, hintIndex: 0 });
      if (noScore.status === 400) pass('Hint rejected (insufficient score)');
      else info(`Hint → ${noScore.status}`);
    }
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

async function testAdmin() {
  section('TEST 7: Admin Endpoint Stress');
  try {
    const noAuth = await request('GET', '/api/admin/sessions');
    if (noAuth.status === 401) pass('Auth required (401)');
    else fail(`No-auth → ${noAuth.status}`);

    const paths = [
      '/api/admin/sessions', '/api/admin/winning-prompts', '/api/admin/game-state',
      '/api/admin/room-secrets', '/api/admin/attack-prompts', '/api/admin/api-stats',
    ];
    const promises = Array.from({ length: ADMIN_BURST }, (_, i) =>
      request('GET', paths[i % paths.length], null, { 'x-admin-key': ADMIN_KEY })
    );
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.rateLimited);
    pass(`${ok.length}/${ADMIN_BURST} admin requests OK`);
    if (rl.length) info(`${rl.length} rate-limited`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

// ═══════════════════════════════════════════════
//  PHASE 3: After cooldown — DB Consistency + Mixed Load
// ═══════════════════════════════════════════════

async function testDBConsistency(teamIds) {
  section('TEST 8: Database Consistency');
  try {
    if (teamIds.length < 2) { info('Need ≥2 teams'); return; }
    const tid = teamIds[0];
    const promises = Array.from({ length: 10 }, () => request('GET', `/api/progress/${tid}`));
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    if (ok.length >= 2) {
      const scores = ok.map(r => r.data.totalScore);
      const rooms = ok.map(r => r.data.currentRoom);
      if (scores.every(s => s === scores[0])) pass(`Scores consistent (all = ${scores[0]})`);
      else fail(`Scores INCONSISTENT: ${[...new Set(scores)]}`);
      if (rooms.every(r => r === rooms[0])) pass(`Rooms consistent (all = ${rooms[0]})`);
      else fail(`Rooms INCONSISTENT: ${[...new Set(rooms)]}`);
    }

    // Concurrent dup registration
    const dupName = `Dup_${Date.now()}`;
    const dups = await Promise.all(
      Array.from({ length: 8 }, () => request('POST', '/api/register', { teamName: dupName }))
    );
    const dupOk = dups.filter(r => r.status === 200);
    const ids = new Set(dupOk.map(r => r.data?.teamId).filter(Boolean));
    if (ids.size <= 1) pass(`Concurrent dup → ${ids.size} unique ID (no duplicates)`);
    else fail(`Concurrent dup → ${ids.size} different IDs!`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

async function testMixedLoad(teamIds) {
  section('TEST 9: Heavy Mixed-Endpoint Load (40 requests)');
  try {
    if (!teamIds.length) { fail('No teams'); return; }
    const promises = [];
    for (let i = 0; i < 40; i++) {
      const tid = teamIds[i % teamIds.length];
      const r = Math.random();
      if (r < 0.25) promises.push(request('GET', `/api/progress/${tid}`));
      else if (r < 0.45) promises.push(request('GET', '/api/leaderboard'));
      else if (r < 0.55) promises.push(request('GET', '/api/rooms'));
      else if (r < 0.80) promises.push(request('POST', '/api/register', { teamName: `Mix_${Date.now()}_${i}` }));
      else promises.push(request('POST', '/api/chat', { teamId: tid, roomNumber: 1, message: `Load ${i}` }));
    }

    info(`Firing 40 mixed requests...`);
    const results = await Promise.all(promises);
    const ok = results.filter(r => r.status === 200);
    const rl = results.filter(r => r.status === 429);
    const busy = results.filter(r => r.status === 503);
    const err = results.filter(r => r.status >= 500 && r.status !== 503);

    pass(`${ok.length}/40 succeeded, ${rl.length} rate-limited, ${busy.length} AI-busy, ${err.length} errors`);
    if (err.length === 0) pass('Zero real server errors under mixed load');
    else fail(`${err.length} real server errors!`);
  } catch (e) { fail(`Crashed: ${e.message}`); }
}

// ═══════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════
async function run() {
  log('');
  log('╔' + '═'.repeat(58) + '╗');
  log('║  🔒 SecureBot Jailbreak — STRESS TEST v3                 ║');
  log(`║  Target: ${BASE}                              ║`);
  log(`║  Time:   ${new Date().toLocaleString().padEnd(45)}║`);
  log('╚' + '═'.repeat(58) + '╝');

  try {
    const h = await fetch(`${BASE}/api/rooms`);
    if (!h.ok) throw new Error(`Status ${h.status}`);
    pass('Server reachable');
  } catch (e) {
    fail(`Cannot reach server: ${e.message}`);
    process.exit(1);
  }

  const t0 = performance.now();

  // ── Phase 1: Heavy burst ──
  info('── Phase 1: Heavy burst tests ──');
  const teamIds = await testRegistration();
  await testChat(teamIds);
  await testProgress(teamIds);
  await testLeaderboard();

  // ── Cooldown ──
  await cooldown('Phase 2');

  // ── Phase 2: Rate limiter + edge cases (need fresh rate limit window) ──
  info('── Phase 2: Rate limiter + edge cases ──');
  await testRateLimiter(teamIds);
  await sleep(3000);
  await testEdgeCases(teamIds);
  await testAdmin();

  // ── Cooldown ──
  await cooldown('Phase 3');

  // ── Phase 3: Consistency + mixed load ──
  info('── Phase 3: DB consistency + mixed load ──');
  await testDBConsistency(teamIds);
  await testMixedLoad(teamIds);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  // ── Summary ──
  section('📊  FINAL RESULTS');

  const p50 = percentile(stats.latencies, 50).toFixed(0);
  const p95 = percentile(stats.latencies, 95).toFixed(0);
  const p99 = percentile(stats.latencies, 99).toFixed(0);
  const maxL = stats.latencies.length ? Math.max(...stats.latencies).toFixed(0) : 0;
  const minL = stats.latencies.length ? Math.min(...stats.latencies).toFixed(0) : 0;

  log(`
  Total Requests:      ${stats.total}
  Successful (200):    ${stats.success}  (${((stats.success / stats.total) * 100).toFixed(1)}%)
  Failed (4xx):        ${stats.failed}
  Rate-Limited (429):  ${stats.rateLimited}
  AI Busy (503):       ${stats.aiBusy}  (by design — attempt NOT counted)
  Server Errors (5xx): ${stats.serverErrors}  (real crashes)

  ── Latency ──
  Min:  ${minL}ms
  P50:  ${p50}ms
  P95:  ${p95}ms
  P99:  ${p99}ms
  Max:  ${maxL}ms

  Total Duration: ${elapsed}s`);

  if (stats.serverErrors === 0) {
    log('\n  🏆 VERDICT: PASSED — Zero server crashes under stress\n');
  } else {
    log(`\n  ⚠️  VERDICT: NEEDS ATTENTION — ${stats.serverErrors} server errors\n`);
  }

  fs.writeFileSync(RESULTS_FILE, lines.join('\n'), 'utf8');
  log(`  📄 Results saved to stress-test-results.txt\n`);
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
