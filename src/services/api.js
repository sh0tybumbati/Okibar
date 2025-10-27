const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const apiService = {
  // Queue operations
  getQueue: async () => {
    const response = await fetch(`${API_BASE_URL}/queue`);
    return response.json();
  },
  
  addToQueue: async (song, tableNumber) => {
    const response = await fetch(`${API_BASE_URL}/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ song, tableNumber }),
    });
    return response.json();
  },
  
  removeFromQueue: async (songId) => {
    const response = await fetch(`${API_BASE_URL}/queue/${songId}`, {
      method: 'DELETE',
    });
    return response.json();
  },
  
  // YouTube search
  searchVideos: async (query) => {
    const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    // Handle new response format with fallback/demo results
    if (data.results) {
      // Show user-friendly message for fallbacks
      if (data.fallback || data.demo) {
        console.warn('⚠️ YouTube API:', data.message);
        // You could show this message in the UI if needed
      }
      return data.results;
    }
    
    // Legacy format - direct array
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
  },
  
  // Table operations
  getTables: async () => {
    const response = await fetch(`${API_BASE_URL}/tables`);
    return response.json();
  },
  
  updateTable: async (tableNumber, tableData) => {
    const response = await fetch(`${API_BASE_URL}/tables/${tableNumber}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tableData),
    });
    return response.json();
  },
  
  // Menu operations
  getMenu: async () => {
    const response = await fetch(`${API_BASE_URL}/menu`);
    return response.json();
  },
  
  updateMenu: async (menuData) => {
    const response = await fetch(`${API_BASE_URL}/menu`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(menuData),
    });
    return response.json();
  }
};

export default apiService;