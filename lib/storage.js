// Storage abstraction so the exact same code path can run:
//  - on Netlify, backed by Netlify Blobs (persists across deploys, no DB needed)
//  - locally via `npm run dev`, backed by plain files on disk (./data and ./uploads)
"use strict";

const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOCAL_DATA_DIR = path.join(ROOT, "data");
const LOCAL_UPLOADS_DIR = path.join(ROOT, "uploads");

function isNetlifyRuntime() {
  // These env vars are automatically present inside deployed Netlify Functions.
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

let cachedStore = null;
function getBlobStore() {
  if (!cachedStore) {
    const { getStore } = require("@netlify/blobs");
    cachedStore = getStore("mart-site-content");
  }
  return cachedStore;
}

async function readJSON(key, fallback) {
  if (isNetlifyRuntime()) {
    const value = await getBlobStore().get(key, { type: "json" });
    return value ?? fallback;
  }
  try {
    const raw = await fs.readFile(
      path.join(LOCAL_DATA_DIR, `${key}.json`),
      "utf-8",
    );
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJSON(key, value) {
  if (isNetlifyRuntime()) {
    await getBlobStore().setJSON(key, value);
    return;
  }
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(LOCAL_DATA_DIR, `${key}.json`),
    JSON.stringify(value, null, 2),
  );
}

async function writeBinary(key, buffer, contentType) {
  if (isNetlifyRuntime()) {
    await getBlobStore().set(key, buffer, { metadata: { contentType } });
    return;
  }
  await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_UPLOADS_DIR, key), buffer);
  await fs.writeFile(
    path.join(LOCAL_UPLOADS_DIR, `${key}.meta.json`),
    JSON.stringify({ contentType }),
  );
}

async function readBinary(key) {
  if (isNetlifyRuntime()) {
    const result = await getBlobStore().getWithMetadata(key, {
      type: "arrayBuffer",
    });
    if (!result) return null;
    return {
      data: Buffer.from(result.data),
      contentType: result.metadata?.contentType || "application/octet-stream",
    };
  }
  try {
    const data = await fs.readFile(path.join(LOCAL_UPLOADS_DIR, key));
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(
        await fs.readFile(
          path.join(LOCAL_UPLOADS_DIR, `${key}.meta.json`),
          "utf-8",
        ),
      );
      contentType = meta.contentType || contentType;
    } catch {
      // no metadata file, fall back to generic content type
    }
    return { data, contentType };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function deleteBinary(key) {
  if (isNetlifyRuntime()) {
    await getBlobStore().delete(key);
    return;
  }
  await fs.rm(path.join(LOCAL_UPLOADS_DIR, key), { force: true });
  await fs.rm(path.join(LOCAL_UPLOADS_DIR, `${key}.meta.json`), {
    force: true,
  });
}

module.exports = {
  readJSON,
  writeJSON,
  writeBinary,
  readBinary,
  deleteBinary,
  isNetlifyRuntime,
};
