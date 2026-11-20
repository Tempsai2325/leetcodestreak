// GET /api/stats?lc=&gh=&cf=  ->  JSON used by the setup page (and future widgets/apps).
const { buildStats } = require('./lib/stats');

exports.handler = async function (event) {
  const p = event.queryStringParameters || {};
  if (!p.lc && !p.user && !p.gh && !p.cf) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Add at least one username.' }) };
  }
  try {
    const stats = await buildStats(p);
    if (!stats) return { statusCode: 404, body: JSON.stringify({ error: 'No profile found for those usernames.' }) };
    const { grid, ...rest } = stats;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=600',
      },
      body: JSON.stringify(rest),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Could not reach the coding platforms.' }) };
  }
};
