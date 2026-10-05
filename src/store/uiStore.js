import { create } from 'zustand';

export const useUIStore = create((set) => ({
  // --- Device identity ---
  mode: null,
  currentTable: 1,
  guestId: '',
  guestName: '',
  guestNameEdit: null,

  // --- Navigation ---
  tablePage: 'karaoke',       // table mode sub-page
  barPage: 'queue',           // bar mode sub-page

  // --- Search ---
  searchQuery: '',
  searchResults: [],
  isSearching: false,
  searchError: null,

  // --- Modals & overlays ---
  pinGate: null,              // { action } pending PIN-gated action
  pinEntry: '',
  pinDraft: '',
  confirmState: null,
  menuForm: null,
  transferForm: null,
  qrTable: null,
  staffMenu: false,
  showTableManager: false,
  showMenuManager: false,
  showCacheViewer: false,
  cacheSearchQuery: '',
  isRecheckingCache: false,
  showFloorPlan: false,
  showHistory: false,
  orderingMemberId: null,
  memberForm: null,
  checkout: null,
  checkoutPaid: {},
  sharedOwners: {},
  historyMode: 'sales',
  historyMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  historyDay: null,
  historySearch: '',

  // --- Playback UI ---
  isMuted: false,
  ytFallback: false,
  progress: { current: 0, duration: 0 },

  // --- Drag & drop ---
  queueDrag: null,
  dragPos: null,
  isEditMode: false,

  // --- Toast notifications ---
  toasts: [],
  pushToast: (message, type = 'info', opts = {}) => set(state => ({
    toasts: [...state.toasts, {
      id: Date.now() + Math.random(),
      message,
      type,
      ...opts
    }]
  })),
  dismissToast: (id) => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // --- LAN ---
  lanHost: null,
  apiKeyStatus: null,

  // --- Misc ---
  connStatus: 'connecting',

  // --- Setters ---
  setMode: (mode) => set({ mode }),
  setCurrentTable: (table) => set({ currentTable: table }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSearchError: (e) => set({ searchError: e }),
  setPinGate: (v) => set({ pinGate: v }),
  setPinEntry: (v) => set({ pinEntry: v }),
  setConfirmState: (v) => set({ confirmState: v }),
  setStaffMenu: (v) => set(typeof v === 'function' ? state => ({ staffMenu: v(state.staffMenu) }) : { staffMenu: v }),
  setTablePage: (p) => set({ tablePage: p }),
  setBarPage: (p) => set({ barPage: p }),
  setIsMuted: (v) => set({ isMuted: v }),
  setProgress: (v) => set({ progress: v }),
  setQueueDrag: (v) => set(typeof v === 'function' ? state => ({ queueDrag: v(state.queueDrag) }) : { queueDrag: v }),
  setYtFallback: (v) => set({ ytFallback: v }),
  setCheckout: (v) => set({ checkout: v }),
  setCheckoutPaid: (v) => set(typeof v === 'function' ? state => ({ checkoutPaid: v(state.checkoutPaid) }) : { checkoutPaid: v }),
  setSharedOwners: (v) => set(typeof v === 'function' ? state => ({ sharedOwners: v(state.sharedOwners) }) : { sharedOwners: v }),
  setMenuForm: (v) => set({ menuForm: v }),
  setTransferForm: (v) => set({ transferForm: v }),
  setQrTable: (v) => set({ qrTable: v }),
  setMemberForm: (v) => set({ memberForm: v }),
  setOrderingMemberId: (v) => set({ orderingMemberId: v }),
  setGuestName: (name) => {
    set({ guestName: name });
    try { localStorage.setItem('cantina-guest-name', name); } catch (_) {}
  },
  setGuestNameEdit: (v) => set({ guestNameEdit: v }),
  setShowCacheViewer: (v) => set({ showCacheViewer: v }),
  setCacheSearchQuery: (v) => set({ cacheSearchQuery: v }),
  setIsRecheckingCache: (v) => set({ isRecheckingCache: v }),
  setShowTableManager: (v) => set({ showTableManager: v }),
  setShowMenuManager: (v) => set({ showMenuManager: v }),
  setShowFloorPlan: (v) => set({ showFloorPlan: v }),
  setIsEditMode: (v) => set({ isEditMode: v }),
  setDragPos: (v) => set({ dragPos: v }),
  setLanHost: (v) => set({ lanHost: v }),
  setApiKeyStatus: (v) => set({ apiKeyStatus: v }),
  setHistoryMode: (v) => set({ historyMode: v }),
  setHistoryMonth: (v) => set({ historyMonth: v }),
  setHistoryDay: (v) => set({ historyDay: v }),
  setHistorySearch: (v) => set({ historySearch: v }),
  setShowHistory: (v) => set({ showHistory: v }),
  setPinDraft: (v) => set({ pinDraft: v }),
}));
