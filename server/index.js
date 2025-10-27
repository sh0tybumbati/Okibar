require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { searchKaraokeVideos, testApiKey, checkVideoAvailability, batchCheckAvailability } = require('./youtubeApi');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? true
      : "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('build'));

// In-memory storage (replace with database in production)
let globalQueue = [];
let tables = {};
let menuItems = {
  drinks: [],
  food: []
};
let cachedSongs = [];

// API Routes
app.get('/api/queue', (req, res) => {
  res.json(globalQueue);
});

app.post('/api/queue', async (req, res) => {
  const { song, tableNumber } = req.body;
  const queueItem = {
    id: Date.now().toString(),
    ...song,
    tableNumber,
    addedAt: new Date(),
    status: 'queued'
  };
  
  globalQueue.push(queueItem);
  
  // Add to cached songs if not already there with availability check
  const exists = cachedSongs.some(cached => cached.videoId === song.videoId);
  if (!exists) {
    // Check video availability when adding to cache
    let availability = null;
    try {
      availability = await checkVideoAvailability(song.videoId);
    } catch (error) {
      console.log(`⚠️  Availability check failed for ${song.videoId}:`, error.message);
      availability = { playable: true, method: 'error', checkedAt: new Date().toISOString() };
    }

    cachedSongs.unshift({
      id: song.videoId,
      videoId: song.videoId,
      title: song.title,
      thumbnail: song.thumbnail,
      channel: song.channel,
      addedAt: new Date().toISOString(),
      usageCount: 1,
      availability: availability
    });
    // Keep only last 200 songs
    cachedSongs = cachedSongs.slice(0, 200);
    io.emit('cachedSongsUpdated', cachedSongs);
  } else {
    // Update usage count for existing songs
    const songIndex = cachedSongs.findIndex(cached => cached.videoId === song.videoId);
    if (songIndex !== -1) {
      cachedSongs[songIndex].usageCount = (cachedSongs[songIndex].usageCount || 0) + 1;
      cachedSongs[songIndex].lastUsed = new Date().toISOString();
      io.emit('cachedSongsUpdated', cachedSongs);
    }
  }
  
  io.emit('queueUpdated', globalQueue);
  res.json(queueItem);
});

app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  globalQueue = globalQueue.filter(item => item.id !== id);
  io.emit('queueUpdated', globalQueue);
  res.json({ success: true });
});

app.get('/api/tables', (req, res) => {
  res.json(tables);
});

app.put('/api/tables/:tableNumber', (req, res) => {
  const { tableNumber } = req.params;
  tables[tableNumber] = { ...tables[tableNumber], ...req.body };
  io.emit('tablesUpdated', tables);
  res.json(tables[tableNumber]);
});

app.get('/api/menu', (req, res) => {
  res.json(menuItems);
});

app.put('/api/menu', (req, res) => {
  menuItems = req.body;
  io.emit('menuUpdated', menuItems);
  res.json(menuItems);
});

// YouTube search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    console.log('🔍 Search request:', q);
    
    // Try YouTube API first
    try {
      const results = await searchKaraokeVideos(q);
      
      // Enhance results with availability status from cache
      const enhancedResults = results.map(song => {
        const cachedSong = cachedSongs.find(cached => cached.videoId === song.videoId);
        return {
          ...song,
          availability: cachedSong?.availability || null,
          isBlocked: cachedSong?.availability?.playable === false
        };
      });
      
      console.log('✅ YouTube API success, returning', enhancedResults.length, 'results with availability status');
      res.json(enhancedResults);
      return;
    } catch (youtubeError) {
      console.error('❌ YouTube API failed:', youtubeError.message);
      
      // Handle specific API errors
      let errorMessage = 'YouTube search temporarily unavailable';
      if (youtubeError.message === 'YOUTUBE_API_KEY_MISSING') {
        errorMessage = 'YouTube API key not configured';
      } else if (youtubeError.message === 'YOUTUBE_API_QUOTA_EXCEEDED') {
        errorMessage = 'YouTube API quota exceeded. Try again later.';
      } else if (youtubeError.message === 'YOUTUBE_API_INVALID_KEY') {
        errorMessage = 'YouTube API key is invalid';
      }
      
      // Fallback to cached search - include all matching songs with availability status
      const filtered = cachedSongs.filter(song => {
        const matchesQuery = song.title.toLowerCase().includes(q.toLowerCase()) ||
                           song.channel.toLowerCase().includes(q.toLowerCase());
        return matchesQuery;
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
        // Return demo results with helpful message
        const demoResults = [
          {
            id: `demo1-${Date.now()}`,
            videoId: 'dQw4w9WgXcQ',
            title: `${q} - Karaoke Version (Demo)`,
            thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            channel: 'Karaoke Demo'
          }
        ];
        console.log('🎭 Returning demo results');
        res.json({
          results: demoResults,
          demo: true,
          message: `${errorMessage}. Showing demo results. Configure YouTube API for real search.`
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

// Cached songs endpoints
app.get('/api/cached-songs', (req, res) => {
  res.json(cachedSongs);
});

app.get('/api/search-cached', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json([]);
  }
  
  const filtered = cachedSongs.filter(song => {
    const matchesQuery = song.title.toLowerCase().includes(q.toLowerCase()) ||
                       song.channel.toLowerCase().includes(q.toLowerCase());
    return matchesQuery;
  }).slice(0, 10).map(song => ({
    ...song,
    isBlocked: song.availability?.playable === false
  }));
  
  res.json(filtered);
});

// Cache management endpoints
app.delete('/api/cached-songs/:videoId', (req, res) => {
  const { videoId } = req.params;
  const initialLength = cachedSongs.length;
  cachedSongs = cachedSongs.filter(song => song.videoId !== videoId);
  
  if (cachedSongs.length < initialLength) {
    io.emit('cachedSongsUpdated', cachedSongs);
    res.json({ success: true, message: 'Song removed from cache' });
  } else {
    res.status(404).json({ success: false, message: 'Song not found in cache' });
  }
});

app.delete('/api/cached-songs', (req, res) => {
  const { blocked } = req.query;
  const initialLength = cachedSongs.length;
  
  if (blocked === 'true') {
    // Clear only blocked songs
    cachedSongs = cachedSongs.filter(song => 
      !song.availability || song.availability.playable !== false
    );
  } else {
    // Clear all cached songs
    cachedSongs = [];
  }
  
  io.emit('cachedSongsUpdated', cachedSongs);
  res.json({ 
    success: true, 
    cleared: initialLength - cachedSongs.length,
    message: blocked === 'true' ? 'Blocked songs cleared' : 'All cached songs cleared'
  });
});

app.post('/api/cached-songs/:videoId/recheck', async (req, res) => {
  const { videoId } = req.params;
  const songIndex = cachedSongs.findIndex(song => song.videoId === videoId);
  
  if (songIndex === -1) {
    return res.status(404).json({ success: false, message: 'Song not found in cache' });
  }
  
  try {
    const availability = await checkVideoAvailability(videoId);
    cachedSongs[songIndex].availability = availability;
    io.emit('cachedSongsUpdated', cachedSongs);
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
    
    // Update cached songs with new availability data
    let updatedCount = 0;
    Object.entries(results).forEach(([videoId, availability]) => {
      const songIndex = cachedSongs.findIndex(song => song.videoId === videoId);
      if (songIndex !== -1) {
        cachedSongs[songIndex].availability = availability;
        updatedCount++;
      }
    });
    
    io.emit('cachedSongsUpdated', cachedSongs);
    res.json({ success: true, updatedCount, results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Batch recheck failed' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current state to newly connected client
  socket.emit('queueUpdated', globalQueue);
  socket.emit('tablesUpdated', tables);
  socket.emit('menuUpdated', menuItems);
  socket.emit('cachedSongsUpdated', cachedSongs);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve React app for all non-API routes (must be last)
const path = require('path');
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Test YouTube API key on startup
  console.log('🔧 Testing YouTube API configuration...');
  const isApiKeyValid = await testApiKey();
  
  if (isApiKeyValid) {
    console.log('✅ YouTube API is ready for karaoke searches!');
  } else {
    console.log('⚠️  YouTube API not available - using fallback mode');
    console.log('📝 To enable YouTube search:');
    console.log('   1. Get API key from https://console.developers.google.com/');
    console.log('   2. Enable YouTube Data API v3');
    console.log('   3. Set YOUTUBE_API_KEY in your .env file');
  }
});