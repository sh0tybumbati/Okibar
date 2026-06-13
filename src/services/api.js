// In dev the CRA client runs on :3000 while the server runs on :5000 (use the
// page's hostname so other devices on the LAN work too). In production the
// server serves the build, so a relative path is always correct.
export const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (window.location.port === '3000'
    ? `http://${window.location.hostname}:5000/api`
    : '/api');

const apiService = {
  // YouTube search
  searchVideos: async (query) => {
    const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    // Handle response format with fallback/demo results
    if (data.results) {
      if (data.fallback || data.demo) {
        console.warn('⚠️ YouTube API:', data.message);
      }
      return data.results;
    }

    // Direct array format
    return data;
  },

  // Search cached songs
  searchCachedVideos: async (query) => {
    const response = await fetch(`${API_BASE_URL}/search-cached?q=${encodeURIComponent(query)}`);
    return response.json();
  },

  // Get all cached songs
  getCachedSongs: async () => {
    const response = await fetch(`${API_BASE_URL}/cached-songs`);
    return response.json();
  }
};

export default apiService;
