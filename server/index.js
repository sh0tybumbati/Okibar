require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const socketIo = require('socket.io');
const cors = require('cors');
const { searchKaraokeVideos, testApiKey, checkVideoAvailability, batchCheckAvailability } = require('./youtubeApi');
const { archiveVideo, findArchivedFile, checkYtDlpAvailable, enforceMediaQuota, VIDEO_ID_REGEX, MEDIA_DIR } = require('./archiver');

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
  // state.json missing or corrupt — try the backup
  const backupFile = STATE_FILE + '.bak';
  try {
    sharedState = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    console.log('💾 Restored venue state from backup', backupFile);
  } catch (_) {
    console.log('🆕 No saved state found — starting fresh');
  }
}

let saveTimer = null;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFile(tmpFile, JSON.stringify(sharedState, null, 2), (err) => {
      if (err) return console.error('Failed to write temp state:', err.message);
      fs.rename(tmpFile, STATE_FILE, (renameErr) => {
        if (renameErr) console.error('Failed to rename state file:', renameErr.message);
      });
    });
  }, 1000);
};

const getCachedSongs = () => sharedState.cachedSongs || [];
const setCachedSongs = (songs) => {
  sharedState.cachedSongs = songs;
  io.emit('state:update', { key: 'cachedSongs', value: songs });
  scheduleSave();
};

// --- REST API ROUTES ---
app.use('/api', require('./routes/search')({ getCachedSongs, setCachedSongs }));
app.use('/api', require('./routes/cachedSongs')({ getCachedSongs, setCachedSongs }));
app.use('/api', require('./routes/archive')({ getCachedSongs, setCachedSongs }));

// --- STAFF AUTH ---
// Keys that require staff PIN to modify
const crypto = require('crypto');
const PIN_SALT = 'okibar::pin::v1';
const hashPin = (pin) => {
  // Mirror the frontend's synchronous SHA-256 hash with the same salt.
  // The stored staffPin in sharedState is already a 64-char hex hash.
  return crypto.createHash('sha256').update(`${PIN_SALT}${pin}`).digest('hex');
};

const PROTECTED_KEYS = new Set([
  'staffPin', 'tables', 'tableList', 'menuItems', 'theme', 'simpleMode',
  'cachedSongs', 'venueName', 'tvLayoutMode', 'songPrice', 'maxSongsPerTable',
  'currency', 'qrPosition', 'guestsCanReorder'
]);

const ALLOWED_KEYS = new Set([
  'globalQueue', 'currentSong', 'isPlaying', 'pendingOrders',
  'groupHistory', 'currentSongStartedAt',
  ...PROTECTED_KEYS
]);

// --- SOCKET SYNC ---
io.on('connection', (socket) => {
  console.log('🚀 Client connected:', socket.id, `(total: ${io.engine.clientsCount})`);

  // Hydrate the new client with the full venue state
  socket.emit('state:init', sharedState);

  // Relay state changes to every other connected device
  socket.on('state:update', (update) => {
    if (!update || typeof update.key !== 'string') return;
    if (!ALLOWED_KEYS.has(update.key)) return; // reject unknown keys

    if (PROTECTED_KEYS.has(update.key)) {
      // Staff PIN required for protected keys
      const storedPin = sharedState.staffPin;
      if (storedPin && typeof storedPin === 'string' && storedPin.length === 64) {
        // PIN is set — verify the provided pin matches
        if (!update.pin || hashPin(update.pin) !== storedPin) {
          socket.emit('state:error', { key: update.key, error: 'Unauthorized: staff PIN required' });
          return;
        }
      }
      // If no PIN is set yet (empty or not a hash), allow the update
      // (this handles initial setup where staffPin hasn't been configured)
    }

    sharedState[update.key] = update.value;
    socket.broadcast.emit('state:update', { key: update.key, value: update.value });
    scheduleSave();
  });

  // --- ACTION-BASED MUTATIONS ---
  // These apply mutations atomically on the server to prevent race conditions
  // when multiple clients modify the same state concurrently.

  socket.on('queue:add', ({ song, pin }) => {
    if (!song || !song.videoId) return;
    const entry = {
      ...song,
      id: song.id || (Date.now() + Math.random()),
      addedAt: song.addedAt || new Date().toLocaleTimeString()
    };
    if (!sharedState.globalQueue) sharedState.globalQueue = [];
    sharedState.globalQueue.push(entry);
    io.emit('state:update', { key: 'globalQueue', value: sharedState.globalQueue });
    scheduleSave();
  });

  socket.on('queue:remove', ({ songId, pin }) => {
    if (!sharedState.globalQueue) return;
    sharedState.globalQueue = sharedState.globalQueue.filter(s => s.id !== songId);
    io.emit('state:update', { key: 'globalQueue', value: sharedState.globalQueue });
    scheduleSave();
  });

  socket.on('queue:reorder', ({ fromIndex, toIndex, pin }) => {
    if (!sharedState.globalQueue) return;
    if (fromIndex == null || toIndex == null) return;
    const queue = [...sharedState.globalQueue];
    if (fromIndex < 0 || fromIndex >= queue.length) return;
    const clampedTo = Math.max(0, Math.min(toIndex, queue.length - 1));
    const [moved] = queue.splice(fromIndex, 1);
    queue.splice(clampedTo, 0, moved);
    sharedState.globalQueue = queue;
    io.emit('state:update', { key: 'globalQueue', value: sharedState.globalQueue });
    scheduleSave();
  });

  socket.on('queue:clear', ({ pin }) => {
    // Protected action — require staff PIN
    const storedPin = sharedState.staffPin;
    if (storedPin && typeof storedPin === 'string' && storedPin.length === 64) {
      if (!pin || hashPin(pin) !== storedPin) {
        socket.emit('state:error', { key: 'globalQueue', error: 'Unauthorized' });
        return;
      }
    }
    sharedState.globalQueue = [];
    io.emit('state:update', { key: 'globalQueue', value: [] });
    scheduleSave();
  });

  socket.on('queue:playNext', ({ pin }) => {
    if (!sharedState.globalQueue) sharedState.globalQueue = [];
    if (sharedState.globalQueue.length > 0) {
      const next = sharedState.globalQueue.shift();
      sharedState.currentSong = next;
      sharedState.currentSongStartedAt = Date.now();
      sharedState.isPlaying = true;
    } else {
      sharedState.currentSong = null;
      sharedState.currentSongStartedAt = null;
      sharedState.isPlaying = false;
    }
    io.emit('state:update', { key: 'globalQueue', value: sharedState.globalQueue });
    io.emit('state:update', { key: 'currentSong', value: sharedState.currentSong });
    io.emit('state:update', { key: 'currentSongStartedAt', value: sharedState.currentSongStartedAt });
    io.emit('state:update', { key: 'isPlaying', value: sharedState.isPlaying });
    scheduleSave();
  });

  socket.on('order:submit', ({ tableNumber, orders }) => {
    if (tableNumber == null || !Array.isArray(orders)) return;
    if (!sharedState.pendingOrders) sharedState.pendingOrders = {};
    if (!sharedState.pendingOrders[tableNumber]) sharedState.pendingOrders[tableNumber] = [];
    sharedState.pendingOrders[tableNumber].push(...orders);
    io.emit('state:update', { key: 'pendingOrders', value: sharedState.pendingOrders });
    scheduleSave();
  });

  socket.on('order:cancel', ({ tableNumber, orderId }) => {
    if (tableNumber == null || !sharedState.pendingOrders?.[tableNumber]) return;
    sharedState.pendingOrders[tableNumber] = sharedState.pendingOrders[tableNumber].filter(o => o.id !== orderId);
    io.emit('state:update', { key: 'pendingOrders', value: sharedState.pendingOrders });
    scheduleSave();
  });

  socket.on('order:clear', ({ tableNumber }) => {
    if (tableNumber == null) return;
    if (!sharedState.pendingOrders) sharedState.pendingOrders = {};
    sharedState.pendingOrders[tableNumber] = [];
    io.emit('state:update', { key: 'pendingOrders', value: sharedState.pendingOrders });
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
const VIRTUAL_ADAPTER_PREFIXES = ['docker', 'br-', 'veth', 'tun', 'vmnet', 'virbr', 'vboxnet'];

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (VIRTUAL_ADAPTER_PREFIXES.some(p => name.startsWith(p))) continue;
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

  // Enforce media storage quota on startup
  enforceMediaQuota().catch(err => console.error('Media quota check failed:', err.message));
});
