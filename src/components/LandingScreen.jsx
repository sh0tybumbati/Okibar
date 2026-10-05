import React from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const LandingScreen = (props) => {
  const {
    assignRole, currentTable, hasPin, overlays, requireStaff, setCurrentTable,
    setStaffMenu, simpleMode, staffMenu, tableList, tableUrl,
  } = props;
    return (
      <>
        {overlays}
      <div className="cantina-app">
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
            <div className="wordmark text-5xl sm:text-6xl mb-3">Can<span className="brand-text">tina</span></div>
            <p className="text-lg sm:text-xl muted mb-10">Karaoke, drinks &amp; good times.</p>

            <div className="panel p-8">
              {simpleMode ? (
                <>
                  <h2 className="h-display text-2xl mb-1">Join the Queue</h2>
                  <p className="muted mb-6">Scan the QR code on the TV screen to join from your phone — or tap below to use this device.</p>
                  <button className="btn btn-primary" onClick={() => assignRole('table')}>
                    <Mic2 className="w-4 h-4" /> Join the Queue
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
          </>
    );
};
export default LandingScreen;
