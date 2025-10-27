# OKibar

A karaoke bar management system with YouTube integration for live karaoke sessions.

## Features

- **YouTube Integration**: Search and queue karaoke videos directly from YouTube
- **Real-time Queue Management**: Live updates via Socket.io for synchronized displays
- **Singer Management**: Track performers and manage the singing order
- **Dual Display Support**: Separate views for management and public display
- **Modern UI**: Built with React and Tailwind CSS

## Tech Stack

- **Frontend**: React, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express
- **Real-time**: Socket.io
- **API**: YouTube Data API v3

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and add your YouTube API key:
   ```
   YOUTUBE_API_KEY=your_api_key_here
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Run both client and server in development mode
- `npm run server` - Run only the backend server
- `npm run client` - Run only the React frontend
- `npm run build` - Build for production

## Environment Variables

See `.env.example` for required environment variables.

## License

All rights reserved.
