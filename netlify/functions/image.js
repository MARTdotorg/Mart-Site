// GET /api/image/<key> (public) -> streams a previously uploaded image back out
"use strict";

const storage = require("../../lib/storage");

exports.handler = async (event) => {
  const key = event.queryStringParameters && event.queryStringParameters.key;
  if (!key) return { statusCode: 400, body: "Missing key" };

  const result = await storage.readBinary(key);
  if (!result) return { statusCode: 404, body: "Not found" };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: result.data.toString("base64"),
    isBase64Encoded: true,
  };
};
