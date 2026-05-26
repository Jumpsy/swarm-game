// Vercel serverless function — Dynamic 30-Minute AI NPC Generator
// GET /api/npc → returns the active server-wide AI-generated enemy type

import { createClient } from '@supabase/supabase-js';

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase client load error:', e.message);
  }
}

// Local in-memory caching fallback
let localActiveNpc = {
  name: 'Robo Charger',
  color: '#ff4d6d',
  skin: '#222222',
  hp: 75,
  speed: 135,
  xp: 10,
  description: 'Cybernetic grunt that rushes with high velocity.',
  createdAt: Date.now()
};

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found');
  return JSON.parse(m[0]);
}

async function generateNewNpc() {
  const prompt = `You design balanced cyberpunk/biomechanical zombie enemy types for SWARM, an auto-shooter roguelite.
Generate ONE highly creative, unique enemy variant. Be descriptive. Keep HP within 40-250, and speed within 70-170.
Reply with ONLY valid JSON in this exact shape, no markdown wrappers:
{"name":"Cyber Stalker","color":"#00e0ff","skin":"#1a1c22","hp":85,"speed":130,"xp":12,"description":"A fast, glowing hunter mechanoid that stalks from boundaries."}`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/Jumpsy/swarm-game',
      'X-Title': 'SWARM'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.95
    })
  });

  if (!res.ok) throw new Error('OpenRouter API error status ' + res.status);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const raw = extractJson(text);
  
  // Validate and clamp to prevent game-breaking AI parameters
  const hp = Math.max(30, Math.min(300, Number(raw.hp) || 60));
  const speed = Math.max(50, Math.min(180, Number(raw.speed) || 100));
  const xp = Math.max(2, Math.min(50, Number(raw.xp) || 5));
  
  return {
    name: String(raw.name || 'AI Threat').slice(0, 20),
    color: String(raw.color || '#ff4d6d').slice(0, 7),
    skin: String(raw.skin || '#222222').slice(0, 7),
    hp,
    speed,
    xp,
    description: String(raw.description || 'Dynamic threat.').slice(0, 80)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only allowed' });

  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  let activeNpc = null;

  // 1. Database Route
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('global_npcs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        const lastCreated = new Date(data.created_at).getTime();
        // Check if active NPC is still fresh
        if (now - lastCreated < THIRTY_MINUTES) {
          activeNpc = {
            name: data.name,
            color: data.color,
            skin: data.skin,
            hp: data.hp,
            speed: data.speed,
            xp: data.xp,
            description: data.description,
            createdAt: lastCreated
          };
        }
      }
    } catch (e) {}
  } else {
    // Check in-memory freshness
    if (now - localActiveNpc.createdAt < THIRTY_MINUTES) {
      activeNpc = localActiveNpc;
    }
  }

  // 2. Lazy Generation Trigger
  if (!activeNpc) {
    try {
      const generated = await generateNewNpc();
      
      if (supabase) {
        const { data, error } = await supabase
          .from('global_npcs')
          .insert([{
            name: generated.name,
            color: generated.color,
            skin: generated.skin,
            hp: generated.hp,
            speed: generated.speed,
            xp: generated.xp,
            description: generated.description,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();
          
        if (!error && data) {
          activeNpc = {
            name: data.name,
            color: data.color,
            skin: data.skin,
            hp: data.hp,
            speed: data.speed,
            xp: data.xp,
            description: data.description,
            createdAt: new Date(data.created_at).getTime()
          };
        }
      }
      
      // Secondary fallback
      if (!activeNpc) {
        localActiveNpc = { ...generated, createdAt: now };
        activeNpc = localActiveNpc;
      }
    } catch (err) {
      console.warn('AI NPC Generation failed, fallback to last active:', err.message);
      activeNpc = supabase ? null : localActiveNpc;
      
      // Double check db fallback if generator failed
      if (supabase && !activeNpc) {
        try {
          const { data } = await supabase
            .from('global_npcs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data) {
            activeNpc = {
              name: data.name,
              color: data.color,
              skin: data.skin,
              hp: data.hp,
              speed: data.speed,
              xp: data.xp,
              description: data.description,
              createdAt: new Date(data.created_at).getTime()
            };
          }
        } catch (dbErr) {}
      }
      
      if (!activeNpc) {
        activeNpc = localActiveNpc;
      }
    }
  }

  return res.status(200).json(activeNpc);
}
