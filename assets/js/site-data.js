// Small shared helper used by index.html, portfolio.html and projects.html
// to pull their content from the API instead of hardcoding it in markup.
async function fetchCollection(type) {
  const res = await fetch(`/api/content?type=${encodeURIComponent(type)}`);
  if (!res.ok) throw new Error(`Failed to load "${type}" (${res.status})`);
  return res.json();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}
