// POST /api/upload  (protected) -> stores an uploaded image, returns { key, url }
"use strict";

const { randomUUID } = require("crypto");
const storage = require("../../lib/storage");
const { isAuthorized } = require("../../lib/auth");
const { MAX_UPLOAD_BYTES } = require("../../lib/uploadLimits");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST")
    return json(405, { error: "Method not allowed" });
  if (!isAuthorized(event, context))
    return json(401, { error: "Unauthorized" });

  try {
    const { filename, contentType, dataBase64 } = JSON.parse(
      event.body || "{}",
    );
    if (!dataBase64) return json(400, { error: "Missing image data" });

    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return json(413, {
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

    return json(200, { key, url: `/api/image/${key}` });
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
