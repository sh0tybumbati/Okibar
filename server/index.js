require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const socketIo = require('socket.io');
const cors = require('cors');
const { searchKaraokeVideos, testApiKey, checkVideoAvailability, batchCheckAvailability } = require('./youtubeApi');
const { archiveVideo, findArchivedFile, checkYtDlpAvailable, MEDIA_DIR } = require('./archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'build')));
app.use('/media', express.static(MEDIA_DIR));

// --- SHARED STATE ---
// Single source of truth for everything the clients mirror across devices
// (queue, tables, menu, playback, cached songs, settings). Clients push
// changes via the 'state:update' socket event and hydrate from 'state:init'.
const STATE_FILE = process.env.CANTINA_STATE_FILE || path.join(__dirname, 'state.json');
let sharedState = {};
try {
  sharedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  console.log('💾 Restored venue state from', STATE_FILE);
} catch (err) {
  // No saved state yet - start fresh
}

let saveTimer = null;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(STATE_FILE, JSON.stringify(sharedState), (err) => {
      if (err) console.error('Failed to persist state:', err.message);
    });
  }, 1000);
};

const getCachedSongs = () => sharedState.cachedSongs || [];
const setCachedSongs = (songs) => {
  sharedState.cachedSongs = songs;
  io.emit('state:update', { key: 'cachedSongs', value: songs });
  scheduleSave();
};

// --- YOUTUBE SEARCH ---
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    console.log('🔍 Search request:', q);

    try {
      const results = await searchKaraokeVideos(q);

      // Enhance results with availability + archive status from cache.
      const cachedSongs = getCachedSongs();
      const enhancedResults = results.map(song => {
        const cachedSong = cachedSongs.find(cached => cached.videoId === song.videoId);
        return {
          ...song,
          availability: cachedSong?.availability || null,
          isBlocked: cachedSong?.availability?.playable === false,
          archive: cachedSong?.archive || null
        };
      });

      console.log('✅ YouTube API success, returning', enhancedResults.length, 'results');
      res.json(enhancedResults);
      return;
    } catch (youtubeError) {
      console.error('❌ YouTube API failed:', youtubeError.message);

      let errorMessage = 'YouTube search temporarily unavailable';
      if (youtubeError.message === 'YOUTUBE_API_KEY_MISSING') {
        errorMessage = 'YouTube API key not configured';
      } else if (youtubeError.message === 'YOUTUBE_API_QUOTA_EXCEEDED') {
        errorMessage = 'YouTube API quota exceeded. Try again later.';
      } else if (youtubeError.message === 'YOUTUBE_API_INVALID_KEY') {
        errorMessage = 'YouTube API key is invalid';
      }

      // Fallback to cached search
      const filtered = getCachedSongs().filter(song => {
        return song.title.toLowerCase().includes(q.toLowerCase()) ||
               (song.channel || '').toLowerCase().includes(q.toLowerCase());
      }).slice(0, 10).map(song => ({
        ...song,
        isBlocked: song.availability?.playable === false
      }));

      if (filtered.length > 0) {
        console.log('🔄 Returning', filtered.length, 'cached results as fallback');
        res.json({
          results: filtered,
          fallback: true,
          message: `${errorMessage}. Showing cached results.`
        });
      } else {
        res.json({
          results: [],
          fallback: true,
          message: `${errorMessage}. No cached matches found.`
        });
      }
    }
  } catch (error) {
    console.error('💥 Search endpoint error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error. Check server logs.'
    });
  }
});

// --- CACHED SONGS ---
app.get('/api/cached-songs', (req, res) => {
  res.json(getCachedSongs());
});

app.get('/api/search-cached', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json([]);
  }

  const filtered = getCachedSongs().filter(song => {
    return song.title.toLowerCase().includes(q.toLowerCase()) ||
           (song.channel || '').toLowerCase().includes(q.toLowerCase());
  }).slice(0, 10).map(song => ({
    ...song,
    isBlocked: song.availability?.playable === false
  }));

  res.json(filtered);
});

app.delete('/api/cached-songs/:videoId', (req, res) => {
  const { videoId } = req.params;
  const cachedSongs = getCachedSongs();
  const remaining = cachedSongs.filter(song => song.videoId !== videoId);

  if (remaining.length < cachedSongs.length) {
    setCachedSongs(remaining);
    res.json({ success: true, message: 'Song removed from cache' });
  } else {
    res.status(404).json({ success: false, message: 'Song not found in cache' });
  }
});

app.delete('/api/cached-songs', (req, res) => {
  const { blocked } = req.query;
  const cachedSongs = getCachedSongs();

  const remaining = blocked === 'true'
    ? cachedSongs.filter(song => !song.availability || song.availability.playable !== false)
    : [];

  setCachedSongs(remaining);
  res.json({
    success: true,
    cleared: cachedSongs.length - remaining.length,
    message: blocked === 'true' ? 'Blocked songs cleared' : 'All cached songs cleared'
  });
});

app.post('/api/cached-songs/:videoId/recheck', async (req, res) => {
  const { videoId } = req.params;
  const cachedSongs = getCachedSongs();
  const songIndex = cachedSongs.findIndex(song => song.videoId === videoId);

  if (songIndex === -1) {
    return res.status(404).json({ success: false, message: 'Song not found in cache' });
  }

  try {
    const availability = await checkVideoAvailability(videoId);
    const updated = cachedSongs.map(song =>
      song.videoId === videoId ? { ...song, availability } : song
    );
    setCachedSongs(updated);
    res.json({ success: true, availability });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to recheck availability' });
  }
});

app.post('/api/cached-songs/batch-recheck', async (req, res) => {
  const { videoIds } = req.body;

  if (!videoIds || !Array.isArray(videoIds)) {
    return res.status(400).json({ success: false, message: 'videoIds array is required' });
  }

  try {
    const results = await batchCheckAvailability(videoIds);

    let updatedCount = 0;
    const updated = getCachedSongs().map(song => {
      const availability = results[song.videoId];
      if (availability) {
        updatedCount++;
        return { ...song, availability };
      }
      return song;
    });
    setCachedSongs(updated);
    res.json({ success: true, updatedCount, results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Batch recheck failed' });
  }
});

// --- LOCAL ARCHIVE (fallback for videos that fail to embed) ---
// Patches just the `archive` field of a cached song and broadcasts it.
const setArchiveStatus = (videoId, patch) => {
  const cachedSongs = getCachedSongs();
  const idx = cachedSongs.findIndex(s => s.videoId === videoId);
  if (idx === -1) return;
  const updated = [...cachedSongs];
  updated[idx] = { ...updated[idx], archive: { ...updated[idx].archive, ...patch } };
  setCachedSongs(updated);
};

app.post('/api/archive', async (req, res) => {
  const { videoId, title, thumbnail, channel } = req.body;
  if (!videoId) {
    return res.status(400).json({ success: false, message: 'videoId is required' });
  }

  const existingFile = findArchivedFile(videoId);
  if (existingFile) {
    return res.json({ success: true, archive: { status: 'ready', progress: 100, file: existingFile } });
  }

  const cachedSongs = getCachedSongs();
  let song = cachedSongs.find(s => s.videoId === videoId);
  if (!song) {
    song = { videoId, title: title || 'Unknown', thumbnail: thumbnail || '', channel: channel || '' };
    setCachedSongs([song, ...cachedSongs].slice(0, 100));
  }
  if (song.archive && song.archive.status === 'downloading') {
    return res.json({ success: true, archive: song.archive });
  }

  const available = await checkYtDlpAvailable();
  if (!available) {
    setArchiveStatus(videoId, { status: 'failed', progress: 0, reason: 'yt-dlp is not installed on this machine' });
    return res.status(503).json({ success: false, message: 'yt-dlp is not installed on this machine' });
  }

  setArchiveStatus(videoId, { status: 'downloading', progress: 0, reason: null });
  res.json({ success: true, archive: { status: 'downloading', progress: 0 } });

  // Downloading can take a while — respond immediately above, then stream
  // progress and the final result over the existing state:update socket.
  let lastBroadcast = 0;
  archiveVideo(videoId, {
    onProgress: (progress) => {
      if (progress - lastBroadcast < 10 && progress < 99) return;
      lastBroadcast = progress;
      setArchiveStatus(videoId, { status: 'downloading', progress });
    }
  }).then((result) => {
    if (result.success) {
      setArchiveStatus(videoId, { status: 'ready', progress: 100, file: result.file, reason: null });
    } else {
      setArchiveStatus(videoId, { status: 'failed', progress: 0, reason: result.reason });
    }
  });
});

// --- SOCKET SYNC ---
io.on('connection', (socket) => {
  console.log('🚀 Client connected:', socket.id, `(total: ${io.engine.clientsCount})`);

  // Hydrate the new client with the full venue state
  socket.emit('state:init', sharedState);

  // Relay state changes to every other connected device
  socket.on('state:update', (update) => {
    if (!update || typeof update.key !== 'string') return;
    sharedState[update.key] = update.value;
    socket.broadcast.emit('state:update', { key: update.key, value: update.value });
    scheduleSave();
  });

  // Transient presence signal: a device entered a table. Relayed (not stored)
  // so a tablet idling on the landing screen can auto-enter that table.
  socket.on('table:join', (payload) => {
    if (!payload || payload.table == null) return;
    socket.broadcast.emit('table:join', { table: payload.table });
  });

  socket.on('disconnect', () => {
    console.log('🚪 Client disconnected:', socket.id, `(total: ${io.engine.clientsCount})`);
  });
});

// --- LAN HOST (for guest QR codes) ---
// The desktop window loads the console from localhost, but phones must reach
// this machine by its LAN IP. Resolve the first non-internal IPv4 address.
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

app.get('/api/host', (req, res) => {
  res.json({ host: `${getLanIp()}:${PORT}` });
});

// Serve React app for all non-API routes (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Cantina server running on port ${PORT}`);

  console.log('🔧 Testing YouTube API configuration...');
  const isApiKeyValid = await testApiKey();

  if (isApiKeyValid) {
    console.log('✅ YouTube API is ready for karaoke searches!');
  } else {
    console.log('⚠️  YouTube API not available - using cached fallback mode');
  }
});
