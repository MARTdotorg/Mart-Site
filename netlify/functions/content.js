// GET    /api/content?type=frames|portfolio|projects        -> public, list items
// POST   /api/content?type=frames|portfolio|projects         -> protected, create/update item
// DELETE /api/content?type=frames|portfolio|projects&id=...  -> protected, delete item
"use strict";

const { listItems, saveItem, deleteItem } = require("../../lib/collections");
const { isAuthorized } = require("../../lib/auth");

exports.handler = async (event, context) => {
  const type = event.queryStringParameters && event.queryStringParameters.type;
  if (!type) return json(400, { error: 'Missing "type" query parameter' });

  try {
    if (event.httpMethod === "GET") {
      return json(200, await listItems(type));
    }

    if (!isAuthorized(event, context)) {
      return json(401, { error: "Unauthorized" });
    }

    if (event.httpMethod === "POST") {
      const item = JSON.parse(event.body || "{}");
      return json(200, await saveItem(type, item));
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters && event.queryStringParameters.id;
      if (!id) return json(400, { error: 'Missing "id" query parameter' });
      await deleteItem(type, id);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(400, { error: err.message });
  }
};

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
