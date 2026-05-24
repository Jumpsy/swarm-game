// Vercel serverless function — SWARM global leaderboard
// GET  /api/leaderboard         → { rows: [{name,time,kills,level,wave,date}] }
// POST /api/leaderboard {body}  → inserts a run, returns the inserted row

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Simple per-IP write throttle (2s)
const lastWrite = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, t] of lastWrite) if (now - t > 10000) lastWrite.delete(ip);
}, 60000).unref?.();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('runs')
      .select('user_name, time_seconds, kills, level, wave, created_at')
      .order('time_seconds', { ascending: false })
      .order('kills', { ascending: false })
      .limit(10);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      rows: (data || []).map(r => ({
        name: r.user_name, time: r.time_seconds, kills: r.kills,
        level: r.level, wave: r.wave, date: r.created_at,
      })),
    });
  }

  if (req.method === 'POST') {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const prev = lastWrite.get(ip);
    if (prev && now - prev < 2000) return res.status(429).json({ error: 'Too fast.' });
    lastWrite.set(ip, now);

    const { name, time, kills, level, wave } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.length > 14)
      return res.status(400).json({ error: 'Invalid name' });
    const ok = v => Number.isInteger(v) && v >= 0;
    if (!ok(time) || !ok(kills) || !ok(level) || !ok(wave))
      return res.status(400).json({ error: 'Invalid stats' });
    if (time >= 18000) return res.status(400).json({ error: 'Time too high' });

    const { data, error } = await supabase
      .from('runs')
      .insert([{ user_name: name.trim(), time_seconds: time, kills, level, wave }])
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      name: data.user_name, time: data.time_seconds, kills: data.kills,
      level: data.level, wave: data.wave, date: data.created_at,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
