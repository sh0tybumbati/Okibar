import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import apiService, { API_BASE_URL, SERVER_ORIGIN } from '../services/api';
import socket from '../services/socket';
import { hashPin, isHashedPin } from '../utils/hash';
import { guestBase } from '../utils/guestUrl';
import { useAppStore } from '../store/appStore';
import { useUIStore } from '../store/uiStore';

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

export const fmtTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Available venue themes. `bar` previews the brand gradient in the selector;
// the live styling itself comes from [data-theme] rules in index.css.
export const THEMES = [
  { id: 'midnight', name: 'Midnight', desc: 'Cool blue-black & cyan', bar: 'linear-gradient(135deg,#38bdf8,#6366f1)' },
  { id: 'amber', name: 'Amber Lounge', desc: 'Warm charcoal & gold', bar: 'linear-gradient(135deg,#f59e0b,#ef6c2e)' },
  { id: 'neon', name: 'Neon Club', desc: 'Purple-black & magenta', bar: 'linear-gradient(135deg,#e879f9,#8b5cf6)' },
  { id: 'emerald', name: 'Emerald', desc: 'Deep forest & teal', bar: 'linear-gradient(135deg,#2dd4bf,#10b981)' },
  { id: 'slate', name: 'Slate', desc: 'Minimal mono & silver', bar: 'linear-gradient(135deg,#e2e8f0,#94a3b8)' },
  { id: 'rose', name: 'Rosé', desc: 'Wine-dark & blush', bar: 'linear-gradient(135deg,#fb7185,#e11d8f)' }
];


export const useCantinaActions = () => {
  // Global state.
  // Device role + table are per-device (NOT synced): a TV must stay a TV across
  // refreshes regardless of other devices. Read from URL (?mode=&table=) first
  // — used by the QR deep links — then localStorage, else null (→ role picker).
  const [mode, setMode] = useState(() => {
    const url = new URLSearchParams(window.location.search);
    const urlMode = url.get('mode');
    if (DEVICE_ROLES.includes(urlMode)) return urlMode;
    const stored = localStorage.getItem('cantina-device-mode');
    return DEVICE_ROLES.includes(stored) ? stored : null;
  });
  const [currentTable, setCurrentTable] = useState(() => {
    const url = new URLSearchParams(window.location.search);
    const raw = url.get('table') || localStorage.getItem('cantina-device-table') || '1';
    return parseInt(raw, 10) || 1;
  });
  // Simple Queue Mode has no tables — each device is its own guest, identified
  // by a random id that persists across reloads but never crosses devices.
  const [guestId] = useState(() => {
    try {
      let id = localStorage.getItem('cantina-guest-id');
      if (!id) {
        id = 'g' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('cantina-guest-id', id);
      }
      return id;
    } catch (_) {
      return 'g' + Math.random().toString(36).slice(2, 8);
    }
  });
  const guestLabel = `Guest ${(parseInt(guestId.slice(1), 36) % 9000) + 1000}`;
  // Optional display name a guest can set for themselves, overriding guestLabel.
  const [guestName, setGuestNameState] = useState(() => {
    try { return localStorage.getItem('cantina-guest-name') || ''; } catch (_) { return ''; }
  });
  const setGuestName = (name) => {
    setGuestNameState(name);
    try { localStorage.setItem('cantina-guest-name', name); } catch (_) {}
  };
  const [guestNameEdit, setGuestNameEdit] = useState(null); // draft string while the rename modal is open
  const [tablePage, setTablePage] = useState('karaoke'); // 'karaoke', 'menu'
  const [barPage, setBarPage] = useState('queue'); // 'queue', 'orders', 'guests'
  const [showTableManager, setShowTableManager] = useState(false);
  const [showMenuManager, setShowMenuManager] = useState(false);
  const [showCacheViewer, setShowCacheViewer] = useState(false);
  const [cacheSearchQuery, setCacheSearchQuery] = useState('');
  const [isRecheckingCache, setIsRecheckingCache] = useState(false);
  // === SERVER-SYNCED STATE (from Zustand appStore) ===
  const {
    globalQueue, currentSong, currentSongStartedAt, isPlaying,
    tables, tableList, menuItems, pendingOrders, groupHistory,
    cachedSongs, staffPin, theme, simpleMode, songPrice,
    maxSongsPerTable, currency, venueName, qrPosition,
    guestsCanReorder, tvLayoutMode, syncedOnce,
    // Action-based mutations (server-side atomic)
    addToQueue: storeAddToQueue, removeFromQueue: storeRemoveFromQueue,
    reorderQueue: storeReorderQueue, clearQueue: storeClearQueue,
    playNext: storePlayNext, submitOrder: storeSubmitOrder,
    cancelOrder: storeCancelOrder, clearOrders: storeClearOrders,
    // Legacy setters (optimistic + state:update)
    setCurrentSong, setCurrentSongStartedAt, setIsPlaying,
    setTables, setTableList, setMenuItems, setPendingOrders,
    setGroupHistory, setCachedSongs, setStaffPin, setTheme,
    setSimpleMode, setSongPrice, setMaxSongsPerTable, setCurrency,
    setVenueName, setQrPosition, setGuestsCanReorder, setGlobalQueue,
  } = useAppStore();

  const connStatus = useAppStore(s => s.connStatus);

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

  const [lanHost, setLanHost] = useState(null);           // ip:port for guest QR (from /api/host)
  const [pinGate, setPinGate] = useState(null);           // { action } pending PIN-gated action
  const [pinEntry, setPinEntry] = useState('');
  const [pinDraft, setPinDraft] = useState('');           // Settings: new-PIN field
  const [ytFallback, setYtFallback] = useState(false);    // TV: use plain iframe if API fails

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
  const [checkoutPaid, setCheckoutPaid] = useState({});   // memberId|'group' -> paid bool
  const [sharedOwners, setSharedOwners] = useState({}); // sharedItemKey -> string[] memberIds (subset that splits it)
  // History (sales + guests by calendar)
  const [historyMode, setHistoryMode] = useState('sales'); // 'sales' | 'guests'
  const [historyMonth, setHistoryMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [historyDay, setHistoryDay] = useState(null);      // 'YYYY-MM-DD' | null
  const [historySearch, setHistorySearch] = useState('');
  const [dragPos, setDragPos] = useState(null);            // {num,x,y} live drag position on floor
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [isMuted, setIsMuted] = useState(false);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Edit mode for menu management
  const [isEditMode, setIsEditMode] = useState(false);
  
  const ytHostRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const playNextRef = useRef(() => {});
  const dragIndexRef = useRef(null);
  const floorRef = useRef(null);       // floor-plan container
  const reposRef = useRef(null);       // table number being repositioned
  const dragGroupRef = useRef(null);   // source table number when relocating a group
  const tokenDraggedRef = useRef(false); // guards against the click a drag fires on its source token

  // Apply the selected venue theme to the document (drives CSS variables)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // The desktop window serves the console from localhost; phones can't reach
  // that. Ask the server for its LAN ip:port and build QR links from it.
  useEffect(() => {
    apiService.getHost()
      .then((data) => { if (data && data.host) setLanHost(data.host); })
      .catch(() => {});
  }, []);

  // Persist device role + table (per-device, survives refresh)
  useEffect(() => {
    if (mode) localStorage.setItem('cantina-device-mode', mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('cantina-device-table', String(currentTable));
  }, [currentTable]);

  // Socket connection status is tracked by appStore.

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
      else if (guestNameEdit != null) setGuestNameEdit(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinGate, qrTable, menuForm, memberForm, transferForm, checkout, confirmState, showCacheViewer, staffMenu, guestNameEdit]);

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

  // Ticks once a second on table devices so the "Start Over" window (visible
  // for the first 15s of a table's own song) expires without needing a click.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== 'table') return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
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

  // Simple Queue Mode hides the ordering/venue tabs — if a Bar Console was
  // sitting on one of them when another device flipped the mode on, bounce
  // it back to Queue rather than leaving it stranded with no way to navigate.
  const barOnlyPages = ['orders', 'guests', 'floor', 'tables', 'menu', 'history', 'tabs'];
  useEffect(() => {
    if (simpleMode && barOnlyPages.includes(barPage)) setBarPage('queue');
  }, [simpleMode, barPage]);
  useEffect(() => {
    if (simpleMode && tablePage === 'menu') setTablePage('karaoke');
  }, [simpleMode, tablePage]);

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch (_) {}
  };

  // Corner placement for the TV's join QR code — configurable in Settings.
  // Top corners are pushed below the top bar's controls; "Now Singing"
  // (bottom-left) swaps to bottom-right when the QR claims bottom-left, so
  // the two never sit on top of each other.
  const qrCornerStyle = (position) => {
    const base = { position: 'absolute', zIndex: 15 };
    if (position === 'top-left') return { ...base, top: '5.5rem', left: '1rem' };
    if (position === 'top-right') return { ...base, top: '5.5rem', right: '1rem' };
    if (position === 'bottom-right') return { ...base, bottom: '1rem', right: '1rem' };
    return { ...base, bottom: '1rem', left: '1rem' };
  };

  // If this song already has a local copy, play that instead of touching
  // YouTube's embed at all — sidesteps "embedding disabled" completely
  // rather than just reacting to it after the fact.
  const currentSongArchive = currentSong ? cachedSongs.find(s => s.videoId === currentSong.videoId)?.archive : null;
  const isLocalPlayback = currentSongArchive?.status === 'ready';

  // --- TV PLAYER (YouTube IFrame API) ---
  // Drives real progress + auto-advance on song end. Falls back silently to a
  // plain iframe (rendered in the markup) if the API can't initialize.
  useEffect(() => {
    if (mode !== 'tv' || !currentSong || !isPlaying || isLocalPlayback) {
      setProgress({ current: 0, duration: 0 });
      setYtFallback(false);
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
          onError: (e) => {
            // 101/150 = the video owner disabled embedded playback. Don't
            // bother falling back to a raw iframe — it'll show the same
            // "Video unavailable" screen. Archive it locally and skip.
            if (e?.data === 101 || e?.data === 150) {
              handleEmbedBlocked(currentSong);
            } else {
              setYtFallback(true);
            }
          },
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
  }, [mode, currentSong?.videoId, isPlaying, currentSongStartedAt, isLocalPlayback]);

  // Toggle mute on the live player without rebuilding it
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (p && p.mute) { try { isMuted ? p.mute() : p.unMute(); } catch (_) {} }
  }, [isMuted]);

  // --- QUEUE DRAG-REORDER (bar) ---
  const reorderQueue = (from, to) => {
    if (from == null || from === to) return;
    storeReorderQueue(from, to);
  };

  // --- QUEUE DRAG-REORDER (guests, Party Mode) ---
  // Pointer Events unify mouse/touch/pen into one event set, unlike the
  // HTML5 Drag and Drop API the Bar Console uses above — iOS Safari doesn't
  // support HTML5 DnD via touch at all, so guests dragging from their phones
  // need this instead.
  const [queueDrag, setQueueDrag] = useState(null); // { index, overIndex }

  const queueRowIndexAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest('[data-queue-row]');
    if (!row) return null;
    const idx = parseInt(row.dataset.queueRow, 10);
    return Number.isNaN(idx) ? null : idx;
  };

  const startQueueDrag = (e, index) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setQueueDrag({ index, overIndex: index });
  };

  const moveQueueDrag = (e) => {
    if (!queueDrag) return;
    const overIndex = queueRowIndexAtPoint(e.clientX, e.clientY);
    if (overIndex !== null && overIndex !== queueDrag.overIndex) {
      setQueueDrag(prev => (prev ? { ...prev, overIndex } : prev));
    }
  };

  const endQueueDrag = () => {
    if (queueDrag && queueDrag.index !== queueDrag.overIndex) {
      reorderQueue(queueDrag.index, queueDrag.overIndex);
    }
    setQueueDrag(null);
  };

  // --- STATE SYNC ---
  // Server sync is now handled by Zustand stores (src/store/appStore.js).
  // Socket listeners run at module load in appStore.js, outside React.


  // Cache management functions
  const addSongToCache = (song) => {
    setCachedSongs(prev => {
      // Check if song already exists
      const exists = prev.some(cached => cached.videoId === song.videoId);
      if (exists) return prev;
      
      // Add new song and keep only last 100 songs
      const updated = [song, ...prev].slice(0, 100);
      localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
      return updated;
    });
  };

  // Kick off (or resume checking on) a local download for a song, so it can
  // be played back as a plain file instead of a YouTube embed. Idempotent —
  // safe to call every time a known-problem song re-enters the queue; the
  // server no-ops if it's already downloading or already archived.
  const ensureArchived = (song) => {
    if (!song?.videoId) return;
    fetch(`${API_BASE_URL}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: song.videoId, title: song.title, thumbnail: song.thumbnail, channel: song.channel })
    }).catch((error) => console.error('Failed to start archiving:', error));
  };

  // A song failed to play because its owner disabled embedding (YT error
  // 101/150) and it isn't archived yet. Rather than dropping it (forcing
  // someone to re-search and re-add it later), send it to the back of the
  // queue — it'll get another shot once its download finishes.
  const handleEmbedBlocked = (song) => {
    if (!song) return;
    ensureArchived(song);
    pushToast(`"${song.title}" isn't archived yet — moving it to the back of the queue while it downloads.`, 'warn');
    setGlobalQueue(prev => [...prev, song]);
    if (globalQueue.length > 0) {
      // Something else was already queued behind it — play that now.
      playNextRef.current();
    } else {
      // It was the only thing around; go idle instead of instantly
      // retrying the same not-yet-archived song. The idle auto-advance
      // watcher picks it back up once its archive is actually ready.
      setCurrentSong(null);
      setCurrentSongStartedAt(null);
      setIsPlaying(false);
    }
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
          localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
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
          localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
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
          localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
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
              localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
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
      channel: songOrder.channel,
      url: `https://www.youtube.com/watch?v=${songOrder.videoId}`,
      title: songOrder.item,
      thumbnail: songOrder.thumbnail,
      tableNumber: currentTable,
      groupName: table.groupName || `Table of ${table.guestCount}`,
      addedAt: new Date().toLocaleTimeString(),
      price: songOrder.price
    }));

    // Nothing playing — start the first confirmed song immediately instead
    // of leaving it queued until someone presses play on the TV/console.
    if (!currentSong && newQueueItems.length > 0) {
      const [first, ...rest] = newQueueItems;
      setCurrentSong(first);
      setCurrentSongStartedAt(Date.now());
      setIsPlaying(true);
      setGlobalQueue(prev => [...prev, ...rest]);
    } else {
      setGlobalQueue(prev => [...prev, ...newQueueItems]);
    }

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
    // Simple Queue Mode has no tables or billing — each device is its own
    // guest, queueing straight from search, limited by their own live count.
    if (simpleMode) {
      const myQueuedCount = globalQueue.filter(s => s.guestId === guestId).length;
      if (myQueuedCount >= maxSongsPerTable) {
        pushToast(`You've reached the ${maxSongsPerTable}-song limit.`, 'warn');
        return;
      }
      const newSong = {
        id: Date.now() + Math.random(),
        videoId: searchResult.videoId,
        channel: searchResult.channel,
        url: `https://www.youtube.com/watch?v=${searchResult.videoId}`,
        title: searchResult.title,
        thumbnail: searchResult.thumbnail,
        guestId,
        groupName: guestName || guestLabel,
        addedAt: new Date().toLocaleTimeString()
      };
      if (!currentSong) {
        // Nothing playing — start it immediately instead of leaving it
        // queued until someone walks over to press play.
        setCurrentSong(newSong);
        setCurrentSongStartedAt(Date.now());
        setIsPlaying(true);
      } else {
        storeAddToQueue(newSong);
      }
      addSongToCache(searchResult);
      // Archive every queued song up front, win or lose on streaming — by
      // the time it reaches the front of the queue it's already local, so
      // nothing ever needs to be skipped-and-requeued to "try again."
      if (searchResult.archive?.status !== 'ready') ensureArchived(searchResult);
      pushToast(currentSong ? `Added "${searchResult.title}" to the queue` : `"${searchResult.title}" is starting now`, 'success');
      return;
    }

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
      channel: searchResult.channel,
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
    // Archive every queued song up front, win or lose on streaming — by the
    // time it reaches the front of the queue it's already local.
    if (searchResult.archive?.status !== 'ready') ensureArchived(searchResult);
    pushToast(`Reserved "${searchResult.title}"`, 'success');
  };

  // Play next song
  const playNext = () => {
    // Ensure the next song is being archived before the server shifts the queue
    if (globalQueue.length > 0) {
      ensureArchived(globalQueue[0]);
    }
    storePlayNext();
  };

  // Table-side controls for the table whose song is currently playing.
  const restartCurrentSong = () => setCurrentSongStartedAt(Date.now());

  // Remove a table's own not-yet-played song from the shared queue.
  const cancelQueuedSong = (song) => {
    if (simpleMode) {
      if (song.guestId !== guestId) return;
      storeRemoveFromQueue(song.id);
      pushToast(`Removed "${song.title}" from the queue`, 'info');
      return;
    }
    if (song.tableNumber !== currentTable) return;
    storeRemoveFromQueue(song.id);
    setTables(prev => ({
      ...prev,
      [currentTable]: { ...prev[currentTable], songCount: Math.max(0, (prev[currentTable].songCount || 0) - 1) }
    }));
    pushToast(`Removed "${song.title}" from the queue`, 'info');
  };
  // Keep a stable ref so the player/keyboard effects always call the latest playNext
  playNextRef.current = playNext;

  // Idle auto-advance (TV only, avoids a dual-trigger race with Bar Console):
  // whenever nothing is playing and something's queued, start it — unless
  // the front song is a known problem case still mid-download, in which
  // case retrying it immediately would just fail again in a tight loop.
  // This also resumes playback automatically once that download finishes.
  useEffect(() => {
    if (mode !== 'tv') return;
    if (currentSong || isPlaying) return;
    if (globalQueue.length === 0) return;
    const front = globalQueue[0];
    const frontArchive = cachedSongs.find(s => s.videoId === front.videoId)?.archive;
    if (frontArchive && frontArchive.status === 'downloading') return;
    playNextRef.current();
  }, [mode, currentSong, isPlaying, globalQueue, cachedSongs]);

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

  // Split a table's confirmed orders by member. Member-tagged items go to that
  // member; each shared (untagged) item is divided among its "owners" — the
  // members ticked for it (default: everyone). An empty owner set falls back to
  // all members so a shared item's cost is never dropped.
  const computeSplit = (tableNum, owners = {}) => {
    const t = tables[tableNum] || {};
    const members = t.members || [];
    const allIds = members.map(m => m.id);
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
        const key = sharedItems.length;            // index within the shared list
        sharedItems.push({ ...o, _key: key });
        sharedTotal += o.price;
      }
    });
    if (members.length) {
      sharedItems.forEach(item => {
        const picked = (owners[item._key] && owners[item._key].length) ? owners[item._key] : allIds;
        const each = item.price / picked.length;
        picked.forEach(id => { if (perMember[id]) perMember[id].total += each; });
      });
      members.forEach(m => { perMember[m.id].total += perMember[m.id].itemsTotal; });
    }
    return { members, perMember, sharedItems, sharedTotal, grandTotal: t.totalSpent || 0 };
  };

  const openCheckout = (tableNum) => {
    setCheckout({ tableNum });
    setCheckoutPaid({});
    setSharedOwners({});
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
    const split = computeSplit(tableNum, sharedOwners);
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

  // Outstanding tabs = archived checkouts left unpaid (Close as Tab).
  const openTabs = Object.entries(groupHistory)
    .flatMap(([groupKey, entries]) => (entries || []).map(e => ({ ...e, groupKey })))
    .filter(e => e.paid === false && (e.amountTab || 0) > 0)
    .sort((a, b) => new Date(b.checkoutTime) - new Date(a.checkoutTime));

  // Settle an open tab in full: mark it paid and zero the outstanding balance.
  const settleTab = (groupKey, entryId) => {
    setGroupHistory(prev => ({
      ...prev,
      [groupKey]: (prev[groupKey] || []).map(e =>
        e.id === entryId
          ? { ...e, amountPaid: (e.amountPaid || 0) + (e.amountTab || 0), amountTab: 0, paid: true, settledAt: new Date().toISOString() }
          : e
      ),
    }));
    pushToast('Tab settled', 'success');
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
  const tableUrl = (n) => {
    return `${guestBase(lanHost, window.location)}/?mode=table&table=${n}`;
  };

  // Simple Queue Mode deep link — no table to pin to, every scan is a new guest
  const joinUrl = () => {
    return `${guestBase(lanHost, window.location)}/?mode=table`;
  };

  // Connection indicator shared across top bars
  const connDot = (
    <div className="flex items-center gap-2" title={connStatus === 'connected' ? 'Live-synced' : 'Reconnecting…'}>
      <span className={`conn-dot ${connStatus === 'connected' ? 'is-on' : 'is-off'}`} />
      <span className="label hidden sm:inline">{connStatus === 'connected' ? 'Synced' : 'Reconnecting'}</span>
    </div>
  );

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

      {/* Simple Queue Mode: set your own display name (used in place of "Guest 1234") */}
      {guestNameEdit != null && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setGuestNameEdit(null); }}>
          <form
            className="modal-card fade-up"
            role="dialog"
            aria-modal="true"
            aria-label="Set your name"
            onSubmit={(e) => {
              e.preventDefault();
              setGuestName(guestNameEdit.trim());
              setGuestNameEdit(null);
              pushToast(guestNameEdit.trim() ? `You're now "${guestNameEdit.trim()}"` : 'Name cleared', 'success');
            }}
          >
            <h3 className="h-display text-lg mb-1">Set Your Name</h3>
            <p className="muted text-sm mb-4">Shown in the queue instead of "{guestLabel}". Leave blank to use the default.</p>
            <input
              className="input"
              autoFocus
              placeholder={guestLabel}
              maxLength={24}
              value={guestNameEdit}
              onChange={(e) => setGuestNameEdit(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn btn-ghost" onClick={() => setGuestNameEdit(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* Checkout / split-bill modal */}
      {checkout && (() => {
        const t = tables[checkout.tableNum] || {};
        const split = computeSplit(checkout.tableNum, sharedOwners);
        const allIds = split.members.map(m => m.id);
        const ownersFor = (key) => sharedOwners[key] && sharedOwners[key].length ? sharedOwners[key] : allIds;
        const toggleOwner = (key, mid) => setSharedOwners(prev => {
          const cur = prev[key] && prev[key].length ? prev[key] : allIds;
          const next = cur.includes(mid) ? cur.filter(x => x !== mid) : [...cur, mid];
          return { ...prev, [key]: next };
        });
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
                {split.sharedTotal > 0 && hasMembers && <> Shared items ({currency}{split.sharedTotal.toFixed(2)}) split among whoever you tick below.</>}
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

              {hasMembers && split.sharedItems.length > 0 && (
                <div className="subpanel p-3 mt-3 space-y-2">
                  <div className="label">Shared items — tap who's splitting each</div>
                  {split.sharedItems.map(item => (
                    <div key={item._key} className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm">{item.name} <span className="dim">{currency}{item.price.toFixed(2)}</span></div>
                      <div className="flex gap-1 flex-wrap">
                        {split.members.map(m => {
                          const on = ownersFor(item._key).includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleOwner(item._key, m.id)}
                              className={`btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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

  // The first group is server-synced store state (destructured from useAppStore above)
  return {
    cachedSongs, currency, currentSong, currentSongStartedAt, globalQueue, groupHistory,
    guestsCanReorder, isPlaying, maxSongsPerTable, menuItems, pendingOrders, qrPosition,
    simpleMode, songPrice, syncedOnce, tableList, tables, theme,
    setCachedSongs, setCurrency, setGlobalQueue, setGuestsCanReorder, setIsPlaying,
    setMaxSongsPerTable, setQrPosition, setSimpleMode, setSongPrice, setStaffPin, setTables, setTheme,
    addMember, addMenuItem, addSongToCache, addTable, addToPendingOrders, askConfirm, assignOrderMember, assignRole, barOnlyPages, barPage, batchRecheckAvailability, cacheSearchQuery, cancelQueuedSong, checkout, checkoutPaid, clearBlockedSongs, clearPendingOrders, computeSplit, confirmOrders, confirmState, connDot, connStatus, currentSongArchive, currentTable, currentTableRef, dismissToast, dragGroupRef, dragIndexRef, dragPos, endQueueDrag, ensureArchived, finalizeCheckout, floorRef, getFilteredCachedSongs, guestId, guestLabel, guestName, guestNameEdit, handleEmbedBlocked, hasPin, historyDay, historyMode, historyMonth, historySearch, initializeTables, isEditMode, isLocalPlayback, isMuted, isRecheckingCache, isSearching, joinUrl, lanHost, memberForm, menuForm, mode, modeRef, moveQueueDrag, nowTick, openCheckout, openTabs, orderingMemberId, overlays, pinDraft, pinEntry, pinGate, playNext, playNextRef, progress, pushToast, qrCornerStyle, qrTable, queueDrag, queueRowIndexAtPoint, recheckSongAvailability, removeMember, removeMenuItem, removeTable, reorderQueue, reposRef, requestCheck, requireStaff, reserveSong, resetTable, restartCurrentSong, runConfirm, schedulePeriodicRecheck, searchCachedSongs, searchKaraokeVideos, searchQuery, searchResults, setBarPage, setCacheSearchQuery, setCheckout, setCheckoutPaid, setConfirmState, setCurrentTable, setDragPos, setGuestName, setGuestNameEdit, setGuestNameState, setHistoryDay, setHistoryMode, setHistoryMonth, setHistorySearch, setIsEditMode, setIsMuted, setIsRecheckingCache, setIsSearching, setLanHost, setMemberForm, setMenuForm, setMode, setNowTick, setOrderingMemberId, setPinDraft, setPinEntry, setPinGate, setProgress, setQrTable, setQueueDrag, setSearchQuery, setSearchResults, setSharedOwners, setShowCacheViewer, setShowMenuManager, setShowTableManager, setStaffMenu, setTablePage, setTablePos, setToasts, setTransferForm, setYtFallback, settleTab, sharedOwners, showCacheViewer, showMenuManager, showTableManager, staffMenu, startQueueDrag, submitPin, tablePage, tableUrl, tableXY, toasts, toggleFullscreen, toggleMenuItemStock, tokenDraggedRef, transferForm, transferTable, updateGroupInfo, updateMenuPrice, updateTableOccupancy, updateTables, ytFallback, ytHostRef, ytPlayerRef
  };
};
