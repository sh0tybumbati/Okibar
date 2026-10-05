import React from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const TableMode = (props) => {
  const {
    addToPendingOrders, cancelQueuedSong, clearPendingOrders, confirmOrders, connDot, currency,
    currentSong, currentSongStartedAt, currentTable, endQueueDrag, globalQueue, guestId,
    guestLabel, guestName, guestsCanReorder, hasPin, isSearching, maxSongsPerTable,
    menuItems, moveQueueDrag, nowTick, orderingMemberId, overlays, pendingOrders,
    playNext, queueDrag, requestCheck, requireStaff, reserveSong, restartCurrentSong,
    searchKaraokeVideos, searchQuery, searchResults, setCurrentTable, setGuestNameEdit, setMode,
    setOrderingMemberId, setQrTable, setSearchQuery, setTablePage, simpleMode, songPrice,
    startQueueDrag, syncedOnce, tableList, tablePage, tables,
  } = props;
    const table = tables[currentTable];
    // Before the first server sync (or for a table that no longer exists) there is
    // no table record yet, so show a status panel instead of reading it.
    if (!table) {
      return (
        <div className="cantina-app flex items-center justify-center">
          {overlays}
          <div className="cantina-shell fade-up" style={{ maxWidth: '24rem' }}>
            <div className="panel p-8 text-center">
              <div className="brand-dot mx-auto mb-4" style={{ width: '1rem', height: '1rem' }} />
              {syncedOnce ? (
                <>
                  <h2 className="h-display text-lg mb-1">Table {currentTable} not found</h2>
                  <p className="muted text-sm mb-4">Ask staff for the right QR code, or pick a table again.</p>
                  <button className="btn btn-primary" onClick={() => setMode(null)}>Back</button>
                </>
              ) : (
                <>
                  <h2 className="h-display text-lg mb-1">Connecting…</h2>
                  <p className="muted text-sm">Loading venue settings.</p>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }
    const groupName = simpleMode ? (guestName || guestLabel) : (table.groupName || `Table of ${table.guestCount}`);
    const myQueuedCount = globalQueue.filter(s => s.guestId === guestId).length;
    const atSongLimit = simpleMode ? myQueuedCount >= maxSongsPerTable : table.songCount >= maxSongsPerTable;

    const pendingTotal = (pendingOrders[currentTable] || []).reduce((sum, order) => sum + order.price, 0);

    return (
      <div className="cantina-app">
        {overlays}
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-inner">
            <div className="flex items-center gap-3">
              <span className="brand-dot" />
              <div className="leading-tight">
                <div className="wordmark text-xl">Can<span className="brand-text">tina</span></div>
                {simpleMode ? (
                  <button
                    className="label"
                    style={{ marginTop: '2px', cursor: 'pointer', textDecoration: 'underline dotted' }}
                    onClick={() => setGuestNameEdit(guestName)}
                    title="Set your name"
                  >
                    {groupName}
                  </button>
                ) : (
                  <div className="label" style={{ marginTop: '2px' }}>{groupName}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {connDot}
              {!simpleMode && (
                <>
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
                </>
              )}
              <button onClick={() => requireStaff(() => setMode(null))} className="icon-btn" title="Staff — change device role" aria-label="Staff — change device role">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="cantina-shell fade-up">
          {/* Stats */}
          <div className={`grid ${simpleMode ? 'grid-cols-1 max-w-[12rem]' : 'grid-cols-2 sm:grid-cols-4'} gap-3 mb-6`}>
            <div className="stat">
              <div className="stat-num" style={{ color: 'var(--brand)' }}>{simpleMode ? myQueuedCount : table.songCount}/{maxSongsPerTable}</div>
              <div className="stat-cap">{simpleMode ? 'Your Songs' : 'Songs Reserved'}</div>
            </div>
            {!simpleMode && (
              <div className="stat">
                <div className="stat-num">{table.guestCount}</div>
                <div className="stat-cap">Guests</div>
              </div>
            )}
            {!simpleMode && (
              <>
                <div className="stat">
                  <div className="stat-num money">{currency}{table.totalSpent.toFixed(2)}</div>
                  <div className="stat-cap">Total Spent</div>
                </div>
                <button
                  onClick={requestCheck}
                  disabled={table.checkRequested}
                  className={`btn ${table.checkRequested ? 'btn-warn' : 'btn-success'}`}
                  style={{ height: '100%' }}
                >
                  {table.checkRequested ? '✓ Check Requested' : '💳 Request Check'}
                </button>
              </>
            )}
          </div>

          {/* Page Navigation */}
          {!simpleMode && (
            <div className="seg mb-6">
              <button onClick={() => setTablePage('karaoke')} className={`seg-btn ${tablePage === 'karaoke' ? 'is-active' : ''}`}>
                🎤 Karaoke
              </button>
              <button onClick={() => setTablePage('menu')} className={`seg-btn ${tablePage === 'menu' ? 'is-active' : ''}`}>
                🍽️ Menu
              </button>
            </div>
          )}

          {/* Ordering as — tags songs & orders to a guest for split billing */}
          {!simpleMode && (table.members || []).length > 0 && (
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
                          {result.archive?.status === 'ready' && <span className="tag tag-ok flex-shrink-0">Archived</span>}
                          {result.archive?.status === 'downloading' && <span className="tag flex-shrink-0">Downloading {result.archive.progress || 0}%</span>}
                        </div>
                        <p className="text-xs dim">{result.channel}</p>
                        {result.isBlocked && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Embedding disabled — can watch on YouTube</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {!simpleMode && <div className="text-sm money mb-1">{currency}{songPrice.toFixed(2)}</div>}
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
                              disabled={atSongLimit}
                              className="btn btn-sm btn-ghost"
                              title="Reserve anyway (will need manual playback)"
                            >
                              Reserve
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => reserveSong(result)}
                            disabled={atSongLimit}
                            className="btn btn-sm btn-primary"
                          >
                            {atSongLimit ? 'Limit Reached' : 'Reserve'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Queue — Simple Mode only. Every table sees what's playing and
              what's up next, but can only touch its own songs. */}
          {simpleMode && (
            <div className="panel p-5 mb-6">
              <h2 className="h-display text-lg mb-4 flex items-center gap-2">
                <Music2 className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                Up Next{globalQueue.length > 0 && <span className="dim">({globalQueue.length})</span>}
              </h2>

              {currentSong && (
                <div className="subpanel p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Play className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--brand)' }} />
                      <span className="label">Now Playing</span>
                    </div>
                    <p className="text-sm font-semibold truncate">{currentSong.title}</p>
                    <p className="text-xs dim">{currentSong.groupName}</p>
                  </div>
                  {currentSong.guestId === guestId && (
                    <div className="flex gap-2 flex-shrink-0">
                      {currentSongStartedAt && nowTick - currentSongStartedAt < 15000 && (
                        <button onClick={restartCurrentSong} className="btn btn-sm btn-ghost">
                          <RefreshCw className="w-3.5 h-3.5" /> Start Over
                        </button>
                      )}
                      <button onClick={playNext} className="btn btn-sm btn-warn">
                        <SkipForward className="w-3.5 h-3.5" /> Skip
                      </button>
                    </div>
                  )}
                </div>
              )}

              {globalQueue.length === 0 ? (
                <p className="dim text-sm">Nothing queued yet — search above to add a song.</p>
              ) : (
                <div className="space-y-2">
                  {guestsCanReorder && globalQueue.length > 1 && (
                    <p className="dim text-xs mb-1">🎉 Party Mode — drag ⠿ to reorder</p>
                  )}
                  {globalQueue.map((song, index) => (
                    <div
                      key={song.id}
                      data-queue-row={index}
                      className="row flex items-center gap-3 p-3"
                      style={{
                        opacity: queueDrag?.index === index ? 0.5 : 1,
                        borderTop: queueDrag && queueDrag.overIndex === index && queueDrag.index !== index ? '2px solid var(--brand)' : undefined
                      }}
                    >
                      {guestsCanReorder && (
                        <span
                          className="dim cursor-grab active:cursor-grabbing flex-shrink-0"
                          style={{ touchAction: 'none' }}
                          onPointerDown={(e) => startQueueDrag(e, index)}
                          onPointerMove={moveQueueDrag}
                          onPointerUp={endQueueDrag}
                          onPointerCancel={endQueueDrag}
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </span>
                      )}
                      <span className="dim text-xs w-4 flex-shrink-0">{index + 1}</span>
                      <img src={song.thumbnail} alt={song.title} className="w-12 h-9 object-cover rounded flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{song.title}</p>
                        <p className="text-xs dim">{song.groupName}</p>
                      </div>
                      {song.guestId === guestId && (
                        <button
                          onClick={() => cancelQueuedSong(song)}
                          className="icon-btn flex-shrink-0"
                          title="Remove your song from the queue"
                          aria-label="Remove your song from the queue"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Menu Page */}
          {!simpleMode && tablePage === 'menu' && (
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
          {!simpleMode && (pendingOrders[currentTable]?.length || 0) > 0 && (
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
          {!simpleMode && (
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
          )}
        </div>
      </div>
    );
};
export default TableMode;
