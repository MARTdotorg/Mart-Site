// Authorization check used by the write-protected Netlify Functions.
//
// In production (deployed on Netlify with Identity enabled), Netlify itself
// verifies the Identity JWT sent in the `Authorization: Bearer <token>` header
// and, if valid, populates `context.clientContext.user` for us — no extra
// verification code is needed here.
//
// When running the local dev server (server/dev-server.js) there is no
// Netlify Identity service available on localhost, so as a *local-only*
// convenience we instead accept a shared dev token from an env var. This
// path is never reachable in production because `context.clientContext`
// only ever exists inside real Netlify Functions.
"use strict";

function isAuthorized(event, context) {
  if (context && context.clientContext && context.clientContext.user) {
    return true;
  }

  const devToken = process.env.DEV_ADMIN_TOKEN;
  if (
    devToken &&
    event.headers &&
    event.headers["x-dev-admin-token"] === devToken
  ) {
    return true;
  }

  return false;
}

module.exports = { isAuthorized };
