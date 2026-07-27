// CRUD helpers for the three content collections (frames, portfolio, projects).
// Each collection is stored as a single JSON array under its own key.
"use strict";

const { randomUUID } = require("crypto");
const storage = require("./storage");

const DEFAULTS = {
  frames: [],
  portfolio: [],
  projects: [],
};

function assertKnownCollection(type) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, type)) {
    throw new Error(`Unknown collection: ${type}`);
  }
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueSlug(baseSlug, items, ignoreId) {
  const base = baseSlug || "project";
  let candidate = base;
  let n = 2;
  const taken = new Set(
    items.filter((i) => i.id !== ignoreId).map((i) => i.slug),
  );
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

async function listItems(type) {
  assertKnownCollection(type);
  const items = await storage.readJSON(type, DEFAULTS[type]);
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function saveItem(type, item) {
  assertKnownCollection(type);
  const items = await storage.readJSON(type, DEFAULTS[type]);

  if (item.id) {
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index === -1) throw new Error("Item not found");
    const merged = { ...items[index], ...item };
    // Only (re)generate the slug when the merged item doesn't have one yet
    // (new item) or the admin explicitly cleared it to request a fresh one
    // from the title. Partial updates that don't touch title/slug (e.g. a
    // layout-only save) must not clobber the existing slug.
    if (type === "projects" && !merged.slug) {
      merged.slug = uniqueSlug(slugify(merged.title), items, merged.id);
    }
    items[index] = merged;
    await storage.writeJSON(type, items);
    return merged;
  }

  const newItem = { ...item, id: randomUUID() };
  if (type === "projects") {
    newItem.slug = uniqueSlug(
      slugify(newItem.slug || newItem.title),
      items,
      newItem.id,
    );
  }
  if (
    newItem.order === undefined ||
    newItem.order === null ||
    newItem.order === ""
  ) {
    newItem.order = items.length;
  }
  items.push(newItem);
  await storage.writeJSON(type, items);
  return newItem;
}

async function deleteItem(type, id) {
  assertKnownCollection(type);
  const items = await storage.readJSON(type, DEFAULTS[type]);
  const next = items.filter((item) => item.id !== id);
  await storage.writeJSON(type, next);
  return next;
}

module.exports = { listItems, saveItem, deleteItem, DEFAULTS, slugify };
