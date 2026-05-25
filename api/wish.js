// Vercel serverless function — AI-generated power-ups for SWARM.
// Tries providers in order: VPS self-hosted → OpenRouter free → Groq free → Gemini Flash free → Anthropic paid.
// Falls back to procedural generator on the client if none are configured.
//
// Set ONE of these env vars in Vercel:
//   VPS_AI_URL          — http://YOUR_VPS:3737/api/wish  (self-hosted Ollama, free forever, see vps/README.md)
//   OPENROUTER_API_KEY  — https://openrouter.ai/keys  (free models)
//   GROQ_API_KEY        — https://console.groq.com    (free, ~30 req/min, fastest hosted)
//   GEMINI_API_KEY      — https://aistudio.google.com/apikey  (free, 1500/day)
//   ANTHROPIC_API_KEY   — https://console.anthropic.com  (paid, ~$0.0008/wish)

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
  accuracy:   { op:'mult', range:[1.10, 1.25], desc:'accuracy multiplier (tighter spread)' },
};

const last = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of last) if (now - v > 30000) last.delete(k); }, 60000).unref?.();

function buildPrompt(wish) {
  const statList = Object.entries(STATS).map(([k,v]) => `  - "${k}" (${v.op}, range ${v.range[0]}-${v.range[1]}, ${v.desc})`).join('\n');
  return `You design balanced power-ups for SWARM, a roguelike browser auto-shooter.

The player just leveled up and asks for: "${wish}"

Generate ONE power-up matching their request. Be creative with the name (sci-fi / military / tactical theme). Numbers MUST stay inside the range for the chosen stat.

Available stats:
${statList}

Reply with ONLY valid JSON in this exact shape, nothing else, no markdown:
{"name":"Short Name","description":"+15% damage","stat":"dmgMult","op":"mult","value":1.15}`;
}

function clampPower(p) {
  if (!p || typeof p !== 'object') return null;
  const stat = STATS[p.stat];
  if (!stat) return null;
  const op = p.op === 'mult' ? 'mult' : 'add';
  let value = Number(p.value);
  if (!isFinite(value)) return null;
  const [lo, hi] = stat.range;
  value = Math.max(lo, Math.min(hi, value));
  return {
    name: String(p.name || 'Custom Boost').slice(0, 28),
    description: String(p.description || '').slice(0, 80),
    stat: p.stat,
    op,
    value: Math.round(value * 1000) / 1000,
    provider: p.provider || 'unknown',
  };
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON found');
  return JSON.parse(m[0]);
}

// ---- Provider implementations ----

async function callVPS(prompt, wish) {
  // Our VPS endpoint already builds the prompt + clamps the output —
  // we just forward the wish text.
  const res = await fetch(process.env.VPS_AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wish }),
    // 25s timeout — CPU inference can take a while
    signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
  });
  if (!res.ok) throw new Error('vps ' + res.status + ' ' + (await res.text()).slice(0, 100));
  const data = await res.json();
  // VPS already returns clamped {name,description,stat,op,value,provider}
  return data;
}

async function callOpenRouter(prompt) {
  // Uses only :free model variants so this stays zero-cost.
  // Llama 3.3 70B free → fallback to Gemini Flash free if unavailable.
  const models = [
    'google/gemini-2.5-flash:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/Jumpsy/swarm-game',
          'X-Title': 'SWARM',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.9,
        }),
      });
      if (!res.ok) { lastErr = 'openrouter ' + model + ' ' + res.status; continue; }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const json = extractJson(text);
      json.provider = 'openrouter/' + model.split('/').pop();
      return json;
    } catch (e) {
      lastErr = 'openrouter ' + model + ' ' + (e.message || e);
      continue;
    }
  }
  throw new Error(lastErr || 'openrouter all models failed');
}

async function callGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error('groq ' + res.status + ' ' + (await res.text()).slice(0, 100));
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const json = extractJson(text);
  json.provider = 'groq';
  return json;
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 200 },
      }),
    }
  );
  if (!res.ok) throw new Error('gemini ' + res.status + ' ' + (await res.text()).slice(0, 100));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const json = extractJson(text);
  json.provider = 'gemini';
  return json;
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('anthropic ' + res.status + ' ' + (await res.text()).slice(0, 100));
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const json = extractJson(text);
  json.provider = 'anthropic';
  return json;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x';
  const now = Date.now();
  const prev = last.get(ip);
  if (prev && now - prev < 1500) return res.status(429).json({ error: 'too_fast' });
  last.set(ip, now);

  const wish = String((req.body || {}).wish || 'surprise me').slice(0, 100);
  const prompt = buildPrompt(wish);

  // Try providers in order: self-hosted VPS first, then hosted free, then paid
  const providers = [];
  if (process.env.VPS_AI_URL)        providers.push({ name: 'vps',        call: (p) => callVPS(p, wish), skipClamp: true });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: 'openrouter', call: callOpenRouter });
  if (process.env.GROQ_API_KEY)      providers.push({ name: 'groq',        call: callGroq });
  if (process.env.GEMINI_API_KEY)    providers.push({ name: 'gemini',      call: callGemini });
  if (process.env.ANTHROPIC_API_KEY) providers.push({ name: 'anthropic',   call: callAnthropic });

  if (!providers.length) {
    return res.status(503).json({
      error: 'no_key',
      message: 'Set VPS_AI_URL (self-hosted) or OPENROUTER_API_KEY (free) or GROQ_API_KEY (free) or GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Vercel env vars.',
    });
  }

  const errors = [];
  for (const p of providers) {
    try {
      const raw = await p.call(prompt);
      // VPS already clamps; everything else needs it.
      const safe = p.skipClamp ? raw : clampPower(raw);
      if (!safe) throw new Error('invalid power shape');
      return res.status(200).json(safe);
    } catch (e) {
      errors.push(p.name + ': ' + String(e.message || e).slice(0, 80));
      continue;
    }
  }
  return res.status(500).json({ error: 'all_providers_failed', tried: errors });
}
