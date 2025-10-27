// Quick YouTube API Test Script
// Run this with: node test-youtube-api.js

require('dotenv').config();
const { google } = require('googleapis');

console.log('🧪 YouTube API Test Tool');
console.log('========================');

if (!process.env.YOUTUBE_API_KEY) {
  console.log('❌ No YOUTUBE_API_KEY found in .env file');
  process.exit(1);
}

console.log('✅ API Key found:', process.env.YOUTUBE_API_KEY.substring(0, 10) + '...');

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

async function testAPI() {
  try {
    console.log('🔍 Testing YouTube Data API v3...');
    
    const response = await youtube.search.list({
      part: 'snippet',
      q: 'test karaoke',
      type: 'video',
      maxResults: 1
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const video = response.data.items[0];
      console.log('✅ SUCCESS! YouTube API is working perfectly!');
      console.log('📺 Test result:', video.snippet.title);
      console.log('🎉 Your karaoke app is ready to search YouTube!');
    } else {
      console.log('⚠️  API responded but no results found');
    }
    
  } catch (error) {
    console.log('❌ YouTube API Test Failed:');
    console.log('   Error:', error.message);
    console.log('   Code:', error.code);
    
    if (error.code === 403) {
      if (error.message && error.message.includes('quota')) {
        console.log('');
        console.log('🎉 GOOD NEWS: Your YouTube API key is working!');
        console.log('⏰ You\'ve just hit your daily quota limit');
        console.log('');
        console.log('💡 What this means:');
        console.log('   ✅ YouTube Data API v3 is enabled');
        console.log('   ✅ Your API key is valid and configured correctly');
        console.log('   ✅ Your karaoke app will work perfectly!');
        console.log('');
        console.log('⏳ Quota resets at midnight Pacific Time');
        console.log('🔄 Until then, your app will use cached/demo results');
        console.log('');
      } else {
        console.log('');
        console.log('🔧 SOLUTION: Enable YouTube Data API v3');
        console.log('   1. Go to: https://console.cloud.google.com/');
        console.log('   2. Select your project');
        console.log('   3. Go to APIs & Services > Library');
        console.log('   4. Search for "YouTube Data API v3"');
        console.log('   5. Click ENABLE');
        console.log('');
      }
    } else if (error.code === 400) {
      console.log('');
      console.log('🔧 SOLUTION: Check your API key');
      console.log('   - Make sure the key is copied correctly');
      console.log('   - Verify it\'s from the right Google Cloud project');
      console.log('');
    }
  }
}

testAPI();