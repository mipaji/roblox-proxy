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

    // all=true → keep fetching until ~300 items (reduced to avoid rate limits)
    let results = [];
    let cursor = "";
    let pages = 0;
    
    while (results.length < 300 && pages < 5) { // reduced safety cap
      const params = { ...defaultParams, cursor: cursor };
      
      try {
        const data = await fetchFromRoblox(params);
        
        if (data && data.data) {
          results.push(...data.data);
          console.log(`Page ${pages + 1}: Added ${data.data.length} items. Total: ${results.length}`);
        }
        
        if (!data.nextPageCursor) {
          console.log("No more pages available");
          break;
        }
        
        cursor = data.nextPageCursor;
        pages++;
        
        // Add extra delay between pages to avoid rate limiting
        if (pages < 5 && data.nextPageCursor) {
          console.log("Waiting 6 seconds before next page...");
          await wait(6000); // 6 second delay between pages
        }
        
      } catch (error) {
        console.error(`Error on page ${pages + 1}:`, error.message);
        if (error.message.includes("429")) {
          console.log("Rate limited, stopping pagination");
          break;
        }
        throw error; // Re-throw non-rate-limit errors
      }
    }

    console.log(`Fetched ${results.length} items in ${pages} pages`);
    res.json({ 
      data: results, 
      total: results.length,
      pages: pages,
      nextPageCursor: cursor || null
    });
    
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
