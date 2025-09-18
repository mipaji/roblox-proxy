const express = require("express");
const https = require("https");
const app = express();

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting - increased to avoid 429 errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 5000; // 5 seconds between requests

// Helper: wait function
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch from Roblox API using built-in https module
async function fetchFromRoblox(params) {
  // Rate limiting
  const now = Date.now();
  const timeSince = now - lastRequestTime;
  if (timeSince < MIN_REQUEST_INTERVAL) {
    await wait(MIN_REQUEST_INTERVAL - timeSince);
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    const url = "https://catalog.roblox.com/v2/search/items/details?" + new URLSearchParams(params);
    console.log("Fetching:", url);
    
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            throw new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

app.get("/catalog", async (req, res) => {
  try {
    const keyword = req.query.keyword || "";
    const limit = parseInt(req.query.limit) || 30;
    
    // Validate limit
    const validLimits = [10, 28, 30, 60, 120];
    const finalLimit = validLimits.includes(limit) ? limit : 30;

    const params = {
      limit: finalLimit.toString(),
      keyword: keyword
    };

    console.log(`Searching for: "${keyword}" with limit ${finalLimit}`);
    
    const data = await fetchFromRoblox(params);
    
    if (data && data.data) {
      console.log(`Found ${data.data.length} items for keyword: "${keyword}"`);
    }
    
    res.json(data);
    
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "Roblox Catalog Proxy Running",
    timestamp: new Date().toISOString(),
    rateLimit: `${MIN_REQUEST_INTERVAL / 1000} seconds between requests`
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy running at http://localhost:${PORT}`));
