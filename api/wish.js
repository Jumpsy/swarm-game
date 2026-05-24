// Vercel serverless function — AI-generated power-ups for SWARM.
// POST /api/wish  { wish: "more damage please", currentPowers?: [...] }
//   → { name, description, stat, op, value }
//
// Requires env var ANTHROPIC_API_KEY in Vercel (free tier works).
// Client falls back to local procedural generator if this endpoint is unavailable.

import Anthropic from '@anthropic-ai/sdk';

const STATS = {
  dmgMult:    { op:'mult', range:[1.05, 1.20], desc:'damage multiplier' },
  moveSpeed:  { op:'mult', range:[1.05, 1.15], desc:'move speed multiplier' },
  fireRate:   { op:'mult', range:[1.05, 1.15], desc:'fire rate multiplier (currently ~2.4)' },
  pierce:     { op:'add',  range:[1, 1],       desc:'flat +N bullet pierces' },
  magnet:     { op:'mult', range:[1.20, 1.50], desc:'XP pickup range multiplier' },
  crit:       { op:'add',  range:[0.03, 0.10], desc:'flat +N crit chance (0.0-1.0)' },
  regen:      { op:'add',  range:[0.3, 0.8],   desc:'flat +N HP/sec regen' },
  maxHp:      { op:'add',  range:[15, 30],     desc:'flat +N max HP' },
  xpMult:     { op:'mult', range:[1.10, 1.20], desc:'XP gain multiplier' },
  bulletSize: { op:'add',  range:[1, 3],       desc:'flat +N bullet size' },
  extraShots: { op:'add',  range:[1, 1],       desc:'flat +1 projectile per volley' },
  chain:      { op:'add',  range:[1, 1],       desc:'flat +1 chain target' },
  vamp:       { op:'add',  range:[0.03, 0.07], desc:'flat +N lifesteal fraction (0.0-1.0)' },
  armor:      { op:'mult', range:[0.85, 0.94], desc:'damage taken multiplier (<1 = less damage)' },
  accuracy:   { op:'mult', range:[1.10, 1.25], desc:'accuracy multiplier (tighter bullet spread)' },
};

// Per-IP throttle: 1 request / 1.5s
const last = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of last) if (now - v > 30000) last.delete(k); }, 60000).unref?.();

function clampPower(p) {
  // Defensive clamp so the LLM can't return broken/overpowered values.
  if (!p || typeof p !== 'object') return null;
  const stat = STATS[p.stat];
  if (!stat) return null;
  const op = p.op === 'mult' ? 'mult' : 'add';
  let value = Number(p.value);
  if (!isFinite(value)) return null;
  // Force into the safe range for that stat
  const [lo, hi] = stat.range;
  value = Math.max(lo, Math.min(hi, value));
  return {
    name: String(p.name || 'Custom Boost').slice(0, 32),
    description: String(p.description || '').slice(0, 80),
    stat: p.stat,
    op,
    value: Math.round(value * 1000) / 1000,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'no_api_key', message: 'Set ANTHROPIC_API_KEY in Vercel env vars.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x';
  const now = Date.now();
  const prev = last.get(ip);
  if (prev && now - prev < 1500) return res.status(429).json({ error: 'too_fast' });
  last.set(ip, now);

  const wish = String((req.body || {}).wish || 'surprise me').slice(0, 100);

  const statList = Object.entries(STATS).map(([k,v]) => `  - "${k}" (${v.op}, ${v.desc})`).join('\n');
  const prompt = `You design balanced power-ups for an indie roguelike called SWARM (auto-shooter, vampire-survivors style).

The player just leveled up and wishes for: "${wish}"

Generate ONE power-up that matches their request. Be creative with the name (sci-fi / tactical / military theme) but keep numbers BALANCED — never overpowered.

Available stats:
${statList}

Reply with ONLY valid JSON in this exact shape, nothing else:
{
  "name": "Short cool name (max 24 chars)",
  "description": "+15% damage" or "+1 pierce" etc,
  "stat": "<one of the stat keys above>",
  "op": "mult" or "add",
  "value": <number within that stat's range>
}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content?.[0]?.text?.trim() || '';
    // The LLM should reply with raw JSON. Tolerate a code-fence wrap.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no JSON in response');
    const parsed = JSON.parse(m[0]);
    const safe = clampPower(parsed);
    if (!safe) throw new Error('invalid power shape');
    return res.status(200).json(safe);
  } catch (e) {
    return res.status(500).json({ error: 'llm_failed', message: String(e.message || e) });
  }
}
