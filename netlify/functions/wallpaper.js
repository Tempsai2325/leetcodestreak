const satoriModule = require('satori');
const satori = satoriModule.default || satoriModule;
const { Resvg } = require('@resvg/resvg-js');

exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const username = params.user || '';
  const width = parseInt(params.width || '1080', 10);
  const height = parseInt(params.height || '2400', 10);

  if (!username) {
    return { statusCode: 400, body: 'Missing ?user= parameter' };
  }

  // Fetch LeetCode data
  let data;
  try {
    const res = await fetch(`https://leetcode-api-faisalshohag.vercel.app/${username}`);
    data = await res.json();
    if (data.errors || data.status === 'error' || !data.totalQuestions) {
      return { statusCode: 404, body: 'User not found' };
    }
  } catch (e) {
    return { statusCode: 502, body: 'Failed to fetch LeetCode data' };
  }

  // Fetch unique accepted submissions from LeetCode GraphQL
  let activityLookup = {};
  let streak = 0, activeToday = false;
  const streakDatesSet = new Set();

  try {
    const gqlQuery = `{ recentAcSubmissionList(username: "${username}", limit: 2000) { title timestamp } }`;
    const gqlRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gqlQuery }),
    });
    const gqlJson = await gqlRes.json();
    const submissions = gqlJson.data?.recentAcSubmissionList || [];

    const getStr = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

    // Group by day and count unique problem titles
    const dayProblems = {};
    submissions.forEach(sub => {
      const dayKey = getStr(new Date(Number(sub.timestamp) * 1000));
      if (!dayProblems[dayKey]) dayProblems[dayKey] = new Set();
      dayProblems[dayKey].add(sub.title);
    });
    Object.keys(dayProblems).forEach(key => {
      activityLookup[key] = dayProblems[key].size;
    });

    // Calculate streak
    const today2 = new Date();
    const todayStr = getStr(today2);
    activeToday = !!activityLookup[todayStr];

    const checkDate = new Date();
    if (!activeToday) checkDate.setDate(checkDate.getDate() - 1);
    while (activityLookup[getStr(checkDate)]) {
      streak++;
      streakDatesSet.add(getStr(checkDate));
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } catch (e) {
    // Fallback to submissionCalendar if GraphQL fails
    const calendarData = data.submissionCalendar;
    if (calendarData && calendarData !== 'null') {
      const calendar = typeof calendarData === 'string' ? JSON.parse(calendarData) : calendarData;
      const getStr = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      Object.keys(calendar).forEach(ts => {
        const key = getStr(new Date(Number(ts) * 1000));
        activityLookup[key] = (activityLookup[key] || 0) + Number(calendar[ts]);
      });
    }
  }

  // Build year data
  const currentYear = new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yearDays = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const curr = new Date(currentYear, m, d);
      const key = `${currentYear}-${m + 1}-${d}`;
      yearDays.push({
        count: activityLookup[key] || 0,
        isStreak: streakDatesSet.has(key),
        isFuture: curr > today,
        isToday: curr.getTime() === today.getTime(),
      });
    }
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));

  const solved = data.totalSolved || 0;
  const totalQ = data.totalQuestions || 1;
  const pct = Math.round((solved / totalQ) * 100);
  const easy = data.easySolved || 0;
  const medium = data.mediumSolved || 0;
  const hard = data.hardSolved || 0;

  // Fetch fonts
  const fontData = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.woff')
    .then(r => r.arrayBuffer());
  const fontDataBold = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff')
    .then(r => r.arrayBuffer());

  // Scale factor
  const s = width / 1080;
  const cols = 15;
  const cellGap = Math.round(6 * s);
  const gridPad = Math.round(36 * s);

  // Build heatmap cells
  const gridCells = yearDays.map((day) => {
    let bg = '#161616';
    if (day.isFuture) {
      bg = '#0d0d0d';
    } else if (day.count > 0) {
      if (day.isStreak) {
        const intensity = Math.min(day.count / 5, 1);
        bg = `rgba(250, 204, 21, ${0.6 + intensity * 0.4})`;
      } else {
        const intensity = Math.min(day.count / 5, 1);
        bg = `rgba(34, 197, 94, ${0.25 + intensity * 0.45})`;
      }
    }
    let border = 'none';
    if (day.isFuture) border = `${Math.round(2 * s)}px solid #1a1a1a`;
    if (day.isToday) border = `${Math.round(3 * s)}px solid #ffffff`;
    return { bg, border };
  });

  const cellSize = Math.floor((width - 2 * Math.round(width * 0.05) - 2 * gridPad - (cols - 1) * cellGap) / cols);
  const cellRadius = Math.round(6 * s);

  // Satori markup
  const markup = {
    type: 'div',
    props: {
      style: {
        width: `${width}px`, height: `${height}px`, background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        padding: `${Math.round(height * 0.04)}px ${Math.round(width * 0.05)}px ${Math.round(height * 0.025)}px`,
        fontFamily: 'Inter', color: '#fff',
      },
      children: [
        // TOP
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }, children: [
          // Pill
          { type: 'div', props: { style: {
            display: 'flex', alignItems: 'center', gap: `${Math.round(16 * s)}px`,
            padding: `${Math.round(16 * s)}px ${Math.round(44 * s)}px`, borderRadius: '100px',
            background: activeToday ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `2px solid ${activeToday ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            marginBottom: `${Math.round(30 * s)}px`,
          }, children: [
            { type: 'div', props: { style: { width: `${Math.round(16*s)}px`, height: `${Math.round(16*s)}px`, borderRadius: '50%', background: activeToday ? '#22c55e' : '#ef4444' } } },
            { type: 'span', props: { style: { fontSize: `${Math.round(28*s)}px`, fontWeight: 700, letterSpacing: '0.15em', color: activeToday ? '#22c55e' : '#ef4444' }, children: activeToday ? 'SOLVED TODAY' : 'NOT SOLVED' } },
          ] } },
          // Streak + Solved
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${Math.round(60*s)}px` }, children: [
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }, children: [
              { type: 'div', props: { style: { fontSize: `${Math.round(200*s)}px`, fontWeight: 900, lineHeight: 1, color: activeToday ? '#fff' : '#ef4444' }, children: `${streak}` } },
              { type: 'div', props: { style: { fontSize: `${Math.round(26*s)}px`, fontWeight: 700, letterSpacing: '0.3em', color: '#525252', marginTop: `${Math.round(20*s)}px` }, children: 'STREAK' } },
            ] } },
            { type: 'div', props: { style: { width: `${Math.round(2*s)}px`, height: `${Math.round(180*s)}px`, background: '#333' } } },
            { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }, children: [
              { type: 'div', props: { style: { fontSize: `${Math.round(200*s)}px`, fontWeight: 900, lineHeight: 1, color: '#facc15' }, children: `${solved}` } },
              { type: 'div', props: { style: { fontSize: `${Math.round(26*s)}px`, fontWeight: 700, letterSpacing: '0.3em', color: '#525252', marginTop: `${Math.round(20*s)}px` }, children: 'SOLVED' } },
            ] } },
          ] } },
        ] } },
        // MIDDLE
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', flex: 1, justifyContent: 'center' }, children: [
          { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: `${Math.round(30*s)}px`, padding: `0 ${Math.round(10*s)}px` }, children: [
            { type: 'span', props: { style: { fontSize: `${Math.round(28*s)}px`, fontWeight: 700, color: '#404040' }, children: `${currentYear}` } },
            { type: 'span', props: { style: { fontSize: `${Math.round(26*s)}px`, fontWeight: 600, color: '#404040' }, children: `DAY ${dayOfYear} / 365` } },
          ] } },
          { type: 'div', props: { style: {
            display: 'flex', flexWrap: 'wrap', gap: `${cellGap}px`, width: '100%',
            padding: `${gridPad}px`, background: 'rgba(255,255,255,0.02)',
            borderRadius: `${Math.round(48*s)}px`, border: '2px solid rgba(255,255,255,0.04)',
          }, children: gridCells.map((cell) => ({
            type: 'div', props: { style: {
              width: `${cellSize}px`, height: `${cellSize}px`,
              borderRadius: `${cellRadius}px`, background: cell.bg, border: cell.border,
            } }
          })) } },
          { type: 'div', props: { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${Math.round(40*s)}px`, marginTop: `${Math.round(30*s)}px` }, children: [
            { label: 'No Activity', color: '#161616' },
            { label: 'Active', color: 'rgba(34,197,94,0.5)' },
            { label: 'Streak', color: '#facc15' },
          ].map(item => ({
            type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: `${Math.round(10*s)}px` }, children: [
              { type: 'div', props: { style: { width: `${Math.round(20*s)}px`, height: `${Math.round(20*s)}px`, borderRadius: `${Math.round(4*s)}px`, background: item.color } } },
              { type: 'span', props: { style: { fontSize: `${Math.round(20*s)}px`, color: '#525252', fontWeight: 600 }, children: item.label } },
            ] }
          })) } },
        ] } },
        // BOTTOM
        { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', width: '100%' }, children: [
          { type: 'div', props: { style: { width: '100%', height: `${Math.round(10*s)}px`, background: '#1a1a1a', borderRadius: '100px', overflow: 'hidden', marginBottom: `${Math.round(24*s)}px`, display: 'flex' }, children: [
            { type: 'div', props: { style: { height: '100%', width: `${pct}%`, background: activeToday ? '#facc15' : '#ef4444', borderRadius: '100px' } } },
          ] } },
          { type: 'div', props: { style: { display: 'flex', gap: `${Math.round(20*s)}px`, marginBottom: `${Math.round(24*s)}px` }, children: [
            { label: 'SOLVED', value: solved, color: '#fff' },
            { label: 'EASY', value: easy, color: '#22c55e' },
            { label: 'MED', value: medium, color: '#f59e0b' },
            { label: 'HARD', value: hard, color: '#ef4444' },
          ].map(stat => ({
            type: 'div', props: { style: {
              display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
              padding: `${Math.round(20*s)}px ${Math.round(10*s)}px`, background: 'rgba(255,255,255,0.02)',
              borderRadius: `${Math.round(28*s)}px`, border: '2px solid rgba(255,255,255,0.04)',
            }, children: [
              { type: 'div', props: { style: { fontSize: `${Math.round(48*s)}px`, fontWeight: 800, color: stat.color }, children: `${stat.value}` } },
              { type: 'div', props: { style: { fontSize: `${Math.round(18*s)}px`, fontWeight: 700, color: '#525252', letterSpacing: '0.1em', marginTop: `${Math.round(6*s)}px` }, children: stat.label } },
            ] }
          })) } },
          { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', width: '100%', opacity: 0.25 }, children: [
            { type: 'span', props: { style: { fontSize: `${Math.round(20*s)}px`, fontWeight: 700 }, children: `@${username}` } },
            { type: 'span', props: { style: { fontSize: `${Math.round(20*s)}px`, fontWeight: 600 }, children: `SYNCED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` } },
          ] } },
        ] } },
      ]
    }
  };

  const svg = await satori(markup, {
    width, height,
    fonts: [
      { name: 'Inter', data: fontData, weight: 900, style: 'normal' },
      { name: 'Inter', data: fontDataBold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const pngBuffer = resvg.render().asPng();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    body: Buffer.from(pngBuffer).toString('base64'),
    isBase64Encoded: true,
  };
};
