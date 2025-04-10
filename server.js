const express = require('express');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure FFmpeg is available
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Directory to store temporary MP3 files
const outputDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// API endpoint to download audio
app.get('/api/audio', async (req, res) => {
  const { url } = req.query;

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }

  try {
    // Get video info
    const info = await ytdl.getInfo(url);
    const videoTitle = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize title
    const outputFilePath = path.join(outputDir, `${videoTitle}.mp3`);

    // Check if file already exists to avoid re-downloading
    if (fs.existsSync(outputFilePath)) {
      return res.json({ url: `/downloads/${videoTitle}.mp3` });
    }

    // Download and convert to MP3
    const stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
    ffmpeg(stream)
      .audioBitrate(128)
      .toFormat('mp3')
      .save(outputFilePath)
      .on('end', () => {
        console.log(`Converted ${videoTitle} to MP3`);
        res.json({ url: `/downloads/${videoTitle}.mp3` });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ error: 'Failed to convert audio' });
      });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to download audio' });
  }
});

// Serve downloaded files
app.use('/downloads', express.static(outputDir));

// Clean up old files (optional, to save space)
const cleanupInterval = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  fs.readdir(outputDir, (err, files) => {
    if (err) return console.error('Cleanup error:', err);
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        const age = Date.now() - stats.mtimeMs;
        if (age > cleanupInterval) {
          fs.unlink(filePath, err => {
            if (err) console.error('Delete error:', err);
            else console.log(`Deleted old file: ${file}`);
          });
        }
      });
    });
  });
}, cleanupInterval);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});