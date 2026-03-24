// Fetches unique accepted (AC) submissions per day from LeetCode GraphQL
// Returns JSON: { calendar: { "YYYY-M-D": count, ... }, streak, activeToday }

exports.handler = async function(event) {
  const params = event.queryStringParameters || {};
  const username = params.user || '';

  if (!username) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing ?user= parameter' }),
    };
  }

  try {
    // Fetch accepted submissions from LeetCode GraphQL
    const query = `{
      recentAcSubmissionList(username: "${username}", limit: 2000) {
        title
        timestamp
      }
    }`;

    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const json = await res.json();
    const submissions = json.data?.recentAcSubmissionList || [];

    // Group by day and count unique problem titles
    const getDateStr = (ts) => {
      const d = new Date(Number(ts) * 1000);
      return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    };

    const dayProblems = {}; // key: "YYYY-M-D", value: Set of titles
    submissions.forEach(sub => {
      const dayKey = getDateStr(sub.timestamp);
      if (!dayProblems[dayKey]) dayProblems[dayKey] = new Set();
      dayProblems[dayKey].add(sub.title);
    });

    // Convert to counts
    const calendar = {};
    Object.keys(dayProblems).forEach(key => {
      calendar[key] = dayProblems[key].size;
    });

    // Calculate streak
    const today = new Date();
    const todayStr = getDateStr(Math.floor(today.getTime() / 1000));
    const activeToday = !!calendar[todayStr];

    let streak = 0;
    const streakDates = [];
    const checkDate = new Date();
    if (!activeToday) checkDate.setDate(checkDate.getDate() - 1);

    const checkStr = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    while (calendar[checkStr(checkDate)]) {
      streak++;
      streakDates.push(checkStr(checkDate));
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ calendar, streak, activeToday, streakDates }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to fetch from LeetCode', details: e.message }),
    };
  }
};
