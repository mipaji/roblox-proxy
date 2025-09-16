const express = require("express");
const app = express();

app.get("/catalog", async (req, res) => {
  try {
    const url = "https://catalog.roblox.com/v2/search/items/details?" + new URLSearchParams(req.query);
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Proxy running on port 3000"));
