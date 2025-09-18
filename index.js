const express = require("express");
const https = require("https");
const app = express();

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

// Helper: wait function
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch from Roblox API using built-in https module
function fetchFromRoblox(params) {
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
    // Rate limiting
    const now = Date.now();
    const timeSince = now - lastRequestTime;
    if (timeSince < MIN_REQUEST_INTERVAL) {
      await wait(MIN_REQUEST_INTERVAL - timeSince);
    }
    lastRequestTime = Date.now();

    const allMode = req.query.all === "true"; // fetch multiple pages if set
    const defaultParams = {
      limit: req.query.limit || "30",
      cursor: req.query.cursor || ""
    };

    // Validate limit
    const validLimits = [10, 28, 30, 60, 120];
    let limit = parseInt(defaultParams.limit);
    if (!validLimits.includes(limit)) limit = 30;
    defaultParams.limit = limit.toString();

    // If all=false → single page
    if (!allMode) {
      const data = await fetchFromRoblox(defaultParams);
      return res.json(data);
    }

    // all=true → keep fetching until ~500 items
    let results = [];
    let cursor = "";
    let pages = 0;
    
    while (results.length < 500 && pages < 10) { // safety cap
      const params = { ...defaultParams, cursor: cursor };
      const data = await fetchFromRoblox(params);
      
      if (data && data.data) {
        results.push(...data.data);
      }
      
      if (!data.nextPageCursor) break;
      cursor = data.nextPageCursor;
      pages++;
    }

    console.log(`Fetched ${results.length} items in ${pages} pages`);
    res.json({ data: results, total: results.length });
    
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Roblox Catalog Proxy Running" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy running at http://localhost:${PORT}`));
