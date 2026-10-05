// Local video archiving — when a song fails to play because its owner
// disabled embedding, we download it once (yt-dlp) and serve it back as a
// plain file from then on. A <video> tag playing a local file never touches
// YouTube's embed restriction at all, so this fixes the failure at the root
// instead of just detecting and avoiding it.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const MEDIA_DIR = process.env.CANTINA_MEDIA_DIR || path.join(__dirname, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// yt-dlp leaves .part/.ytdl siblings while downloading — only a file with
// none of those suffixes is actually finished and safe to serve.
const isPartialFile = (name) => /\.(part|ytdl|part-Frag\d+)$/i.test(name);

const findArchivedFile = (videoId) => {
  if (!VIDEO_ID_REGEX.test(videoId)) return null;
  const prefix = `${videoId}.`;
  const match = fs.readdirSync(MEDIA_DIR).find(f => f.startsWith(prefix) && !isPartialFile(f));
  return match || null;
};

const isArchived = (videoId) => findArchivedFile(videoId) !== null;

// A double-clicked/launcher-started desktop app on Linux typically does NOT
// inherit the shell's PATH (no .bashrc/.profile sourcing), so a bare
// spawn('yt-dlp', ...) can silently fail to find a pip/pipx-installed
// binary that works fine from a terminal. Check common install locations
// explicitly before falling back to a plain PATH lookup.
let ytDlpBin = null; // resolved absolute path, or 'yt-dlp' to rely on PATH
const resolveYtDlpBin = () => {
  if (ytDlpBin) return ytDlpBin;
  if (process.env.CANTINA_YTDLP_PATH) return (ytDlpBin = process.env.CANTINA_YTDLP_PATH);
  const candidates = [
    path.join(require('os').homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    '/usr/bin/yt-dlp'
  ];
  const found = candidates.find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });
  return (ytDlpBin = found || 'yt-dlp');
};

let ytDlpAvailable = null; // cached after first check
const checkYtDlpAvailable = () => new Promise((resolve) => {
  if (ytDlpAvailable !== null) return resolve(ytDlpAvailable);
  execFile(resolveYtDlpBin(), ['--version'], (error) => {
    ytDlpAvailable = !error;
    if (!ytDlpAvailable) {
      console.warn(`⚠️  yt-dlp not found (looked for "${resolveYtDlpBin()}") — local archiving of embed-blocked songs is disabled.`);
      console.warn('📖 Install it, or set CANTINA_YTDLP_PATH: https://github.com/yt-dlp/yt-dlp#installation');
    } else {
      console.log(`🎬 yt-dlp found at "${resolveYtDlpBin()}" — queued songs will be archived locally.`);
    }
    resolve(ytDlpAvailable);
  });
});

const inFlight = new Map(); // videoId -> Promise<{success, file?, reason?}>

// Every queued song gets archived now (not just ones that already failed),
// so a full night's queue can dump a burst of downloads on the server at
// once. Cap how many yt-dlp processes run at a time so that doesn't choke
// the machine's CPU/bandwidth while a song is actually trying to play.
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;
const pendingStarts = [];

const runNextPending = () => {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS || pendingStarts.length === 0) return;
  activeDownloads++;
  const start = pendingStarts.shift();
  start();
};

const releaseDownloadSlot = () => {
  activeDownloads--;
  runNextPending();
};

// Downloads a video for local playback, capped at 480p — plenty for a TV
// screen, keeps downloads fast and storage reasonable for a bar running
// this over weeks/months.
const archiveVideo = (videoId, { onProgress } = {}) => {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    return Promise.reject(new Error(`Invalid video ID: ${videoId}`));
  }
  const existing = findArchivedFile(videoId);
  if (existing) return Promise.resolve({ success: true, file: existing });
  if (inFlight.has(videoId)) return inFlight.get(videoId);

  const promise = (async () => {
    const available = await checkYtDlpAvailable();
    if (!available) {
      inFlight.delete(videoId);
      return { success: false, reason: 'yt-dlp is not installed on this machine' };
    }

    return new Promise((resolve) => {
      pendingStarts.push(() => {
        const args = [
          '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best',
          '--no-playlist',
          '--newline',
          '-o', path.join(MEDIA_DIR, `${videoId}.%(ext)s`),
          `https://www.youtube.com/watch?v=${videoId}`
        ];
        const proc = spawn(resolveYtDlpBin(), args);
        let lastErr = '';

        proc.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          const match = text.match(/\[download\]\s+([\d.]+)% of/);
          if (match && onProgress) onProgress(Math.min(99, Math.round(parseFloat(match[1]))));
        });
        proc.stderr.on('data', (chunk) => { lastErr += chunk.toString(); });

        proc.on('close', (code) => {
          inFlight.delete(videoId);
          releaseDownloadSlot();
          const file = findArchivedFile(videoId);
          if (code !== 0 || !file) {
            console.error(`❌ Archive failed for ${videoId} (exit ${code}):`, lastErr.trim().slice(-500));
            resolve({ success: false, reason: 'Download failed' });
            return;
          }
          console.log(`✅ Archived ${videoId} -> ${file}`);
          resolve({ success: true, file });
        });

        proc.on('error', (err) => {
          inFlight.delete(videoId);
          releaseDownloadSlot();
          console.error(`❌ Failed to launch yt-dlp for ${videoId}:`, err.message);
          resolve({ success: false, reason: err.message });
        });
      });
      runNextPending();
    });
  })();

  inFlight.set(videoId, promise);
  return promise;
};

// Enforce a maximum media directory size by evicting least-recently-accessed
// files first. Called on startup and after each successful download.
const DEFAULT_MAX_MEDIA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

const enforceMediaQuota = async (maxBytes) => {
  maxBytes = maxBytes || (parseFloat(process.env.CANTINA_MAX_MEDIA_GB) || 5) * 1024 * 1024 * 1024;
  try {
    const files = await fs.promises.readdir(MEDIA_DIR);
    const stats = await Promise.all(
      files
        .filter(f => !isPartialFile(f))
        .map(async (f) => {
          const filePath = path.join(MEDIA_DIR, f);
          const stat = await fs.promises.stat(filePath);
          return { name: f, path: filePath, size: stat.size, atimeMs: stat.atimeMs };
        })
    );
    // Sort by access time, oldest first
    stats.sort((a, b) => a.atimeMs - b.atimeMs);
    let totalSize = stats.reduce((sum, s) => sum + s.size, 0);
    let evicted = 0;
    while (totalSize > maxBytes && stats.length > 0) {
      const oldest = stats.shift();
      await fs.promises.unlink(oldest.path);
      totalSize -= oldest.size;
      evicted++;
    }
    if (evicted > 0) {
      console.log(`🧹 Media quota: evicted ${evicted} file(s), ${(totalSize / 1024 / 1024).toFixed(0)} MB remaining`);
    }
  } catch (err) {
    console.error('Failed to enforce media quota:', err.message);
  }
};

module.exports = { archiveVideo, isArchived, findArchivedFile, checkYtDlpAvailable, enforceMediaQuota, VIDEO_ID_REGEX, MEDIA_DIR };
