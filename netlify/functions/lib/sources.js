// Data sources for StreakWall. Everything here reads PUBLIC profile data only:
// no logins, no passwords, no tokens from users.
//
// All days are keyed in UTC (YYYY-MM-DD), which matches LeetCode's daily reset
// (00:00 UTC = 5:30 AM IST).

const UA = { 'User-Agent': 'StreakWall (+https://github.com/Tempsai2325/leetcodestreak)' };

const dayKey = (d) => d.toISOString().slice(0, 10);

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { ...UA, ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── LeetCode ────────────────────────────────────────────────
// Direct from LeetCode's public GraphQL, falling back to the community API.
const LC_QUERY = `query($u:String!){
  matchedUser(username:$u){
    submitStatsGlobal{ acSubmissionNum{ difficulty count } }
    userCalendar{ submissionCalendar }
  }
}`;

async function getLeetCode(username) {
  let solved = 0, easy = 0, medium = 0, hard = 0, calendar = {};
  try {
    const json = await fetchJson('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
      body: JSON.stringify({ query: LC_QUERY, variables: { u: username } }),
    });
    const user = json?.data?.matchedUser;
    if (!user) return null;
    for (const row of user.submitStatsGlobal.acSubmissionNum) {
      if (row.difficulty === 'All') solved = row.count;
      if (row.difficulty === 'Easy') easy = row.count;
      if (row.difficulty === 'Medium') medium = row.count;
      if (row.difficulty === 'Hard') hard = row.count;
    }
    calendar = JSON.parse(user.userCalendar?.submissionCalendar || '{}');
  } catch (e) {
    // Fallback: community API
    const data = await fetchJson(`https://leetcode-api-faisalshohag.vercel.app/${encodeURIComponent(username)}`);
    if (data.errors || data.status === 'error' || !data.totalQuestions) return null;
    solved = data.totalSolved || 0; easy = data.easySolved || 0;
    medium = data.mediumSolved || 0; hard = data.hardSolved || 0;
    calendar = typeof data.submissionCalendar === 'string'
      ? JSON.parse(data.submissionCalendar || '{}') : (data.submissionCalendar || {});
  }
  const days = {};
  for (const [ts, count] of Object.entries(calendar)) {
    const k = dayKey(new Date(Number(ts) * 1000));
    days[k] = (days[k] || 0) + Number(count);
  }
  return { platform: 'leetcode', username, solved, easy, medium, hard, days };
}

// ── GitHub ──────────────────────────────────────────────────
// Uses GraphQL when the site owner sets GITHUB_TOKEN (any read-only token),
// otherwise the public contributions API.
async function getGitHub(username) {
  const days = {};
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const q = `query($u:String!){ user(login:$u){ contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`;
    const json = await fetchJson('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: { u: username } }),
    });
    const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) return null;
    for (const w of cal.weeks) for (const d of w.contributionDays) if (d.contributionCount) days[d.date] = d.contributionCount;
    return { platform: 'github', username, total: cal.totalContributions, days };
  }
  const json = await fetchJson(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`);
  if (!json?.contributions) return null;
  for (const d of json.contributions) if (d.count) days[d.date] = d.count;
  return { platform: 'github', username, total: json.total?.lastYear || 0, days };
}

// ── Codeforces ──────────────────────────────────────────────
async function getCodeforces(handle) {
  const info = await fetchJson(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
  if (info.status !== 'OK') return null;
  const status = await fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=500`);
  const days = {};
  for (const s of status.result || []) {
    const k = dayKey(new Date(s.creationTimeSeconds * 1000));
    days[k] = (days[k] || 0) + 1;
  }
  const u = info.result[0];
  return { platform: 'codeforces', username: handle, rating: u.rating || 0, rank: u.rank || 'unrated', days };
}

// Fetch everything in parallel; a failing optional source never breaks the wallpaper.
async function getAll({ lc, gh, cf }) {
  const settle = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const [leetcode, github, codeforces] = await Promise.all([
    settle(lc && getLeetCode(lc)),
    settle(gh && getGitHub(gh)),
    settle(cf && getCodeforces(cf)),
  ]);
  return { leetcode, github, codeforces };
}

module.exports = { getAll, dayKey };
