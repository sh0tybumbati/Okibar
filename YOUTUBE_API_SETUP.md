# YouTube API Setup Guide

Your Okibar karaoke system is now ready to use YouTube's API for song searches! Currently, it's running in **fallback mode** using cached results only.

## 🚀 Quick Setup (5 minutes)

### Step 1: Get a YouTube API Key
1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select an existing one
3. Click "Enable APIs and Services"
4. Search for "YouTube Data API v3" and enable it
5. Go to "Credentials" → "Create Credentials" → "API Key"
6. Copy your new API key

### Step 2: Configure Your App
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and replace `YOUR_YOUTUBE_API_KEY_HERE` with your actual API key:
   ```
   YOUTUBE_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Restart your server:
   ```bash
   npm run server
   ```

### Step 3: Verify Setup
You should see this message when the server starts:
```
✅ YouTube API is ready for karaoke searches!
```

## 🔒 Security Best Practices

1. **Restrict your API key** in Google Cloud Console:
   - Go to your API key settings
   - Under "Application restrictions", select "HTTP referrers" for web apps
   - Add your domain: `localhost:3000` for development
   - Under "API restrictions", select "YouTube Data API v3"

2. **Set usage quotas** to prevent unexpected charges:
   - YouTube Data API v3 has a daily quota
   - Monitor usage in Google Cloud Console

## 🎵 How It Works

- **With API key**: Real-time YouTube search for karaoke videos
- **Without API key**: Uses cached songs from previous searches + demo results
- **API quota exceeded**: Automatically falls back to cached results
- **API errors**: Graceful fallback with user-friendly messages

## 💡 Pro Tips

- The system automatically adds "karaoke" to your search queries
- Results are filtered for music category and safe content
- Previously searched songs are cached locally for offline use
- API key is tested on server startup for immediate feedback

## 🔧 Troubleshooting

### "YouTube API key is invalid"
- Double-check your API key in the `.env` file
- Ensure YouTube Data API v3 is enabled in Google Cloud Console
- Check that your API key hasn't expired or been regenerated

### "YouTube API quota exceeded"
- You've hit your daily usage limit
- The system will automatically use cached results
- Consider upgrading your quota in Google Cloud Console

### Still seeing demo results?
- Verify your `.env` file exists and has the correct API key
- Restart the server after making changes
- Check server console for error messages

---

**Need help?** Check the server console logs for detailed error messages and troubleshooting hints.