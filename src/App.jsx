import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trophy, Activity, Smartphone as MobileIcon, Zap, Clock } from 'lucide-react';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileData, setProfileData] = useState(null);
  const [viewMode, setViewMode] = useState('dashboard');
  const [lastSync, setLastSync] = useState('');
  const [wpWidth, setWpWidth] = useState(1080);
  const [wpHeight, setWpHeight] = useState(2400);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const userParam = params.get('user');
    const widthParam = params.get('width');
    const heightParam = params.get('height');

    if (modeParam === 'wallpaper') setViewMode('wallpaper');
    if (widthParam) setWpWidth(parseInt(widthParam, 10));
    if (heightParam) setWpHeight(parseInt(heightParam, 10));
    
    const saved = userParam || localStorage.getItem('lc_saved_user');
    if (saved) {
      setInput(saved);
      fetchProfile(null, saved);
    }
  }, []);

  const fetchProfile = async (e, overrideUsername = null) => {
    if (e) e.preventDefault();
    const username = (overrideUsername || input).trim().replace(/.*leetcode\.com\/(?:u\/)?/, '').replace(/\/.*/, '');
    if (!username) return;

    setLoading(true);
    setError('');

    try {
      // Fetch profile data (totals, etc.)
      const realRes = await fetch(`https://leetcode-api-faisalshohag.vercel.app/${username}`);
      const data = await realRes.json();

      if (data.errors || data.status === 'error' || !data.totalQuestions) {
        setError('User not found.');
        setProfileData(null);
        return;
      }

      // Fetch unique problems solved per day from our activity API
      let activityData = { calendar: {}, streak: 0, activeToday: false, streakDates: [] };
      try {
        const actRes = await fetch(`/api/activity?user=${username}`);
        if (!actRes.ok) throw new Error('Activity API returned ' + actRes.status);
        const actJson = await actRes.json();
        if (!actJson.error) activityData = actJson;
      } catch (actErr) {
        // Fallback: use submissionCalendar if activity API fails (e.g. local dev)
        console.warn('Activity API failed, falling back to submissionCalendar');
        const cal = data.submissionCalendar;
        if (cal && cal !== 'null') {
          const parsed = typeof cal === 'string' ? JSON.parse(cal) : cal;
          const getStr = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
          const calendar = {};
          Object.keys(parsed).forEach(ts => {
            const key = getStr(new Date(Number(ts) * 1000));
            calendar[key] = (calendar[key] || 0) + parsed[ts];
          });
          const today = new Date();
          const todayStr = getStr(today);
          const aToday = !!calendar[todayStr];

          // Calculate streak from the calendar
          let s = 0;
          const sDates = [];
          const checkDate = new Date();
          if (!aToday) checkDate.setDate(checkDate.getDate() - 1);
          while (calendar[getStr(checkDate)]) {
            s++;
            sDates.push(getStr(checkDate));
            checkDate.setDate(checkDate.getDate() - 1);
          }

          activityData = { calendar, streak: s, activeToday: aToday, streakDates: sDates };
        }
      }

      const streakData = {
        streak: activityData.streak,
        activeToday: activityData.activeToday,
        calendar: activityData.calendar,
        streakDates: new Set(activityData.streakDates || []),
        hasData: Object.keys(activityData.calendar).length > 0,
      };

      setProfileData({ ...data, username, streakData });
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (overrideUsername) localStorage.setItem('lc_saved_user', username);
    } catch (err) {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  // Build the full year data organized by weeks (columns) like GitHub/LeetCode heatmap
  const yearGridData = useMemo(() => {
    if (!profileData?.streakData?.calendar) return { weeks: [], monthBreaks: [] };
    const calendar = profileData.streakData.calendar;
    const streakDates = profileData.streakData.streakDates;
    const activityLookup = calendar; // calendar is already { "YYYY-M-D": count }

    const currentYear = new Date().getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from Jan 1
    const jan1 = new Date(currentYear, 0, 1);
    const startDay = jan1.getDay(); // 0=Sun

    const allDays = [];
    // Add empty padding for the first week
    for (let i = 0; i < startDay; i++) {
      allDays.push(null);
    }

    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const curr = new Date(currentYear, m, d);
        const key = `${currentYear}-${m + 1}-${d}`;
        allDays.push({
          date: curr,
          month: m,
          day: d,
          count: activityLookup[key] || 0,
          isStreak: streakDates.has(key),
          isFuture: curr > today,
          isToday: curr.getTime() === today.getTime()
        });
      }
    }

    // Organize into weeks (columns of 7)
    const weeks = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    // Pad last week
    while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
      weeks[weeks.length - 1].push(null);
    }

    // Find month boundaries for labels
    const monthBreaks = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      for (const day of week) {
        if (day && day.month !== lastMonth) {
          monthBreaks.push({ weekIndex: wi, month: day.month });
          lastMonth = day.month;
          break;
        }
      }
    });

    return { weeks, monthBreaks };
  }, [profileData]);

  // Flat year data for the wallpaper grid
  const fullYearData = useMemo(() => {
    if (!profileData?.streakData?.calendar) return [];
    const points = [];
    const calendar = profileData.streakData.calendar;
    const streakDates = profileData.streakData.streakDates;
    const activityLookup = calendar; // calendar is already { "YYYY-M-D": count }

    const currentYear = new Date().getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const curr = new Date(currentYear, m, d);
        const key = `${currentYear}-${m + 1}-${d}`;
        points.push({
          date: curr,
          month: m,
          count: activityLookup[key] || 0,
          isStreak: streakDates.has(key),
          isFuture: curr > today,
          isToday: curr.getTime() === today.getTime()
        });
      }
    }
    return points;
  }, [profileData]);

  // ─── WALLPAPER MODE ─────────────────────────────────────────
  // Renders at exact pixel dimensions (from URL params: ?width=1080&height=2400)
  // and scales to fit the browser viewport. MacroDroid screenshots this.
  if (viewMode === 'wallpaper' && profileData) {
    const streak = profileData.streakData.streak;
    const activeToday = profileData.streakData.activeToday;
    const solved = profileData.totalSolved;
    const total = profileData.totalQuestions;
    const pct = Math.round((solved / total) * 100);
    const currentYear = new Date().getFullYear();

    // Difficulty breakdown
    const easy = profileData.easySolved || 0;
    const medium = profileData.mediumSolved || 0;
    const hard = profileData.hardSolved || 0;

    // Compute day of year
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now - startOfYear;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Scale factor: fit the canvas into the browser viewport
    const scaleX = window.innerWidth / wpWidth;
    const scaleY = window.innerHeight / wpHeight;
    const scale = Math.min(scaleX, scaleY);

    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#000000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <div
        id="wallpaper-capture"
        style={{
          width: `${wpWidth}px`,
          height: `${wpHeight}px`,
          background: '#000000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${wpHeight * 0.04}px ${wpWidth * 0.05}px ${wpHeight * 0.025}px`,
          fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
          color: '#ffffff',
          overflow: 'hidden',
          boxSizing: 'border-box',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        {/* ── TOP SECTION: Streak hero ── */}
        <div style={{ textAlign: 'center', width: '100%' }}>
          {/* Status pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px 44px',
            borderRadius: '100px',
            background: activeToday ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `2px solid ${activeToday ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            marginBottom: '30px',
          }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%',
              background: activeToday ? '#22c55e' : '#ef4444',
              boxShadow: activeToday ? '0 0 20px #22c55e' : '0 0 20px #ef4444',
            }} />
            <span style={{
              fontSize: '28px', fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: activeToday ? '#22c55e' : '#ef4444',
            }}>
              {activeToday ? 'SOLVED TODAY' : 'NOT SOLVED'}
            </span>
          </div>

          {/* Streak + Solved side by side */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '60px',
          }}>
            {/* Streak */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '200px',
                fontWeight: 900,
                lineHeight: 0.9,
                letterSpacing: '-8px',
                background: activeToday
                  ? 'linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)'
                  : 'linear-gradient(180deg, #ef4444 0%, #7f1d1d 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {streak}
              </div>
              <div style={{
                fontSize: '26px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#525252',
                marginTop: '20px',
              }}>
                STREAK
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: '2px',
              height: '180px',
              background: 'linear-gradient(180deg, transparent, #333, transparent)',
            }} />

            {/* Solved */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '200px',
                fontWeight: 900,
                lineHeight: 0.9,
                letterSpacing: '-8px',
                background: 'linear-gradient(180deg, #facc15 0%, #a16207 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {solved}
              </div>
              <div style={{
                fontSize: '26px',
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#525252',
                marginTop: '20px',
              }}>
                SOLVED
              </div>
            </div>
          </div>
        </div>

        {/* ── MIDDLE SECTION: Heatmap Grid ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '30px 0',
        }}>
          {/* Year label */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginBottom: '30px',
            padding: '0 10px',
          }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#404040', letterSpacing: '0.1em' }}>
              {currentYear}
            </span>
            <span style={{ fontSize: '26px', fontWeight: 600, color: '#404040' }}>
              DAY {dayOfYear} / 365
            </span>
          </div>

          {/* The actual heatmap — 15 columns to fit well on 1080px */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(15, 1fr)',
            gap: '6px',
            width: '100%',
            padding: '36px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '48px',
            border: '2px solid rgba(255,255,255,0.04)',
          }}>
            {fullYearData.map((day, i) => {
              let bg = '#161616';
              let shadow = 'none';
              let cellBorder = 'none';

              if (day.isFuture) {
                bg = 'transparent';
                cellBorder = '2px solid #1a1a1a';
              } else if (day.count > 0) {
                if (day.isStreak) {
                  const intensity = Math.min(day.count / 5, 1);
                  bg = `rgba(250, 204, 21, ${0.6 + intensity * 0.4})`;
                  shadow = `0 0 ${12 + intensity * 16}px rgba(250, 204, 21, ${0.3 + intensity * 0.4})`;
                } else {
                  const intensity = Math.min(day.count / 5, 1);
                  bg = `rgba(34, 197, 94, ${0.25 + intensity * 0.45})`;
                }
              }

              if (day.isToday) {
                cellBorder = '3px solid #ffffff';
                shadow = '0 0 24px rgba(255,255,255,0.3)';
              }

              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '6px',
                    background: bg,
                    boxShadow: shadow,
                    border: cellBorder,
                  }}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            marginTop: '30px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#161616' }} />
              <span style={{ fontSize: '20px', color: '#525252', fontWeight: 600 }}>No Activity</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: 'rgba(34,197,94,0.5)' }} />
              <span style={{ fontSize: '20px', color: '#525252', fontWeight: 600 }}>Active</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: '#facc15', boxShadow: '0 0 12px rgba(250,204,21,0.5)' }} />
              <span style={{ fontSize: '20px', color: '#525252', fontWeight: 600 }}>Streak</span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM SECTION: Stats ── */}
        <div style={{ width: '100%' }}>
          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: '10px',
            background: '#1a1a1a',
            borderRadius: '100px',
            overflow: 'hidden',
            marginBottom: '24px',
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: activeToday
                ? 'linear-gradient(90deg, #facc15, #f59e0b)'
                : 'linear-gradient(90deg, #ef4444, #dc2626)',
              borderRadius: '100px',
            }} />
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            marginBottom: '24px',
          }}>
            {[
              { label: 'SOLVED', value: solved, color: '#ffffff' },
              { label: 'EASY', value: easy, color: '#22c55e' },
              { label: 'MED', value: medium, color: '#f59e0b' },
              { label: 'HARD', value: hard, color: '#ef4444' },
            ].map((stat, i) => (
              <div key={i} style={{
                textAlign: 'center',
                padding: '20px 10px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '28px',
                border: '2px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{
                  fontSize: '48px', fontWeight: 800,
                  color: stat.color,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: '18px', fontWeight: 700,
                  color: '#525252', letterSpacing: '0.1em',
                  marginTop: '6px',
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: 0.25,
          }}>
            <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '0.1em' }}>
              @{profileData.username}
            </span>
            <span style={{ fontSize: '20px', fontWeight: 600 }}>
              SYNCED {lastSync}
            </span>
          </div>

          {/* Exit button — only visible in browser, hidden in MacroDroid screenshot */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              onClick={() => setViewMode('dashboard')}
              style={{
                fontSize: '22px',
                color: '#404040',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                fontWeight: 700,
                background: 'none',
                border: '2px solid #262626',
                padding: '20px 60px',
                borderRadius: '100px',
                cursor: 'pointer',
              }}
            >
              Exit Wallpaper
            </button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  // ─── DASHBOARD MODE ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <Trophy className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-none tracking-tight">LeetCode Guardian</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Status: {profileData?.streakData?.activeToday ? 'Verified' : 'Unsolved'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {profileData && (
              <button onClick={() => setViewMode('wallpaper')} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-zinc-800"><MobileIcon className="w-4 h-4 text-yellow-500" /> Wallpaper Mode</button>
            )}
            <form onSubmit={fetchProfile} className="relative w-full md:w-64">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Username..." className="w-full bg-[#111] border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-yellow-500/50" />
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-600" />
            </form>
          </div>
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 mt-4">Fetching profile...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 text-sm font-bold">{error}</p>
          </div>
        )}

        {profileData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl relative overflow-hidden group">
                <h2 className="text-2xl font-black text-white mb-1">@{profileData.username}</h2>
                <div className="text-yellow-500 text-xs font-bold mb-6">Rank #{profileData.ranking?.toLocaleString()}</div>
                <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 transition-all duration-1000" style={{ width: `${(profileData.totalSolved / profileData.totalQuestions) * 100}%` }}></div>
                </div>
              </div>
              <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl shadow-xl">
                <div className="flex items-center gap-2 mb-4"><MobileIcon className="w-5 h-5 text-yellow-500" /><span className="font-bold text-sm text-white">MacroDroid Setup</span></div>
                <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
                  Set your wallpaper to auto-update with MacroDroid. Use this URL as the webpage to screenshot:
                </p>
                <div className="bg-black/60 p-3 rounded-xl border border-white/5 font-mono text-[10px] text-yellow-500 break-all select-all">
                  {window.location.origin}/?mode=wallpaper&user={profileData.username}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                   <div className="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-inner">
                      <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Solved</p>
                      <p className="text-2xl font-mono font-bold text-white">{profileData.totalSolved}</p>
                   </div>
                   <div className="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-inner">
                      <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Target</p>
                      <p className={`text-2xl font-mono font-bold ${profileData.streakData.activeToday ? 'text-green-500' : 'text-red-500'}`}>{profileData.totalSolved + (profileData.streakData.activeToday ? 0 : 1)}</p>
                   </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#111] border border-gray-800 p-6 rounded-3xl shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-green-500" /><h3 className="font-bold text-sm uppercase tracking-wider text-white">Life Calendar {new Date().getFullYear()}</h3></div>
                  <div className="text-[10px] text-gray-500 bg-gray-900 px-3 py-1 rounded-full font-bold">365 Days</div>
                </div>
                {/* GitHub-style heatmap with weeks as columns */}
                <div className="overflow-x-auto">
                  <div style={{ display: 'flex', gap: '3px', minWidth: 'max-content' }}>
                    {yearGridData.weeks.map((week, wi) => (
                      <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {week.map((day, di) => (
                          <div
                            key={di}
                            title={day ? day.date.toDateString() : ''}
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '2px',
                              background: !day
                                ? 'transparent'
                                : day.isFuture
                                  ? 'transparent'
                                  : day.count === 0
                                    ? '#161616'
                                    : day.isStreak
                                      ? '#facc15'
                                      : `rgba(34,197,94,${0.3 + Math.min(day.count / 5, 1) * 0.5})`,
                              border: !day
                                ? 'none'
                                : day.isFuture
                                  ? '1px solid #1a1a1a'
                                  : day.isToday
                                    ? '2px solid #fff'
                                    : 'none',
                              boxShadow: day?.isStreak ? '0 0 6px rgba(250,204,21,0.3)' : 'none',
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* Month labels */}
                  <div style={{ display: 'flex', gap: '3px', marginTop: '6px', minWidth: 'max-content' }}>
                    {yearGridData.weeks.map((_, wi) => {
                      const mb = yearGridData.monthBreaks.find(b => b.weekIndex === wi);
                      return (
                        <div key={wi} style={{ width: '12px', textAlign: 'center' }}>
                          {mb ? (
                            <span style={{ fontSize: '8px', color: '#525252', fontWeight: 600 }}>
                              {MONTH_LABELS[mb.month]}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}