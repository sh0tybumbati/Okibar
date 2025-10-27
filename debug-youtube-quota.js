// Advanced YouTube API Quota Debugging
require('dotenv').config();
const { google } = require('googleapis');

console.log('🔍 Advanced YouTube API Debugging');
console.log('==================================');

if (!process.env.YOUTUBE_API_KEY) {
  console.log('❌ No YOUTUBE_API_KEY found in .env file');
  process.exit(1);
}

const apiKey = process.env.YOUTUBE_API_KEY;
console.log('🔑 API Key:', apiKey.substring(0, 15) + '...' + apiKey.substring(apiKey.length - 5));
console.log('📏 Key Length:', apiKey.length, '(should be 39 characters)');

// Check if it looks like a valid Google API key format
const validFormat = /^AIza[0-9A-Za-z\-_]{35}$/.test(apiKey);
console.log('✅ Valid Format:', validFormat ? 'YES' : 'NO');

const youtube = google.youtube({
  version: 'v3',
  auth: apiKey
});

async function debugQuota() {
  console.log('\n🧪 Testing different YouTube API endpoints...\n');
  
  // Test 1: Try the most basic quota endpoint first
  try {
    console.log('Test 1: Checking quota with simplest possible request...');
    const response = await youtube.search.list({
      part: 'id',  // Minimal part to use least quota
      q: 'test',
      type: 'video',
      maxResults: 1,
      fields: 'items(id)'  // Minimal fields
    });
    
    console.log('✅ SUCCESS! Basic search works');
    console.log('📊 Results found:', response.data.items?.length || 0);
    return true;
  } catch (error) {
    console.log('❌ Basic search failed:');
    console.log('   Status:', error.response?.status);
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
    
    // Log full error details for debugging
    if (error.response?.data?.error) {
      console.log('   Full Error:', JSON.stringify(error.response.data.error, null, 2));
    }
  }
  
  // Test 2: Try a different endpoint that uses less quota
  try {
    console.log('\nTest 2: Trying videos.list endpoint...');
    const response = await youtube.videos.list({
      part: 'id',
      id: 'dQw4w9WgXcQ',  // Rick Roll video ID (always exists)
      fields: 'items(id)'
    });
    
    console.log('✅ SUCCESS! Videos endpoint works');
    console.log('📊 Video found:', response.data.items?.length > 0 ? 'YES' : 'NO');
    return true;
  } catch (error) {
    console.log('❌ Videos endpoint failed:');
    console.log('   Status:', error.response?.status);
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
  }
  
  // Test 3: Check if it's a billing issue
  try {
    console.log('\nTest 3: Checking channel endpoint (lowest quota)...');
    const response = await youtube.channels.list({
      part: 'id',
      id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',  // Google Developers channel
      fields: 'items(id)'
    });
    
    console.log('✅ SUCCESS! Channels endpoint works');
    return true;
  } catch (error) {
    console.log('❌ Channels endpoint failed:');
    console.log('   Status:', error.response?.status);
    console.log('   Code:', error.code);
    console.log('   Message:', error.message);
  }
  
  return false;
}

async function main() {
  const success = await debugQuota();
  
  if (!success) {
    console.log('\n🔧 TROUBLESHOOTING STEPS:');
    console.log('=========================');
    console.log('');
    console.log('1. 📋 Check Google Cloud Console Quotas:');
    console.log('   → Go to: https://console.cloud.google.com/');
    console.log('   → Navigate: APIs & Services → Quotas');
    console.log('   → Search: "YouTube Data API v3"');
    console.log('   → Check: Daily quota usage and limits');
    console.log('');
    console.log('2. 💳 Check Billing Status:');
    console.log('   → Go to: https://console.cloud.google.com/billing');
    console.log('   → Verify: Billing account is linked (even for free tier)');
    console.log('   → Note: Some regions require billing enabled');
    console.log('');
    console.log('3. 🔑 Verify API Key:');
    console.log('   → Ensure: Key is from the SAME project where YouTube API is enabled');
    console.log('   → Check: API restrictions allow YouTube Data API v3');
    console.log('   → Try: Create a new API key in the same project');
    console.log('');
    console.log('4. 🌍 Regional Issues:');
    console.log('   → Some Google Cloud regions have different quota limits');
    console.log('   → Try: Creating a new project in a different region');
    console.log('');
  }
}

main();