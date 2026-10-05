import React from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL } from '../services/api';
import { hashPin } from '../utils/hash';
import { THEMES } from '../hooks/useCantinaActions';

const BarConsole = (props) => {
  const {
    addTable, askConfirm, assignOrderMember, barPage, batchRecheckAvailability, cacheSearchQuery,
    cachedSongs, clearBlockedSongs, connDot, currency, currentSong, dragGroupRef,
    dragIndexRef, dragPos, ensureArchived, floorRef, getFilteredCachedSongs, globalQueue,
    groupHistory, guestsCanReorder, hasPin, historyDay, historyMode, historyMonth,
    historySearch, isEditMode, isPlaying, isRecheckingCache, maxSongsPerTable, menuItems,
    openCheckout, openTabs, overlays, pinDraft, playNext, pushToast,
    qrPosition, recheckSongAvailability, removeMember, removeMenuItem, removeTable, reorderQueue,
    reposRef, setBarPage, setCacheSearchQuery, setCachedSongs, setCurrency, setDragPos,
    setGlobalQueue, setGuestsCanReorder, setHistoryDay, setHistoryMode, setHistoryMonth, setHistorySearch,
    setIsEditMode, setIsPlaying, setMaxSongsPerTable, setMemberForm, setMenuForm, setMode,
    setPinDraft, setQrPosition, setQrTable, setShowCacheViewer, setSimpleMode, setSongPrice,
    setStaffPin, setTablePos, setTables, setTheme, setTransferForm, settleTab,
    showCacheViewer, simpleMode, songPrice, syncedOnce, tableList, tableXY,
    tables, theme, toggleMenuItemStock, tokenDraggedRef, transferTable, updateGroupInfo,
    updateMenuPrice, updateTableOccupancy,
  } = props;
    // Forced first-run security: the Bar Console can't be used until a staff PIN
    // exists, so a venue is never left wide open (and a guest can't claim the
    // PIN first). Wait for the initial server sync so we don't prompt on a
    // device that's about to receive an existing PIN.
    if (!hasPin) {
      return (
        <div className="cantina-app flex items-center justify-center">
          {overlays}
          <div className="cantina-shell fade-up" style={{ maxWidth: '24rem' }}>
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
      ...(simpleMode ? [] : [
        { id: 'orders', label: '📋 Orders' },
        { id: 'guests', label: '👥 Guests' },
        { id: 'floor', label: '🗺️ Floor' },
        { id: 'tables', label: '🪑 Tables' },
        { id: 'menu', label: '🍽️ Menu' },
        { id: 'history', label: '📅 History' },
        { id: 'tabs', label: '💳 Tabs' }
      ]),
      { id: 'settings', label: '⚙️ Settings' }
    ];

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
              {typeof window !== 'undefined' && window.cantina?.isDesktop && (
                <button
                  onClick={() => window.cantina.openTvWindow()}
                  className="btn btn-sm ml-2 btn-ghost"
                  title="Open the TV/player view in its own window"
                >
                  <Monitor className="w-4 h-4" /> TV Window
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

        <div className="cantina-shell fade-up">
          {/* Page Navigation */}
          <div className="seg seg-scroll mb-6">
            {barTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setBarPage(tab.id)}
                className={`seg-btn ${barPage === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}{tab.id === 'tabs' && openTabs.length ? ` (${openTabs.length})` : ''}
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
                      onDragStart={() => { if (!isEditMode && occupied) { dragGroupRef.current = table.number; tokenDraggedRef.current = true; } }}
                      onDragEnd={() => { setTimeout(() => { tokenDraggedRef.current = false; }, 0); }}
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
                      onClick={() => { if (!isEditMode && occupied && !tokenDraggedRef.current) openCheckout(String(table.number)); }}
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
                        {!simpleMode && <div className="money text-sm">{currency}{(song.price || 0).toFixed(2)}</div>}
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

          {barPage === 'tabs' && (
            <div className="space-y-3">
              <h3 className="h-display text-xl mb-2">Open Tabs</h3>
              {openTabs.length === 0 && <div className="muted text-sm">No open tabs.</div>}
              {openTabs.map(tab => (
                <div key={tab.id} className="panel p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{tab.groupName} · Table {tab.tableNumber}</div>
                    <div className="text-xs dim">
                      {(tab.members || []).map(m => m.name).join(', ') || `Table of ${tab.guestCount}`}
                      {' · '}{new Date(tab.checkoutTime).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="money" style={{ color: 'var(--warn)' }}>{currency}{(tab.amountTab || 0).toFixed(2)}</span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => askConfirm({
                        title: `Settle ${tab.groupName}'s tab?`,
                        body: `${currency}${(tab.amountTab || 0).toFixed(2)} will be marked paid.`,
                        confirmLabel: 'Collect & Settle',
                        onConfirm: () => settleTab(tab.groupKey, tab.id),
                      })}
                    >
                      <CheckCircle className="w-4 h-4" /> Collect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

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

              {/* Simple Queue Mode */}
              <div className="panel p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Mic2 className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                  <h4 className="h-display text-lg">Simple Queue Mode</h4>
                  <span className={`tag ${simpleMode ? 'tag-ok' : ''}`}>{simpleMode ? 'On' : 'Off'}</span>
                </div>
                <p className="text-sm dim mb-4">
                  Strips this down to just the karaoke queue — no tables, no ordering, no billing. Each device that joins is its own guest, singing straight from search. Guests scan the QR code on the TV to join. Hides Orders, Guests, Floor, Tables, Menu, History and Tabs from the Bar Console.
                </p>
                <button
                  className={`btn ${simpleMode ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => {
                    if (simpleMode) { setSimpleMode(false); pushToast('Simple Queue Mode off — bar features restored', 'info'); return; }
                    askConfirm({
                      title: 'Turn on Simple Queue Mode?',
                      body: 'Ordering, billing, tables, floor plan and history become unavailable on every device until this is turned back off.',
                      confirmLabel: 'Turn on',
                      onConfirm: () => { setSimpleMode(true); setBarPage('queue'); pushToast('Simple Queue Mode on — bar features hidden', 'success'); }
                    });
                  }}
                >
                  {simpleMode ? 'Turn off' : 'Turn on'}
                </button>

                <div className="divide-line pt-4 mt-4">
                  <label className="label block mb-2">TV QR Code Corner</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'top-left', label: 'Top Left' },
                      { id: 'top-right', label: 'Top Right' },
                      { id: 'bottom-left', label: 'Bottom Left' },
                      { id: 'bottom-right', label: 'Bottom Right' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        className={`seg-btn ${qrPosition === opt.id ? 'is-active' : ''}`}
                        onClick={() => setQrPosition(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-line pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="label">Party Mode — Anyone Can Reorder</label>
                    <span className={`tag ${guestsCanReorder ? 'tag-ok' : ''}`}>{guestsCanReorder ? 'On' : 'Off'}</span>
                  </div>
                  <p className="text-sm dim mb-3">
                    Lets any guest drag-reorder the whole shared queue from their own phone, not just their own songs. Good for parties; turn off if you want the running order to stay put.
                  </p>
                  <button
                    className={`btn btn-sm ${guestsCanReorder ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => setGuestsCanReorder(!guestsCanReorder)}
                  >
                    {guestsCanReorder ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
              </div>

              {/* Archived Songs */}
              {(() => {
                const archivedSongs = cachedSongs.filter(s => s.archive);
                return (
                  <div className="panel p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Database className="w-5 h-5" style={{ color: 'var(--brand)' }} />
                      <h4 className="h-display text-lg">Archived Songs</h4>
                      <span className="tag">{archivedSongs.length}</span>
                    </div>
                    <p className="text-sm dim mb-4">
                      When a song fails to embed on the TV, it gets downloaded here automatically and plays back as a local file from then on — no more "Video unavailable."
                    </p>
                    {archivedSongs.length === 0 ? (
                      <p className="dim text-sm">No songs have needed archiving yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {archivedSongs.map(s => (
                          <div key={s.videoId} className="subpanel p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{s.title}</div>
                              <div className="dim text-xs">
                                {s.archive.status === 'downloading' && `Downloading… ${s.archive.progress || 0}%`}
                                {s.archive.status === 'ready' && 'Ready — playing locally'}
                                {s.archive.status === 'failed' && `Failed: ${s.archive.reason || 'unknown error'}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {s.archive.status === 'failed' && (
                                <button className="btn btn-sm btn-ghost" onClick={() => ensureArchived(s)}>Retry</button>
                              )}
                              <span className={`tag ${s.archive.status === 'ready' ? 'tag-ok' : s.archive.status === 'failed' ? 'tag-danger' : ''}`}>
                                {s.archive.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                              localStorage.removeItem('cantina-cached-songs');
                              pushToast('All cached songs cleared', 'success');
                            }
                          } catch (error) {
                            console.error('Failed to clear cache on server:', error);
                            setCachedSongs([]);
                            localStorage.removeItem('cantina-cached-songs');
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
                                          localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
                                          return updated;
                                        });
                                      }
                                    } catch (error) {
                                      console.error('Failed to remove from server cache:', error);
                                      setCachedSongs(prev => {
                                        const updated = prev.filter(s => s.videoId !== song.videoId);
                                        localStorage.setItem('cantina-cached-songs', JSON.stringify(updated));
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
};
export default BarConsole;
