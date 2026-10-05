const express = require('express');
const { searchKaraokeVideos } = require('../youtubeApi');
const router = express.Router();

module.exports = (deps) => {
  const { getCachedSongs } = deps;

  router.get('/search', async (req, res) => {
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

  return router;
};
