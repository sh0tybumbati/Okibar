// Local video archiving — when a song fails to play because its owner
// disabled embedding, we download it once (yt-dlp) and serve it back as a
// plain file from then on. A <video> tag playing a local file never touches
// YouTube's embed restriction at all, so this fixes the failure at the root
// instead of just detecting and avoiding it.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = process.env.CANTINA_MEDIA_DIR || path.join(__dirname, 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const YT_DLP_BIN = process.env.CANTINA_YTDLP_PATH || 'yt-dlp';

// yt-dlp leaves .part/.ytdl siblings while downloading — only a file with
// none of those suffixes is actually finished and safe to serve.
const isPartialFile = (name) => /\.(part|ytdl|part-Frag\d+)$/i.test(name);

const findArchivedFile = (videoId) => {
  const prefix = `${videoId}.`;
  const match = fs.readdirSync(MEDIA_DIR).find(f => f.startsWith(prefix) && !isPartialFile(f));
  return match || null;
};

const isArchived = (videoId) => findArchivedFile(videoId) !== null;

let ytDlpAvailable = null; // cached after first check
const checkYtDlpAvailable = () => new Promise((resolve) => {
  if (ytDlpAvailable !== null) return resolve(ytDlpAvailable);
  execFile(YT_DLP_BIN, ['--version'], (error) => {
    ytDlpAvailable = !error;
    if (!ytDlpAvailable) {
      console.warn('⚠️  yt-dlp not found — local archiving of embed-blocked songs is disabled.');
      console.warn('📖 Install it: https://github.com/yt-dlp/yt-dlp#installation');
    } else {
      console.log('🎬 yt-dlp found — songs that fail to embed will be archived locally.');
    }
    resolve(ytDlpAvailable);
  });
});

const inFlight = new Map(); // videoId -> Promise<{success, file?, reason?}>

// Downloads a video for local playback, capped at 480p — plenty for a TV
// screen, keeps downloads fast and storage reasonable for a bar running
// this over weeks/months.
const archiveVideo = (videoId, { onProgress } = {}) => {
  const existing = findArchivedFile(videoId);
  if (existing) return Promise.resolve({ success: true, file: existing });
  if (inFlight.has(videoId)) return inFlight.get(videoId);

  const promise = (async () => {
    const available = await checkYtDlpAvailable();
    if (!available) {
      return { success: false, reason: 'yt-dlp is not installed on this machine' };
    }

    return new Promise((resolve) => {
      const args = [
        '-f', 'best[height<=480][ext=mp4]/best[height<=480]/best',
        '--no-playlist',
        '--newline',
        '-o', path.join(MEDIA_DIR, `${videoId}.%(ext)s`),
        `https://www.youtube.com/watch?v=${videoId}`
      ];
      const proc = spawn(YT_DLP_BIN, args);
      let lastErr = '';

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const match = text.match(/\[download\]\s+([\d.]+)% of/);
        if (match && onProgress) onProgress(Math.min(99, Math.round(parseFloat(match[1]))));
      });
      proc.stderr.on('data', (chunk) => { lastErr += chunk.toString(); });

      proc.on('close', (code) => {
        inFlight.delete(videoId);
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
        console.error(`❌ Failed to launch yt-dlp for ${videoId}:`, err.message);
        resolve({ success: false, reason: err.message });
      });
    });
  })();

  inFlight.set(videoId, promise);
  return promise;
};

module.exports = { archiveVideo, isArchived, findArchivedFile, checkYtDlpAvailable, MEDIA_DIR };
