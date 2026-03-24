import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export async function handler(event) {
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

  // Calculate streak
  const calendarData = data.submissionCalendar;
  let streak = 0, activeToday = false;
  const activeDaysSet = new Set();
  const streakDatesSet = new Set();

  if (calendarData && calendarData !== 'null' && calendarData !== '{}') {
    try {
      const calendar = typeof calendarData === 'string' ? JSON.parse(calendarData) : calendarData;
      const timestamps = Object.keys(calendar).map(Number);
      const getStr = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      const daysSet = new Set(timestamps.map(ts => getStr(new Date(ts * 1000))));

      // Build activity lookup
      timestamps.forEach(ts => {
        const date = new Date(ts * 1000);
        const key = getStr(date);
        activeDaysSet.add(key);
      });

      const today = new Date();
      const todayStr = getStr(today);
      activeToday = daysSet.has(todayStr);

      let checkDate = new Date();
      if (!activeToday) checkDate.setDate(checkDate.getDate() - 1);
      while (daysSet.has(getStr(checkDate))) {
        streak++;
        streakDatesSet.add(getStr(checkDate));
        checkDate.setDate(checkDate.getDate() - 1);
      }
    } catch (e) { /* streak stays 0 */ }
  }

  // Build year data
  const currentYear = new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Activity lookup with counts
  const activityLookup = {};
  if (calendarData && calendarData !== 'null') {
    try {
      const calendar = typeof calendarData === 'string' ? JSON.parse(calendarData) : calendarData;
      Object.keys(calendar).forEach(ts => {
        const date = new Date(Number(ts) * 1000);
        const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
        activityLookup[key] = (activityLookup[key] || 0) + Number(calendar[ts]);
      });
    } catch (e) { /* empty */ }
  }

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

  // Fetch font
  const fontData = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&display=swap')
    .then(() =>
      fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.woff')
    )
    .then(r => r.arrayBuffer());

  const fontDataBold = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff')
    .then(r => r.arrayBuffer());

  // Scale factor for different resolutions
  const s = width / 1080;

  // Build heatmap grid cells (15 columns)
  const cols = 15;
  const cellGap = Math.round(6 * s);
  const cellRadius = Math.round(6 * s);
  const gridPad = Math.round(36 * s);

  const gridCells = yearDays.map((day) => {
    let bg = '#161616';
    if (day.isFuture) {
      bg = '#0d0d0d';
    } else if (day.count > 0) {
      if (day.isStreak) {
        const intensity = Math.min(day.count / 5, 1);
        const alpha = Math.round((0.6 + intensity * 0.4) * 255);
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

  // Build rows of cells for the grid
  const rows = [];
  for (let i = 0; i < gridCells.length; i += cols) {
    rows.push(gridCells.slice(i, i + cols));
  }

  // Satori JSX for the wallpaper
  const markup = {
    type: 'div',
    props: {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${Math.round(height * 0.04)}px ${Math.round(width * 0.05)}px ${Math.round(height * 0.025)}px`,
        fontFamily: 'Inter',
        color: '#ffffff',
      },
      children: [
        // TOP: Status pill + Streak/Solved
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' },
            children: [
              // Status pill
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${Math.round(16 * s)}px`,
                    padding: `${Math.round(16 * s)}px ${Math.round(44 * s)}px`,
                    borderRadius: '100px',
                    background: activeToday ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `2px solid ${activeToday ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    marginBottom: `${Math.round(30 * s)}px`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: `${Math.round(16 * s)}px`,
                          height: `${Math.round(16 * s)}px`,
                          borderRadius: '50%',
                          background: activeToday ? '#22c55e' : '#ef4444',
                        }
                      }
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontSize: `${Math.round(28 * s)}px`,
                          fontWeight: 700,
                          letterSpacing: '0.15em',
                          textTransform: 'uppercase',
                          color: activeToday ? '#22c55e' : '#ef4444',
                        },
                        children: activeToday ? 'SOLVED TODAY' : 'NOT SOLVED',
                      }
                    }
                  ]
                }
              },
              // Streak + Solved row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: `${Math.round(60 * s)}px`,
                  },
                  children: [
                    // Streak
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${Math.round(200 * s)}px`,
                                fontWeight: 900,
                                lineHeight: 1,
                                color: activeToday ? '#ffffff' : '#ef4444',
                              },
                              children: `${streak}`,
                            }
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${Math.round(26 * s)}px`,
                                fontWeight: 700,
                                letterSpacing: '0.3em',
                                color: '#525252',
                                marginTop: `${Math.round(20 * s)}px`,
                              },
                              children: 'STREAK',
                            }
                          }
                        ]
                      }
                    },
                    // Divider
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: `${Math.round(2 * s)}px`,
                          height: `${Math.round(180 * s)}px`,
                          background: '#333333',
                        }
                      }
                    },
                    // Solved
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${Math.round(200 * s)}px`,
                                fontWeight: 900,
                                lineHeight: 1,
                                color: '#facc15',
                              },
                              children: `${solved}`,
                            }
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${Math.round(26 * s)}px`,
                                fontWeight: 700,
                                letterSpacing: '0.3em',
                                color: '#525252',
                                marginTop: `${Math.round(20 * s)}px`,
                              },
                              children: 'SOLVED',
                            }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        // MIDDLE: Year label + Heatmap grid
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              flex: 1,
              justifyContent: 'center',
            },
            children: [
              // Year + Day labels
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    marginBottom: `${Math.round(30 * s)}px`,
                    padding: `0 ${Math.round(10 * s)}px`,
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: `${Math.round(28 * s)}px`, fontWeight: 700, color: '#404040' },
                        children: `${currentYear}`,
                      }
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: `${Math.round(26 * s)}px`, fontWeight: 600, color: '#404040' },
                        children: `DAY ${dayOfYear} / 365`,
                      }
                    }
                  ]
                }
              },
              // Heatmap grid
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: `${cellGap}px`,
                    width: '100%',
                    padding: `${gridPad}px`,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: `${Math.round(48 * s)}px`,
                    border: '2px solid rgba(255,255,255,0.04)',
                  },
                  children: gridCells.map((cell, i) => ({
                    type: 'div',
                    props: {
                      style: {
                        width: `${Math.floor((width - 2 * Math.round(width * 0.05) - 2 * gridPad - (cols - 1) * cellGap) / cols)}px`,
                        height: `${Math.floor((width - 2 * Math.round(width * 0.05) - 2 * gridPad - (cols - 1) * cellGap) / cols)}px`,
                        borderRadius: `${cellRadius}px`,
                        background: cell.bg,
                        border: cell.border,
                      }
                    }
                  }))
                }
              },
              // Legend
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: `${Math.round(40 * s)}px`,
                    marginTop: `${Math.round(30 * s)}px`,
                  },
                  children: [
                    { label: 'No Activity', color: '#161616' },
                    { label: 'Active',      color: 'rgba(34,197,94,0.5)' },
                    { label: 'Streak',      color: '#facc15' },
                  ].map(item => ({
                    type: 'div',
                    props: {
                      style: { display: 'flex', alignItems: 'center', gap: `${Math.round(10 * s)}px` },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              width: `${Math.round(20 * s)}px`,
                              height: `${Math.round(20 * s)}px`,
                              borderRadius: `${Math.round(4 * s)}px`,
                              background: item.color,
                            }
                          }
                        },
                        {
                          type: 'span',
                          props: {
                            style: { fontSize: `${Math.round(20 * s)}px`, color: '#525252', fontWeight: 600 },
                            children: item.label,
                          }
                        }
                      ]
                    }
                  }))
                }
              }
            ]
          }
        },
        // BOTTOM: Progress bar + Stats + Footer
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', width: '100%' },
            children: [
              // Progress bar
              {
                type: 'div',
                props: {
                  style: {
                    width: '100%',
                    height: `${Math.round(10 * s)}px`,
                    background: '#1a1a1a',
                    borderRadius: '100px',
                    overflow: 'hidden',
                    marginBottom: `${Math.round(24 * s)}px`,
                    display: 'flex',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          height: '100%',
                          width: `${pct}%`,
                          background: activeToday ? '#facc15' : '#ef4444',
                          borderRadius: '100px',
                        }
                      }
                    }
                  ]
                }
              },
              // Stats row
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    gap: `${Math.round(20 * s)}px`,
                    marginBottom: `${Math.round(24 * s)}px`,
                  },
                  children: [
                    { label: 'SOLVED', value: solved, color: '#ffffff' },
                    { label: 'EASY', value: easy, color: '#22c55e' },
                    { label: 'MED', value: medium, color: '#f59e0b' },
                    { label: 'HARD', value: hard, color: '#ef4444' },
                  ].map(stat => ({
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: 1,
                        padding: `${Math.round(20 * s)}px ${Math.round(10 * s)}px`,
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: `${Math.round(28 * s)}px`,
                        border: '2px solid rgba(255,255,255,0.04)',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: `${Math.round(48 * s)}px`,
                              fontWeight: 800,
                              color: stat.color,
                            },
                            children: `${stat.value}`,
                          }
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: `${Math.round(18 * s)}px`,
                              fontWeight: 700,
                              color: '#525252',
                              letterSpacing: '0.1em',
                              marginTop: `${Math.round(6 * s)}px`,
                            },
                            children: stat.label,
                          }
                        }
                      ]
                    }
                  }))
                }
              },
              // Footer
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    opacity: 0.25,
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: `${Math.round(20 * s)}px`, fontWeight: 700 },
                        children: `@${username}`,
                      }
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: `${Math.round(20 * s)}px`, fontWeight: 600 },
                        children: `SYNCED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ]
    }
  };

  // Generate SVG with satori
  const svg = await satori(markup, {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fontData, weight: 900, style: 'normal' },
      { name: 'Inter', data: fontDataBold, weight: 700, style: 'normal' },
    ],
  });

  // Convert SVG to PNG with resvg
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
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
}
