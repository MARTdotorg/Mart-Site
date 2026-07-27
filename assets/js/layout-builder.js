// Freeform layout builder used by the admin portal to design each project's
// detail page: a fixed-size artboard where text and image boxes can be
// dragged, resized, and (for text) styled with font/size/color/weight/align.
//
// The saved shape is: { width, height, elements: [ {id, type, x, y, width,
// height, ...type-specific fields} ] }. project.html renders this same shape
// on the public side.
"use strict";

const ARTBOARD_WIDTH = 1200;
const ARTBOARD_HEIGHT = 800;

const LAYOUT_FONT_OPTIONS = [
  { label: "Helvetica (sans)", value: "'Helvetica Neue', Arial, sans-serif" },
  { label: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Bebas Neue (display)", value: "'Bebas Neue', Arial, sans-serif" },
  { label: "VT323 (CRT mono)", value: "'VT323', 'Courier New', monospace" },
  { label: "Courier (typewriter)", value: "'Courier New', monospace" },
];

const builderState = {
  projectId: null,
  layout: null,
  selectedId: null,
  onSave: null,
};

function openLayoutBuilder(project, onSave) {
  builderState.projectId = project.id;
  builderState.layout =
    project.layout && Array.isArray(project.layout.elements)
      ? JSON.parse(JSON.stringify(project.layout))
      : { width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT, elements: [] };
  builderState.selectedId = null;
  builderState.onSave = onSave;

  document.getElementById("layout-builder").style.display = "flex";
  renderLayoutCanvas();
  updateLayoutToolbar();
}

function closeLayoutBuilder() {
  document.getElementById("layout-builder").style.display = "none";
}

function renderLayoutCanvas() {
  const canvas = document.getElementById("lb-canvas");
  canvas.style.width = builderState.layout.width + "px";
  canvas.style.height = builderState.layout.height + "px";
  canvas.innerHTML = "";
  builderState.layout.elements.forEach((el) => {
    canvas.appendChild(buildLayoutElementNode(el));
  });
}

function buildLayoutElementNode(el) {
  const node = document.createElement("div");
  node.className =
    "lb-element" + (el.id === builderState.selectedId ? " selected" : "");
  node.style.left = `${el.x}px`;
  node.style.top = `${el.y}px`;
  node.style.width = `${el.width}px`;
  node.style.height = `${el.height}px`;
  node.dataset.id = el.id;

  if (el.type === "text") {
    const textEl = document.createElement("div");
    textEl.className = "lb-text-content";
    textEl.contentEditable = "true";
    textEl.spellcheck = false;
    textEl.style.fontFamily = el.fontFamily;
    textEl.style.fontSize = `${el.fontSize}px`;
    textEl.style.color = el.color;
    textEl.style.fontWeight = el.fontWeight;
    textEl.style.textAlign = el.textAlign;
    textEl.textContent = el.text;
    textEl.addEventListener("input", () => {
      el.text = textEl.textContent;
    });
    textEl.addEventListener("mousedown", (event) => event.stopPropagation());
    textEl.addEventListener("focus", () => selectLayoutElement(el.id));
    node.appendChild(textEl);
  } else if (el.type === "image") {
    const img = document.createElement("img");
    img.src = el.url;
    img.draggable = false;
    node.appendChild(img);
  }

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "lb-resize-handle";
  node.appendChild(resizeHandle);

  wireLayoutDrag(node, el);
  wireLayoutResize(resizeHandle, node, el);

  node.addEventListener("mousedown", (event) => {
    if (event.target === resizeHandle) return;
    selectLayoutElement(el.id);
  });

  return node;
}

function selectLayoutElement(id) {
  builderState.selectedId = id;
  document.querySelectorAll(".lb-element").forEach((node) => {
    node.classList.toggle("selected", node.dataset.id === id);
  });
  updateLayoutToolbar();
}

function getSelectedLayoutElement() {
  return builderState.layout.elements.find(
    (el) => el.id === builderState.selectedId,
  );
}

function updateLayoutToolbar() {
  const el = getSelectedLayoutElement();
  const isText = Boolean(el && el.type === "text");
  [
    "lb-font-family",
    "lb-font-size",
    "lb-font-color",
    "lb-font-weight",
    "lb-text-align",
  ].forEach((id) => {
    document.getElementById(id).disabled = !isText;
  });
  document.getElementById("lb-delete").disabled = !el;

  if (isText) {
    document.getElementById("lb-font-family").value = el.fontFamily;
    document.getElementById("lb-font-size").value = el.fontSize;
    document.getElementById("lb-font-color").value = el.color;
    document.getElementById("lb-font-weight").value = el.fontWeight;
    document.getElementById("lb-text-align").value = el.textAlign;
  }
}

function applyLayoutTextStyle(prop, value) {
  const el = getSelectedLayoutElement();
  if (!el || el.type !== "text") return;
  el[prop] = value;
  const selectedId = builderState.selectedId;
  renderLayoutCanvas();
  selectLayoutElement(selectedId);
}

function wireLayoutDrag(node, el) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;

  node.addEventListener("mousedown", (event) => {
    if (event.target.classList.contains("lb-resize-handle")) return;
    if (event.target.isContentEditable) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    origX = el.x;
    origY = el.y;
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    el.x = Math.max(0, origX + (event.clientX - startX));
    el.y = Math.max(0, origY + (event.clientY - startY));
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });
}

function wireLayoutResize(handle, node, el) {
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let origW = 0;
  let origH = 0;

  handle.addEventListener("mousedown", (event) => {
    resizing = true;
    startX = event.clientX;
    startY = event.clientY;
    origW = el.width;
    origH = el.height;
    event.preventDefault();
    event.stopPropagation();
  });

  window.addEventListener("mousemove", (event) => {
    if (!resizing) return;
    el.width = Math.max(40, origW + (event.clientX - startX));
    el.height = Math.max(30, origH + (event.clientY - startY));
    node.style.width = `${el.width}px`;
    node.style.height = `${el.height}px`;
  });

  window.addEventListener("mouseup", () => {
    resizing = false;
  });
}

function makeLayoutElementId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addLayoutTextElement() {
  const el = {
    id: makeLayoutElementId(),
    type: "text",
    x: 60,
    y: 60,
    width: 320,
    height: 100,
    text: "New text",
    fontFamily: LAYOUT_FONT_OPTIONS[0].value,
    fontSize: 24,
    color: "#111111",
    fontWeight: "400",
    textAlign: "left",
  };
  builderState.layout.elements.push(el);
  renderLayoutCanvas();
  selectLayoutElement(el.id);
}

async function addLayoutImageElement() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    if (!input.files || !input.files[0]) return;
    setStatus("Uploading...");
    try {
      const uploaded = await uploadImage(input.files[0]);
      const el = {
        id: makeLayoutElementId(),
        type: "image",
        x: 80,
        y: 80,
        width: 360,
        height: 240,
        url: uploaded.url,
      };
      builderState.layout.elements.push(el);
      renderLayoutCanvas();
      selectLayoutElement(el.id);
      setStatus("Uploaded.");
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };
  input.click();
}

function deleteSelectedLayoutElement() {
  if (!builderState.selectedId) return;
  builderState.layout.elements = builderState.layout.elements.filter(
    (el) => el.id !== builderState.selectedId,
  );
  builderState.selectedId = null;
  renderLayoutCanvas();
  updateLayoutToolbar();
}

function initLayoutBuilder() {
  document.getElementById("lb-font-family").innerHTML = LAYOUT_FONT_OPTIONS.map(
    (f) => `<option value="${f.value}">${f.label}</option>`,
  ).join("");

  document
    .getElementById("lb-add-text")
    .addEventListener("click", addLayoutTextElement);
  document
    .getElementById("lb-add-image")
    .addEventListener("click", addLayoutImageElement);
  document
    .getElementById("lb-delete")
    .addEventListener("click", deleteSelectedLayoutElement);
  document
    .getElementById("lb-close")
    .addEventListener("click", closeLayoutBuilder);

  document
    .getElementById("lb-font-family")
    .addEventListener("change", (e) =>
      applyLayoutTextStyle("fontFamily", e.target.value),
    );
  document
    .getElementById("lb-font-size")
    .addEventListener("input", (e) =>
      applyLayoutTextStyle("fontSize", Number(e.target.value)),
    );
  document
    .getElementById("lb-font-color")
    .addEventListener("input", (e) =>
      applyLayoutTextStyle("color", e.target.value),
    );
  document
    .getElementById("lb-font-weight")
    .addEventListener("change", (e) =>
      applyLayoutTextStyle("fontWeight", e.target.value),
    );
  document
    .getElementById("lb-text-align")
    .addEventListener("change", (e) =>
      applyLayoutTextStyle("textAlign", e.target.value),
    );

  document
    .getElementById("lb-canvas")
    .addEventListener("mousedown", (event) => {
      if (event.target.id === "lb-canvas") {
        builderState.selectedId = null;
        document
          .querySelectorAll(".lb-element")
          .forEach((node) => node.classList.remove("selected"));
        updateLayoutToolbar();
      }
    });

  document.getElementById("lb-save").addEventListener("click", async () => {
    if (!builderState.onSave) return;
    setStatus("Saving layout...");
    try {
      await builderState.onSave(builderState.layout);
      setStatus("Layout saved.");
      closeLayoutBuilder();
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  });
}

initLayoutBuilder();
