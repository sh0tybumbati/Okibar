import React from 'react';
import { Play, Pause, SkipForward, Trash2, GripVertical, Monitor, Smartphone, Search, Clock, Users, Settings, QrCode, CheckCircle, Edit3, Plus, Database, X, RefreshCw, ExternalLink, AlertTriangle, Palette, Check, Music2, Mic2, DollarSign, UserPlus, Maximize2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SERVER_ORIGIN } from '../services/api';
import { fmtTime } from '../hooks/useCantinaActions';

const TVMode = (props) => {
  const {
    connStatus, currentSong, currentSongArchive, globalQueue, isLocalPlayback, isMuted,
    isPlaying, joinUrl, overlays, playNext, playNextRef, progress,
    qrCornerStyle, qrPosition, requireStaff, setMode, setProgress, simpleMode,
    toggleFullscreen, ytFallback, ytHostRef,
  } = props;
    return (
      <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {overlays}

        {/* Fullscreen — pinned to the very top-left corner, out of the way */}
        <button
          onClick={toggleFullscreen}
          className="icon-btn"
          style={{ position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 20, width: '1.75rem', height: '1.75rem', padding: 0 }}
          title="Toggle fullscreen"
          aria-label="Toggle fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Top Bar */}
        <div className="absolute top-5 z-10 flex justify-between items-center gap-3" style={{ left: '3rem', right: '1.25rem' }}>
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

          {/* Sync status (plain dot) + staff device-switch, kept minimal */}
          <div className="flex items-center gap-2">
            <span
              className={`conn-dot ${connStatus === 'connected' ? 'is-on' : 'is-off'}`}
              title={connStatus === 'connected' ? 'Live-synced' : 'Reconnecting…'}
            />
            <button
              onClick={() => requireStaff(() => setMode(null))}
              className="icon-btn"
              style={{ width: '1.75rem', height: '1.75rem', padding: 0 }}
              title="Staff — change device role"
              aria-label="Staff — change device role"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Player — an archived song plays as a plain local file (no
            YouTube embed involved at all); otherwise the YouTube IFrame API
            mounts into the host div, falling back to a plain embed if it
            can't load (offline/blocked). */}
        {currentSong && isPlaying ? (
          <div className="flex-1 relative">
            {isLocalPlayback ? (
              <video
                key={currentSong.videoId}
                src={`${SERVER_ORIGIN}/media/${currentSongArchive.file}`}
                autoPlay
                muted={isMuted}
                className="w-full h-full"
                style={{ objectFit: 'contain', background: '#000' }}
                onTimeUpdate={(e) => setProgress({ current: e.target.currentTime || 0, duration: e.target.duration || 0 })}
                onEnded={() => playNextRef.current()}
              />
            ) : ytFallback ? (
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
            {/* Now-playing progress (live whenever something is actually driving playback) */}
            <div className="absolute bottom-0 left-0 right-0 z-10 px-6 py-4" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
              <div className="flex items-center gap-3 text-white">
                <Play className="w-4 h-4 flex-shrink-0" />
                {ytFallback && !isLocalPlayback ? (
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
          <div className="cantina-app flex-1 flex items-center justify-center">
            <div className="text-center px-6">
              <div className="text-7xl mb-6 fade-up">🎤</div>
              <div className="label mb-3">Cantina Live</div>
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

        {/* Current Singer Info — swaps to the right when the QR code is
            claiming bottom-left, so they never overlap. */}
        {currentSong && (
          <div className={`absolute bottom-5 panel px-5 py-3 ${simpleMode && qrPosition === 'bottom-left' ? 'right-5' : 'left-5'}`}>
            <div className="h-display text-lg">{currentSong.groupName}</div>
            <div className="label">Now Singing</div>
          </div>
        )}

        {/* Simple Queue Mode: no tables to walk up to, so the join link lives
            here — scan to queue a song from your own phone. Just the code,
            kept small and unobtrusive; corner is configurable in Settings. */}
        {simpleMode && (
          <div style={{ ...qrCornerStyle(qrPosition), opacity: 0.6 }}>
            <div className="qr-box" style={{ padding: '0.25rem' }}>
              <QRCodeSVG value={joinUrl()} size={52} bgColor="#ffffff" fgColor="#0a0e17" level="M" includeMargin={false} />
            </div>
          </div>
        )}
      </div>
    );
};
export default TVMode;
