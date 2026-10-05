const express = require('express');
const { archiveVideo, findArchivedFile, checkYtDlpAvailable, VIDEO_ID_REGEX } = require('../archiver');
const router = express.Router();

module.exports = (deps) => {
  const { getCachedSongs, setCachedSongs } = deps;

  const setArchiveStatus = (videoId, patch) => {
    const cachedSongs = getCachedSongs();
    const idx = cachedSongs.findIndex(s => s.videoId === videoId);
    if (idx === -1) return;
    const updated = [...cachedSongs];
    updated[idx] = { ...updated[idx], archive: { ...updated[idx].archive, ...patch } };
    setCachedSongs(updated);
  };

  router.post('/archive', async (req, res) => {
    const { videoId, title, thumbnail, channel } = req.body;
    if (!videoId || !VIDEO_ID_REGEX.test(videoId)) {
      return res.status(400).json({ success: false, message: 'A valid 11-character videoId is required' });
    }

    const existingFile = findArchivedFile(videoId);
    if (existingFile) {
      return res.json({ success: true, archive: { status: 'ready', progress: 100, file: existingFile } });
    }

    const cachedSongs = getCachedSongs();
    let song = cachedSongs.find(s => s.videoId === videoId);
    if (!song) {
      song = { videoId, title: title || 'Unknown', thumbnail: thumbnail || '', channel: channel || '' };
      setCachedSongs([song, ...cachedSongs].slice(0, 100));
    }
    if (song.archive && song.archive.status === 'downloading') {
      return res.json({ success: true, archive: song.archive });
    }

    const available = await checkYtDlpAvailable();
    if (!available) {
      setArchiveStatus(videoId, { status: 'failed', progress: 0, reason: 'yt-dlp is not installed on this machine' });
      return res.status(503).json({ success: false, message: 'yt-dlp is not installed on this machine' });
    }

    setArchiveStatus(videoId, { status: 'downloading', progress: 0, reason: null });
    res.json({ success: true, archive: { status: 'downloading', progress: 0 } });

    // Downloading can take a while — respond immediately above, then stream
    // progress and the final result over the existing state:update socket.
    let lastBroadcast = 0;
    archiveVideo(videoId, {
      onProgress: (progress) => {
        if (progress - lastBroadcast < 10 && progress < 99) return;
        lastBroadcast = progress;
        setArchiveStatus(videoId, { status: 'downloading', progress });
      }
    }).then((result) => {
      if (result.success) {
        setArchiveStatus(videoId, { status: 'ready', progress: 100, file: result.file, reason: null });
      } else {
        setArchiveStatus(videoId, { status: 'failed', progress: 0, reason: result.reason });
      }
    });
  });

  return router;
};
