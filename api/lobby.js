// Vercel serverless function — SWARM Room Matching & Tick Synchronization
// POST /api/lobby { action: "create" } → { roomId }
// POST /api/lobby { action: "join", roomId, name, skin } → { roomId, players }
// POST /api/lobby { action: "sync", roomId, playerId, state } → { players }

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client if env vars are present
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('Supabase client failed to load:', e.message);
  }
}

// In-Memory fallback store for zero-dependency local runs or offline states
const localLobbies = new Map();

// Periodic GC for dead in-memory lobbies (older than 90 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of localLobbies) {
    if (now - room.lastUpdated > 90000) {
      localLobbies.delete(roomId);
    }
  }
}, 60000).unref?.();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only allowed' });

  const { action, roomId, name, skin, playerId, playerState } = req.body || {};
  
  // GC expired Supabase lobbies older than 3 minutes once in a while
  if (supabase && Math.random() < 0.05) {
    try {
      const expiry = new Date(Date.now() - 180000).toISOString();
      await supabase.from('lobbies').delete().lt('last_updated', expiry);
    } catch (err) {}
  }

  // --- ACTION: CREATE ROOM ---
  if (action === 'create') {
    const newRoomId = String(Math.floor(100000 + Math.random() * 900000));
    
    if (supabase) {
      const { error } = await supabase
        .from('lobbies')
        .insert([{ room_id: newRoomId, players: [], last_updated: new Date().toISOString() }]);
      if (!error) return res.status(200).json({ roomId: newRoomId });
    }
    
    // In-memory fallback
    localLobbies.set(newRoomId, { players: [], lastUpdated: Date.now() });
    return res.status(200).json({ roomId: newRoomId });
  }

  // --- ACTION: JOIN ROOM ---
  if (action === 'join') {
    if (!roomId) return res.status(400).json({ error: 'Missing room ID' });
    const cleanRoomId = String(roomId).trim();
    const newPlayerId = playerId || 'p_' + Math.random().toString(36).substring(2, 9);
    const newPlayer = { id: newPlayerId, name: (name || 'Anonymous').slice(0, 14), skin: skin || 'soldier', ready: false, lastActive: Date.now() };

    if (supabase) {
      const { data, error } = await supabase.from('lobbies').select('players').eq('room_id', cleanRoomId).single();
      if (!error && data) {
        let players = data.players || [];
        // Remove existing duplicates for this playerId
        players = players.filter(p => p.id !== newPlayerId);
        players.push(newPlayer);
        
        const { error: updErr } = await supabase
          .from('lobbies')
          .update({ players, last_updated: new Date().toISOString() })
          .eq('room_id', cleanRoomId);
          
        if (!updErr) {
          return res.status(200).json({ roomId: cleanRoomId, playerId: newPlayerId, players });
        }
      }
    }

    // In-memory fallback
    const room = localLobbies.get(cleanRoomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    
    room.players = room.players.filter(p => p.id !== newPlayerId);
    room.players.push(newPlayer);
    room.lastUpdated = Date.now();
    return res.status(200).json({ roomId: cleanRoomId, playerId: newPlayerId, players: room.players });
  }

  // --- ACTION: SYNC / TICK / READY STATE ---
  if (action === 'sync') {
    if (!roomId || !playerId) return res.status(400).json({ error: 'Missing room or player credentials' });
    const cleanRoomId = String(roomId).trim();
    const cleanPlayerId = String(playerId).trim();
    const now = Date.now();

    if (supabase) {
      const { data, error } = await supabase.from('lobbies').select('players').eq('room_id', cleanRoomId).single();
      if (!error && data) {
        let players = data.players || [];
        let updated = false;

        // Clean out inactive players (> 8 seconds) to prevent ghost peers
        players = players.filter(p => p.id === cleanPlayerId || (now - (p.lastActive || 0) < 8000));

        players = players.map(p => {
          if (p.id === cleanPlayerId) {
            updated = true;
            // Update active variables and ready indicators
            return { ...p, ...playerState, lastActive: now };
          }
          return p;
        });

        // If player was pruned or joined late
        if (!updated && playerState) {
          players.push({ id: cleanPlayerId, lastActive: now, ...playerState });
        }

        await supabase
          .from('lobbies')
          .update({ players, last_updated: new Date().toISOString() })
          .eq('room_id', cleanRoomId);

        return res.status(200).json({ players: players.filter(p => p.id !== cleanPlayerId) });
      }
    }

    // In-memory fallback
    const room = localLobbies.get(cleanRoomId);
    if (!room) return res.status(404).json({ error: 'Room expired or closed' });

    room.lastUpdated = now;
    // Clean dead members
    room.players = room.players.filter(p => p.id === cleanPlayerId || (now - (p.lastActive || 0) < 8000));

    let updated = false;
    room.players = room.players.map(p => {
      if (p.id === cleanPlayerId) {
        updated = true;
        return { ...p, ...playerState, lastActive: now };
      }
      return p;
    });

    if (!updated && playerState) {
      room.players.push({ id: cleanPlayerId, lastActive: now, ...playerState });
    }

    return res.status(200).json({ players: room.players.filter(p => p.id !== cleanPlayerId) });
  }

  return res.status(400).json({ error: 'Invalid action parameter' });
}
