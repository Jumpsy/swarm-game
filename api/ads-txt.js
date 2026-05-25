// Vercel serverless function — Dynamic ads.txt Provider
// GET /ads.txt → Dynamically generates the required ads.txt for Google AdSense authorization

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId = process.env.ADSENSE_CLIENT_ID || 'ca-pub-XXXXXXXXXXXXXX';
  
  // Extract numerical publisher ID (e.g. pub-1234567890123456 from ca-pub-1234567890123456)
  let pubId = clientId;
  if (pubId.startsWith('ca-')) {
    pubId = pubId.substring(3);
  }
  
  const content = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
  return res.status(200).send(content);
}
