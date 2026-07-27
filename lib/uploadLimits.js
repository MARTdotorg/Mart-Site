// Shared upload size cap used by both the Netlify Function and the local
// dev server, so behavior is identical in both environments.
//
// Netlify Functions enforce a hard request payload limit (~6MB) for
// synchronous invocations. Uploads are sent as base64 (~33% bigger than the
// original file), so the real file must stay comfortably under that limit.
// This is enough for photos and short/compressed video clips; for longer or
// higher-resolution video, host it elsewhere (e.g. YouTube/Vimeo) and store
// just the link instead of the raw file.
"use strict";

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

module.exports = { MAX_UPLOAD_BYTES };
