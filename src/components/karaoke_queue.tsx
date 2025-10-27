import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Youtube, Monitor, Smartphone, Volume2, VolumeX, Search, Clock, Users, Settings, QrCode, DollarSign, CheckCircle, Edit3, Plus, Minus, Database, X, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import apiService from '../services/api';

const KaraokeBarApp = () => {
  // Global state
  const [mode, setMode] = useState('table'); // 'table', 'tv', 'bar'
  const [currentTable, setCurrentTable] = useState(1);
  const [tablePage, setTablePage] = useState('karaoke'); // 'karaoke', 'menu'
  const [barPage, setBarPage] = useState('queue'); // 'queue', 'orders', 'guests'
  const [showTableManager, setShowTableManager] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [showCacheViewer, setShowCacheViewer] = useState(false);
  const [cacheSearchQuery, setCacheSearchQuery] = useState('');
  const [isRecheckingCache, setIsRecheckingCache] = useState(false);
  const [currency, setCurrency] = useState('$');
  
  // Song queue and playback
  const [globalQueue, setGlobalQueue] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Cached songs database - songs that have been successfully queued
  const [cachedSongs, setCachedSongs] = useState(() => {
    const stored = localStorage.getItem('okibar-cached-songs');
    if (stored) {
      return JSON.parse(stored);
    }
    
    // Initial seed songs for fresh installations
    const seedSongs = [
      {
        id: 'seed1',
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up - Karaoke Version',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        channel: 'Karaoke Mugen'
      },
      {
        id: 'seed2',
        videoId: 'fJ9rUzIMcZQ',
        title: 'Bohemian Rhapsody - Karaoke Version',
        thumbnail: 'https://img.youtube.com/vi/fJ9rUzIMcZQ/mqdefault.jpg',
        channel: 'Sing King Karaoke'
      },
      {
        id: 'seed3',
        videoId: '9bZkp7q19f0',
        title: 'Sweet Caroline - Karaoke Version',
        thumbnail: 'https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg',
        channel: 'KaraFun Karaoke'
      },
      {
        id: 'seed4',
        videoId: 'kJQP7kiw5Fk',
        title: 'Despacito - Karaoke Version',
        thumbnail: 'https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg',
        channel: 'Sing King Karaoke'
      }
    ];
    
    localStorage.setItem('okibar-cached-songs', JSON.stringify(seedSongs));
    return seedSongs;
  });
  
  // Bar settings
  const [songPrice, setSongPrice] = useState(2.00);
  const [maxSongsPerTable, setMaxSongsPerTable] = useState(3);
  
  // Table list configuration - define as constant first
  const initialTableList = [
    { number: 1, maxOccupancy: 4 },
    { number: 2, maxOccupancy: 2 },
    { number: 3, maxOccupancy: 6 }
  ];
  
  const [tableList, setTableList] = useState(initialTableList);
  
  // Tables and groups - Initialize dynamically based on tableList
  const initializeTables = (tableList) => {
    const newTables = {};
    tableList.forEach(table => {
      newTables[table.number] = {
        groupName: '',
        guestCount: Math.min(4, table.maxOccupancy),
        orders: [],
        songCount: 0,
        totalSpent: 0,
        checkRequested: false,
        isOccupied: false,
        maxOccupancy: table.maxOccupancy
      };
    });
    return newTables;
  };

  const [tables, setTables] = useState(() => initializeTables(initialTableList));
  
  // Pending orders (unconfirmed)
  const [pendingOrders, setPendingOrders] = useState({});
  
  // Edit mode for menu management
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Group history
  const [groupHistory, setGroupHistory] = useState({});
  
  // Menu items - now editable with stock status
  const [menuItems, setMenuItems] = useState({
    drinks: [
      { id: 'beer', name: 'Draft Beer', price: 5.00, category: 'Alcohol', inStock: true },
      { id: 'wine', name: 'House Wine', price: 7.00, category: 'Alcohol', inStock: true },
      { id: 'cocktail', name: 'Mixed Cocktail', price: 9.00, category: 'Alcohol', inStock: true },
      { id: 'soda', name: 'Soft Drink', price: 3.00, category: 'Non-Alcohol', inStock: true },
      { id: 'water', name: 'Bottled Water', price: 2.00, category: 'Non-Alcohol', inStock: true },
      { id: 'coffee', name: 'Coffee', price: 3.50, category: 'Non-Alcohol', inStock: true }
    ],
    food: [
      { id: 'wings', name: 'Buffalo Wings (12pc)', price: 14.00, category: 'Appetizers', inStock: true },
      { id: 'nachos', name: 'Loaded Nachos', price: 12.00, category: 'Appetizers', inStock: true },
      { id: 'burger', name: 'Classic Burger', price: 15.00, category: 'Mains', inStock: true },
      { id: 'pizza', name: 'Personal Pizza', price: 13.00, category: 'Mains', inStock: true },
      { id: 'fries', name: 'Seasoned Fries', price: 8.00, category: 'Sides', inStock: true },
      { id: 'salad', name: 'House Salad', price: 10.00, category: 'Mains', inStock: true }
    ]
  });
  
  const playerRef = useRef(null);
  
  // Cache management functions
  const addSongToCache = (song) => {
    setCachedSongs(prev => {
      // Check if song already exists
      const exists = prev.some(cached => cached.videoId === song.videoId);
      if (exists) return prev;
      
      // Add new song and keep only last 100 songs
      const updated = [song, ...prev].slice(0, 100);
      localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
      return updated;
    });
  };
  
  // Search cached songs by query
  const searchCachedSongs = (query) => {
    return cachedSongs.filter(song => 
      song.title.toLowerCase().includes(query.toLowerCase()) ||
      song.channel.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10); // Return top 10 matches
  };

  // Sync cached songs with server on component mount
  useEffect(() => {
    const fetchCachedSongs = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs`);
        if (response.ok) {
          const serverCachedSongs = await response.json();
          if (serverCachedSongs.length > 0) {
            setCachedSongs(serverCachedSongs);
            localStorage.setItem('okibar-cached-songs', JSON.stringify(serverCachedSongs));
          }
        }
      } catch (error) {
        console.log('Could not sync with server cache, using local cache');
      }
    };
    
    fetchCachedSongs();
  }, []);

  // YouTube API search with fallback to cached songs
  const searchKaraokeVideos = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await apiService.searchVideos(query);
      setSearchResults(results);
    } catch (error) {
      console.error('YouTube API failed, searching cached songs:', error);
      // Fallback to cached songs when API fails
      try {
        const cachedResults = await apiService.searchCachedVideos(query);
        if (cachedResults.length > 0) {
          console.log(`Found ${cachedResults.length} cached songs for "${query}"`);
          setSearchResults(cachedResults);
        } else {
          // Also try local cache as last resort
          const localResults = searchCachedSongs(query);
          setSearchResults(localResults);
          if (localResults.length === 0) {
            console.log('No cached songs found. Try searching for songs that have been queued before.');
          }
        }
      } catch (cacheError) {
        console.error('Cache search also failed:', cacheError);
        const localResults = searchCachedSongs(query);
        setSearchResults(localResults);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Cache management functions
  const recheckSongAvailability = async (videoId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs/${videoId}/recheck`, {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        // Update local cached songs with new availability
        setCachedSongs(prev => {
          const updated = prev.map(song => 
            song.videoId === videoId ? { ...song, availability: result.availability } : song
          );
          localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to recheck song availability:', error);
    }
  };

  const batchRecheckAvailability = async () => {
    setIsRecheckingCache(true);
    try {
      const videoIds = cachedSongs.map(song => song.videoId);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs/batch-recheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds })
      });
      const result = await response.json();
      if (result.success) {
        // Update local cached songs with new availability data
        setCachedSongs(prev => {
          const updated = prev.map(song => {
            const newAvailability = result.results[song.videoId];
            return newAvailability ? { ...song, availability: newAvailability } : song;
          });
          localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
          return updated;
        });
        alert(`Successfully rechecked ${result.updatedCount} songs`);
      }
    } catch (error) {
      console.error('Failed to batch recheck availability:', error);
      alert('Failed to recheck songs. Please try again.');
    } finally {
      setIsRecheckingCache(false);
    }
  };

  const clearBlockedSongs = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs?blocked=true`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.success) {
        // Update local cache to remove blocked songs
        setCachedSongs(prev => {
          const updated = prev.filter(song => 
            !song.availability || song.availability.playable !== false
          );
          localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
          return updated;
        });
        alert(`Cleared ${result.cleared} blocked songs from cache`);
      }
    } catch (error) {
      console.error('Failed to clear blocked songs:', error);
      alert('Failed to clear blocked songs. Please try again.');
    }
  };

  // Filter cached songs based on search query
  const getFilteredCachedSongs = () => {
    if (!cacheSearchQuery) return cachedSongs;
    
    const query = cacheSearchQuery.toLowerCase();
    return cachedSongs.filter(song => 
      song.title.toLowerCase().includes(query) ||
      song.channel.toLowerCase().includes(query)
    );
  };

  // Periodic re-check system for cached songs
  const schedulePeriodicRecheck = () => {
    const RECHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    
    const recheckOldSongs = async () => {
      const now = new Date();
      const oldSongs = cachedSongs.filter(song => {
        if (!song.availability || !song.availability.checkedAt) return true;
        const checkedAt = new Date(song.availability.checkedAt);
        const hoursSinceCheck = (now - checkedAt) / (1000 * 60 * 60);
        return hoursSinceCheck > 24; // Recheck songs older than 24 hours
      });
      
      if (oldSongs.length > 0) {
        console.log(`🔄 Automatically rechecking ${oldSongs.length} cached songs`);
        try {
          const videoIds = oldSongs.map(song => song.videoId);
          const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs/batch-recheck`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds })
          });
          const result = await response.json();
          if (result.success) {
            setCachedSongs(prev => {
              const updated = prev.map(song => {
                const newAvailability = result.results[song.videoId];
                return newAvailability ? { ...song, availability: newAvailability } : song;
              });
              localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
              return updated;
            });
            console.log(`✅ Automatic recheck complete: ${result.updatedCount} songs updated`);
          }
        } catch (error) {
          console.error('❌ Automatic recheck failed:', error);
        }
      }
    };
    
    // Run initial check after 1 minute, then every 24 hours
    setTimeout(recheckOldSongs, 60 * 1000);
    setInterval(recheckOldSongs, RECHECK_INTERVAL);
  };

  // Start periodic recheck system when component mounts
  useEffect(() => {
    schedulePeriodicRecheck();
  }, []);

  // Add menu item to pending orders
  const addToPendingOrders = (item) => {
    const transaction = {
      id: Date.now(),
      type: 'menu',
      item: item.name,
      price: item.price,
      timestamp: new Date().toISOString(),
      tableNumber: currentTable,
      category: item.category
    };

    setPendingOrders(prev => ({
      ...prev,
      [currentTable]: [...(prev[currentTable] || []), transaction]
    }));
  };

  // Confirm pending orders
  const confirmOrders = () => {
    const tablePendingOrders = pendingOrders[currentTable] || [];
    if (tablePendingOrders.length === 0) return;

    const table = tables[currentTable];
    const totalPendingAmount = tablePendingOrders.reduce((sum, order) => sum + order.price, 0);
    const songOrders = tablePendingOrders.filter(order => order.type === 'song');

    // Add songs to the global queue
    const newQueueItems = songOrders.map(songOrder => ({
      id: Date.now() + Math.random(), // Ensure unique ID
      videoId: songOrder.videoId,
      url: `https://www.youtube.com/watch?v=${songOrder.videoId}`,
      title: songOrder.item,
      thumbnail: songOrder.thumbnail,
      tableNumber: currentTable,
      groupName: table.groupName || `Table of ${table.guestCount}`,
      addedAt: new Date().toLocaleTimeString(),
      price: songOrder.price
    }));

    setGlobalQueue(prev => [...prev, ...newQueueItems]);

    // Move pending orders to confirmed orders
    setTables(prev => ({
      ...prev,
      [currentTable]: {
        ...prev[currentTable],
        orders: [...prev[currentTable].orders, ...tablePendingOrders],
        songCount: prev[currentTable].songCount + songOrders.length,
        totalSpent: prev[currentTable].totalSpent + totalPendingAmount
      }
    }));

    // Clear pending orders for this table
    setPendingOrders(prev => ({
      ...prev,
      [currentTable]: []
    }));
  };

  // Clear pending orders
  const clearPendingOrders = () => {
    setPendingOrders(prev => ({
      ...prev,
      [currentTable]: []
    }));
  };

  // Request check
  const requestCheck = () => {
    setTables(prev => ({
      ...prev,
      [currentTable]: {
        ...prev[currentTable],
        checkRequested: true
      }
    }));
    alert('Check requested! Your server will be with you shortly.');
  };
  const reserveSong = (searchResult) => {
    const table = tables[currentTable];
    
    // Check song limit (including pending songs)
    const confirmedSongs = table.songCount;
    const pendingSongs = (pendingOrders[currentTable] || []).filter(order => order.type === 'song').length;
    const totalSongs = confirmedSongs + pendingSongs;
    
    if (totalSongs >= maxSongsPerTable) {
      alert(`Sorry! Table ${currentTable} has reached the ${maxSongsPerTable} song limit (including pending orders).`);
      return;
    }

    const transaction = {
      id: Date.now(),
      type: 'song',
      item: searchResult.title,
      price: songPrice,
      timestamp: new Date().toISOString(),
      tableNumber: currentTable,
      category: 'Song',
      videoId: searchResult.videoId,
      thumbnail: searchResult.thumbnail,
      availability: searchResult.availability,
      isBlocked: searchResult.isBlocked
    };

    // Add to pending orders instead of directly confirming
    setPendingOrders(prev => ({
      ...prev,
      [currentTable]: [...(prev[currentTable] || []), transaction]
    }));
    
    // Add song to cache for offline search
    addSongToCache(searchResult);
  };

  // Play next song
  const playNext = () => {
    if (globalQueue.length > 0) {
      setCurrentSong(globalQueue[0]);
      setIsPlaying(true);
      setGlobalQueue(prev => prev.slice(1));
    } else {
      setCurrentSong(null);
      setIsPlaying(false);
    }
  };

  // Update table list
  const updateTables = (newTableList) => {
    setTableList(newTableList);
    const newTables = initializeTables(newTableList);
    // Preserve existing data for tables that still exist
    Object.keys(tables).forEach(tableNum => {
      if (newTableList.some(t => t.number === parseInt(tableNum))) {
        const tableConfig = newTableList.find(t => t.number === parseInt(tableNum));
        newTables[tableNum] = {
          ...tables[tableNum],
          maxOccupancy: tableConfig.maxOccupancy
        };
      }
    });
    setTables(newTables);
  };

  // Add new table
  const addTable = () => {
    const newTableNum = Math.max(...tableList.map(t => t.number), 0) + 1;
    const newTable = { number: newTableNum, maxOccupancy: 4 };
    updateTables([...tableList, newTable]);
  };

  // Remove table
  const removeTable = (tableNum) => {
    if (tableList.length <= 1) {
      alert('Must have at least one table');
      return;
    }
    updateTables(tableList.filter(t => t.number !== tableNum));
  };

  // Update table max occupancy
  const updateTableOccupancy = (tableNum, maxOccupancy) => {
    const updatedList = tableList.map(t => 
      t.number === tableNum ? { ...t, maxOccupancy } : t
    );
    updateTables(updatedList);
  };

  // Update menu item price
  const updateMenuPrice = (category, itemId, newPrice) => {
    setMenuItems(prev => ({
      ...prev,
      [category]: prev[category].map(item =>
        item.id === itemId ? { ...item, price: newPrice } : item
      )
    }));
  };

  // Toggle menu item stock status
  const toggleMenuItemStock = (category, itemId) => {
    setMenuItems(prev => ({
      ...prev,
      [category]: prev[category].map(item =>
        item.id === itemId ? { ...item, inStock: !item.inStock } : item
      )
    }));
  };

  // Add new menu item
  const addMenuItem = (category, name, price, itemCategory) => {
    const newItem = {
      id: Date.now().toString(),
      name,
      price: parseFloat(price) || 0,
      category: itemCategory,
      inStock: true
    };

    setMenuItems(prev => ({
      ...prev,
      [category]: [...prev[category], newItem]
    }));
  };

  // Remove menu item
  const removeMenuItem = (category, itemId) => {
    setMenuItems(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== itemId)
    }));
  };

  // Check out table
  const checkoutTable = (tableNum) => {
    const table = tables[tableNum];
    
    if (table.totalSpent > 0 || table.orders.length > 0) {
      // Create complete order history entry
      const groupKey = table.groupName || `Table of ${table.guestCount}`;
      const checkoutEntry = {
        id: Date.now(),
        groupName: groupKey,
        tableNumber: tableNum,
        guestCount: table.guestCount,
        orders: [...table.orders],
        totalSpent: table.totalSpent,
        checkoutTime: new Date().toISOString(),
        sessionDuration: 'N/A' // Could add session tracking later
      };

      // Store in group history
      setGroupHistory(prev => ({
        ...prev,
        [groupKey]: [...(prev[groupKey] || []), checkoutEntry]
      }));
    }
    
    // Clear pending orders for this table
    setPendingOrders(prev => ({
      ...prev,
      [tableNum]: []
    }));
    
    // Reset table
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        groupName: '',
        guestCount: Math.min(4, prev[tableNum]?.maxOccupancy || 4),
        orders: [],
        songCount: 0,
        totalSpent: 0,
        checkRequested: false,
        isOccupied: false,
        maxOccupancy: prev[tableNum]?.maxOccupancy || 4
      }
    }));

    // Remove songs from queue for this table
    setGlobalQueue(prev => prev.filter(song => song.tableNumber !== parseInt(tableNum)));
  };

  // Transfer table
  const transferTable = (fromTable, toTable) => {
    const sourceTable = tables[fromTable];
    const targetTable = tables[toTable];
    
    if (targetTable.isOccupied) {
      alert('Target table is already occupied!');
      return;
    }

    // Move all data to new table
    setTables(prev => ({
      ...prev,
      [toTable]: {
        ...sourceTable,
        isOccupied: true
      },
      [fromTable]: {
        groupName: '',
        guestCount: 4,
        orders: [],
        songCount: 0,
        totalSpent: 0,
        checkRequested: false,
        isOccupied: false
      }
    }));

    // Update queue with new table numbers
    setGlobalQueue(prev => prev.map(song => 
      song.tableNumber === parseInt(fromTable) 
        ? { ...song, tableNumber: parseInt(toTable) }
        : song
    ));
  };

  // Update group info
  const updateGroupInfo = (tableNum, groupName, guestCount) => {
    const table = tables[tableNum];
    const maxAllowed = table?.maxOccupancy || 8;
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        ...prev[tableNum],
        groupName,
        guestCount: Math.min(guestCount, maxAllowed),
        isOccupied: true
      }
    }));
  };

  // TABLE MODE
  if (mode === 'table') {
    const table = tables[currentTable];
    const groupName = table.groupName || `Table of ${table.guestCount}`;
    
    return (
      <div className="max-w-4xl mx-auto p-4 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 min-h-screen text-white">
        <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                🎤 Table {currentTable}
              </h1>
              <p className="text-gray-300">{groupName}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('bar')}
                className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                title="Bar Admin"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-green-400">{table.songCount}/{maxSongsPerTable}</div>
              <div className="text-xs text-gray-400">Songs Reserved</div>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-400">{currency}{table.totalSpent.toFixed(2)}</div>
              <div className="text-xs text-gray-400">Total Spent</div>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-purple-400">{table.guestCount}</div>
              <div className="text-xs text-gray-400">Guests</div>
            </div>
            <div className="bg-black/20 rounded-lg p-3 text-center">
              <button
                onClick={requestCheck}
                disabled={table.checkRequested}
                className={`text-lg font-bold px-2 py-1 rounded ${
                  table.checkRequested 
                    ? 'text-yellow-400 bg-yellow-900/20' 
                    : 'text-green-400 hover:bg-green-900/20 cursor-pointer'
                }`}
              >
                {table.checkRequested ? '✓ Check Requested' : '💳 Check Please'}
              </button>
            </div>
          </div>

          {/* Page Navigation */}
          <div className="flex mb-6 bg-black/20 rounded-lg p-1">
            <button
              onClick={() => setTablePage('karaoke')}
              className={`flex-1 px-4 py-2 rounded transition-colors ${
                tablePage === 'karaoke'
                  ? 'bg-pink-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎤 Karaoke
            </button>
            <button
              onClick={() => setTablePage('menu')}
              className={`flex-1 px-4 py-2 rounded transition-colors ${
                tablePage === 'menu'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🍽️ Menu
            </button>
          </div>

          {/* Karaoke Page */}
          {tablePage === 'karaoke' && (
            <>
              {/* Search Karaoke */}
              <div className="mb-6 bg-black/20 rounded-xl p-4 border border-pink-400/30">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  <Search className="w-5 h-5 text-pink-500" />
                  Find Karaoke Songs
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchKaraokeVideos(searchQuery)}
                    placeholder="Search for any song..."
                    className="flex-1 px-4 py-2 bg-black/30 border border-pink-400/40 rounded-lg focus:outline-none focus:border-pink-400 text-white placeholder-gray-400"
                  />
                  <button
                    onClick={() => searchKaraokeVideos(searchQuery)}
                    disabled={isSearching}
                    className="px-4 sm:px-6 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-800 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isSearching ? <Clock className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isSearching ? 'Searching...' : 'Search'}</span>
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div key={result.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        result.isBlocked 
                          ? 'bg-red-900/20 border-red-500/30 hover:border-red-400/50' 
                          : 'bg-black/40 border-gray-600/30 hover:border-pink-400/50'
                      }`}>
                        <div className="relative">
                          <img
                            src={result.thumbnail}
                            alt={result.title}
                            className={`w-16 h-12 object-cover rounded flex-shrink-0 ${
                              result.isBlocked ? 'opacity-60' : ''
                            }`}
                          />
                          {result.isBlocked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-sm sm:text-base font-medium truncate ${
                              result.isBlocked ? 'text-gray-300' : 'text-white'
                            }`}>{result.title}</h4>
                            {result.isBlocked && (
                              <span className="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded-full flex-shrink-0">
                                Restricted
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{result.channel}</p>
                          {result.isBlocked && (
                            <p className="text-xs text-red-400 mt-1">Embedding disabled - can watch on YouTube</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-green-400 mb-1">{currency}{songPrice.toFixed(2)}</div>
                          {result.isBlocked ? (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => window.open(`https://www.youtube.com/watch?v=${result.videoId}`, '_blank')}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium transition-colors flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Watch
                              </button>
                              <button
                                onClick={() => reserveSong(result)}
                                disabled={table.songCount >= maxSongsPerTable}
                                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
                                title="Reserve anyway (will need manual playback)"
                              >
                                Reserve
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => reserveSong(result)}
                              disabled={table.songCount >= maxSongsPerTable}
                              className="mt-1 px-4 py-1 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                            >
                              {table.songCount >= maxSongsPerTable ? 'Limit Reached' : 'Reserve'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Menu Page */}
          {tablePage === 'menu' && (
            <>
              {/* Drinks */}
              <div className="mb-6 bg-black/20 rounded-xl p-4 border border-blue-400/30">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 text-blue-400">
                  🍺 Drinks
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {menuItems.drinks.map((item) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      item.inStock 
                        ? 'bg-black/40 border-gray-600/30' 
                        : 'bg-red-900/20 border-red-400/30'
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${!item.inStock ? 'line-through text-gray-500' : ''}`}>
                            {item.name}
                          </h4>
                          {!item.inStock && <span className="text-xs text-red-400 bg-red-900/20 px-1 rounded">OUT</span>}
                        </div>
                        <p className="text-xs text-gray-400">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${item.inStock ? 'text-green-400' : 'text-gray-500'}`}>
                          {currency}{item.price.toFixed(2)}
                        </span>
                        <button
                          onClick={() => addToPendingOrders(item)}
                          disabled={!item.inStock}
                          className={`px-3 py-1 rounded text-sm transition-colors ${
                            item.inStock 
                              ? 'bg-blue-600 hover:bg-blue-700' 
                              : 'bg-gray-600 cursor-not-allowed'
                          }`}
                        >
                          {item.inStock ? 'Add' : 'Out of Stock'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Food */}
              <div className="mb-6 bg-black/20 rounded-xl p-4 border border-green-400/30">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2 text-green-400">
                  🍕 Food
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {menuItems.food.map((item) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                      item.inStock 
                        ? 'bg-black/40 border-gray-600/30' 
                        : 'bg-red-900/20 border-red-400/30'
                    }`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`font-medium ${!item.inStock ? 'line-through text-gray-500' : ''}`}>
                            {item.name}
                          </h4>
                          {!item.inStock && <span className="text-xs text-red-400 bg-red-900/20 px-1 rounded">OUT</span>}
                        </div>
                        <p className="text-xs text-gray-400">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${item.inStock ? 'text-green-400' : 'text-gray-500'}`}>
                          {currency}{item.price.toFixed(2)}
                        </span>
                        <button
                          onClick={() => addToPendingOrders(item)}
                          disabled={!item.inStock}
                          className={`px-3 py-1 rounded text-sm transition-colors ${
                            item.inStock 
                              ? 'bg-green-600 hover:bg-green-700' 
                              : 'bg-gray-600 cursor-not-allowed'
                          }`}
                        >
                          {item.inStock ? 'Add' : 'Out of Stock'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Pending Orders */}
          {(pendingOrders[currentTable]?.length || 0) > 0 && (
            <div className="mb-6 bg-black/20 rounded-xl p-4 border border-orange-400/30">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold text-orange-400">Pending Orders</h2>
                <div className="flex gap-2">
                  <button
                    onClick={confirmOrders}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Confirm All
                  </button>
                  <button
                    onClick={clearPendingOrders}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(pendingOrders[currentTable] || []).map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-orange-900/20 rounded-lg border border-orange-400/30">
                    <div>
                      <h4 className="font-medium">{order.item}</h4>
                      <p className="text-xs text-gray-400">
                        {order.type === 'song' ? '🎤' : '🍽️'} {order.category || 'Song'} • Pending confirmation
                      </p>
                    </div>
                    <div className="text-orange-400 font-bold">{currency}{order.price.toFixed(2)}</div>
                  </div>
                ))}
                <div className="border-t border-orange-600 pt-2 mt-4">
                  <div className="flex justify-between items-center font-bold">
                    <span>Pending Total:</span>
                    <span className="text-orange-400">
                      {currency}{(pendingOrders[currentTable] || []).reduce((sum, order) => sum + order.price, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Confirmed Orders */}
          <div className="bg-black/20 rounded-xl p-4 border border-yellow-400/30">
            <h2 className="text-xl font-semibold mb-3 text-yellow-400">Confirmed Orders</h2>
            {table.orders.length === 0 && (pendingOrders[currentTable]?.length || 0) === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">📝</div>
                <p>No orders yet</p>
                <p className="text-sm">Search for songs or browse the menu!</p>
              </div>
            ) : table.orders.length === 0 ? (
              <div className="text-center py-4 text-gray-400">
                <p>No confirmed orders yet</p>
                <p className="text-sm">Confirm your pending orders above!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {table.orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-black/30 rounded-lg">
                    <div>
                      <h4 className="font-medium">{order.item}</h4>
                      <p className="text-xs text-gray-400">
                        {order.type === 'song' ? '🎤' : '🍽️'} {order.category || 'Song'} • {new Date(order.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="text-green-400 font-bold">{currency}{order.price.toFixed(2)}</div>
                  </div>
                ))}
                <div className="border-t border-gray-600 pt-2 mt-4">
                  <div className="flex justify-between items-center font-bold">
                    <span>Confirmed Total:</span>
                    <span className="text-green-400">{currency}{table.totalSpent.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // TV MODE
  if (mode === 'tv') {
    return (
      <div className="w-full h-screen bg-black flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center">
          {/* Next Song Info */}
          {globalQueue.length > 0 && (
            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
              <span className="text-sm">Next: {globalQueue[0].title}</span>
              <span className="text-xs text-gray-300 ml-2">({globalQueue[0].groupName})</span>
            </div>
          )}
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Fullscreen YouTube Button */}
            {currentSong && (
              <button
                onClick={() => window.open(`https://www.youtube.com/watch?v=${currentSong.videoId}`, '_blank')}
                className="p-3 bg-red-600 hover:bg-red-700 rounded-full text-white transition-colors"
                title="Open in YouTube (Fullscreen)"
              >
                <ExternalLink className="w-5 h-5" />
              </button>
            )}
            
            {/* Mute Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-3 bg-gray-600 hover:bg-gray-700 rounded-full text-white transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            
            {/* Controller Mode Button */}
            <button
              onClick={() => setMode('table')}
              className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white transition-colors"
              title="Switch to Table Mode"
            >
              <Smartphone className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player */}
        {currentSong && isPlaying ? (
          <div className="flex-1">
            <iframe
              ref={playerRef}
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1`}
              title="Karaoke Video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
            <div className="text-center text-white">
              <div className="text-8xl mb-6">🎤</div>
              <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                Karaoke Night!
              </h1>
              {globalQueue.length > 0 ? (
                <div>
                  <p className="text-2xl mb-6">Up Next: {globalQueue[0].groupName}</p>
                  <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 inline-block">
                    <img
                      src={globalQueue[0].thumbnail}
                      alt="Next song"
                      className="w-64 h-36 object-cover rounded-lg mb-4 mx-auto"
                    />
                    <h3 className="text-xl font-semibold mb-4">{globalQueue[0].title}</h3>
                    <button
                      onClick={playNext}
                      className="px-8 py-4 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold transition-colors flex items-center gap-3 mx-auto"
                    >
                      <Play className="w-6 h-6" />
                      Start Song!
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-2xl">No songs in queue</p>
              )}
            </div>
          </div>
        )}

        {/* Current Singer Info */}
        {currentSong && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white">
            <div className="text-lg font-bold">{currentSong.groupName}</div>
            <div className="text-sm text-gray-300">Now Singing</div>
          </div>
        )}
      </div>
    );
  }

  // BAR MODE
  if (mode === 'bar') {
    return (
      <div className="max-w-6xl mx-auto p-4 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 min-h-screen text-white">
        <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-purple-500/20">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                🍺 Bar Admin Dashboard
              </h1>
              {(barPage === 'menu' || barPage === 'tables') && (
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isEditMode 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  {isEditMode ? 'Exit Edit Mode' : (barPage === 'menu' ? 'Edit Menu' : 'Edit Tables')}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('table')}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
              >
                <Users className="w-4 h-4" />
                Table Mode
              </button>
              <button
                onClick={() => setMode('tv')}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition-colors"
              >
                <Monitor className="w-4 h-4" />
                TV Mode
              </button>
            </div>
          </div>

          {/* Page Navigation */}
          <div className="flex mb-6 bg-black/20 rounded-lg p-1 overflow-x-auto">
            <button
              onClick={() => setBarPage('queue')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'queue'
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎤 Queue
            </button>
            <button
              onClick={() => setBarPage('orders')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'orders'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📋 Orders
            </button>
            <button
              onClick={() => setBarPage('guests')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'guests'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              👥 Guests
            </button>
            <button
              onClick={() => setBarPage('tables')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'tables'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🪑 Tables
            </button>
            <button
              onClick={() => setBarPage('menu')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'menu'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🍽️ Menu
            </button>
            <button
              onClick={() => setBarPage('settings')}
              className={`flex-1 px-4 py-2 rounded transition-colors whitespace-nowrap ${
                barPage === 'settings'
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⚙️ Settings
            </button>
          </div>

          {/* Tables Page */}
          {barPage === 'tables' && (
            <div className="mb-6">
              <h3 className="text-2xl font-semibold mb-4 text-orange-400">Table Manager</h3>

              <div className="bg-black/20 rounded-xl p-4 border border-orange-400/30">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-semibold">All Tables</h4>
                  {isEditMode && (
                    <button
                      onClick={addTable}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Table
                    </button>
                  )}
                </div>
                
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {tableList.map((table) => (
                    <div key={table.number} className="flex items-center gap-4 p-4 bg-black/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-medium">Table {table.number}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          tables[table.number]?.isOccupied 
                            ? 'bg-green-900/20 text-green-400' 
                            : 'bg-gray-900/20 text-gray-400'
                        }`}>
                          {tables[table.number]?.isOccupied ? 'Occupied' : 'Empty'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Max occupancy:</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={table.maxOccupancy}
                          onChange={(e) => updateTableOccupancy(table.number, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 text-sm bg-black/30 border border-gray-600 rounded text-white"
                          disabled={!isEditMode}
                        />
                        <span className="text-xs text-gray-400">guests</span>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {tables[table.number] && (
                          <span className="text-xs text-gray-400">
                            Current: {tables[table.number].guestCount} guests, {currency}{tables[table.number].totalSpent.toFixed(2)}
                          </span>
                        )}
                        {isEditMode && (
                          <button
                            onClick={() => {
                              if (confirm(`Remove Table ${table.number}? This will clear all current data for this table.`)) {
                                removeTable(table.number);
                              }
                            }}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                            title="Remove table"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Menu Page */}
          {barPage === 'menu' && (
            <div className="mb-6">
              <h3 className="text-2xl font-semibold mb-4 text-indigo-400">Menu Manager</h3>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Drinks Section */}
                <div className="bg-black/20 rounded-xl p-4 border border-blue-400/30">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-semibold text-blue-400">🍺 Drinks</h4>
                    {isEditMode && (
                      <button
                        onClick={() => {
                          const name = prompt('Drink name:');
                          const price = prompt('Price:');
                          const category = prompt('Category (e.g., Alcohol, Non-Alcohol):');
                          if (name && price && category) {
                            addMenuItem('drinks', name, price, category);
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {menuItems.drinks.map((item) => (
                      <div key={item.id} className={`flex items-center gap-3 p-3 rounded ${
                        item.inStock ? 'bg-black/30' : 'bg-red-900/20 border border-red-400/30'
                      }`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className={`font-medium ${!item.inStock ? 'line-through text-gray-500' : ''}`}>
                              {item.name}
                            </h5>
                            {!item.inStock && <span className="text-xs text-red-400 bg-red-900/20 px-1 rounded">OUT OF STOCK</span>}
                          </div>
                          <p className="text-xs text-gray-400">{item.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMenuItemStock('drinks', item.id)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              item.inStock 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            {item.inStock ? 'In Stock' : 'Out'}
                          </button>
                          <span className="text-sm text-gray-400">{currency}</span>
                          <input
                            type="number"
                            step="0.50"
                            min="0"
                            value={item.price.toFixed(2)}
                            onChange={(e) => updateMenuPrice('drinks', item.id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm bg-black/30 border border-gray-600 rounded text-white"
                            disabled={!isEditMode}
                          />
                          {isEditMode && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove "${item.name}" from menu?`)) {
                                  removeMenuItem('drinks', item.id);
                                }
                              }}
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Food Section */}
                <div className="bg-black/20 rounded-xl p-4 border border-green-400/30">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-semibold text-green-400">🍕 Food</h4>
                    {isEditMode && (
                      <button
                        onClick={() => {
                          const name = prompt('Food item name:');
                          const price = prompt('Price:');
                          const category = prompt('Category (e.g., Appetizers, Mains, Sides):');
                          if (name && price && category) {
                            addMenuItem('food', name, price, category);
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {menuItems.food.map((item) => (
                      <div key={item.id} className={`flex items-center gap-3 p-3 rounded ${
                        item.inStock ? 'bg-black/30' : 'bg-red-900/20 border border-red-400/30'
                      }`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className={`font-medium ${!item.inStock ? 'line-through text-gray-500' : ''}`}>
                              {item.name}
                            </h5>
                            {!item.inStock && <span className="text-xs text-red-400 bg-red-900/20 px-1 rounded">OUT OF STOCK</span>}
                          </div>
                          <p className="text-xs text-gray-400">{item.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMenuItemStock('food', item.id)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              item.inStock 
                                ? 'bg-green-600 hover:bg-green-700 text-white' 
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            {item.inStock ? 'In Stock' : 'Out'}
                          </button>
                          <span className="text-sm text-gray-400">{currency}</span>
                          <input
                            type="number"
                            step="0.50"
                            min="0"
                            value={item.price.toFixed(2)}
                            onChange={(e) => updateMenuPrice('food', item.id, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm bg-black/30 border border-gray-600 rounded text-white"
                            disabled={!isEditMode}
                          />
                          {isEditMode && (
                            <button
                              onClick={() => {
                                if (confirm(`Remove "${item.name}" from menu?`)) {
                                  removeMenuItem('food', item.id);
                                }
                              }}
                              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Song Queue Page */}
          {barPage === 'queue' && (
            <>
              {/* Queue Controls */}
              <div className="mb-6">
                <div className="bg-black/20 rounded-xl p-4 border border-green-400/30">
                  <h3 className="text-lg font-semibold mb-3 text-green-400">Queue Control</h3>
                  <div className="space-y-2">
                    {currentSong ? (
                      <div className="text-sm">
                        <p><strong>Now Playing:</strong> {currentSong.groupName}</p>
                        <p className="text-gray-400">{currentSong.title}</p>
                      </div>
                    ) : (
                      <p className="text-gray-400">No song playing</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={playNext}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                      >
                        Next Song
                      </button>
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm transition-colors"
                      >
                        {isPlaying ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => setShowCacheViewer(true)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors flex items-center gap-2"
                      >
                        <Database className="w-4 h-4" />
                        View Cache
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Global Queue */}
              <div className="bg-black/20 rounded-xl p-4 border border-purple-400/30">
                <h3 className="text-lg font-semibold mb-3 text-purple-400">Song Queue ({globalQueue.length})</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {globalQueue.length === 0 ? (
                    <div className="text-center py-4 text-gray-400">
                      <p>No songs in queue</p>
                    </div>
                  ) : (
                    globalQueue.map((song, index) => (
                      <div key={song.id} className={`flex items-center gap-3 p-3 rounded-lg ${
                        song.isBlocked ? 'bg-red-900/20 border border-red-500/30' : 'bg-black/30'
                      }`}>
                        <div className="text-sm bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-medium">
                          {index + 1}
                        </div>
                        <div className="relative">
                          <img
                            src={song.thumbnail}
                            alt="Video thumbnail"
                            className={`w-12 h-9 object-cover rounded flex-shrink-0 ${
                              song.isBlocked ? 'opacity-60' : ''
                            }`}
                          />
                          {song.isBlocked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className={`font-medium truncate ${
                              song.isBlocked ? 'text-gray-300' : 'text-white'
                            }`}>{song.title}</h4>
                            {song.isBlocked && (
                              <span className="px-2 py-0.5 bg-red-600/20 text-red-400 text-xs rounded-full flex-shrink-0">
                                Blocked
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{song.groupName} • Table {song.tableNumber} • {song.addedAt}</p>
                          {song.isBlocked && (
                            <p className="text-xs text-red-400">Will need manual YouTube playback</p>
                          )}
                        </div>
                        <div className="text-green-400 font-bold text-sm">{currency}{song.price.toFixed(2)}</div>
                        <div className="flex items-center gap-1">
                          {song.isBlocked && (
                            <button
                              onClick={() => window.open(`https://www.youtube.com/watch?v=${song.videoId}`, '_blank')}
                              className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded transition-colors"
                              title="Watch on YouTube"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setGlobalQueue(prev => prev.filter(s => s.id !== song.id))}
                            className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* Orders Page */}
          {barPage === 'orders' && (
            <>
              {/* Orders Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {Object.entries(tables)
                  .filter(([_, tableData]) => tableData.orders.length > 0)
                  .map(([tableNum, tableData]) => (
                  <div key={tableNum} className={`bg-black/20 rounded-xl p-4 border ${
                    tableData.checkRequested 
                      ? 'border-yellow-400/60 bg-yellow-900/10' 
                      : 'border-blue-400/30'
                  }`}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">Table {tableNum}</h3>
                        {tableData.checkRequested && (
                          <span className="text-yellow-400 text-xs">💳 CHECK</span>
                        )}
                      </div>
                      {tableData.checkRequested && (
                        <button
                          onClick={() => setTables(prev => ({
                            ...prev,
                            [tableNum]: { ...prev[tableNum], checkRequested: false }
                          }))}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mb-2">
                      {tableData.groupName || `Table of ${tableData.guestCount}`}
                    </p>
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {tableData.orders.map((order) => (
                        <div key={order.id} className="flex justify-between text-xs">
                          <span>{order.item}</span>
                          <span className="text-green-400">{currency}{order.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-gray-600 pt-2">
                      <div className="flex justify-between font-bold text-sm">
                        <span>Total:</span>
                        <span className="text-green-400">{currency}{tableData.totalSpent.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {Object.entries(tables).filter(([_, tableData]) => tableData.orders.length > 0).length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <div className="text-4xl mb-2">📋</div>
                  <p>No orders yet</p>
                </div>
              )}
            </>
          )}

          {/* Guest Manager Page */}
          {barPage === 'guests' && (
            <>
              {/* All Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(tables).map(([tableNum, tableData]) => (
                  <div key={tableNum} className={`bg-black/20 rounded-xl p-4 border ${
                    tableData.isOccupied 
                      ? 'border-green-400/30' 
                      : 'border-gray-600/30'
                  }`}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-semibold">Table {tableNum}</h3>
                      <span className={`text-xs px-2 py-1 rounded ${
                        tableData.isOccupied 
                          ? 'bg-green-900/20 text-green-400' 
                          : 'bg-gray-900/20 text-gray-400'
                      }`}>
                        {tableData.isOccupied ? 'Occupied' : 'Empty'}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Group Name</label>
                        <input
                          type="text"
                          value={tableData.groupName}
                          onChange={(e) => updateGroupInfo(tableNum, e.target.value, tableData.guestCount)}
                          placeholder={`Table of ${tableData.guestCount}`}
                          className="w-full px-2 py-1 text-sm bg-black/30 border border-gray-600 rounded text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Guests</label>
                        <input
                          type="number"
                          min="1"
                          max={tableData.maxOccupancy || 8}
                          value={tableData.guestCount}
                          onChange={(e) => updateGroupInfo(tableNum, tableData.groupName, parseInt(e.target.value) || 1)}
                          className="w-20 px-2 py-1 text-sm bg-black/30 border border-gray-600 rounded text-white"
                        />
                      </div>
                      
                      <div className="text-xs space-y-1 text-gray-400">
                        <div>Orders: {tableData.orders.length}</div>
                        <div>Songs: {tableData.songCount}</div>
                        <div>Total: {currency}{tableData.totalSpent.toFixed(2)}</div>
                      </div>
                      
                      <div className="flex gap-2">
                        {tableData.isOccupied && (
                          <>
                            <button
                              onClick={() => checkoutTable(tableNum)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                            >
                              Checkout
                            </button>
                            <button
                              onClick={() => {
                                const targetTable = prompt('Transfer to table number:');
                                if (targetTable && tables[targetTable]) {
                                  transferTable(tableNum, targetTable);
                                }
                              }}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
                            >
                              Transfer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Settings Page */}
          {barPage === 'settings' && (
            <div className="mb-6">
              <h3 className="text-2xl font-semibold mb-4 text-gray-400">Global Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Currency & Display Settings */}
                <div className="bg-black/20 rounded-xl p-4 border border-gray-400/30">
                  <h4 className="text-lg font-semibold mb-4 text-gray-300">💰 Currency & Display</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Currency</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-3 py-2 bg-black/30 border border-gray-600 rounded text-white"
                      >
                        <option value="$">$ USD - US Dollar</option>
                        <option value="€">€ EUR - Euro</option>
                        <option value="£">£ GBP - British Pound</option>
                        <option value="¥">¥ JPY - Japanese Yen</option>
                        <option value="₹">₹ INR - Indian Rupee</option>
                        <option value="₱">₱ PHP - Philippine Peso</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Karaoke Settings */}
                <div className="bg-black/20 rounded-xl p-4 border border-purple-400/30">
                  <h4 className="text-lg font-semibold mb-4 text-purple-300">🎤 Karaoke Settings</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Song Price</label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{currency}</span>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={songPrice.toFixed(2)}
                          onChange={(e) => setSongPrice(parseFloat(e.target.value) || 0)}
                          className="flex-1 px-3 py-2 bg-black/30 border border-gray-600 rounded text-white"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Max Songs Per Table</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={maxSongsPerTable}
                        onChange={(e) => setMaxSongsPerTable(parseInt(e.target.value) || 1)}
                        className="w-20 px-3 py-2 bg-black/30 border border-gray-600 rounded text-white"
                      />
                      <span className="text-xs text-gray-400 ml-2">songs per table</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Future Settings Section */}
              <div className="mt-6 bg-black/20 rounded-xl p-4 border border-blue-400/30">
                <h4 className="text-lg font-semibold mb-4 text-blue-300">🔧 System Settings</h4>
                <div className="text-center py-8 text-gray-400">
                  <div className="text-4xl mb-2">⚙️</div>
                  <p>Additional system settings will appear here</p>
                  <p className="text-sm">Features like backup/restore, themes, and more coming soon!</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Cache Viewer Modal */}
          {showCacheViewer && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-purple-500/30">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-blue-900/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Database className="w-6 h-6 text-purple-400" />
                      <h2 className="text-2xl font-bold text-white">Cached Songs</h2>
                      <span className="px-2 py-1 bg-purple-600 rounded-full text-xs font-medium">
                        {cachedSongs.length} songs
                      </span>
                    </div>
                    <button
                      onClick={() => setShowCacheViewer(false)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Cache Controls */}
                <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-64">
                      <input
                        type="text"
                        placeholder="Search cached songs..."
                        value={cacheSearchQuery}
                        onChange={(e) => setCacheSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 bg-black/30 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm"
                      />
                    </div>
                    <button
                      onClick={batchRecheckAvailability}
                      disabled={isRecheckingCache || cachedSongs.length === 0}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRecheckingCache ? 'animate-spin' : ''}`} />
                      {isRecheckingCache ? 'Rechecking...' : 'Recheck All'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Clear all blocked songs from cache?')) {
                          clearBlockedSongs();
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Blocked
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Clear all cached songs? This cannot be undone.')) {
                          try {
                            const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs`, {
                              method: 'DELETE'
                            });
                            if (response.ok) {
                              setCachedSongs([]);
                              localStorage.removeItem('okibar-cached-songs');
                              alert('All cached songs cleared');
                            }
                          } catch (error) {
                            console.error('Failed to clear cache on server:', error);
                            setCachedSongs([]);
                            localStorage.removeItem('okibar-cached-songs');
                            alert('Cache cleared locally (server sync failed)');
                          }
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Cache List */}
                <div className="p-6 overflow-y-auto max-h-96">
                  {(() => {
                    const filteredSongs = getFilteredCachedSongs();
                    
                    if (cachedSongs.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-400">
                          <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg mb-2">No cached songs</p>
                          <p className="text-sm">Songs will be cached automatically as they're added to the queue</p>
                        </div>
                      );
                    }
                    
                    if (filteredSongs.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-400">
                          <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg mb-2">No songs match your search</p>
                          <p className="text-sm">Try a different search term</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        {filteredSongs.map((song) => {
                        const availability = song.availability;
                        const isBlocked = availability && availability.playable === false;
                        
                        return (
                          <div key={song.videoId} className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                            isBlocked 
                              ? 'bg-red-900/20 border-red-500/30' 
                              : 'bg-black/20 border-gray-600/30 hover:bg-black/30'
                          }`}>
                            {/* Thumbnail */}
                            <img
                              src={song.thumbnail}
                              alt="Video thumbnail"
                              className="w-16 h-12 object-cover rounded flex-shrink-0"
                            />
                            
                            {/* Song Info */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-white truncate">{song.title}</h4>
                              <p className="text-sm text-gray-400 truncate">{song.channel}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                {song.usageCount && (
                                  <span>Used {song.usageCount}x</span>
                                )}
                                {song.addedAt && (
                                  <span>Added {new Date(song.addedAt).toLocaleDateString()}</span>
                                )}
                                {song.lastUsed && (
                                  <span>Last used {new Date(song.lastUsed).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            
                            {/* Status & Actions */}
                            <div className="flex items-center gap-2">
                              {availability ? (
                                <div className="text-right">
                                  <div className={`px-2 py-1 rounded text-xs font-medium mb-1 ${
                                    isBlocked
                                      ? 'bg-red-600/20 text-red-400'
                                      : availability.playable
                                      ? 'bg-green-600/20 text-green-400'
                                      : 'bg-yellow-600/20 text-yellow-400'
                                  }`}>
                                    {isBlocked ? 'Blocked' : availability.playable ? 'Playable' : 'Unknown'}
                                  </div>
                                  {availability.blockedReason && (
                                    <div className="text-xs text-red-400 truncate max-w-32" title={availability.blockedReason}>
                                      {availability.blockedReason}
                                    </div>
                                  )}
                                  {availability.checkedAt && (
                                    <div className="text-xs text-gray-500">
                                      {new Date(availability.checkedAt).toLocaleDateString()}
                                    </div>
                                  )}
                                  <div className="text-xs text-gray-500">
                                    via {availability.method || 'unknown'}
                                  </div>
                                </div>
                              ) : (
                                <div className="px-2 py-1 bg-gray-600/20 text-gray-400 rounded text-xs font-medium">
                                  Not checked
                                </div>
                              )}
                              
                              {isBlocked && (
                                <button
                                  onClick={() => window.open(`https://www.youtube.com/watch?v=${song.videoId}`, '_blank')}
                                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                                  title="Watch on YouTube"
                                >
                                  <ExternalLink className="w-4 h-4 text-blue-400" />
                                </button>
                              )}
                              
                              <button
                                onClick={() => recheckSongAvailability(song.videoId)}
                                className="p-2 hover:bg-gray-700 rounded transition-colors"
                                title="Recheck availability"
                              >
                                <RefreshCw className="w-4 h-4 text-gray-400" />
                              </button>
                              
                              <button
                                onClick={async () => {
                                  if (confirm(`Remove "${song.title}" from cache?`)) {
                                    try {
                                      const response = await fetch(`${process.env.REACT_APP_API_URL}/cached-songs/${song.videoId}`, {
                                        method: 'DELETE'
                                      });
                                      if (response.ok) {
                                        setCachedSongs(prev => {
                                          const updated = prev.filter(s => s.videoId !== song.videoId);
                                          localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
                                          return updated;
                                        });
                                      }
                                    } catch (error) {
                                      console.error('Failed to remove from server cache:', error);
                                      setCachedSongs(prev => {
                                        const updated = prev.filter(s => s.videoId !== song.videoId);
                                        localStorage.setItem('okibar-cached-songs', JSON.stringify(updated));
                                        return updated;
                                      });
                                    }
                                  }
                                }}
                                className="p-2 hover:bg-gray-700 rounded transition-colors"
                                title="Remove from cache"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 bg-gray-800/50">
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <div className="flex items-center gap-4">
                      <span>{cachedSongs.length} total songs</span>
                      <span>{cachedSongs.filter(s => s.availability?.playable === false).length} blocked</span>
                      <span>{cachedSongs.filter(s => !s.availability || s.availability.playable !== false).length} available</span>
                    </div>
                    <div className="text-xs">
                      Songs are automatically cached when added to queue
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
};

export default KaraokeBarApp;
