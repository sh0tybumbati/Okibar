const { google } = require('googleapis');

// Validate API key on startup
if (!process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
  console.warn('⚠️  WARNING: YouTube API key not configured. Set YOUTUBE_API_KEY in your .env file.');
  console.warn('📖 Instructions: https://console.developers.google.com/');
  console.warn('🔄 Karaoke search will fall back to cached results only.');
} else {
  console.log('🔑 YouTube API key loaded:', process.env.YOUTUBE_API_KEY.substring(0, 15) + '...');
}

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const searchKaraokeVideos = async (query, maxResults = 10) => {
  // Check if API key is configured
  if (!process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
    throw new Error('YOUTUBE_API_KEY_MISSING');
  }

  try {
    console.log(`🔍 Searching YouTube for: "${query}"`);
    
    const response = await youtube.search.list({
      part: 'snippet',
      q: `${query} karaoke`,
      type: 'video',
      maxResults: maxResults,
      order: 'relevance',
      videoCategoryId: '10', // Music category
      safeSearch: 'strict',
      fields: 'items(id/videoId,snippet(title,channelTitle,thumbnails/medium/url,publishedAt))'
    });

    const results = response.data.items.map(item => ({
      id: item.id.videoId,
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || 'https://img.youtube.com/vi/' + item.id.videoId + '/mqdefault.jpg',
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));

    console.log(`✅ Found ${results.length} karaoke videos for "${query}"`);
    return results;

  } catch (error) {
    console.error('❌ YouTube API Error:', {
      message: error.message,
      code: error.code,
      query: query
    });

    // Handle specific error types
    if (error.code === 403) {
      if (error.message && error.message.includes('quota')) {
        throw new Error('YOUTUBE_API_QUOTA_EXCEEDED');
      } else {
        throw new Error('YOUTUBE_API_INVALID_KEY');
      }
    } else if (error.code === 400) {
      throw new Error('YOUTUBE_API_INVALID_REQUEST');
    } else if (error.code === 401) {
      throw new Error('YOUTUBE_API_INVALID_KEY');
    }

    throw error;
  }
};

// Test API key validity
const testApiKey = async () => {
  if (!process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
    console.log('❌ No API key configured');
    return false;
  }

  try {
    console.log('🔍 Testing YouTube API key:', process.env.YOUTUBE_API_KEY.substring(0, 10) + '...');
    
    const response = await youtube.search.list({
      part: 'snippet',
      q: 'test',
      type: 'video',
      maxResults: 1
    });
    
    console.log('✅ YouTube API key is valid and working!');
    console.log(`📊 Test search returned ${response.data.items.length} result(s)`);
    return true;
  } catch (error) {
    console.error('❌ YouTube API key validation failed:');
    console.error('   Error Code:', error.code);
    console.error('   Error Message:', error.message);
    
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Response Data:', error.response.data);
    }
    
    // Provide specific guidance based on error type
    if (error.code === 400) {
      console.error('💡 This usually means:');
      console.error('   - The API key format is incorrect');
      console.error('   - YouTube Data API v3 is not enabled for this project');
    } else if (error.code === 401) {
      console.error('💡 This usually means:');
      console.error('   - The API key is invalid or has been regenerated');
      console.error('   - Check your Google Cloud Console credentials');
    } else if (error.code === 403) {
      console.error('💡 This usually means:');
      console.error('   - The API key has restrictions that block this request');
      console.error('   - The YouTube Data API v3 is not enabled');
      console.error('   - You may have exceeded your quota');
    }
    
    return false;
  }
};

// Check if a video is embeddable/playable
const checkVideoAvailability = async (videoId) => {
  try {
    console.log(`🔍 Checking availability for video: ${videoId}`);
    
    // Method 1: Use YouTube oEmbed API to check if embedding is allowed
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    try {
      const oEmbedResponse = await fetch(oEmbedUrl);
      if (oEmbedResponse.ok) {
        const oEmbedData = await oEmbedResponse.json();
        console.log(`✅ Video ${videoId} is embeddable via oEmbed`);
        return {
          playable: true,
          method: 'oembed',
          checkedAt: new Date().toISOString(),
          title: oEmbedData.title || 'Unknown'
        };
      } else if (oEmbedResponse.status === 401 || oEmbedResponse.status === 403) {
        console.log(`❌ Video ${videoId} embedding blocked (oEmbed ${oEmbedResponse.status})`);
        return {
          playable: false,
          method: 'oembed',
          checkedAt: new Date().toISOString(),
          blockedReason: `Embedding disabled (HTTP ${oEmbedResponse.status})`
        };
      }
    } catch (oEmbedError) {
      console.log(`⚠️  oEmbed check failed for ${videoId}:`, oEmbedError.message);
    }

    // Method 2: Use YouTube Data API to get video details and check embeddable status
    if (process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_API_KEY !== 'YOUR_YOUTUBE_API_KEY_HERE') {
      try {
        const response = await youtube.videos.list({
          part: 'status,snippet',
          id: videoId,
          fields: 'items(status/embeddable,snippet/title)'
        });

        if (response.data.items && response.data.items.length > 0) {
          const video = response.data.items[0];
          const isEmbeddable = video.status?.embeddable !== false;
          
          console.log(`${isEmbeddable ? '✅' : '❌'} Video ${videoId} embeddable status: ${isEmbeddable}`);
          
          return {
            playable: isEmbeddable,
            method: 'youtube_api',
            checkedAt: new Date().toISOString(),
            title: video.snippet?.title || 'Unknown',
            blockedReason: isEmbeddable ? null : 'Embedding disabled by video owner'
          };
        }
      } catch (apiError) {
        console.log(`⚠️  YouTube API availability check failed for ${videoId}:`, apiError.message);
      }
    }

    // Method 3: Default to playable with unknown status if all checks fail
    console.log(`❓ Could not determine availability for ${videoId}, assuming playable`);
    return {
      playable: true,
      method: 'unknown',
      checkedAt: new Date().toISOString(),
      blockedReason: null,
      needsRecheck: true
    };

  } catch (error) {
    console.error(`❌ Error checking video availability for ${videoId}:`, error.message);
    return {
      playable: true, // Default to playable to avoid breaking the app
      method: 'error',
      checkedAt: new Date().toISOString(),
      blockedReason: `Check failed: ${error.message}`,
      needsRecheck: true
    };
  }
};

// Batch check multiple videos for availability
const batchCheckAvailability = async (videoIds) => {
  console.log(`🔄 Batch checking availability for ${videoIds.length} videos`);
  
  const results = {};
  const batchSize = 5; // Check 5 videos at a time to avoid rate limits
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (videoId) => {
      const result = await checkVideoAvailability(videoId);
      return { videoId, result };
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((promiseResult) => {
      if (promiseResult.status === 'fulfilled') {
        const { videoId, result } = promiseResult.value;
        results[videoId] = result;
      } else {
        console.error('Batch check failed:', promiseResult.reason);
      }
    });
    
    // Small delay between batches to be respectful to APIs
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
};

module.exports = {
  searchKaraokeVideos,
  testApiKey,
  checkVideoAvailability,
  batchCheckAvailability
};