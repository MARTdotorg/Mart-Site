// Local development server.
//
// Run with: npm run dev   (then open http://localhost:8888)
//
// This mirrors the exact same /api/* routes that the Netlify Functions
// expose in production, so index.html / portfolio.html / projects.html /
// admin.html work identically whether they're talking to this server or to
// the deployed Netlify Functions.
//
// Auth note: production admin auth is handled by real Netlify Identity.
// Locally there's no Identity service running, so writes are gated by a
// simple shared token instead (see README section in this file's comments
// and DEV_ADMIN_TOKEN below). Set DEV_ADMIN_TOKEN in a .env file to require
// it; leave it unset to allow open access while developing on your machine.
"use strict";

require("dotenv").config();
const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");

const storage = require("../lib/storage");
const { listItems, saveItem, deleteItem } = require("../lib/collections");
const { MAX_UPLOAD_BYTES } = require("../lib/uploadLimits");

const app = express();
const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8888;

app.use(express.json({ limit: "8mb" }));
app.use(express.static(ROOT));

function isAuthorized(req) {
  const devToken = process.env.DEV_ADMIN_TOKEN;
  if (!devToken) return true; // no token configured -> open access, local convenience only
  return req.headers["x-dev-admin-token"] === devToken;
}

app.get("/api/content", async (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: "Missing type" });
  try {
    res.json(await listItems(type));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/content", async (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: "Missing type" });
  if (!isAuthorized(req))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    res.json(await saveItem(type, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/content", async (req, res) => {
  const { type, id } = req.query;
  if (!type || !id)
    return res.status(400).json({ error: "Missing type or id" });
  if (!isAuthorized(req))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    await deleteItem(type, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/upload", async (req, res) => {
  if (!isAuthorized(req))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const { filename, contentType, dataBase64 } = req.body;
    if (!dataBase64)
      return res.status(400).json({ error: "Missing image data" });

    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: "File too large (max 4.5MB). Please compress it first.",
      });
    }
    const ext =
      filename && filename.includes(".") ? filename.split(".").pop() : "jpg";
    const key = `img-${randomUUID()}.${ext}`;
    await storage.writeBinary(
      key,
      buffer,
      contentType || "application/octet-stream",
    );

    res.json({ key, url: `/api/image/${key}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/image/:key", async (req, res) => {
  const result = await storage.readBinary(req.params.key);
  if (!result) return res.status(404).end();
  res.setHeader("Content-Type", result.contentType);
  res.send(result.data);
});

// Pretty per-project URLs (e.g. /projects/my-film) all serve the same
// project.html template, which reads the slug from the URL on the client.
app.get("/projects/:slug", (req, res) => {
  res.sendFile(path.join(ROOT, "project.html"));
});

app.listen(PORT, () => {
  console.log(`MART dev server running at http://localhost:${PORT}`);
  if (!process.env.DEV_ADMIN_TOKEN) {
    console.log(
      "DEV_ADMIN_TOKEN not set — admin writes are open on localhost. Set it in .env to require a token.",
    );
  }
});
