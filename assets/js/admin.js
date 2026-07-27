// Admin portal logic.
//
// Auth model:
//  - On the deployed site: gated by Netlify Identity (the widget below).
//    Every write request sends `Authorization: Bearer <identity JWT>`, which
//    Netlify verifies for us before the function code even runs.
//  - While developing locally (no Netlify Identity service on localhost):
//    the admin UI is shown directly, and writes are gated (optionally) by a
//    shared DEV_ADMIN_TOKEN header instead. See server/dev-server.js.
"use strict";

const COLLECTIONS = {
  frames: {
    label: "Homepage Film Frames",
    image: { required: true, label: "Frame image" },
    fields: [
      { name: "caption", label: "Caption (optional)", type: "text" },
      { name: "order", label: "Order", type: "number" },
    ],
  },
  portfolio: {
    label: "Portfolio",
    image: { required: true, label: "Image" },
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "order", label: "Order", type: "number" },
    ],
  },
  projects: {
    label: "Projects",
    media: { label: "Images / videos", multiple: true },
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: [
          "Short Films",
          "Feature Films",
          "Street Photography",
          "About",
        ],
        required: true,
      },
      { name: "description", label: "Description", type: "textarea" },
      { name: "link", label: "External link (optional)", type: "text" },
      {
        name: "slug",
        label: "URL slug (optional, auto-generated from title)",
        type: "text",
      },
      { name: "order", label: "Order", type: "number" },
    ],
  },
};

function isLocalDev() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function setStatus(message) {
  document.getElementById("status-banner").textContent = message || "";
}

async function authHeaders() {
  if (isLocalDev()) {
    const token = localStorage.getItem("devAdminToken") || "";
    return token ? { "x-dev-admin-token": token } : {};
  }
  const user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
  if (!user) return {};
  const jwt = await user.jwt();
  return { Authorization: `Bearer ${jwt}` };
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function uploadImage(file) {
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return apiRequest("/api/upload", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      dataBase64,
    }),
  });
}

function mediaTypeFromFile(file) {
  return file.type && file.type.startsWith("video/") ? "video" : "image";
}

function renderMediaPreview(section) {
  const form = section.querySelector("form");
  const preview = section.querySelector(".media-preview");
  if (!preview) return;

  const media = JSON.parse(form.mediaJson.value || "[]");
  if (!media.length) {
    preview.innerHTML = '<p class="empty-note">No media attached yet.</p>';
    return;
  }

  preview.innerHTML = media
    .map(
      (m, i) => `
    <div class="media-thumb">
      ${m.type === "video" ? `<video src="${escapeHtml(m.url)}" muted></video>` : `<img src="${escapeHtml(m.url)}" alt="" />`}
      <button type="button" class="remove-media" data-index="${i}" title="Remove">&times;</button>
    </div>
  `,
    )
    .join("");

  preview.querySelectorAll(".remove-media").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      const current = JSON.parse(form.mediaJson.value || "[]");
      current.splice(idx, 1);
      form.mediaJson.value = JSON.stringify(current);
      renderMediaPreview(section);
    });
  });
}

function buildFieldHtml(field, value) {
  const val = value == null ? "" : value;
  if (field.type === "textarea") {
    return `<label>${field.label}<textarea name="${field.name}">${escapeHtml(val)}</textarea></label>`;
  }
  if (field.type === "select") {
    const options = field.options
      .map(
        (opt) =>
          `<option value="${escapeHtml(opt)}" ${opt === val ? "selected" : ""}>${escapeHtml(opt)}</option>`,
      )
      .join("");
    return `<label>${field.label}<select name="${field.name}">${options}</select></label>`;
  }
  return `<label>${field.label}<input type="${field.type}" name="${field.name}" value="${escapeHtml(val)}" ${field.required ? "required" : ""} /></label>`;
}

function renderSection(type) {
  const config = COLLECTIONS[type];
  const section = document.createElement("section");
  section.className = "collection-section";
  section.dataset.type = type;

  section.innerHTML = `
    <h2>${config.label}</h2>
    <form class="item-form">
      <input type="hidden" name="id" />
      <input type="hidden" name="existingImageUrl" />
      ${config.image ? `<label>${config.image.label}<input type="file" name="imageFile" accept="image/*" ${config.image.required ? "" : ""} /></label>` : ""}
      ${
        config.media
          ? `
        <input type="hidden" name="mediaJson" value="[]" />
        <label>${config.media.label}<input type="file" name="mediaFiles" accept="image/*,video/*" ${config.media.multiple ? "multiple" : ""} /></label>
        <div class="media-preview"></div>
      `
          : ""
      }
      ${config.fields.map((f) => buildFieldHtml(f)).join("")}
      <div class="form-actions">
        <button type="submit" class="btn">Save</button>
        <button type="button" class="btn cancel-edit" style="display: none">Cancel edit</button>
      </div>
    </form>
    <div class="item-list"></div>
  `;

  const form = section.querySelector("form");
  const cancelBtn = section.querySelector(".cancel-edit");
  const mediaInput = form.mediaFiles;

  if (mediaInput) {
    mediaInput.addEventListener("change", async () => {
      if (!mediaInput.files || !mediaInput.files.length) return;
      setStatus("Uploading...");
      try {
        const current = JSON.parse(form.mediaJson.value || "[]");
        for (const file of Array.from(mediaInput.files)) {
          const uploaded = await uploadImage(file);
          current.push({ url: uploaded.url, type: mediaTypeFromFile(file) });
        }
        form.mediaJson.value = JSON.stringify(current);
        renderMediaPreview(section);
        setStatus("Uploaded.");
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      } finally {
        mediaInput.value = "";
      }
    });
    renderMediaPreview(section);
  }

  cancelBtn.addEventListener("click", () => {
    form.reset();
    form.id.value = "";
    form.existingImageUrl.value = "";
    if (config.media) {
      form.mediaJson.value = "[]";
      renderMediaPreview(section);
    }
    cancelBtn.style.display = "none";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Saving...");
    try {
      const item = { id: form.id.value || undefined };
      config.fields.forEach((f) => {
        const raw = form[f.name].value;
        item[f.name] = f.type === "number" && raw !== "" ? Number(raw) : raw;
      });

      if (config.media) {
        item.media = JSON.parse(form.mediaJson.value || "[]");
        if (config.media.required && !item.media.length) {
          throw new Error("At least one image or video is required.");
        }
      } else {
        const fileInput = form.imageFile;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const uploaded = await uploadImage(fileInput.files[0]);
          item.imageUrl = uploaded.url;
        } else if (form.existingImageUrl.value) {
          item.imageUrl = form.existingImageUrl.value;
        }

        if (config.image && config.image.required && !item.imageUrl) {
          throw new Error("An image is required.");
        }
      }

      await apiRequest(`/api/content?type=${type}`, {
        method: "POST",
        body: JSON.stringify(item),
      });
      form.reset();
      form.id.value = "";
      form.existingImageUrl.value = "";
      if (config.media) {
        form.mediaJson.value = "[]";
        renderMediaPreview(section);
      }
      cancelBtn.style.display = "none";
      setStatus("Saved.");
      await loadAndRenderItems(type, section);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  });

  return section;
}

async function loadAndRenderItems(type, section) {
  const config = COLLECTIONS[type];
  const listRoot = section.querySelector(".item-list");
  const form = section.querySelector("form");
  const cancelBtn = section.querySelector(".cancel-edit");

  const items = await fetchCollection(type);

  if (!items.length) {
    listRoot.innerHTML =
      '<p class="empty-note">Nothing here yet — use the form above to add one.</p>';
    return;
  }

  listRoot.innerHTML = items
    .map((item) => {
      const thumbUrl =
        item.imageUrl || (item.media && item.media[0] && item.media[0].url);
      const mediaCount = item.media ? item.media.length : item.imageUrl ? 1 : 0;
      return `
    <div class="item-row" data-id="${escapeHtml(item.id)}">
      ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="" />` : ""}
      <div class="meta">
        <strong>${escapeHtml(item.title || item.caption || "(untitled)")}</strong>
        <span>${escapeHtml(item.category ? item.category + " · " : "")}${escapeHtml(item.description || "")}${mediaCount > 1 ? ` · ${mediaCount} files` : ""}</span>
        ${item.slug ? `<span>/projects/${escapeHtml(item.slug)}</span>` : ""}
      </div>
      <div class="row-actions">
        ${type === "projects" ? '<button type="button" class="btn layout-btn">Edit Layout</button>' : ""}
        <button type="button" class="btn edit-btn">Edit</button>
        <button type="button" class="btn danger delete-btn">Delete</button>
      </div>
    </div>
  `;
    })
    .join("");

  listRoot.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".item-row").dataset.id;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      form.id.value = item.id;
      form.existingImageUrl.value = item.imageUrl || "";
      if (config.media) {
        form.mediaJson.value = JSON.stringify(item.media || []);
        renderMediaPreview(section);
      }
      config.fields.forEach((f) => {
        if (form[f.name]) form[f.name].value = item[f.name] ?? "";
      });
      cancelBtn.style.display = "inline-block";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  listRoot.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".item-row").dataset.id;
      if (!confirm("Delete this item?")) return;
      setStatus("Deleting...");
      try {
        await apiRequest(
          `/api/content?type=${type}&id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        setStatus("Deleted.");
        await loadAndRenderItems(type, section);
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    });
  });

  listRoot.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".item-row").dataset.id;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      openLayoutBuilder(item, async (layout) => {
        await apiRequest(`/api/content?type=projects`, {
          method: "POST",
          body: JSON.stringify({ id: item.id, layout }),
        });
        await loadAndRenderItems(type, section);
      });
    });
  });
}

function showAdminApp() {
  document.getElementById("locked-notice").style.display = "none";
  const app = document.getElementById("admin-app");
  app.style.display = "block";
  if (app.dataset.built) return;
  app.dataset.built = "true";

  const tabsRoot = document.getElementById("main-tabs");
  const sectionsRoot = document.getElementById("sections-root");
  const types = Object.keys(COLLECTIONS);

  tabsRoot.innerHTML = types
    .map(
      (type, i) =>
        `<li><button class="btn tab-btn ${i === 0 ? "active" : ""}" data-type="${type}">${COLLECTIONS[type].label}</button></li>`,
    )
    .join("");

  types.forEach((type, i) => {
    const section = renderSection(type);
    if (i === 0) section.classList.add("active");
    sectionsRoot.appendChild(section);
    loadAndRenderItems(type, section).catch((err) =>
      setStatus(`Error: ${err.message}`),
    );
  });

  tabsRoot.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabsRoot
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sectionsRoot.querySelectorAll(".collection-section").forEach((s) => {
        s.classList.toggle("active", s.dataset.type === btn.dataset.type);
      });
    });
  });
}

function hideAdminApp() {
  document.getElementById("admin-app").style.display = "none";
  document.getElementById("locked-notice").style.display = "block";
}

function initLocalDev() {
  document.getElementById("login-btn").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  document.getElementById("local-dev-box").style.display = "block";

  const input = document.getElementById("dev-token-input");
  input.value = localStorage.getItem("devAdminToken") || "";
  document.getElementById("dev-token-save").addEventListener("click", () => {
    localStorage.setItem("devAdminToken", input.value.trim());
    setStatus("Dev token saved.");
  });

  showAdminApp();
}

function initNetlifyIdentity() {
  const loginBtn = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const emailLabel = document.getElementById("user-email");

  loginBtn.addEventListener("click", () =>
    window.netlifyIdentity.open("login"),
  );
  logoutBtn.addEventListener("click", () => window.netlifyIdentity.logout());

  window.netlifyIdentity.on("init", (user) => updateAuthUI(user));
  window.netlifyIdentity.on("login", (user) => {
    updateAuthUI(user);
    window.netlifyIdentity.close();
  });
  window.netlifyIdentity.on("logout", () => updateAuthUI(null));

  function updateAuthUI(user) {
    if (user) {
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      emailLabel.textContent = user.email || "";
      showAdminApp();
    } else {
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      emailLabel.textContent = "";
      hideAdminApp();
    }
  }

  window.netlifyIdentity.init();
}

if (isLocalDev()) {
  initLocalDev();
} else if (window.netlifyIdentity) {
  initNetlifyIdentity();
} else {
  setStatus("Netlify Identity script failed to load.");
}
