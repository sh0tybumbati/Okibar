import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Volume2, VolumeX, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiService, { API_BASE_URL } from '../services/api';
import socket from '../services/socket';
import { hashPin, isHashedPin } from '../utils/hash';

const DEVICE_ROLES = ['table', 'tv', 'bar'];

// Lazily load the YouTube IFrame Player API once. Resolves to window.YT.
let ytApiPromise = null;
const loadYouTubeAPI = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
};

const fmtTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Available venue themes. `bar` previews the brand gradient in the selector;
// the live styling itself comes from [data-theme] rules in index.css.
const THEMES = [
  { id: 'midnight', name: 'Midnight', desc: 'Cool blue-black & cyan', bar: 'linear-gradient(135deg,#38bdf8,#6366f1)' },
  { id: 'amber', name: 'Amber Lounge', desc: 'Warm charcoal & gold', bar: 'linear-gradient(135deg,#f59e0b,#ef6c2e)' },
  { id: 'neon', name: 'Neon Club', desc: 'Purple-black & magenta', bar: 'linear-gradient(135deg,#e879f9,#8b5cf6)' },
  { id: 'emerald', name: 'Emerald', desc: 'Deep forest & teal', bar: 'linear-gradient(135deg,#2dd4bf,#10b981)' },
  { id: 'slate', name: 'Slate', desc: 'Minimal mono & silver', bar: 'linear-gradient(135deg,#e2e8f0,#94a3b8)' },
  { id: 'rose', name: 'Rosé', desc: 'Wine-dark & blush', bar: 'linear-gradient(135deg,#fb7185,#e11d8f)' }
];

const KaraokeBarApp = () => {
  // Global state.
  // Device role + table are per-device (NOT synced): a TV must stay a TV across
  // refreshes regardless of other devices. Read from URL (?mode=&table=) first
  // — used by the QR deep links — then localStorage, else null (→ role picker).
  const [mode, setMode] = useState(() => {
    const url = new URLSearchParams(window.location.search);
    const urlMode = url.get('mode');
    if (DEVICE_ROLES.includes(urlMode)) return urlMode;
    const stored = localStorage.getItem('okibar-device-mode');
    return DEVICE_ROLES.includes(stored) ? stored : null;
  });
  const [currentTable, setCurrentTable] = useState(() => {
    const url = new URLSearchParams(window.location.search);
    const raw = url.get('table') || localStorage.getItem('okibar-device-table') || '1';
    return parseInt(raw, 10) || 1;
  });
  const [tablePage, setTablePage] = useState('karaoke'); // 'karaoke', 'menu'
  const [barPage, setBarPage] = useState('queue'); // 'queue', 'orders', 'guests'
  const [showTableManager, setShowTableManager] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [showCacheViewer, setShowCacheViewer] = useState(false);
  const [cacheSearchQuery, setCacheSearchQuery] = useState('');
  const [isRecheckingCache, setIsRecheckingCache] = useState(false);
  const [currency, setCurrency] = useState('$');
  const [theme, setTheme] = useState('midnight');
  const [staffPin, setStaffPin] = useState('');           // synced staff PIN ('' = off)
  const [pinGate, setPinGate] = useState(null);           // { action } pending PIN-gated action
  const [pinEntry, setPinEntry] = useState('');
  const [pinDraft, setPinDraft] = useState('');           // Settings: new-PIN field
  const [ytFallback, setYtFallback] = useState(false);    // TV: use plain iframe if API fails
  const [syncedOnce, setSyncedOnce] = useState(false);    // received initial server state at least once

  // UI system: toasts, modal dialogs, connection + playback progress
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null); // {title, body, confirmLabel, danger, onConfirm}
  const [menuForm, setMenuForm] = useState(null);         // {category, name, price, itemCategory}
  const [transferForm, setTransferForm] = useState(null); // {from, to}
  const [qrTable, setQrTable] = useState(null);           // table number for QR modal
  const [staffMenu, setStaffMenu] = useState(false);      // staff role popover on landing
  const [orderingMemberId, setOrderingMemberId] = useState(null); // table mode: "ordering as"
  const [memberForm, setMemberForm] = useState(null);     // {tableNum, name} add-guest modal
  const [checkout, setCheckout] = useState(null);         // {tableNum} checkout/split modal
  const [checkoutPaid, setCheckoutPaid] = useState({});   // memberId|'shared' -> paid bool
  // History (sales + guests by calendar)
  const [historyMode, setHistoryMode] = useState('sales'); // 'sales' | 'guests'
  const [historyMonth, setHistoryMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [historyDay, setHistoryDay] = useState(null);      // 'YYYY-MM-DD' | null
  const [historySearch, setHistorySearch] = useState('');
  const [dragPos, setDragPos] = useState(null);            // {num,x,y} live drag position on floor
  const [connStatus, setConnStatus] = useState(socket.connected ? 'connected' : 'connecting');
  const [progress, setProgress] = useState({ current: 0, duration: 0 });

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
    try {
      const stored = localStorage.getItem('okibar-cached-songs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {
      // Corrupted cache — fall through to reseed below
      try { localStorage.removeItem('okibar-cached-songs'); } catch (__) {}
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
        members: [],
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
  
  const ytHostRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const playNextRef = useRef(() => {});
  const dragIndexRef = useRef(null);
  const floorRef = useRef(null);       // floor-plan container
  const reposRef = useRef(null);       // table number being repositioned
  const dragGroupRef = useRef(null);   // source table number when relocating a group

  // Apply the selected venue theme to the document (drives CSS variables)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Persist device role + table (per-device, survives refresh)
  useEffect(() => {
    if (mode) localStorage.setItem('okibar-device-mode', mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('okibar-device-table', String(currentTable));
  }, [currentTable]);

  // Socket connection indicator
  useEffect(() => {
    const onConnect = () => setConnStatus('connected');
    const onDisconnect = () => setConnStatus('reconnecting');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onDisconnect);
    };
  }, []);

  // --- TABLE PRESENCE / AUTO-ENTER ---
  // Refs keep the once-bound socket listener reading live values.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const currentTableRef = useRef(currentTable);
  currentTableRef.current = currentTable;

  // Announce when this device enters (or switches) a table, so a tablet idling
  // on the landing screen showing this table's QR can adopt the same table.
  useEffect(() => {
    if (mode === 'table') socket.emit('table:join', { table: currentTable });
  }, [mode, currentTable]);

  // Clear "ordering as" if that guest is no longer at the current table
  useEffect(() => {
    const members = tables[currentTable]?.members || [];
    if (orderingMemberId && !members.some(m => m.id === orderingMemberId)) {
      setOrderingMemberId(null);
    }
  }, [tables, currentTable, orderingMemberId]);

  // Landing screen: when someone joins the table whose QR we're displaying,
  // set this device up into that same table automatically.
  useEffect(() => {
    const onJoin = ({ table }) => {
      if (modeRef.current === null && Number(table) === Number(currentTableRef.current)) {
        setMode('table');
      }
    };
    socket.on('table:join', onJoin);
    return () => socket.off('table:join', onJoin);
  }, []);

  // --- TOASTS ---
  const pushToast = (message, type = 'info', opts = {}) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, action: opts.action || null }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), opts.duration || 3400);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // --- STAFF PIN GATE ---
  // staffPin holds a SHA-256 hash (never the raw PIN). A valid, hashed PIN
  // counts as "set"; any legacy plaintext value is treated as no PIN.
  const hasPin = isHashedPin(staffPin);
  // Run an action immediately if no PIN is configured, else require it first.
  const requireStaff = (action) => {
    if (!hasPin) { action(); return; }
    setPinEntry('');
    setPinGate({ action });
  };
  const submitPin = () => {
    if (hashPin(pinEntry) === staffPin) {
      const a = pinGate?.action;
      setPinGate(null);
      setPinEntry('');
      if (a) a();
    } else {
      pushToast('Incorrect PIN', 'danger');
      setPinEntry('');
    }
  };

  // --- CONFIRM DIALOG --- (replaces window.confirm)
  const askConfirm = (opts) => setConfirmState(opts);
  const runConfirm = () => {
    if (confirmState?.onConfirm) confirmState.onConfirm();
    setConfirmState(null);
  };

  // Esc closes the topmost open overlay
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pinGate) { setPinGate(null); setPinEntry(''); }
      else if (confirmState) setConfirmState(null);
      else if (qrTable != null) setQrTable(null);
      else if (menuForm) setMenuForm(null);
      else if (memberForm) setMemberForm(null);
      else if (transferForm) setTransferForm(null);
      else if (checkout) setCheckout(null);
      else if (showCacheViewer) setShowCacheViewer(false);
      else if (staffMenu) setStaffMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinGate, qrTable, menuForm, memberForm, transferForm, checkout, confirmState, showCacheViewer, staffMenu]);

  // Bar-mode keyboard shortcuts: Space = play/pause, n = next
  useEffect(() => {
    if (mode !== 'bar') return;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p); }
      else if (e.key === 'n' || e.key === 'N') { playNextRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // --- KIOSK HARDENING (guest table + TV devices) ---
  // Suppress context menus, text selection and pinch/double-tap zoom so a
  // guest device behaves like an appliance, not a browser.
  useEffect(() => {
    if (mode !== 'table' && mode !== 'tv') return;
    const prevent = (e) => e.preventDefault();
    const preventZoomKeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
    };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('keydown', preventZoomKeys, { passive: false });
    document.body.classList.add('kiosk');
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('keydown', preventZoomKeys);
      document.body.classList.remove('kiosk');
    };
  }, [mode]);

  // Table devices: after a couple minutes idle, return to the karaoke home and
  // clear any lingering search so the next guest gets a clean screen.
  useEffect(() => {
    if (mode !== 'table') return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setTablePage('karaoke');
        setSearchResults([]);
        setSearchQuery('');
      }, 120000);
    };
    const events = ['pointerdown', 'keydown'];
    events.forEach(ev => window.addEventListener(ev, reset));
    reset();
    return () => { clearTimeout(timer); events.forEach(ev => window.removeEventListener(ev, reset)); };
  }, [mode]);

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch (_) {}
  };

  // --- TV PLAYER (YouTube IFrame API) ---
  // Drives real progress + auto-advance on song end. Falls back silently to a
  // plain iframe (rendered in the markup) if the API can't initialize.
  useEffect(() => {
    if (mode !== 'tv' || !currentSong || !isPlaying) {
      setProgress({ current: 0, duration: 0 });
      return;
    }
    let cancelled = false;
    let interval = null;
    let player = null;
    let childEl = null;
    setYtFallback(false);
    // If the API doesn't initialize in time (offline / blocked), fall back to a
    // plain embed so the TV always shows the video.
    const fallbackTimer = setTimeout(() => { if (!cancelled) setYtFallback(true); }, 5000);
    loadYouTubeAPI().then((YT) => {
      const host = ytHostRef.current;
      if (cancelled || !host) return;
      // Mount the player onto a child element React doesn't track, so YT can
      // freely replace it without conflicting with React's DOM reconciliation.
      childEl = document.createElement('div');
      host.appendChild(childEl);
      player = new YT.Player(childEl, {
        width: '100%',
        height: '100%',
        videoId: currentSong.videoId,
        playerVars: { autoplay: 1, mute: isMuted ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e) => { clearTimeout(fallbackTimer); try { e.target.playVideo(); } catch (_) {} },
          onError: () => setYtFallback(true),
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) playNextRef.current(); }
        }
      });
      ytPlayerRef.current = player;
      interval = setInterval(() => {
        try {
          if (player && player.getDuration) {
            setProgress({ current: player.getCurrentTime() || 0, duration: player.getDuration() || 0 });
          }
        } catch (_) {}
      }, 500);
    }).catch(() => { if (!cancelled) setYtFallback(true); });
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      if (interval) clearInterval(interval);
      try { if (player && player.destroy) player.destroy(); } catch (_) {}
      try { if (ytHostRef.current) ytHostRef.current.innerHTML = ''; } catch (_) {}
      ytPlayerRef.current = null;
    };
  }, [mode, currentSong?.videoId, isPlaying]);

  // Toggle mute on the live player without rebuilding it
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (p && p.mute) { try { isMuted ? p.mute() : p.unMute(); } catch (_) {} }
  }, [isMuted]);

  // --- QUEUE DRAG-REORDER (bar) ---
  const reorderQueue = (from, to) => {
    if (from == null || from === to) return;
    setGlobalQueue(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  // --- CROSS-DEVICE STATE SYNC ---
  // Every entry here is mirrored to the server and broadcast to all other
  // devices (tables, TV, bar). Per-device UI state (mode, current table,
  // search, modals) intentionally stays out of this map.
  const syncedState = {
    globalQueue: [globalQueue, setGlobalQueue],
    currentSong: [currentSong, setCurrentSong],
    isPlaying: [isPlaying, setIsPlaying],
    cachedSongs: [cachedSongs, setCachedSongs],
    tables: [tables, setTables],
    tableList: [tableList, setTableList],
    pendingOrders: [pendingOrders, setPendingOrders],
    groupHistory: [groupHistory, setGroupHistory],
    menuItems: [menuItems, setMenuItems],
    songPrice: [songPrice, setSongPrice],
    maxSongsPerTable: [maxSongsPerTable, setMaxSongsPerTable],
    currency: [currency, setCurrency],
    theme: [theme, setTheme],
    staffPin: [staffPin, setStaffPin]
  };
  const syncedStateRef = useRef(syncedState);
  syncedStateRef.current = syncedState;

  // Last value (per key) seen from or sent to the server, so we only emit
  // genuine local changes and never echo remote updates back.
  const lastSyncedRef = useRef(null);
  if (lastSyncedRef.current === null) {
    lastSyncedRef.current = {};
    Object.entries(syncedState).forEach(([key, [value]]) => {
      lastSyncedRef.current[key] = JSON.stringify(value === undefined ? null : value);
    });
  }

  useEffect(() => {
    const applyRemote = (key, value) => {
      const entry = syncedStateRef.current[key];
      if (!entry || value === undefined) return;
      lastSyncedRef.current[key] = JSON.stringify(value === null ? null : value);
      entry[1](value);
      if (key === 'cachedSongs') {
        localStorage.setItem('okibar-cached-songs', JSON.stringify(value));
      }
    };

    const onInit = (state) => {
      Object.entries(state || {}).forEach(([key, value]) => applyRemote(key, value));
      setSyncedOnce(true);
    };
    const onUpdate = (update) => {
      if (update && typeof update.key === 'string') applyRemote(update.key, update.value);
    };

    socket.on('state:init', onInit);
    socket.on('state:update', onUpdate);
    return () => {
      socket.off('state:init', onInit);
      socket.off('state:update', onUpdate);
    };
  }, []);

  // Broadcast local changes after every render, diffed per key
  useEffect(() => {
    Object.entries(syncedState).forEach(([key, [value]]) => {
      const serialized = JSON.stringify(value === undefined ? null : value);
      if (lastSyncedRef.current[key] === serialized) return;
      lastSyncedRef.current[key] = serialized;
      socket.emit('state:update', { key, value });
    });
  });


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
      const response = await fetch(`${API_BASE_URL}/cached-songs/${videoId}/recheck`, {
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
      const response = await fetch(`${API_BASE_URL}/cached-songs/batch-recheck`, {
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
        pushToast(`Rechecked ${result.updatedCount} songs`, 'success');
      }
    } catch (error) {
      console.error('Failed to batch recheck availability:', error);
      pushToast('Failed to recheck songs. Please try again.', 'danger');
    } finally {
      setIsRecheckingCache(false);
    }
  };

  const clearBlockedSongs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/cached-songs?blocked=true`, {
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
        pushToast(`Cleared ${result.cleared} blocked songs`, 'success');
      }
    } catch (error) {
      console.error('Failed to clear blocked songs:', error);
      pushToast('Failed to clear blocked songs. Please try again.', 'danger');
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
          const response = await fetch(`${API_BASE_URL}/cached-songs/batch-recheck`, {
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
      category: item.category,
      memberId: orderingMemberId
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
    pushToast('Check requested — your server will be right over.', 'success');
  };
  const reserveSong = (searchResult) => {
    const table = tables[currentTable];
    
    // Check song limit (including pending songs)
    const confirmedSongs = table.songCount;
    const pendingSongs = (pendingOrders[currentTable] || []).filter(order => order.type === 'song').length;
    const totalSongs = confirmedSongs + pendingSongs;
    
    if (totalSongs >= maxSongsPerTable) {
      pushToast(`Table ${currentTable} has reached the ${maxSongsPerTable}-song limit.`, 'warn');
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
      isBlocked: searchResult.isBlocked,
      memberId: orderingMemberId
    };

    // Add to pending orders instead of directly confirming
    setPendingOrders(prev => ({
      ...prev,
      [currentTable]: [...(prev[currentTable] || []), transaction]
    }));
    
    // Add song to cache for offline search
    addSongToCache(searchResult);
    pushToast(`Reserved "${searchResult.title}"`, 'success');
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
  // Keep a stable ref so the player/keyboard effects always call the latest playNext
  playNextRef.current = playNext;

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

  // Add new table (placed near top-left of the floor; staff drags into position)
  const addTable = () => {
    const newTableNum = Math.max(...tableList.map(t => t.number), 0) + 1;
    const offset = (tableList.length % 5) * 6;
    const newTable = { number: newTableNum, maxOccupancy: 4, x: 18 + offset, y: 18 + offset };
    updateTables([...tableList, newTable]);
  };

  // --- FLOOR PLAN (2D table layout) ---
  // Persist a table's position (percentage coords) into the synced tableList
  const setTablePos = (num, x, y) => {
    setTableList(prev => prev.map(t => (t.number === num ? { ...t, x, y } : t)));
  };

  // Resolve a table's coords, auto-laying-out any table that has none yet
  const tableXY = (table, index, count) => {
    if (typeof table.x === 'number' && typeof table.y === 'number') return { x: table.x, y: table.y };
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: ((col + 0.5) / cols) * 100, y: ((row + 0.5) / rows) * 100 };
  };

  // Remove table
  const removeTable = (tableNum) => {
    if (tableList.length <= 1) {
      pushToast('Must have at least one table', 'warn');
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

  // --- GUEST MEMBERS (named customers, for split billing) ---
  const addMember = (tableNum, name) => {
    const clean = (name || '').trim();
    if (!clean) return;
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        ...prev[tableNum],
        members: [...(prev[tableNum].members || []), { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: clean }],
        isOccupied: true
      }
    }));
  };

  const removeMember = (tableNum, memberId) => {
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        ...prev[tableNum],
        members: (prev[tableNum].members || []).filter(m => m.id !== memberId),
        // Unassign their orders back to the shared bucket
        orders: (prev[tableNum].orders || []).map(o => (o.memberId === memberId ? { ...o, memberId: null } : o))
      }
    }));
  };

  // Reassign a confirmed order to a member (or null = shared)
  const assignOrderMember = (tableNum, orderId, memberId) => {
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        ...prev[tableNum],
        orders: (prev[tableNum].orders || []).map(o => (o.id === orderId ? { ...o, memberId } : o))
      }
    }));
  };

  // Split a table's confirmed orders by member; shared items split evenly
  const computeSplit = (tableNum) => {
    const t = tables[tableNum] || {};
    const members = t.members || [];
    const orders = t.orders || [];
    const perMember = {};
    members.forEach(m => { perMember[m.id] = { id: m.id, name: m.name, items: [], itemsTotal: 0, total: 0 }; });
    let sharedItems = [];
    let sharedTotal = 0;
    orders.forEach(o => {
      if (o.memberId && perMember[o.memberId]) {
        perMember[o.memberId].items.push(o);
        perMember[o.memberId].itemsTotal += o.price;
      } else {
        sharedItems.push(o);
        sharedTotal += o.price;
      }
    });
    const sharedSplit = members.length ? sharedTotal / members.length : 0;
    members.forEach(m => { perMember[m.id].total = perMember[m.id].itemsTotal + sharedSplit; });
    return { members, perMember, sharedItems, sharedTotal, sharedSplit, grandTotal: t.totalSpent || 0 };
  };

  const openCheckout = (tableNum) => {
    setCheckout({ tableNum });
    setCheckoutPaid({});
  };

  const resetTable = (tableNum) => {
    setPendingOrders(prev => ({ ...prev, [tableNum]: [] }));
    setTables(prev => ({
      ...prev,
      [tableNum]: {
        groupName: '',
        guestCount: Math.min(4, prev[tableNum]?.maxOccupancy || 4),
        members: [],
        orders: [],
        songCount: 0,
        totalSpent: 0,
        checkRequested: false,
        isOccupied: false,
        maxOccupancy: prev[tableNum]?.maxOccupancy || 4
      }
    }));
    setGlobalQueue(prev => prev.filter(song => song.tableNumber !== parseInt(tableNum)));
  };

  // Archive a checkout (with per-customer paid/tab breakdown) and free the table
  const finalizeCheckout = (tableNum, paidMap) => {
    const t = tables[tableNum];
    if (!t) return;
    const split = computeSplit(tableNum);
    const hasMembers = split.members.length > 0;
    const grandTotal = t.totalSpent || 0;

    let amountPaid = 0;
    const breakdown = hasMembers
      ? split.members.map(m => {
          const total = split.perMember[m.id].total;
          const paid = !!paidMap[m.id];
          if (paid) amountPaid += total;
          return { name: m.name, total, paid };
        })
      : [{ name: t.groupName || `Table of ${t.guestCount}`, total: grandTotal, paid: !!paidMap.group }];
    if (!hasMembers && breakdown[0].paid) amountPaid = grandTotal;

    const amountTab = Math.max(0, grandTotal - amountPaid);
    const groupKey = t.groupName || `Table of ${t.guestCount}`;
    const entry = {
      id: Date.now(),
      groupName: groupKey,
      tableNumber: tableNum,
      guestCount: t.guestCount,
      members: t.members || [],
      orders: [...t.orders],
      breakdown,
      sharedTotal: split.sharedTotal,
      totalSpent: grandTotal,
      amountPaid,
      amountTab,
      paid: amountTab === 0,
      checkoutTime: new Date().toISOString()
    };
    // Snapshot for undo (table data, pending orders, and this table's queued songs)
    const snapshot = {
      tableNum,
      table: { ...t },
      pending: [...(pendingOrders[tableNum] || [])],
      queueSongs: globalQueue.filter(s => s.tableNumber === parseInt(tableNum)),
      entryId: entry.id,
      groupKey
    };
    const undoCheckout = () => {
      setGroupHistory(prev => ({ ...prev, [snapshot.groupKey]: (prev[snapshot.groupKey] || []).filter(e => e.id !== snapshot.entryId) }));
      setTables(prev => ({ ...prev, [snapshot.tableNum]: snapshot.table }));
      setPendingOrders(prev => ({ ...prev, [snapshot.tableNum]: snapshot.pending }));
      if (snapshot.queueSongs.length) setGlobalQueue(prev => [...prev, ...snapshot.queueSongs]);
      pushToast(`Checkout for Table ${snapshot.tableNum} undone`, 'info');
    };

    setGroupHistory(prev => ({ ...prev, [groupKey]: [...(prev[groupKey] || []), entry] }));
    resetTable(tableNum);
    setCheckout(null);
    pushToast(
      amountTab === 0
        ? `Table ${tableNum} checked out — paid in full`
        : `Table ${tableNum} checked out — ${currency}${amountTab.toFixed(2)} left on tab`,
      amountTab === 0 ? 'success' : 'warn',
      { duration: 12000, action: { label: 'Undo', onClick: undoCheckout } }
    );
  };

  // Transfer table
  const transferTable = (fromTable, toTable) => {
    const sourceTable = tables[fromTable];
    const targetTable = tables[toTable];
    
    if (!targetTable) {
      pushToast(`Table ${toTable} does not exist`, 'warn');
      return;
    }
    if (targetTable.isOccupied) {
      pushToast(`Table ${toTable} is already occupied`, 'warn');
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
        members: [],
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

    pushToast(`Moved Table ${fromTable} → Table ${toTable}`, 'success');
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

  const assignRole = (role) => setMode(role);

  // Deep link that opens (or syncs) a device straight into a given table
  const tableUrl = (n) => `${window.location.origin}/?mode=table&table=${n}`;

  // Connection indicator shared across top bars
  const connDot = (
    <div className="flex items-center gap-2" title={connStatus === 'connected' ? 'Live-synced' : 'Reconnecting…'}>
      <span className={`conn-dot ${connStatus === 'connected' ? 'is-on' : 'is-off'}`} />
      <span className="label hidden sm:inline">{connStatus === 'connected' ? 'Synced' : 'Reconnecting'}</span>
    </div>
  );

  // Overlays rendered in every mode: toasts + themed dialogs (replace native popups)
  const overlays = (
    <>
      {/* Toasts */}
      <div className="toast-wrap" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type} fade-up`} role="status" onClick={() => dismissToast(t.id)}>
            {t.type === 'success' && <Check className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'danger' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="btn btn-sm btn-ghost flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); t.action.onClick(); dismissToast(t.id); }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmState(null); }}>
          <div className="modal-card fade-up" role="dialog" aria-modal="true" aria-label={confirmState.title}>
            <h3 className="h-display text-lg mb-2">{confirmState.title}</h3>
            {confirmState.body && <p className="muted text-sm mb-5">{confirmState.body}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setConfirmState(null)}>Cancel</button>
              <button className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={runConfirm}>
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-menu-item form */}
      {menuForm && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuForm(null); }}>
          <form
            className="modal-card fade-up"
            role="dialog"
            aria-modal="true"
            aria-label="Add menu item"
            onSubmit={(e) => {
              e.preventDefault();
              if (!menuForm.name || !menuForm.price) { pushToast('Name and price are required', 'warn'); return; }
              addMenuItem(menuForm.category, menuForm.name, menuForm.price, menuForm.itemCategory || 'Other');
              pushToast(`Added "${menuForm.name}"`, 'success');
              setMenuForm(null);
            }}
          >
            <h3 className="h-display text-lg mb-4">Add {menuForm.category === 'drinks' ? 'Drink' : 'Food Item'}</h3>
            <div className="space-y-3">
              <div>
                <label className="label block mb-1">Name</label>
                <input className="input" autoFocus value={menuForm.name} onChange={(e) => setMenuForm({ ...menuForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label block mb-1">Price</label>
                <input className="input" type="number" step="0.50" min="0" value={menuForm.price} onChange={(e) => setMenuForm({ ...menuForm, price: e.target.value })} />
              </div>
              <div>
                <label className="label block mb-1">Category</label>
                <input className="input" placeholder={menuForm.category === 'drinks' ? 'e.g. Alcohol' : 'e.g. Mains'} value={menuForm.itemCategory} onChange={(e) => setMenuForm({ ...menuForm, itemCategory: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-ghost" onClick={() => setMenuForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Add Item</button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer-table form */}
      {transferForm && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setTransferForm(null); }}>
          <form
            className="modal-card fade-up"
            role="dialog"
            aria-modal="true"
            aria-label="Transfer table"
            onSubmit={(e) => {
              e.preventDefault();
              if (!transferForm.to) { pushToast('Pick a destination table', 'warn'); return; }
              transferTable(transferForm.from, transferForm.to);
              setTransferForm(null);
            }}
          >
            <h3 className="h-display text-lg mb-4">Transfer Table {transferForm.from}</h3>
            <label className="label block mb-1">Move guests to</label>
            <select className="select" autoFocus value={transferForm.to} onChange={(e) => setTransferForm({ ...transferForm, to: e.target.value })}>
              <option value="">Select a table…</option>
              {tableList
                .filter(t => String(t.number) !== String(transferForm.from) && !tables[t.number]?.isOccupied)
                .map(t => <option key={t.number} value={t.number}>Table {t.number}</option>)}
            </select>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-ghost" onClick={() => setTransferForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Transfer</button>
            </div>
          </form>
        </div>
      )}

      {/* QR code modal */}
      {qrTable != null && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setQrTable(null); }}>
          <div className="modal-card fade-up text-center" role="dialog" aria-modal="true" aria-label={`QR code for table ${qrTable}`}>
            <h3 className="h-display text-lg mb-1">Table {qrTable}</h3>
            <p className="muted text-sm mb-4">Guests scan to open this table on their phone</p>
            <div className="qr-box mx-auto">
              <QRCodeSVG value={tableUrl(qrTable)} size={220} bgColor="#ffffff" fgColor="#0a0e17" level="M" includeMargin />
            </div>
            <p className="dim text-xs mt-4 break-all">{tableUrl(qrTable)}</p>
            <button className="btn btn-ghost mt-5" onClick={() => setQrTable(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Add-guest (member) form */}
      {memberForm && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMemberForm(null); }}>
          <form
            className="modal-card fade-up"
            role="dialog"
            aria-modal="true"
            aria-label="Add guest"
            onSubmit={(e) => {
              e.preventDefault();
              if (!memberForm.name.trim()) { pushToast('Enter a name', 'warn'); return; }
              addMember(memberForm.tableNum, memberForm.name);
              // keep open for fast multi-add, just clear the field
              setMemberForm({ ...memberForm, name: '' });
            }}
          >
            <h3 className="h-display text-lg mb-1">Add Guest — Table {memberForm.tableNum}</h3>
            <p className="muted text-sm mb-4">Name each guest so orders can be split per customer.</p>
            <input className="input" autoFocus placeholder="Guest name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-ghost" onClick={() => setMemberForm(null)}>Done</button>
              <button type="submit" className="btn btn-primary"><UserPlus className="w-4 h-4" /> Add</button>
            </div>
          </form>
        </div>
      )}

      {/* Checkout / split-bill modal */}
      {checkout && (() => {
        const t = tables[checkout.tableNum] || {};
        const split = computeSplit(checkout.tableNum);
        const hasMembers = split.members.length > 0;
        const lines = hasMembers
          ? split.members.map(m => ({ key: m.id, name: m.name, total: split.perMember[m.id].total, items: split.perMember[m.id].items.length }))
          : [{ key: 'group', name: t.groupName || `Table of ${t.guestCount}`, total: t.totalSpent || 0, items: (t.orders || []).length }];
        const paidTotal = lines.reduce((s, l) => s + (checkoutPaid[l.key] ? l.total : 0), 0);
        const tabRemaining = Math.max(0, (t.totalSpent || 0) - paidTotal);
        const allPaid = lines.every(l => checkoutPaid[l.key]);
        const togglePaid = (key) => setCheckoutPaid(prev => ({ ...prev, [key]: !prev[key] }));

        return (
          <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setCheckout(null); }}>
            <div className="modal-card fade-up" role="dialog" aria-modal="true" aria-label="Checkout" style={{ maxWidth: '34rem' }}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="h-display text-lg">Check Out — Table {checkout.tableNum}</h3>
                <button className="icon-btn" onClick={() => setCheckout(null)} aria-label="Close"><X className="w-4 h-4" /></button>
              </div>
              <p className="muted text-sm mb-4">
                {hasMembers ? 'Tap each guest as they pay.' : 'No named guests — settle the whole bill, or add names in Guests to split.'}
                {split.sharedTotal > 0 && hasMembers && <> Shared items ({currency}{split.sharedTotal.toFixed(2)}) are split evenly.</>}
              </p>

              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {lines.map(l => (
                  <button
                    key={l.key}
                    onClick={() => togglePaid(l.key)}
                    className={`row w-full flex items-center justify-between p-3 ${checkoutPaid[l.key] ? '' : ''}`}
                    style={checkoutPaid[l.key] ? { borderColor: 'var(--ok-border)', background: 'var(--ok-soft)' } : undefined}
                  >
                    <div className="flex items-center gap-3 text-left">
                      <span className={`conn-dot ${checkoutPaid[l.key] ? 'is-on' : ''}`} style={!checkoutPaid[l.key] ? { background: 'var(--text-dim)', boxShadow: 'none' } : undefined} />
                      <div>
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-xs dim">{l.items} item{l.items === 1 ? '' : 's'}{checkoutPaid[l.key] ? ' · paid' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="money">{currency}{l.total.toFixed(2)}</span>
                      {checkoutPaid[l.key] && <Check className="w-4 h-4" style={{ color: 'var(--ok)' }} />}
                    </div>
                  </button>
                ))}
              </div>

              <div className="subpanel p-3 mt-4 space-y-1">
                <div className="flex justify-between text-sm"><span className="muted">Bill total</span><span className="money">{currency}{(t.totalSpent || 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="muted">Paid</span><span style={{ color: 'var(--ok)' }}>{currency}{paidTotal.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold"><span>Remaining</span><span style={{ color: tabRemaining > 0 ? 'var(--warn)' : 'var(--ok)' }}>{currency}{tabRemaining.toFixed(2)}</span></div>
              </div>

              <div className="flex flex-wrap justify-between gap-2 mt-5">
                <button
                  className="btn btn-ghost"
                  onClick={() => setCheckoutPaid(Object.fromEntries(lines.map(l => [l.key, true])))}
                >
                  Mark all paid
                </button>
                <div className="flex gap-2">
                  {!allPaid && (
                    <button
                      className="btn btn-warn"
                      onClick={() => askConfirm({
                        title: `Close Table ${checkout.tableNum} with an open tab?`,
                        body: `${currency}${tabRemaining.toFixed(2)} will be recorded as unpaid.`,
                        confirmLabel: 'Close as Tab',
                        onConfirm: () => finalizeCheckout(checkout.tableNum, checkoutPaid)
                      })}
                    >
                      Close as Tab
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    disabled={!allPaid && (t.totalSpent || 0) > 0}
                    onClick={() => finalizeCheckout(checkout.tableNum, checkoutPaid)}
                  >
                    <CheckCircle className="w-4 h-4" /> Paid &amp; Check Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Staff PIN gate */}
      {pinGate && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { setPinGate(null); setPinEntry(''); } }}>
          <form
            className="modal-card fade-up text-center"
            role="dialog"
            aria-modal="true"
            aria-label="Staff PIN required"
            style={{ maxWidth: '20rem' }}
            onSubmit={(e) => { e.preventDefault(); submitPin(); }}
          >
            <Settings className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--brand)' }} />
            <h3 className="h-display text-lg mb-1">Staff PIN</h3>
            <p className="muted text-sm mb-4">Enter the staff PIN to continue.</p>
            <input
              className="input text-center"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value)}
              style={{ letterSpacing: '0.4em', fontSize: '1.2rem' }}
            />
            <div className="flex gap-2 mt-5">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => { setPinGate(null); setPinEntry(''); }}>Cancel</button>
              <button type="submit" className="btn btn-primary flex-1">Unlock</button>
            </div>
          </form>
        </div>
      )}
    </>
  );

  // LANDING SCREEN — guest-first: scan a QR or sit down at a table.
  // Staff roles (Bar / TV) are tucked behind the discreet cog top-right.
  if (!mode) {
    return (
      <div className="okibar-app">
        {/* Discreet staff entry */}
        <div className="absolute top-5 right-5 z-30">
          <button
            className="icon-btn"
            onClick={() => setStaffMenu(v => !v)}
            aria-label="Staff options"
            aria-expanded={staffMenu}
            title="Staff"
          >
            <Settings className="w-5 h-5" />
          </button>
          {staffMenu && (
            <>
              {/* click-away layer */}
              <div className="fixed inset-0 z-20" onClick={() => setStaffMenu(false)} />
              <div className="panel p-2 absolute right-0 mt-2 z-30" style={{ minWidth: '200px' }} role="menu">
                <div className="label px-2 py-1">Staff {hasPin && <span className="tag tag-brand ml-1">PIN</span>}</div>
                <button className="seg-btn w-full" style={{ textAlign: 'left', display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={() => { setStaffMenu(false); requireStaff(() => assignRole('bar')); }} role="menuitem">
                  <Settings className="w-4 h-4" /> Bar Console
                </button>
                <button className="seg-btn w-full" style={{ textAlign: 'left', display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={() => { setStaffMenu(false); requireStaff(() => assignRole('tv')); }} role="menuitem">
                  <Monitor className="w-4 h-4" /> TV / Screen
                </button>
              </div>
            </>
          )}
        </div>

        <div className="min-h-screen flex items-center justify-center px-4 py-10">
          <div className="text-center fade-up w-full" style={{ maxWidth: '560px' }}>
            <div className="brand-dot mx-auto mb-6" style={{ width: '1rem', height: '1rem' }} />
            <div className="wordmark text-5xl sm:text-6xl mb-3">Oki<span className="brand-text">bar</span></div>
            <p className="text-lg sm:text-xl muted mb-10">Karaoke, drinks &amp; good times.</p>

            <div className="panel p-8">
              <h2 className="h-display text-2xl mb-1">Join your table</h2>
              <p className="muted mb-6">Scan with your phone to sing from your seat — or tap Sit Down to use this device.</p>

              <div className="qr-box mx-auto mb-2">
                <QRCodeSVG value={tableUrl(currentTable)} size={208} bgColor="#ffffff" fgColor="#0a0e17" level="M" includeMargin />
              </div>
              <p className="label">Scan to join Table {currentTable}</p>
              <p className="dim text-xs mb-6">This screen opens to your table automatically when someone scans.</p>

              <div className="divide-line pt-6">
                <div className="flex gap-2 justify-center flex-wrap items-center">
                  <select
                    className="select"
                    style={{ width: 'auto' }}
                    aria-label="Choose your table"
                    value={currentTable}
                    onChange={(e) => setCurrentTable(parseInt(e.target.value, 10))}
                  >
                    {tableList.map(t => <option key={t.number} value={t.number}>Table {t.number}</option>)}
                  </select>
                  <button className="btn btn-primary" onClick={() => assignRole('table')}>
                    <Mic2 className="w-4 h-4" /> Sit Down
                  </button>
                </div>
                <p className="dim text-xs mt-4 break-all">{tableUrl(currentTable)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TABLE MODE
  if (mode === 'table') {
    const table = tables[currentTable];
    const groupName = table.groupName || `Table of ${table.guestCount}`;
    
    const pendingTotal = (pendingOrders[currentTable] || []).reduce((sum, order) => sum + order.price, 0);

    return (
      <div className="okibar-app">
        {overlays}
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-inner">
            <div className="flex items-center gap-3">
              <span className="brand-dot" />
              <div className="leading-tight">
                <div className="wordmark text-xl">Oki<span className="brand-text">bar</span></div>
                <div className="label" style={{ marginTop: '2px' }}>{groupName}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {connDot}
              {/* Table switcher only when unlocked (no staff PIN). With a PIN set,
                  a guest device is kiosk-locked to its own table. */}
              {!hasPin && (
                <select
                  aria-label="Table number"
                  className="select"
                  style={{ width: 'auto' }}
                  value={currentTable}
                  onChange={(e) => setCurrentTable(parseInt(e.target.value, 10))}
                >
                  {tableList.map(t => <option key={t.number} value={t.number}>Table {t.number}</option>)}
                </select>
              )}
              <span className="tag">Table {currentTable}</span>
              <button onClick={() => setQrTable(currentTable)} className="icon-btn" title="Invite — show table QR" aria-label="Show table QR code">
                <QrCode className="w-4 h-4" />
              </button>
              <button onClick={() => requireStaff(() => setMode(null))} className="icon-btn" title="Staff — change device role" aria-label="Staff — change device role">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="okibar-shell fade-up">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="stat">
              <div className="stat-num" style={{ color: 'var(--brand)' }}>{table.songCount}/{maxSongsPerTable}</div>
              <div className="stat-cap">Songs Reserved</div>
            </div>
            <div className="stat">
              <div className="stat-num money">{currency}{table.totalSpent.toFixed(2)}</div>
              <div className="stat-cap">Total Spent</div>
            </div>
            <div className="stat">
              <div className="stat-num">{table.guestCount}</div>
              <div className="stat-cap">Guests</div>
            </div>
            <button
              onClick={requestCheck}
              disabled={table.checkRequested}
              className={`btn ${table.checkRequested ? 'btn-warn' : 'btn-success'}`}
              style={{ height: '100%' }}
            >
              {table.checkRequested ? '✓ Check Requested' : '💳 Request Check'}
            </button>
          </div>

          {/* Page Navigation */}
          <div className="seg mb-6">
            <button onClick={() => setTablePage('karaoke')} className={`seg-btn ${tablePage === 'karaoke' ? 'is-active' : ''}`}>
              🎤 Karaoke
            </button>
            <button onClick={() => setTablePage('menu')} className={`seg-btn ${tablePage === 'menu' ? 'is-active' : ''}`}>
              🍽️ Menu
            </button>
          </div>

          {/* Ordering as — tags songs & orders to a guest for split billing */}
          {(table.members || []).length > 0 && (
            <div className="panel p-4 mb-6 flex items-center gap-3 flex-wrap">
              <Users className="w-4 h-4" style={{ color: 'var(--brand)' }} />
              <span className="label">Ordering as</span>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={orderingMemberId || ''}
                onChange={(e) => setOrderingMemberId(e.target.value || null)}
                aria-label="Ordering as which guest"
              >
                <option value="">Shared / table</option>
                {table.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <span className="dim text-xs">Songs &amp; items you add are billed to this guest.</span>
            </div>
          )}

          {/* Karaoke Page */}
          {tablePage === 'karaoke' && (
            <div className="panel p-5 mb-6">
              <h2 className="h-display text-lg mb-4 flex items-center gap-2">
                <Search className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                Find Karaoke Songs
              </h2>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchKaraokeVideos(searchQuery)}
                  placeholder="Search for any song..."
                  className="input flex-1"
                />
                <button
                  onClick={() => searchKaraokeVideos(searchQuery)}
                  disabled={isSearching}
                  className="btn btn-primary"
                >
                  {isSearching ? <Clock className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>{isSearching ? 'Searching...' : 'Search'}</span>
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {searchResults.map((result) => (
                    <div key={result.id} className={`row flex items-center gap-3 p-3 ${result.isBlocked ? 'row-danger' : ''}`}>
                      <div className="relative">
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          className={`w-16 h-12 object-cover rounded-lg flex-shrink-0 ${result.isBlocked ? 'opacity-60' : ''}`}
                        />
                        {result.isBlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm sm:text-base font-semibold truncate">{result.title}</h4>
                          {result.isBlocked && <span className="tag tag-danger flex-shrink-0">Restricted</span>}
                        </div>
                        <p className="text-xs dim">{result.channel}</p>
                        {result.isBlocked && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Embedding disabled — can watch on YouTube</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm money mb-1">{currency}{songPrice.toFixed(2)}</div>
                        {result.isBlocked ? (
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => window.open(`https://www.youtube.com/watch?v=${result.videoId}`, '_blank')}
                              className="btn btn-sm btn-danger"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Watch
                            </button>
                            <button
                              onClick={() => reserveSong(result)}
                              disabled={table.songCount >= maxSongsPerTable}
                              className="btn btn-sm btn-ghost"
                              title="Reserve anyway (will need manual playback)"
                            >
                              Reserve
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => reserveSong(result)}
                            disabled={table.songCount >= maxSongsPerTable}
                            className="btn btn-sm btn-primary"
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
          )}

          {/* Menu Page */}
          {tablePage === 'menu' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {/* Drinks */}
              <div className="panel p-5">
                <h2 className="h-display text-lg mb-4 flex items-center gap-2">🍺 Drinks</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {menuItems.drinks.map((item) => (
                    <div key={item.id} className={`row flex items-center justify-between p-3 ${!item.inStock ? 'row-danger' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`font-semibold ${!item.inStock ? 'line-through dim' : ''}`}>{item.name}</h4>
                          {!item.inStock && <span className="tag tag-danger">OUT</span>}
                        </div>
                        <p className="text-xs dim">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={item.inStock ? 'money' : 'dim'}>{currency}{item.price.toFixed(2)}</span>
                        <button onClick={() => addToPendingOrders(item)} disabled={!item.inStock} className="btn btn-sm btn-primary">
                          {item.inStock ? 'Add' : 'Out'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Food */}
              <div className="panel p-5">
                <h2 className="h-display text-lg mb-4 flex items-center gap-2">🍕 Food</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {menuItems.food.map((item) => (
                    <div key={item.id} className={`row flex items-center justify-between p-3 ${!item.inStock ? 'row-danger' : ''}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`font-semibold ${!item.inStock ? 'line-through dim' : ''}`}>{item.name}</h4>
                          {!item.inStock && <span className="tag tag-danger">OUT</span>}
                        </div>
                        <p className="text-xs dim">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={item.inStock ? 'money' : 'dim'}>{currency}{item.price.toFixed(2)}</span>
                        <button onClick={() => addToPendingOrders(item)} disabled={!item.inStock} className="btn btn-sm btn-primary">
                          {item.inStock ? 'Add' : 'Out'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Pending Orders */}
          {(pendingOrders[currentTable]?.length || 0) > 0 && (
            <div className="panel p-5 mb-6" style={{ borderColor: 'var(--warn-border)' }}>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <h2 className="h-display text-lg" style={{ color: 'var(--warn)' }}>Pending Orders</h2>
                <div className="flex gap-2">
                  <button onClick={confirmOrders} className="btn btn-success">
                    <CheckCircle className="w-4 h-4" />
                    Confirm All
                  </button>
                  <button onClick={clearPendingOrders} className="btn btn-danger">Clear All</button>
                </div>
              </div>
              <div className="space-y-2">
                {(pendingOrders[currentTable] || []).map((order) => (
                  <div key={order.id} className="row flex items-center justify-between p-3" style={{ background: 'var(--warn-soft)', borderColor: 'var(--warn-border)' }}>
                    <div>
                      <h4 className="font-semibold">{order.item}</h4>
                      <p className="text-xs dim">{order.type === 'song' ? '🎤' : '🍽️'} {order.category || 'Song'} · Pending confirmation</p>
                    </div>
                    <div className="font-bold" style={{ color: 'var(--warn)' }}>{currency}{order.price.toFixed(2)}</div>
                  </div>
                ))}
                <div className="divide-line pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold">
                    <span>Pending Total</span>
                    <span style={{ color: 'var(--warn)' }}>{currency}{pendingTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Confirmed Orders */}
          <div className="panel p-5">
            <h2 className="h-display text-lg mb-4">Confirmed Orders</h2>
            {table.orders.length === 0 && (pendingOrders[currentTable]?.length || 0) === 0 ? (
              <div className="text-center py-10 dim">
                <div className="text-4xl mb-2">📝</div>
                <p className="font-medium">No orders yet</p>
                <p className="text-sm">Search for songs or browse the menu</p>
              </div>
            ) : table.orders.length === 0 ? (
              <div className="text-center py-6 dim">
                <p className="font-medium">No confirmed orders yet</p>
                <p className="text-sm">Confirm your pending orders above</p>
              </div>
            ) : (
              <div className="space-y-2">
                {table.orders.map((order) => (
                  <div key={order.id} className="row flex items-center justify-between p-3">
                    <div>
                      <h4 className="font-semibold">{order.item}</h4>
                      <p className="text-xs dim">{order.type === 'song' ? '🎤' : '🍽️'} {order.category || 'Song'} · {new Date(order.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="money">{currency}{order.price.toFixed(2)}</div>
                  </div>
                ))}
                <div className="divide-line pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold">
                    <span>Confirmed Total</span>
                    <span className="money">{currency}{table.totalSpent.toFixed(2)}</span>
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
      <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {overlays}
        {/* Top Bar */}
        <div className="absolute top-5 left-5 right-5 z-10 flex justify-between items-center gap-3">
          {/* Next Song Info */}
          {globalQueue.length > 0 ? (
            <div className="panel px-4 py-2.5 flex items-center gap-3">
              <span className="brand-dot" />
              <div className="leading-tight">
                <div className="label">Up Next</div>
                <div className="text-sm font-semibold truncate max-w-[40vw]">{globalQueue[0].title}</div>
              </div>
              <span className="text-xs dim">· {globalQueue[0].groupName}</span>
            </div>
          ) : <span />}

          {/* Controls */}
          <div className="flex items-center gap-2">
            {connDot}
            {currentSong && (
              <button
                onClick={() => window.open(`https://www.youtube.com/watch?v=${currentSong.videoId}`, '_blank')}
                className="icon-btn"
                title="Open in YouTube (Fullscreen)"
                aria-label="Open in YouTube"
              >
                <ExternalLink className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => setIsMuted(!isMuted)} className="icon-btn" title={isMuted ? 'Unmute' : 'Mute'} aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button onClick={toggleFullscreen} className="icon-btn" title="Toggle fullscreen" aria-label="Toggle fullscreen">
              <Maximize2 className="w-5 h-5" />
            </button>
            <button onClick={() => requireStaff(() => setMode(null))} className="icon-btn" title="Staff — change device role" aria-label="Staff — change device role">
              <Smartphone className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Player — YouTube IFrame API mounts into the host div; if it
            can't load (offline/blocked) we fall back to a plain embed. */}
        {currentSong && isPlaying ? (
          <div className="flex-1 relative">
            {ytFallback ? (
              <iframe
                key={currentSong.videoId}
                title="Karaoke video"
                width="100%"
                height="100%"
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${currentSong.videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1&playsinline=1`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div ref={ytHostRef} className="w-full h-full" />
            )}
            {/* Now-playing progress (live only when the API is driving playback) */}
            <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-4" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
              <div className="flex items-center gap-3 text-white">
                <Play className="w-4 h-4 flex-shrink-0" />
                {ytFallback ? (
                  <span className="text-sm flex-1">Now playing — {currentSong.title}</span>
                ) : (
                  <>
                    <span className="text-sm tabular-nums">{fmtTime(progress.current)}</span>
                    <div className="progress flex-1">
                      <div className="progress-fill" style={{ width: progress.duration ? `${Math.min(100, (progress.current / progress.duration) * 100)}%` : '0%' }} />
                    </div>
                    <span className="text-sm tabular-nums">{fmtTime(progress.duration)}</span>
                  </>
                )}
                <button onClick={playNext} className="btn btn-sm btn-ghost ml-2" title="Skip">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="okibar-app flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="text-7xl mb-6 fade-up">🎤</div>
              <div className="label mb-3">Okibar Live</div>
              <h1 className="h-display text-5xl sm:text-7xl mb-8 brand-text">Karaoke Night</h1>
              {globalQueue.length > 0 ? (
                <div className="panel p-8 inline-block fade-up">
                  <div className="label mb-3">Up Next · {globalQueue[0].groupName}</div>
                  <img
                    src={globalQueue[0].thumbnail}
                    alt="Next song"
                    className="w-72 h-40 object-cover rounded-xl mb-5 mx-auto"
                  />
                  <h3 className="h-display text-xl mb-5 max-w-md mx-auto">{globalQueue[0].title}</h3>
                  <button onClick={playNext} className="btn btn-primary text-lg px-8 py-4 mx-auto">
                    <Play className="w-6 h-6" />
                    Start Song
                  </button>
                </div>
              ) : (
                <p className="text-2xl muted">No songs in queue</p>
              )}
            </div>
          </div>
        )}

        {/* Current Singer Info */}
        {currentSong && (
          <div className="absolute bottom-5 left-5 panel px-5 py-3">
            <div className="h-display text-lg">{currentSong.groupName}</div>
            <div className="label">Now Singing</div>
          </div>
        )}
      </div>
    );
  }

  // BAR MODE
  if (mode === 'bar') {
    // Forced first-run security: the Bar Console can't be used until a staff PIN
    // exists, so a venue is never left wide open (and a guest can't claim the
    // PIN first). Wait for the initial server sync so we don't prompt on a
    // device that's about to receive an existing PIN.
    if (!hasPin) {
      return (
        <div className="okibar-app flex items-center justify-center">
          {overlays}
          <div className="okibar-shell fade-up" style={{ maxWidth: '24rem' }}>
            {!syncedOnce ? (
              <div className="panel p-8 text-center">
                <div className="brand-dot mx-auto mb-4" style={{ width: '1rem', height: '1rem' }} />
                <h2 className="h-display text-lg mb-1">Connecting…</h2>
                <p className="muted text-sm">Loading venue settings.</p>
              </div>
            ) : (
              <form
                className="panel p-8 text-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pinDraft.length < 4) { pushToast('PIN must be at least 4 digits', 'warn'); return; }
                  setStaffPin(hashPin(pinDraft));
                  setPinDraft('');
                  pushToast('Staff PIN set — console unlocked', 'success');
                }}
              >
                <Settings className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--brand)' }} />
                <h2 className="h-display text-xl mb-1">Secure this venue</h2>
                <p className="muted text-sm mb-5">Create a staff PIN before opening the console. You'll use it to reach admin and to lock guest tablets.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  className="input text-center"
                  style={{ letterSpacing: '0.4em', fontSize: '1.2rem' }}
                  placeholder="4-digit PIN"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button type="submit" className="btn btn-primary w-full mt-5" disabled={pinDraft.length < 4}>
                  Set PIN &amp; Continue
                </button>
                <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => setMode(null)}>
                  Back
                </button>
              </form>
            )}
          </div>
        </div>
      );
    }

    const barTabs = [
      { id: 'queue', label: '🎤 Queue' },
      { id: 'orders', label: '📋 Orders' },
      { id: 'guests', label: '👥 Guests' },
      { id: 'floor', label: '🗺️ Floor' },
      { id: 'tables', label: '🪑 Tables' },
      { id: 'menu', label: '🍽️ Menu' },
      { id: 'history', label: '📅 History' },
      { id: 'settings', label: '⚙️ Settings' }
    ];

    return (
      <div className="okibar-app">
        {overlays}
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-inner">
            <div className="flex items-center gap-3">
              <span className="brand-dot" />
              <div className="leading-tight">
                <div className="wordmark text-xl">Oki<span className="brand-text">bar</span></div>
                <div className="label" style={{ marginTop: '2px' }}>Admin Console</div>
              </div>
              {(barPage === 'menu' || barPage === 'tables' || barPage === 'floor') && (
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`btn btn-sm ml-2 ${isEditMode ? 'btn-danger' : 'btn-warn'}`}
                >
                  <Edit3 className="w-4 h-4" />
                  {isEditMode ? 'Done' : (barPage === 'menu' ? 'Edit Menu' : barPage === 'floor' ? 'Arrange' : 'Edit Tables')}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {connDot}
              <button onClick={() => setMode(null)} className="btn btn-ghost" title="Change device role">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Device</span>
              </button>
            </div>
          </div>
        </header>

        <div className="okibar-shell fade-up">
          {/* Page Navigation */}
          <div className="seg seg-scroll mb-6">
            {barTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setBarPage(tab.id)}
                className={`seg-btn ${barPage === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Floor Plan Page */}
          {barPage === 'floor' && (
            <div className="panel p-5 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="h-display text-xl">Floor Plan</h3>
                  <p className="text-sm dim">
                    {isEditMode
                      ? 'Arrange mode — drag tables to lay out the room.'
                      : 'Drag an occupied table onto an empty one to move the group.'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="conn-dot is-on" /> Occupied</span>
                  <span className="flex items-center gap-1"><span className="conn-dot" style={{ background: 'var(--text-dim)', boxShadow: 'none' }} /> Empty</span>
                </div>
              </div>

              <div
                ref={floorRef}
                className="floor"
                style={isEditMode ? { cursor: 'default' } : undefined}
              >
                {tableList.map((table, index) => {
                  const data = tables[table.number] || {};
                  const occupied = !!data.isOccupied;
                  const base = tableXY(table, index, tableList.length);
                  const live = dragPos && dragPos.num === table.number ? dragPos : null;
                  const x = live ? live.x : base.x;
                  const y = live ? live.y : base.y;

                  const onPointerDownRepos = (e) => {
                    if (!isEditMode) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    reposRef.current = table.number;
                    setDragPos({ num: table.number, x, y });
                  };
                  const onPointerMoveRepos = (e) => {
                    if (reposRef.current !== table.number || !floorRef.current) return;
                    const rect = floorRef.current.getBoundingClientRect();
                    const nx = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
                    const ny = Math.min(94, Math.max(6, ((e.clientY - rect.top) / rect.height) * 100));
                    setDragPos({ num: table.number, x: nx, y: ny });
                  };
                  const onPointerUpRepos = (e) => {
                    if (reposRef.current !== table.number) return;
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
                    if (dragPos && dragPos.num === table.number) setTablePos(table.number, dragPos.x, dragPos.y);
                    reposRef.current = null;
                    setDragPos(null);
                  };

                  return (
                    <div
                      key={table.number}
                      className={`floor-table ${occupied ? 'is-occupied' : 'is-empty'} ${isEditMode ? 'is-arrange' : ''}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      // Repositioning (arrange mode)
                      onPointerDown={onPointerDownRepos}
                      onPointerMove={onPointerMoveRepos}
                      onPointerUp={onPointerUpRepos}
                      // Group relocation (normal mode): drag occupied → drop on another
                      draggable={!isEditMode && occupied}
                      onDragStart={() => { if (!isEditMode && occupied) dragGroupRef.current = table.number; }}
                      onDragOver={(e) => { if (!isEditMode) e.preventDefault(); }}
                      onDrop={() => {
                        if (isEditMode) return;
                        const from = dragGroupRef.current;
                        dragGroupRef.current = null;
                        if (from == null || from === table.number) return;
                        const fromData = tables[from] || {};
                        if (occupied) { pushToast(`Table ${table.number} is occupied`, 'warn'); return; }
                        askConfirm({
                          title: `Move ${fromData.groupName || `Table ${from}`} to Table ${table.number}?`,
                          body: `Relocates the group and its ${(globalQueue.filter(s => s.tableNumber === parseInt(from)).length)} queued song(s) from Table ${from}.`,
                          confirmLabel: 'Move group',
                          onConfirm: () => transferTable(String(from), String(table.number))
                        });
                      }}
                      title={occupied ? `${data.groupName || `Table ${table.number}`}` : `Table ${table.number} (empty)`}
                    >
                      <div className="floor-num">{table.number}</div>
                      <div className="floor-occ">{occupied ? `${data.guestCount}/${table.maxOccupancy}` : table.maxOccupancy}</div>
                      {occupied && (
                        <div className="floor-meta">
                          <div className="truncate">{data.groupName || `Table of ${data.guestCount}`}</div>
                          <div className="money">{currency}{(data.totalSpent || 0).toFixed(0)}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tables Page */}
          {barPage === 'tables' && (
            <div className="panel p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="h-display text-xl">Table Manager</h3>
                {isEditMode && (
                  <button onClick={addTable} className="btn btn-success">
                    <Plus className="w-4 h-4" />
                    Add Table
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {tableList.map((table) => (
                  <div key={table.number} className="row flex flex-wrap items-center gap-4 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">Table {table.number}</span>
                      <span className={`tag ${tables[table.number]?.isOccupied ? 'tag-ok' : ''}`}>
                        {tables[table.number]?.isOccupied ? 'Occupied' : 'Empty'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="label">Max</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={table.maxOccupancy}
                        onChange={(e) => updateTableOccupancy(table.number, parseInt(e.target.value) || 1)}
                        className="input w-16 py-1"
                        disabled={!isEditMode}
                      />
                      <span className="text-xs dim">guests</span>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      {tables[table.number] && (
                        <span className="text-xs dim">
                          {tables[table.number].guestCount} guests · <span className="money">{currency}{tables[table.number].totalSpent.toFixed(2)}</span>
                        </span>
                      )}
                      <button onClick={() => setQrTable(table.number)} className="icon-btn" title="Show QR code" aria-label={`Show QR code for table ${table.number}`}>
                        <QrCode className="w-4 h-4" />
                      </button>
                      {isEditMode && (
                        <button
                          onClick={() => askConfirm({
                            title: `Remove Table ${table.number}?`,
                            body: 'This clears all current data for this table.',
                            confirmLabel: 'Remove',
                            danger: true,
                            onConfirm: () => removeTable(table.number)
                          })}
                          className="icon-btn"
                          title="Remove table"
                          aria-label={`Remove table ${table.number}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Menu Page */}
          {barPage === 'menu' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              {/* Drinks Section */}
              <div className="panel p-5">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="h-display text-lg">🍺 Drinks</h4>
                  {isEditMode && (
                    <button
                      onClick={() => setMenuForm({ category: 'drinks', name: '', price: '', itemCategory: '' })}
                      className="btn btn-sm btn-primary"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {menuItems.drinks.map((item) => (
                    <div key={item.id} className={`row flex items-center gap-3 p-3 ${!item.inStock ? 'row-danger' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className={`font-semibold ${!item.inStock ? 'line-through dim' : ''}`}>{item.name}</h5>
                          {!item.inStock && <span className="tag tag-danger">OUT OF STOCK</span>}
                        </div>
                        <p className="text-xs dim">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMenuItemStock('drinks', item.id)}
                          className={`btn btn-sm ${item.inStock ? 'btn-success' : 'btn-danger'}`}
                        >
                          {item.inStock ? 'In Stock' : 'Out'}
                        </button>
                        <span className="text-sm dim">{currency}</span>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={item.price.toFixed(2)}
                          onChange={(e) => updateMenuPrice('drinks', item.id, parseFloat(e.target.value) || 0)}
                          className="input w-20 py-1"
                          disabled={!isEditMode}
                        />
                        {isEditMode && (
                          <button
                            onClick={() => askConfirm({
                              title: `Remove "${item.name}"?`,
                              body: 'This removes the item from the menu.',
                              confirmLabel: 'Remove',
                              danger: true,
                              onConfirm: () => removeMenuItem('drinks', item.id)
                            })}
                            className="icon-btn"
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
              <div className="panel p-5">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="h-display text-lg">🍕 Food</h4>
                  {isEditMode && (
                    <button
                      onClick={() => setMenuForm({ category: 'food', name: '', price: '', itemCategory: '' })}
                      className="btn btn-sm btn-primary"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {menuItems.food.map((item) => (
                    <div key={item.id} className={`row flex items-center gap-3 p-3 ${!item.inStock ? 'row-danger' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className={`font-semibold ${!item.inStock ? 'line-through dim' : ''}`}>{item.name}</h5>
                          {!item.inStock && <span className="tag tag-danger">OUT OF STOCK</span>}
                        </div>
                        <p className="text-xs dim">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleMenuItemStock('food', item.id)}
                          className={`btn btn-sm ${item.inStock ? 'btn-success' : 'btn-danger'}`}
                        >
                          {item.inStock ? 'In Stock' : 'Out'}
                        </button>
                        <span className="text-sm dim">{currency}</span>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={item.price.toFixed(2)}
                          onChange={(e) => updateMenuPrice('food', item.id, parseFloat(e.target.value) || 0)}
                          className="input w-20 py-1"
                          disabled={!isEditMode}
                        />
                        {isEditMode && (
                          <button
                            onClick={() => askConfirm({
                              title: `Remove "${item.name}"?`,
                              body: 'This removes the item from the menu.',
                              confirmLabel: 'Remove',
                              danger: true,
                              onConfirm: () => removeMenuItem('food', item.id)
                            })}
                            className="icon-btn"
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
          )}

          {/* Song Queue Page */}
          {barPage === 'queue' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Queue Controls */}
              <div className="panel p-5 lg:col-span-1 h-fit">
                <h3 className="h-display text-lg mb-4">Now Playing</h3>
                {currentSong ? (
                  <div className="subpanel p-4 mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Mic2 className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                      <span className="font-semibold">{currentSong.groupName}</span>
                    </div>
                    <p className="text-sm dim truncate">{currentSong.title}</p>
                  </div>
                ) : (
                  <p className="dim mb-4">No song playing</p>
                )}
                <div className="flex flex-col gap-2">
                  <button onClick={playNext} className="btn btn-primary">
                    <SkipForward className="w-4 h-4" />
                    Next Song
                  </button>
                  <button onClick={() => setIsPlaying(!isPlaying)} className="btn btn-warn">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {isPlaying ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => setShowCacheViewer(true)} className="btn btn-ghost">
                    <Database className="w-4 h-4" />
                    View Cache
                  </button>
                  {globalQueue.length > 0 && (
                    <button
                      onClick={() => askConfirm({
                        title: 'Clear the whole queue?',
                        body: `Removes all ${globalQueue.length} queued song(s). This can't be undone.`,
                        confirmLabel: 'Clear queue',
                        danger: true,
                        onConfirm: () => { setGlobalQueue([]); pushToast('Queue cleared', 'info'); }
                      })}
                      className="btn btn-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Queue
                    </button>
                  )}
                </div>
              </div>

              {/* Global Queue */}
              <div className="panel p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="h-display text-lg">Song Queue <span className="dim">({globalQueue.length})</span></h3>
                  {globalQueue.length > 1 && <span className="label">Drag ⠿ to reorder</span>}
                </div>
                <div className="space-y-2">
                  {globalQueue.length === 0 ? (
                    <div className="text-center py-10 dim">
                      <Music2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No songs in queue</p>
                    </div>
                  ) : (
                    globalQueue.map((song, index) => (
                      <div
                        key={song.id}
                        className={`row flex items-center gap-3 p-3 ${song.isBlocked ? 'row-danger' : ''}`}
                        draggable
                        onDragStart={() => { dragIndexRef.current = index; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { reorderQueue(dragIndexRef.current, index); dragIndexRef.current = null; }}
                        onDragEnd={() => { dragIndexRef.current = null; }}
                      >
                        <span className="dim cursor-grab active:cursor-grabbing flex-shrink-0" title="Drag to reorder" aria-hidden="true">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <div className="text-sm rounded-full w-7 h-7 flex items-center justify-center font-bold flex-shrink-0" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                          {index + 1}
                        </div>
                        <div className="relative">
                          <img
                            src={song.thumbnail}
                            alt="Video thumbnail"
                            className={`w-14 h-10 object-cover rounded-lg flex-shrink-0 ${song.isBlocked ? 'opacity-60' : ''}`}
                          />
                          {song.isBlocked && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                              <AlertTriangle className="w-3 h-3" style={{ color: 'var(--danger)' }} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold truncate">{song.title}</h4>
                            {song.isBlocked && <span className="tag tag-danger flex-shrink-0">Blocked</span>}
                          </div>
                          <p className="text-xs dim">{song.groupName} · Table {song.tableNumber} · {song.addedAt}</p>
                          {song.isBlocked && <p className="text-xs" style={{ color: 'var(--danger)' }}>Will need manual YouTube playback</p>}
                        </div>
                        <div className="money text-sm">{currency}{song.price.toFixed(2)}</div>
                        <div className="flex items-center gap-1">
                          {song.isBlocked && (
                            <button
                              onClick={() => window.open(`https://www.youtube.com/watch?v=${song.videoId}`, '_blank')}
                              className="icon-btn"
                              title="Watch on YouTube"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setGlobalQueue(prev => prev.filter(s => s.id !== song.id))}
                            className="icon-btn"
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
            </div>
          )}

          {/* Orders Page */}
          {barPage === 'orders' && (
            <>
              {/* Orders Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
                {Object.entries(tables)
                  .filter(([_, tableData]) => tableData.orders.length > 0)
                  .map(([tableNum, tableData]) => (
                  <div key={tableNum} className="panel p-4" style={tableData.checkRequested ? { borderColor: 'var(--warn-border)', background: 'var(--warn-soft)' } : undefined}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="h-display">Table {tableNum}</h3>
                        {tableData.checkRequested && <span className="tag tag-warn">💳 Check</span>}
                      </div>
                      {tableData.checkRequested && (
                        <button
                          onClick={() => setTables(prev => ({
                            ...prev,
                            [tableNum]: { ...prev[tableNum], checkRequested: false }
                          }))}
                          className="btn btn-sm btn-success"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="text-sm muted mb-3">{tableData.groupName || `Table of ${tableData.guestCount}`}</p>
                    <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                      {tableData.orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="muted truncate pr-2 flex-1">{order.item}</span>
                          {(tableData.members || []).length > 0 && (
                            <select
                              className="select py-0.5"
                              style={{ width: 'auto', fontSize: '0.7rem' }}
                              value={order.memberId || ''}
                              onChange={(e) => assignOrderMember(tableNum, order.id, e.target.value || null)}
                              aria-label="Assign order to guest"
                            >
                              <option value="">Shared</option>
                              {tableData.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          )}
                          <span className="money">{currency}{order.price.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="divide-line pt-2">
                      <div className="flex justify-between font-bold text-sm">
                        <span>Total</span>
                        <span className="money">{currency}{tableData.totalSpent.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {Object.entries(tables).filter(([_, tableData]) => tableData.orders.length > 0).length === 0 && (
                <div className="panel p-5 text-center py-12 dim">
                  <div className="text-4xl mb-2">📋</div>
                  <p className="font-medium">No orders yet</p>
                </div>
              )}
            </>
          )}

          {/* Guest Manager Page */}
          {barPage === 'guests' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {Object.entries(tables).map(([tableNum, tableData]) => (
                <div key={tableNum} className="panel p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="h-display text-lg">Table {tableNum}</h3>
                    <span className={`tag ${tableData.isOccupied ? 'tag-ok' : ''}`}>
                      {tableData.isOccupied ? 'Occupied' : 'Empty'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="label block mb-1">Group Name</label>
                      <input
                        type="text"
                        value={tableData.groupName}
                        onChange={(e) => updateGroupInfo(tableNum, e.target.value, tableData.guestCount)}
                        placeholder={`Table of ${tableData.guestCount}`}
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="label block mb-1">Guests</label>
                      <input
                        type="number"
                        min="1"
                        max={tableData.maxOccupancy || 8}
                        value={tableData.guestCount}
                        onChange={(e) => updateGroupInfo(tableNum, tableData.groupName, parseInt(e.target.value) || 1)}
                        className="input w-24"
                      />
                    </div>

                    {/* Members (named customers) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="label">Guests / Members</label>
                        <button
                          onClick={() => setMemberForm({ tableNum, name: '' })}
                          className="btn btn-sm btn-ghost"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>
                      {(tableData.members || []).length === 0 ? (
                        <p className="dim text-xs">No names yet — add guests to split the bill.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tableData.members.map(m => (
                            <span key={m.id} className="tag">
                              {m.name}
                              <button
                                onClick={() => removeMember(tableNum, m.id)}
                                className="ml-1 hover:opacity-100 opacity-60"
                                title={`Remove ${m.name}`}
                                aria-label={`Remove ${m.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="subpanel py-2">
                        <div className="font-bold">{tableData.orders.length}</div>
                        <div className="stat-cap">Orders</div>
                      </div>
                      <div className="subpanel py-2">
                        <div className="font-bold">{tableData.songCount}</div>
                        <div className="stat-cap">Songs</div>
                      </div>
                      <div className="subpanel py-2">
                        <div className="font-bold money text-sm">{currency}{tableData.totalSpent.toFixed(2)}</div>
                        <div className="stat-cap">Total</div>
                      </div>
                    </div>

                    {tableData.isOccupied && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openCheckout(tableNum)}
                          className="btn btn-sm btn-primary flex-1"
                        >
                          <DollarSign className="w-4 h-4" /> Check Out
                        </button>
                        <button
                          onClick={() => setTransferForm({ from: tableNum, to: '' })}
                          className="btn btn-sm btn-info flex-1"
                        >
                          Transfer
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* History Page — sales & guests by calendar */}
          {barPage === 'history' && (() => {
            // Flatten archived checkouts into a flat, date-indexed list
            const allEntries = Object.values(groupHistory || {}).flat();
            const dateKey = (iso) => {
              const d = new Date(iso);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            };
            const byDate = {};
            allEntries.forEach(e => {
              const k = dateKey(e.checkoutTime);
              if (!byDate[k]) byDate[k] = { entries: [], sales: 0, paid: 0, tab: 0, guests: 0 };
              const b = byDate[k];
              b.entries.push(e);
              b.sales += e.totalSpent || 0;
              b.paid += e.amountPaid || 0;
              b.tab += e.amountTab || 0;
              b.guests += e.guestCount || 0;
            });

            // Month grid
            const year = historyMonth.getFullYear();
            const month = historyMonth.getMonth();
            const monthLabel = historyMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
            const firstDow = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const cells = [];
            for (let i = 0; i < firstDow; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

            // Month totals
            const monthKeys = Object.keys(byDate).filter(k => k.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
            const monthSales = monthKeys.reduce((s, k) => s + byDate[k].sales, 0);
            const monthGuests = monthKeys.reduce((s, k) => s + byDate[k].guests, 0);
            const monthCheckouts = monthKeys.reduce((s, k) => s + byDate[k].entries.length, 0);

            const dayData = historyDay ? byDate[historyDay] : null;
            const search = historySearch.trim().toLowerCase();
            const searchResults = (historyMode === 'guests' && search)
              ? allEntries
                  .filter(e => (e.groupName || '').toLowerCase().includes(search) || (e.members || []).some(m => m.name.toLowerCase().includes(search)))
                  .sort((a, b) => new Date(b.checkoutTime) - new Date(a.checkoutTime))
              : null;

            const goMonth = (delta) => { setHistoryMonth(new Date(year, month + delta, 1)); setHistoryDay(null); };
            const fmtDay = (k) => new Date(k + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

            return (
              <div className="mb-6">
                {/* Mode + month summary */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div className="seg" style={{ width: 'auto' }}>
                    <button onClick={() => setHistoryMode('sales')} className={`seg-btn ${historyMode === 'sales' ? 'is-active' : ''}`}>💵 Sales</button>
                    <button onClick={() => setHistoryMode('guests')} className={`seg-btn ${historyMode === 'guests' ? 'is-active' : ''}`}>👥 Guests</button>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="muted">This month:</span>
                    {historyMode === 'sales'
                      ? <span className="money">{currency}{monthSales.toFixed(2)}</span>
                      : <span><b>{monthGuests}</b> <span className="dim">guests</span></span>}
                    <span className="dim">· {monthCheckouts} checkout{monthCheckouts === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {historyMode === 'guests' && (
                  <div className="panel p-3 mb-5 flex items-center gap-2">
                    <Search className="w-4 h-4 dim" />
                    <input
                      className="input"
                      placeholder="Search all history by group or guest name…"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                    {historySearch && <button className="btn btn-sm btn-ghost" onClick={() => setHistorySearch('')}>Clear</button>}
                  </div>
                )}

                {searchResults ? (
                  <div className="panel p-5">
                    <h3 className="h-display text-lg mb-4">{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{historySearch}”</h3>
                    <div className="space-y-2">
                      {searchResults.map(e => (
                        <div key={e.id} className="row flex items-center justify-between p-3">
                          <div>
                            <div className="font-semibold">{e.groupName}</div>
                            <div className="text-xs dim">{new Date(e.checkoutTime).toLocaleString()} · Table {e.tableNumber} · {e.guestCount} guests</div>
                          </div>
                          <div className="text-right">
                            <div className="money">{currency}{(e.totalSpent || 0).toFixed(2)}</div>
                            <span className={`tag ${e.paid ? 'tag-ok' : 'tag-warn'}`}>{e.paid ? 'Paid' : `Tab ${currency}${(e.amountTab || 0).toFixed(2)}`}</span>
                          </div>
                        </div>
                      ))}
                      {searchResults.length === 0 && <p className="dim text-center py-6">No matching groups.</p>}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Calendar */}
                    <div className="panel p-5 lg:col-span-2">
                      <div className="flex items-center justify-between mb-4">
                        <button className="icon-btn" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
                        <h3 className="h-display text-lg">{monthLabel}</h3>
                        <button className="icon-btn" onClick={() => goMonth(1)} aria-label="Next month">›</button>
                      </div>
                      <div className="cal-grid mb-1">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="cal-dow">{d}</div>)}
                      </div>
                      <div className="cal-grid">
                        {cells.map((k, i) => {
                          if (!k) return <div key={`b${i}`} />;
                          const b = byDate[k];
                          const dayNum = parseInt(k.slice(-2), 10);
                          const metric = b ? (historyMode === 'sales' ? `${currency}${Math.round(b.sales)}` : `${b.guests}👤`) : '';
                          return (
                            <button
                              key={k}
                              onClick={() => setHistoryDay(k)}
                              className={`cal-cell ${b ? 'has-data' : ''} ${historyDay === k ? 'is-active' : ''}`}
                            >
                              <span className="cal-day">{dayNum}</span>
                              {metric && <span className="cal-metric">{metric}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Day detail */}
                    <div className="panel p-5">
                      {!historyDay ? (
                        <div className="text-center py-12 dim">
                          <div className="text-4xl mb-2">📅</div>
                          <p className="font-medium">Pick a day</p>
                          <p className="text-sm">Select a date to see {historyMode === 'sales' ? 'its sales' : 'who came in'}.</p>
                        </div>
                      ) : !dayData ? (
                        <div className="text-center py-12 dim">
                          <p className="font-medium">{fmtDay(historyDay)}</p>
                          <p className="text-sm">No checkouts on this day.</p>
                        </div>
                      ) : (
                        <>
                          <h3 className="h-display text-lg mb-1">{fmtDay(historyDay)}</h3>
                          <div className="grid grid-cols-3 gap-2 text-center my-4">
                            <div className="subpanel py-2"><div className="font-bold money text-sm">{currency}{dayData.sales.toFixed(2)}</div><div className="stat-cap">Sales</div></div>
                            <div className="subpanel py-2"><div className="font-bold">{dayData.entries.length}</div><div className="stat-cap">Checkouts</div></div>
                            <div className="subpanel py-2"><div className="font-bold">{dayData.guests}</div><div className="stat-cap">Guests</div></div>
                          </div>
                          {dayData.tab > 0 && (
                            <p className="text-xs mb-3" style={{ color: 'var(--warn)' }}>{currency}{dayData.tab.toFixed(2)} left on open tabs</p>
                          )}
                          <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
                            {dayData.entries.slice().sort((a, b) => new Date(b.checkoutTime) - new Date(a.checkoutTime)).map(e => (
                              <div key={e.id} className="row p-3">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">{e.groupName}</div>
                                  <div className="money">{currency}{(e.totalSpent || 0).toFixed(2)}</div>
                                </div>
                                <div className="text-xs dim mb-1">{new Date(e.checkoutTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · Table {e.tableNumber} · {e.guestCount} guests</div>
                                <div className="flex items-center justify-between">
                                  <span className={`tag ${e.paid ? 'tag-ok' : 'tag-warn'}`}>{e.paid ? 'Paid' : `Tab ${currency}${(e.amountTab || 0).toFixed(2)}`}</span>
                                  {(e.members || []).length > 0 && <span className="text-xs dim">{e.members.map(m => m.name).join(', ')}</span>}
                                </div>
                                {historyMode === 'guests' && (e.breakdown || []).length > 1 && (
                                  <div className="divide-line mt-2 pt-2 space-y-0.5">
                                    {e.breakdown.map((bd, idx) => (
                                      <div key={idx} className="flex justify-between text-xs">
                                        <span className="muted">{bd.name} {bd.paid ? '' : '(tab)'}</span>
                                        <span className="money">{currency}{bd.total.toFixed(2)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {allEntries.length === 0 && (
                  <div className="panel p-5 text-center py-12 dim mt-6">
                    <div className="text-4xl mb-2">🗓️</div>
                    <p className="font-medium">No history yet</p>
                    <p className="text-sm">Checked-out tables will appear here by date.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Settings Page */}
          {barPage === 'settings' && (
            <div className="space-y-6 mb-6">
              {/* Theme Selector */}
              <div className="panel p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Palette className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                  <h4 className="h-display text-lg">Venue Theme</h4>
                </div>
                <p className="text-sm dim mb-4">Pick a look for every screen — applies live across all connected devices.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`theme-swatch ${theme === t.id ? 'is-active' : ''}`}
                    >
                      <div className="theme-bar mb-3" style={{ background: t.bar }} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{t.name}</span>
                        {theme === t.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand)' }} />}
                      </div>
                      <p className="text-xs dim mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Currency & Display Settings */}
                <div className="panel p-5">
                  <h4 className="h-display text-lg mb-4">💰 Currency &amp; Display</h4>
                  <div>
                    <label className="label block mb-2">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="select"
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

                {/* Karaoke Settings */}
                <div className="panel p-5">
                  <h4 className="h-display text-lg mb-4">🎤 Karaoke Settings</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="label block mb-2">Song Price</label>
                      <div className="flex items-center gap-2">
                        <span className="dim">{currency}</span>
                        <input
                          type="number"
                          step="0.50"
                          min="0"
                          value={songPrice.toFixed(2)}
                          onChange={(e) => setSongPrice(parseFloat(e.target.value) || 0)}
                          className="input flex-1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label block mb-2">Max Songs Per Table</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={maxSongsPerTable}
                          onChange={(e) => setMaxSongsPerTable(parseInt(e.target.value) || 1)}
                          className="input w-24"
                        />
                        <span className="text-xs dim">songs per table</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="panel p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Settings className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                  <h4 className="h-display text-lg">Security</h4>
                  <span className={`tag ${hasPin ? 'tag-ok' : ''}`}>{hasPin ? 'PIN on' : 'PIN off'}</span>
                </div>
                <p className="text-sm dim mb-4">
                  A staff PIN locks the Bar Console and device-role changes, and kiosk-locks guest tablets to their own table. Applies to every device. Stored hashed, never as plain text.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label block mb-1">{hasPin ? 'Change PIN' : 'Set PIN'}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      className="input"
                      style={{ width: '10rem', letterSpacing: '0.3em' }}
                      placeholder="4-digit PIN"
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={pinDraft.length < 4}
                    onClick={() => { setStaffPin(hashPin(pinDraft)); setPinDraft(''); pushToast('Staff PIN set', 'success'); }}
                  >
                    {hasPin ? 'Update PIN' : 'Set PIN'}
                  </button>
                  {hasPin && (
                    <button
                      className="btn btn-danger"
                      onClick={() => askConfirm({
                        title: 'Reset staff PIN?',
                        body: "You'll be prompted to set a new PIN right away — the console can't run without one.",
                        confirmLabel: 'Reset PIN',
                        danger: true,
                        onConfirm: () => { setStaffPin(''); setPinDraft(''); pushToast('Set a new staff PIN', 'warn'); }
                      })}
                    >
                      Reset PIN
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cache Viewer Modal */}
          {showCacheViewer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
              <div className="panel w-full max-w-4xl max-h-[90vh] overflow-hidden fade-up">
                {/* Header */}
                <div className="p-5 divide-line" style={{ borderTop: 'none', borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Database className="w-6 h-6" style={{ color: 'var(--brand)' }} />
                      <h2 className="h-display text-xl">Cached Songs</h2>
                      <span className="tag tag-brand">{cachedSongs.length} songs</span>
                    </div>
                    <button onClick={() => setShowCacheViewer(false)} className="icon-btn">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Cache Controls */}
                <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-64">
                      <input
                        type="text"
                        placeholder="Search cached songs..."
                        value={cacheSearchQuery}
                        onChange={(e) => setCacheSearchQuery(e.target.value)}
                        className="input"
                      />
                    </div>
                    <button
                      onClick={batchRecheckAvailability}
                      disabled={isRecheckingCache || cachedSongs.length === 0}
                      className="btn btn-info"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRecheckingCache ? 'animate-spin' : ''}`} />
                      {isRecheckingCache ? 'Rechecking...' : 'Recheck All'}
                    </button>
                    <button
                      onClick={() => askConfirm({
                        title: 'Clear blocked songs?',
                        body: 'Removes every song flagged as un-embeddable from the cache.',
                        confirmLabel: 'Clear Blocked',
                        danger: true,
                        onConfirm: clearBlockedSongs
                      })}
                      className="btn btn-warn"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Blocked
                    </button>
                    <button
                      onClick={() => askConfirm({
                        title: 'Clear all cached songs?',
                        body: 'This cannot be undone.',
                        confirmLabel: 'Clear All',
                        danger: true,
                        onConfirm: async () => {
                          try {
                            const response = await fetch(`${API_BASE_URL}/cached-songs`, { method: 'DELETE' });
                            if (response.ok) {
                              setCachedSongs([]);
                              localStorage.removeItem('okibar-cached-songs');
                              pushToast('All cached songs cleared', 'success');
                            }
                          } catch (error) {
                            console.error('Failed to clear cache on server:', error);
                            setCachedSongs([]);
                            localStorage.removeItem('okibar-cached-songs');
                            pushToast('Cache cleared locally (server sync failed)', 'warn');
                          }
                        }
                      })}
                      className="btn btn-danger"
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
                                  className="icon-btn"
                                  title="Watch on YouTube"
                                  aria-label="Watch on YouTube"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                onClick={() => recheckSongAvailability(song.videoId)}
                                className="icon-btn"
                                title="Recheck availability"
                                aria-label="Recheck availability"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => askConfirm({
                                  title: `Remove "${song.title}"?`,
                                  body: 'Removes this song from the cache.',
                                  confirmLabel: 'Remove',
                                  danger: true,
                                  onConfirm: async () => {
                                    try {
                                      const response = await fetch(`${API_BASE_URL}/cached-songs/${song.videoId}`, { method: 'DELETE' });
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
                                })}
                                className="icon-btn"
                                title="Remove from cache"
                                aria-label="Remove from cache"
                              >
                                <Trash2 className="w-4 h-4" />
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
                <div className="p-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between text-sm dim flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <span>{cachedSongs.length} total</span>
                      <span style={{ color: 'var(--danger)' }}>{cachedSongs.filter(s => s.availability?.playable === false).length} blocked</span>
                      <span style={{ color: 'var(--ok)' }}>{cachedSongs.filter(s => !s.availability || s.availability.playable !== false).length} available</span>
                    </div>
                    <div className="text-xs">Songs are cached automatically when added to queue</div>
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
