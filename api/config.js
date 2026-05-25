// Vercel serverless function — Config Provider
// GET /api/config → returns public configuration and Google AdSense credentials

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    adsenseClientId: process.env.ADSENSE_CLIENT_ID || '',
    adsenseSlotId: process.env.ADSENSE_SLOT_ID || '',
  });
}
