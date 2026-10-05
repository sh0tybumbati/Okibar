import { create } from 'zustand';
import { socket } from '../services/socket';

// Helper: emit a state:update for keys that still use the legacy protocol
const emitUpdate = (key, value) => socket.emit('state:update', { key, value });

export const useAppStore = create((set, get) => ({
  // === Connection state ===
  connStatus: socket.connected ? 'connected' : 'connecting',

  // === Server-synced state (hydrated from state:init) ===
  globalQueue: [],
  currentSong: null,
  currentSongStartedAt: null,
  isPlaying: false,
  tables: {},
  tableList: [],
  menuItems: { drinks: [], food: [] },
  pendingOrders: {},
  groupHistory: {},
  cachedSongs: [],
  staffPin: '',
  theme: 'midnight',
  simpleMode: false,
  songPrice: 2.00,
  maxSongsPerTable: 3,
  currency: '$',
  venueName: '',
  qrPosition: 'bottom-left',
  guestsCanReorder: false,
  tvLayoutMode: 'standard',

  // Whether we've received the initial state:init hydration
  syncedOnce: false,

  // === Action-based mutations (server applies atomically) ===
  addToQueue: (song) => socket.emit('queue:add', { song }),
  removeFromQueue: (songId) => socket.emit('queue:remove', { songId }),
  reorderQueue: (fromIndex, toIndex) => socket.emit('queue:reorder', { fromIndex, toIndex }),
  clearQueue: (pin) => socket.emit('queue:clear', { pin }),
  playNext: (pin) => socket.emit('queue:playNext', { pin }),
  submitOrder: (tableNumber, orders) => socket.emit('order:submit', { tableNumber, orders }),
  cancelOrder: (tableNumber, orderId) => socket.emit('order:cancel', { tableNumber, orderId }),
  clearOrders: (tableNumber) => socket.emit('order:clear', { tableNumber }),

  // === Legacy mutations (still use state:update) ===
  // Direct setters for complex multi-key operations during migration.
  // These bypass the action protocol — use sparingly.
  setGlobalQueue: (updater) => {
    const current = get().globalQueue;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ globalQueue: next });
    emitUpdate('globalQueue', next);
  },
  // These emit the full value to the server. They update local state optimistically
  // AND emit to server. The server broadcasts to other clients.
  setCurrentSong: (song) => {
    set({ currentSong: song });
    emitUpdate('currentSong', song);
  },
  setCurrentSongStartedAt: (ts) => {
    set({ currentSongStartedAt: ts });
    emitUpdate('currentSongStartedAt', ts);
  },
  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
    emitUpdate('isPlaying', playing);
  },
  setTables: (updater) => {
    const current = get().tables;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ tables: next });
    emitUpdate('tables', next);
  },
  setTableList: (updater) => {
    const current = get().tableList;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ tableList: next });
    emitUpdate('tableList', next);
  },
  setMenuItems: (updater) => {
    const current = get().menuItems;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ menuItems: next });
    emitUpdate('menuItems', next);
  },
  setPendingOrders: (updater) => {
    const current = get().pendingOrders;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ pendingOrders: next });
    emitUpdate('pendingOrders', next);
  },
  setGroupHistory: (updater) => {
    const current = get().groupHistory;
    const next = typeof updater === 'function' ? updater(current) : updater;
    set({ groupHistory: next });
    emitUpdate('groupHistory', next);
  },
  setCachedSongs: (songs) => {
    set({ cachedSongs: songs });
    emitUpdate('cachedSongs', songs);
    try { localStorage.setItem('cantina-cached-songs', JSON.stringify(songs)); } catch (_) {}
  },
  setStaffPin: (pin) => {
    set({ staffPin: pin });
    emitUpdate('staffPin', pin);
  },
  setTheme: (theme) => {
    set({ theme });
    emitUpdate('theme', theme);
  },
  setSimpleMode: (mode) => {
    set({ simpleMode: mode });
    emitUpdate('simpleMode', mode);
  },
  setSongPrice: (price) => {
    set({ songPrice: price });
    emitUpdate('songPrice', price);
  },
  setMaxSongsPerTable: (max) => {
    set({ maxSongsPerTable: max });
    emitUpdate('maxSongsPerTable', max);
  },
  setCurrency: (currency) => {
    set({ currency });
    emitUpdate('currency', currency);
  },
  setVenueName: (name) => {
    set({ venueName: name });
    emitUpdate('venueName', name);
  },
  setQrPosition: (pos) => {
    set({ qrPosition: pos });
    emitUpdate('qrPosition', pos);
  },
  setGuestsCanReorder: (val) => {
    set({ guestsCanReorder: val });
    emitUpdate('guestsCanReorder', val);
  },
}));

// === Socket listeners (run once at module load, not inside React) ===

// Hydrate store from server on connect
socket.on('state:init', (state) => {
  if (!state) return;
  const patch = {};
  const storeState = useAppStore.getState();
  Object.keys(state).forEach(key => {
    if (key in storeState && key !== 'syncedOnce') {
      patch[key] = state[key];
    }
  });
  patch.syncedOnce = true;
  useAppStore.setState(patch);
});

// Apply server-pushed updates
socket.on('state:update', ({ key, value }) => {
  if (!key) return;
  const storeState = useAppStore.getState();
  if (key in storeState) {
    useAppStore.setState({ [key]: value });
  }
  // Persist cachedSongs to localStorage for offline fallback
  if (key === 'cachedSongs') {
    try { localStorage.setItem('cantina-cached-songs', JSON.stringify(value)); } catch (_) {}
  }
});

// Connection status
socket.on('connect', () => useAppStore.setState({ connStatus: 'connected' }));
socket.on('disconnect', () => useAppStore.setState({ connStatus: 'disconnected' }));
socket.on('reconnecting', () => useAppStore.setState({ connStatus: 'reconnecting' }));

// Handle auth errors from the server
socket.on('state:error', ({ key, error }) => {
  console.warn(`State update rejected for key "${key}":`, error);
});
