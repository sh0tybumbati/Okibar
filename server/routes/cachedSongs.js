const express = require('express');
const { checkVideoAvailability, batchCheckAvailability } = require('../youtubeApi');
const { VIDEO_ID_REGEX } = require('../archiver');
const router = express.Router();

module.exports = (deps) => {
  const { getCachedSongs, setCachedSongs } = deps;

  router.get('/cached-songs', (req, res) => {
    res.json(getCachedSongs());
  });

  router.get('/search-cached', (req, res) => {
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

  router.delete('/cached-songs/:videoId', (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID_REGEX.test(videoId)) {
      return res.status(400).json({ success: false, message: 'Invalid video ID' });
    }
    const cachedSongs = getCachedSongs();
    const remaining = cachedSongs.filter(song => song.videoId !== videoId);

    if (remaining.length < cachedSongs.length) {
      setCachedSongs(remaining);
      res.json({ success: true, message: 'Song removed from cache' });
    } else {
      res.status(404).json({ success: false, message: 'Song not found in cache' });
    }
  });

  router.delete('/cached-songs', (req, res) => {
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

  router.post('/cached-songs/:videoId/recheck', async (req, res) => {
    const { videoId } = req.params;
    if (!VIDEO_ID_REGEX.test(videoId)) {
      return res.status(400).json({ success: false, message: 'Invalid video ID' });
    }
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

  router.post('/cached-songs/batch-recheck', async (req, res) => {
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

  return router;
};
