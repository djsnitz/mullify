// Vercel serverless function — proxies Golf Course API with auth header
export default async function handler(req, res) {
  const { path, ...query } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : (path || 'search');
  const params = new URLSearchParams(query).toString();
  const url = `https://api.golfcourseapi.com/v1/${pathStr}${params ? '?' + params : ''}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        'Authorization': 'Key LUMI5W3CW6EBRA3FYPCECXCWHM',
        'Content-Type': 'application/json'
      }
    });
    const data = await apiRes.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(apiRes.status).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
