// === Core Data Models ===

export interface Song {
  id: number | string;
  videoId: string;
  title: string;
  thumbnail: string;
  channel?: string;
  url?: string;
  tableNumber?: number;
  guestId?: string;
  groupName?: string;
  addedAt?: string;
  availability?: VideoAvailability | null;
  archive?: ArchiveStatus | null;
  isBlocked?: boolean;
}

export interface VideoAvailability {
  playable: boolean;
  reason?: string;
}

export interface ArchiveStatus {
  status: 'downloading' | 'ready' | 'failed';
  progress: number;
  file?: string;
  reason?: string | null;
}

export interface CachedSong extends Song {
  availability?: VideoAvailability | null;
  archive?: ArchiveStatus | null;
}

export interface TableConfig {
  number: number;
  maxOccupancy: number;
  x?: number;
  y?: number;
}

export interface TableState {
  groupName: string;
  guestCount: number;
  members: TableMember[];
  orders: Order[];
  songCount: number;
  totalSpent: number;
  checkRequested: boolean;
  isOccupied: boolean;
  maxOccupancy: number;
}

export interface TableMember {
  id: string;
  name: string;
}

export interface Order {
  id: number;
  type: 'song' | 'drink' | 'food';
  item: string;
  price: number;
  timestamp: string;
  tableNumber?: number;
  category?: string;
  videoId?: string;
  channel?: string;
  thumbnail?: string;
  availability?: VideoAvailability | null;
  isBlocked?: boolean;
  memberId?: string | null;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
  itemCategory?: string;
}

export interface MenuItems {
  drinks: MenuItem[];
  food: MenuItem[];
}

export interface HistoryEntry {
  id: number;
  groupName: string;
  tableNumber: number;
  guestCount: number;
  members: TableMember[];
  orders: Order[];
  breakdown: BreakdownEntry[];
  sharedTotal: number;
  totalSpent: number;
  amountPaid: number;
  amountTab: number;
  paid: boolean;
  checkoutTime: string;
  settledAt?: string;
}

export interface BreakdownEntry {
  name: string;
  total: number;
  paid: boolean;
}

export type ThemeId = 'midnight' | 'amber' | 'neon' | 'emerald' | 'slate' | 'rose';

export interface Theme {
  id: ThemeId;
  name: string;
  desc: string;
  bar: string;
}

export type DeviceMode = 'table' | 'tv' | 'bar' | null;
export type QrPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type ConnStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
export type TVLayoutMode = 'standard' | 'compact';

// === Store Types ===

export interface AppState {
  // Connection
  connStatus: ConnStatus;
  
  // Server-synced state
  globalQueue: Song[];
  currentSong: Song | null;
  currentSongStartedAt: number | null;
  isPlaying: boolean;
  tables: Record<number, TableState>;
  tableList: TableConfig[];
  menuItems: MenuItems;
  pendingOrders: Record<number, Order[]>;
  groupHistory: Record<string, HistoryEntry[]>;
  cachedSongs: CachedSong[];
  staffPin: string;
  theme: ThemeId;
  simpleMode: boolean;
  songPrice: number;
  maxSongsPerTable: number;
  currency: string;
  venueName: string;
  qrPosition: QrPosition;
  guestsCanReorder: boolean;
  tvLayoutMode: TVLayoutMode;
  syncedOnce: boolean;

  // Action-based mutations
  addToQueue: (song: Partial<Song>) => void;
  removeFromQueue: (songId: number | string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: (pin?: string) => void;
  playNext: (pin?: string) => void;
  submitOrder: (tableNumber: number, orders: Order[]) => void;
  cancelOrder: (tableNumber: number, orderId: number) => void;
  clearOrders: (tableNumber: number) => void;

  // Legacy setters
  setGlobalQueue: (updater: Song[] | ((prev: Song[]) => Song[])) => void;
  setCurrentSong: (song: Song | null) => void;
  setCurrentSongStartedAt: (ts: number | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setTables: (updater: Record<number, TableState> | ((prev: Record<number, TableState>) => Record<number, TableState>)) => void;
  setTableList: (updater: TableConfig[] | ((prev: TableConfig[]) => TableConfig[])) => void;
  setMenuItems: (updater: MenuItems | ((prev: MenuItems) => MenuItems)) => void;
  setPendingOrders: (updater: Record<number, Order[]> | ((prev: Record<number, Order[]>) => Record<number, Order[]>)) => void;
  setGroupHistory: (updater: Record<string, HistoryEntry[]> | ((prev: Record<string, HistoryEntry[]>) => Record<string, HistoryEntry[]>)) => void;
  setCachedSongs: (songs: CachedSong[]) => void;
  setStaffPin: (pin: string) => void;
  setTheme: (theme: ThemeId) => void;
  setSimpleMode: (mode: boolean) => void;
  setSongPrice: (price: number) => void;
  setMaxSongsPerTable: (max: number) => void;
  setCurrency: (currency: string) => void;
  setVenueName: (name: string) => void;
  setQrPosition: (pos: QrPosition) => void;
  setGuestsCanReorder: (val: boolean) => void;
}
