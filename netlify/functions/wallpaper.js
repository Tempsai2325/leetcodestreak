// GET /api/wallpaper?lc=<leetcode>&gh=<github>&cf=<codeforces>&width=1080&height=2400&tz=Asia/Kolkata
// Returns a PNG wallpaper. `user=` still works as an alias for `lc=`.
//
// Battery-friendly by design:
//  - Phones send If-None-Match; when nothing changed we answer 304 (zero bytes).
//  - Netlify's CDN caches each wallpaper for 15 minutes.
const satoriModule = require('satori');
const satori = satoriModule.default || satoriModule;
const { Resvg } = require('@resvg/resvg-js');
const { buildStats } = require('./lib/stats');

let FONTS = null; // cached across warm invocations
async function loadFonts() {
  if (FONTS) return FONTS;
  const get = (w) => fetch(`https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-${w}-normal.woff`).then((r) => r.arrayBuffer());
  const [w500, w700, w900] = await Promise.all([get(500), get(700), get(900)]);
  FONTS = [
    { name: 'Inter', data: w500, weight: 500, style: 'normal' },
    { name: 'Inter', data: w700, weight: 700, style: 'normal' },
    { name: 'Inter', data: w900, weight: 900, style: 'normal' },
  ];
  return FONTS;
}

// Tiny element helper. Satori needs display:flex on any div with several children.
const h = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

function render(stats, { width, height, tz }) {
  const s = width / 1080;
  const px = (n) => `${Math.round(n * s)}px`;
  const { activeToday, atRisk, streak } = stats;

  const pill = activeToday
    ? { text: 'CODED TODAY', fg: '#22c55e', bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.45)' }
    : atRisk
      ? { text: `RESET IN ${stats.hoursToReset}H`, fg: '#ef4444', bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.5)' }
      : { text: 'NOT YET TODAY', fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.4)' };

  const bigNumber = (value, label, color) => h({ flexDirection: 'column', alignItems: 'center' }, [
    h({ fontSize: px(190), fontWeight: 900, lineHeight: 1, color, letterSpacing: px(-6) }, `${value}`),
    h({ fontSize: px(26), fontWeight: 700, letterSpacing: px(6), color: '#6b6b6b', marginTop: px(18) }, label),
  ]);

  // Second big number: LeetCode solved if connected, otherwise GitHub contributions.
  const second = stats.leetcode
    ? { value: stats.leetcode.solved, label: 'SOLVED' }
    : stats.github
      ? { value: stats.github.total, label: 'COMMITS' }
      : { value: stats.codeforces.rating, label: 'RATING' };

  // Heatmap: current year; column count chosen below to fill the screen.
  // Size cells to fit BOTH the width and the height left after the other blocks.
  const gap = Math.round(7 * s);
  const gridPad = Math.round(28 * s);
  const sidePad = Math.round(width * 0.05);
  // Top ~11% stays clear for the lock-screen clock; everything else is used.
  const topPad = Math.round(height * 0.11);
  const bottomPad = Math.round(height * 0.035);
  // Reserve room for every row of platform chips (2 per row) so the footer never falls off.
  const chipCount = (stats.github ? 1 : 0) + (stats.leetcode ? 2 : 0) + (stats.codeforces ? 1 : 0);
  const extraChipRows = Math.max(0, Math.ceil(chipCount / 2) - 1);
  const availH = height - topPad - bottomPad - Math.round((680 + 150 * extraChipRows) * s) - 2 * gridPad;
  // Pick the column count that gives the biggest cells, so the heatmap fills the screen.
  let cols = 21, rows = 0, cell = 0;
  for (let c = 12; c <= 24; c++) {
    const r = Math.ceil(stats.grid.length / c);
    const cw = Math.floor((width - 2 * sidePad - 2 * gridPad - (c - 1) * gap) / c);
    const ch = Math.floor((availH - (r - 1) * gap) / r);
    const size = Math.min(cw, ch);
    if (size > cell) { cell = size; cols = c; rows = r; }
  }
  cell = Math.max(8, cell);
  const gridW = cols * cell + (cols - 1) * gap + 2 * gridPad;
  const cells = stats.grid.map((d) => {
    let bg = '#151515', border = 'none';
    if (d.isFuture) { bg = 'transparent'; border = `${Math.max(1, Math.round(2 * s))}px solid #1f1f1f`; }
    else if (d.count > 0) {
      const t = Math.min(d.count / 6, 1);
      bg = d.isStreak ? `rgba(34,197,94,${0.55 + t * 0.45})` : `rgba(34,197,94,${0.22 + t * 0.3})`;
    }
    if (d.isToday) border = `${Math.round(3 * s)}px solid ${activeToday ? '#ffffff' : pill.fg}`;
    return h({ width: `${cell}px`, height: `${cell}px`, borderRadius: `${Math.max(2, Math.round(cell * 0.22))}px`, background: bg, border });
  });

  // Platform chips (only for connected platforms) + time coded slot left for future WakaTime.
  const chips = [];
  if (stats.github) chips.push({ name: 'GitHub', value: `${stats.github.today} today`, color: '#e5e5e5' });
  if (stats.leetcode) chips.push({ name: 'LeetCode', value: `${stats.leetcode.today} today`, color: '#facc15' });
  if (stats.codeforces) chips.push({ name: 'Codeforces', value: `${stats.codeforces.rating || 'unrated'}`, color: '#60a5fa' });
  if (stats.leetcode) chips.push({ name: 'E / M / H', value: `${stats.leetcode.easy} / ${stats.leetcode.medium} / ${stats.leetcode.hard}`, color: '#a3a3a3' });

  const chip = (c) => h({
    flexDirection: 'column', width: `${Math.floor((width - 2 * sidePad - gap * 3) / 2)}px`,
    padding: `${px(22)} ${px(28)}`, borderRadius: px(30), background: 'rgba(255,255,255,0.035)',
    border: `${Math.max(1, Math.round(2 * s))}px solid rgba(34,197,94,0.18)`,
  }, [
    h({ fontSize: px(28), fontWeight: 700, color: c.color }, c.name),
    h({ fontSize: px(26), fontWeight: 500, color: '#8a8a8a', marginTop: px(6) }, c.value),
  ]);

  const handle = stats.usernames.lc || stats.usernames.gh || stats.usernames.cf;
  let updated = '';
  try {
    updated = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch { updated = new Date().toISOString().slice(11, 16) + ' UTC'; }

  return h({
    width: `${width}px`, height: `${height}px`, background: '#000', color: '#fff', fontFamily: 'Inter',
    flexDirection: 'column', alignItems: 'center',
    // Top ~30% left clear for the phone's lock-screen clock.
    padding: `${topPad}px ${sidePad}px ${bottomPad}px`,
  }, [
    // Status pill
    h({ alignItems: 'center', padding: `${px(16)} ${px(42)}`, borderRadius: px(100), background: pill.bg,
        border: `${Math.round(2 * s)}px solid ${pill.bd}` }, [
      h({ width: px(16), height: px(16), borderRadius: px(16), background: pill.fg, marginRight: px(16) }),
      h({ fontSize: px(28), fontWeight: 700, letterSpacing: px(4), color: pill.fg }, pill.text),
    ]),
    // Big numbers
    h({ alignItems: 'center', justifyContent: 'center', marginTop: px(50) }, [
      bigNumber(streak, 'DAY STREAK', activeToday ? '#ffffff' : pill.fg),
      h({ width: px(2), height: px(170), background: '#2a2a2a', margin: `0 ${px(60)}` }),
      bigNumber(second.value, second.label, '#facc15'),
    ]),
    // Year header
    h({ justifyContent: 'space-between', width: `${gridW + 4}px`, marginTop: px(60), marginBottom: px(20), padding: `0 ${px(8)}` }, [
      h({ fontSize: px(26), fontWeight: 700, color: '#4a4a4a' }, `${stats.year}`),
      h({ fontSize: px(26), fontWeight: 700, color: '#4a4a4a' }, `DAY ${stats.dayOfYear} / ${stats.daysInYear}`),
    ]),
    // Heatmap
    h({ flexWrap: 'wrap', width: `${gridW - 2 * gridPad + 4}px`, boxSizing: 'content-box', padding: `${gridPad}px`, background: 'rgba(255,255,255,0.02)',
        borderRadius: px(44), border: `${Math.round(2 * s)}px solid rgba(255,255,255,0.05)`, gap: `${gap}px` }, cells),
    // Chips
    h({ flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginTop: px(36), gap: `${gap * 3}px` }, chips.map(chip)),
    // Footer
    h({ justifyContent: 'space-between', width: '100%', marginTop: 'auto', opacity: 0.35 }, [
      h({ fontSize: px(22), fontWeight: 700 }, `@${handle}`),
      h({ fontSize: px(22), fontWeight: 500 }, `STREAKWALL · ${updated}`),
    ]),
  ]);
}

exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  if (!p.lc && !p.user && !p.gh && !p.cf) {
    return { statusCode: 400, body: 'Add at least one of ?lc= (LeetCode), ?gh= (GitHub), ?cf= (Codeforces)' };
  }
  const width = Math.min(Math.max(parseInt(p.width || '1080', 10) || 1080, 480), 2160);
  const height = Math.min(Math.max(parseInt(p.height || '2400', 10) || 2400, 800), 4000);
  const tz = p.tz || 'Asia/Kolkata';

  let stats;
  try {
    stats = await buildStats(p);
  } catch (e) {
    return { statusCode: 502, body: 'Could not reach the coding platforms. Try again in a minute.' };
  }
  if (!stats) return { statusCode: 404, body: 'No profile found for those usernames.' };

  const etag = `${stats.etag.slice(0, -1)}-${width}x${height}"`;
  const cacheHeaders = {
    ETag: etag,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
  };
  const inm = event.headers && (event.headers['if-none-match'] || event.headers['If-None-Match']);
  if (inm && inm === etag) return { statusCode: 304, headers: cacheHeaders, body: '' };

  const svg = await satori(render(stats, { width, height, tz }), { width, height, fonts: await loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="streakwall.png"', ...cacheHeaders },
    body: Buffer.from(png).toString('base64'),
    isBase64Encoded: true,
  };
};

// Exported for local testing.
exports.render = render;
exports.loadFonts = loadFonts;
