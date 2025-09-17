const express = require("express");
const app = express();

// Simple in-memory cache
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

app.get("/catalog", async (req, res) => {
  try {
    // Create cache key from query parameters
    const cacheKey = JSON.stringify(req.query);
    
    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("Serving from cache:", cacheKey);
      return res.json(cached.data);
    }
    
    // Rate limiting - wait if last request was too recent
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Default parameters for clothing catalog
    const defaultParams = {
      Category: req.query.Category || '11', // Accessories category
      Subcategory: req.query.Subcategory || '12', // T-Shirts
      SortType: req.query.SortType || '4', // Recently Updated
      Limit: req.query.Limit || '10', // Must be 10, 28, 30, 60, or 120
      ...req.query // Override with any provided parameters
    };
    
    // Validate limit parameter
    const validLimits = [10, 28, 30, 60, 120];
    const requestedLimit = parseInt(defaultParams.Limit);
    if (!validLimits.includes(requestedLimit)) {
      // Find the closest valid limit
      const closestLimit = validLimits.reduce((prev, curr) => 
        Math.abs(curr - requestedLimit) < Math.abs(prev - requestedLimit) ? curr : prev
      );
      defaultParams.Limit = closestLimit.toString();
      console.log(`Invalid limit ${requestedLimit}, using ${closestLimit} instead`);
    }
    
    const url = "https://catalog.roblox.com/v2/search/items/details?" + new URLSearchParams(defaultParams);
    console.log("Fetching from Roblox:", url);
    
    lastRequestTime = Date.now();
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'RobloxProxy/1.0',
        'Accept': 'application/json',
      }
    });
    
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    }
    
    const data = await r.json();
    
    // Cache the response
    cache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    // Clean up old cache entries (simple cleanup)
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    console.log("Success! Returning", data.data ? data.data.length : 0, "items");
    res.json(data);
    
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "Roblox Catalog Proxy Running",
    cache_size: cache.size,
    uptime: process.uptime(),
    valid_limits: [10, 28, 30, 60, 120]
  });
});

// Clear cache endpoint (for debugging)
app.get("/clear-cache", (req, res) => {
  cache.clear();
  res.json({ message: "Cache cleared" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /catalog - Roblox catalog proxy with caching");
  console.log("  GET / - Health check");
  console.log("  GET /clear-cache - Clear response cache");
});
