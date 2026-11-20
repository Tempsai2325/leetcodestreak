// Turns raw platform data into the numbers the wallpaper shows.
const crypto = require('crypto');
const { getAll, dayKey } = require('./sources');

// Small in-memory cache: warm function instances skip refetching for 10 minutes.
const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000;

function computeStreak(activeDays, now = new Date()) {
  const today = dayKey(now);
  const activeToday = activeDays.has(today);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!activeToday) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  const streakDays = new Set();
  while (activeDays.has(dayKey(d))) {
    streak++;
    streakDays.add(dayKey(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return { streak, activeToday, streakDays };
}

async function buildStats(params) {
  const lc = (params.lc || params.user || '').trim();
  const gh = (params.gh || '').trim();
  const cf = (params.cf || '').trim();
  const key = `${lc}|${gh}|${cf}`.toLowerCase();

  const hit = CACHE.get(key);
  let sources;
  if (hit && Date.now() - hit.at < TTL_MS) sources = hit.sources;
  else {
    sources = await getAll({ lc, gh, cf });
    CACHE.set(key, { at: Date.now(), sources });
  }

  const { leetcode, github, codeforces } = sources;
  if (!leetcode && !github && !codeforces) return null;

  // Combined activity: any coding on any platform counts toward the dev streak.
  const combined = {};
  for (const src of [leetcode, github, codeforces]) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src.days)) combined[k] = (combined[k] || 0) + v;
  }
  const activeDays = new Set(Object.keys(combined));
  const now = new Date();
  const today = dayKey(now);
  const { streak, activeToday, streakDays } = computeStreak(activeDays, now);

  // Time left before the daily reset (00:00 UTC, matches LeetCode).
  const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const hoursToReset = Math.max(0, Math.ceil((nextReset - now.getTime()) / 3600000));

  // Current-year grid (UTC days).
  const year = now.getUTCFullYear();
  const grid = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = dayKey(d);
    grid.push({ count: combined[k] || 0, isStreak: streakDays.has(k), isFuture: k > today, isToday: k === today });
  }

  const stats = {
    usernames: { lc, gh, cf },
    streak,
    activeToday,
    hoursToReset,
    atRisk: !activeToday && hoursToReset <= 6,
    dayOfYear: grid.findIndex((g) => g.isToday) + 1,
    daysInYear: grid.length,
    year,
    leetcode: leetcode && {
      solved: leetcode.solved, easy: leetcode.easy, medium: leetcode.medium, hard: leetcode.hard,
      today: leetcode.days[today] || 0,
    },
    github: github && { today: github.days[today] || 0, total: github.total },
    codeforces: codeforces && { rating: codeforces.rating, rank: codeforces.rank, today: codeforces.days[today] || 0 },
    grid,
  };

  // ETag: changes only when what's drawn changes, so phones skip re-downloading.
  const fingerprint = JSON.stringify({ ...stats, hoursToReset: stats.atRisk ? stats.hoursToReset : null, grid: grid.map((g) => `${g.count}${g.isStreak ? 's' : ''}`).join(',') });
  stats.etag = '"' + crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 16) + '"';
  return stats;
}

module.exports = { buildStats, computeStreak };
