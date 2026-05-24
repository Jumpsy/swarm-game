// SWARM wish-proxy — runs on the VPS, talks to local Ollama.
// POST /api/wish  {wish}  →  {name, description, stat, op, value}
//
// Output is always clamped to safe ranges so the LLM can't return broken values.

const http = require('http');

const STATS = {
  dmgMult:    { op:'mult', range:[1.05, 1.20], desc:'damage multiplier' },
  moveSpeed:  { op:'mult', range:[1.05, 1.15], desc:'move speed multiplier' },
  fireRate:   { op:'mult', range:[1.05, 1.15], desc:'fire rate multiplier' },
  pierce:     { op:'add',  range:[1, 1],       desc:'flat +N bullet pierces' },
  magnet:     { op:'mult', range:[1.20, 1.50], desc:'XP pickup range multiplier' },
  crit:       { op:'add',  range:[0.03, 0.10], desc:'flat +N crit chance' },
  regen:      { op:'add',  range:[0.3, 0.8],   desc:'flat +N HP/sec regen' },
  maxHp:      { op:'add',  range:[15, 30],     desc:'flat +N max HP' },
  xpMult:     { op:'mult', range:[1.10, 1.20], desc:'XP gain multiplier' },
  bulletSize: { op:'add',  range:[1, 3],       desc:'flat +N bullet size' },
  extraShots: { op:'add',  range:[1, 1],       desc:'flat +1 projectile per volley' },
  chain:      { op:'add',  range:[1, 1],       desc:'flat +1 chain target' },
  vamp:       { op:'add',  range:[0.03, 0.07], desc:'flat +N lifesteal fraction' },
  armor:      { op:'mult', range:[0.85, 0.94], desc:'damage taken multiplier (<1 = less damage)' },
  accuracy:   { op:'mult', range:[1.10, 1.25], desc:'accuracy multiplier' },
};

const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const last = new Map();

function clamp(p) {
  if (!p || typeof p !== 'object') return null;
  const s = STATS[p.stat];
  if (!s) return null;
  let v = Number(p.value);
  if (!isFinite(v)) return null;
  v = Math.max(s.range[0], Math.min(s.range[1], v));
  return {
    name: String(p.name || 'Custom Boost').slice(0, 28),
    description: String(p.description || '').slice(0, 80),
    stat: p.stat,
    op: p.op === 'mult' ? 'mult' : 'add',
    value: Math.round(v * 1000) / 1000,
    provider: 'vps/' + MODEL,
  };
}

function buildPrompt(wish) {
  const statList = Object.entries(STATS).map(([k, v]) =>
    `  - "${k}" (${v.op}, range ${v.range[0]}-${v.range[1]}, ${v.desc})`
  ).join('\n');
  return `You design balanced power-ups for SWARM, a roguelike browser auto-shooter.

The player just leveled up and asks for: "${wish}"

Generate ONE power-up matching the request. Be creative with the name (sci-fi or military theme, max 24 chars). The value MUST be within the chosen stat's range.

Available stats:
${statList}

Reply with ONLY raw JSON in this exact shape, no markdown, no explanation:
{"name":"Short Name","description":"+15% damage","stat":"<key>","op":"mult","value":<number>}`;
}

async function callOllama(prompt) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.9, num_predict: 200 },
    }),
  });
  if (!res.ok) throw new Error('ollama HTTP ' + res.status + ': ' + (await res.text()).slice(0, 120));
  const data = await res.json();
  let text = (data.response || '').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in response: ' + text.slice(0, 120));
  return JSON.parse(m[0]);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 4096) { req.destroy(); reject(new Error('body too large')); } });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200).end(); return; }

  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, model: MODEL, uptime: process.uptime() }));
  }

  if (req.url !== '/api/wish' || req.method !== 'POST') {
    res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x';
  const now = Date.now();
  if (last.has(ip) && now - last.get(ip) < 1500) {
    res.writeHead(429).end(JSON.stringify({ error: 'too_fast' }));
    return;
  }
  last.set(ip, now);

  let body;
  try { body = await readBody(req); }
  catch (e) { res.writeHead(400).end(JSON.stringify({ error: e.message })); return; }

  const wish = String(body.wish || 'surprise me').slice(0, 100);

  try {
    const raw = await callOllama(buildPrompt(wish));
    const safe = clamp(raw);
    if (!safe) throw new Error('invalid power shape');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safe));
  } catch (e) {
    console.error('[wish error]', e.message);
    res.writeHead(500).end(JSON.stringify({ error: String(e.message || e) }));
  }
});

// Periodic rate-limit map cleanup
setInterval(() => {
  const cutoff = Date.now() - 30000;
  for (const [ip, t] of last) if (t < cutoff) last.delete(ip);
}, 60000).unref();

const PORT = Number(process.env.PORT) || 3737;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SWARM wish AI listening on :${PORT} (model: ${MODEL})`);
});
