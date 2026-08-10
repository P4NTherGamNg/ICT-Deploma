// Shared "details modal" logic used by BOTH Study Notes and Quests cards.
// This keeps a single copy of all the modal wiring (tabs, file preview,
// code viewer, copy button) instead of duplicating it per content type.

const detailsModal = document.getElementById("noteDetailsModal");
const closeDetailsBtn = document.getElementById("closeNoteDetailsBtn");
const detailsBanner = document.getElementById("detailsBanner");
const detailsSubject = document.getElementById("detailsSubject");
const detailsTitle = document.getElementById("detailsTitle");
const detailsDate = document.getElementById("detailsDate");
const detailsDesc = document.getElementById("detailsDesc");

const tabsWrap = document.querySelector(".note-details-tabs");
const filesTabBtn = document.getElementById("filesTabBtn");
const codeTabBtn = document.getElementById("codeTabBtn");
const filesTabPanel = document.getElementById("filesTabPanel");
const codeTabPanel = document.getElementById("codeTabPanel");

// Files tab
const detailsLinks = document.getElementById("detailsLinks");
const fileBlockViewer = document.getElementById("fileBlockViewer");
const fileBlockTitle = document.getElementById("fileBlockTitle");
const filePreviewArea = document.getElementById("filePreviewArea");
const fileOpenNewTab = document.getElementById("fileOpenNewTab");
const fileBackBtn = document.getElementById("fileBackBtn");

// Code tab
const codeBlocksList = document.getElementById("codeBlocksList");
const codeBlockViewer = document.getElementById("codeBlockViewer");
const codeBlockTitle = document.getElementById("codeBlockTitle");
const detailsCode = document.getElementById("detailsCode");
const codeBackBtn = document.getElementById("codeBackBtn");
const copyCodeBtn = document.getElementById("copyCodeBtn");

let currentCodeBlocks = [];
let currentFiles = [];

// ---------- Open modal for a given item (a note OR a quest) ----------
export function openDetailsModal(item) {
  const bannerImage = item.imageUrl || "https://placehold.co/700x300/1E1E1E/D4AF37?text=Details";
  detailsBanner.style.backgroundImage = `url('${bannerImage}')`;

  detailsTitle.textContent = item.title || "";
  detailsSubject.textContent = item.subject || "";
  detailsSubject.classList.toggle("hidden", !item.subject);

  detailsDesc.textContent = item.description || "No description provided.";

  const date = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : "";
  detailsDate.textContent = date ? `Added on ${date}` : "";

  // ---- Determine which tabs should be visible for this item ----
  const showFiles = item.showFilesTab !== false;
  const showCode = item.showCodeTab !== false;

  filesTabBtn.classList.toggle("hidden", !showFiles);
  codeTabBtn.classList.toggle("hidden", !showCode);
  tabsWrap.classList.toggle("hidden", !showFiles && !showCode);

  // Files tab content
  currentFiles = item.files || [];
  if (currentFiles.length) {
    detailsLinks.innerHTML = currentFiles
      .map(
        (f, i) => `
      <button type="button" class="file-card file-block-card" data-index="${i}">
        <i class="fa-solid ${getFileIcon(f.url)}"></i>
        <span>${escapeHtml(f.title || "Download")}</span>
        <i class="fa-solid fa-chevron-right file-card-icon"></i>
      </button>`
      )
      .join("");
  } else {
    detailsLinks.innerHTML = `<p class="cart-empty">No files attached.</p>`;
  }
  detailsLinks.classList.remove("hidden");
  fileBlockViewer.classList.add("hidden");

  // Code tab content
  currentCodeBlocks = item.codeBlocks || [];
  if (currentCodeBlocks.length) {
    codeBlocksList.innerHTML = currentCodeBlocks
      .map(
        (b, i) => `
      <button type="button" class="file-card code-block-card" data-index="${i}">
        <i class="fa-solid fa-code"></i>
        <span>${escapeHtml(b.title || "Untitled")}</span>
        <i class="fa-solid fa-chevron-right file-card-icon"></i>
      </button>`
      )
      .join("");
  } else {
    codeBlocksList.innerHTML = `<p class="cart-empty">No text/code blocks added.</p>`;
  }
  codeBlocksList.classList.remove("hidden");
  codeBlockViewer.classList.add("hidden");

  // Pick the first available tab as the default active one
  if (showFiles) activateTab("files");
  else if (showCode) activateTab("code");

  detailsModal.classList.add("active");
}

// ---------- File card click -> preview (YouTube embed / iframe / open link) ----------
detailsLinks.addEventListener("click", (e) => {
  const card = e.target.closest(".file-block-card");
  if (!card) return;

  const file = currentFiles[card.dataset.index];
  if (!file) return;

  fileBlockTitle.textContent = file.title || "File";
  fileOpenNewTab.href = file.url;

  const youtubeId = getYoutubeId(file.url);

  if (youtubeId) {
    filePreviewArea.innerHTML = `
      <div class="video-embed-wrap">
        <iframe src="https://www.youtube.com/embed/${youtubeId}" title="${escapeAttr(file.title || "Video")}" allowfullscreen></iframe>
      </div>`;
  } else if (isDirectPreviewable(file.url)) {
    filePreviewArea.innerHTML = `<iframe class="file-preview-frame" src="${file.url}" title="${escapeAttr(file.title || "Preview")}"></iframe>
      <p class="preview-fallback-hint">If the preview doesn't load, use "Open in New Tab" below.</p>`;
  } else {
    filePreviewArea.innerHTML = `<p class="cart-empty">Preview isn't available for this link — use "Open in New Tab" below.</p>`;
  }

  detailsLinks.classList.add("hidden");
  fileBlockViewer.classList.remove("hidden");
});

fileBackBtn.addEventListener("click", () => {
  filePreviewArea.innerHTML = "";
  fileBlockViewer.classList.add("hidden");
  detailsLinks.classList.remove("hidden");
});

// ---------- Code block card click -> open viewer ----------
codeBlocksList.addEventListener("click", (e) => {
  const card = e.target.closest(".code-block-card");
  if (!card) return;

  const block = currentCodeBlocks[card.dataset.index];
  if (!block) return;

  codeBlockTitle.textContent = block.title || "Untitled";
  detailsCode.textContent = block.content || "";

  codeBlocksList.classList.add("hidden");
  codeBlockViewer.classList.remove("hidden");
});

codeBackBtn.addEventListener("click", () => {
  codeBlockViewer.classList.add("hidden");
  codeBlocksList.classList.remove("hidden");
});

// ---------- Copy code/text to clipboard ----------
copyCodeBtn.addEventListener("click", async () => {
  const text = detailsCode.textContent || "";
  try {
    await navigator.clipboard.writeText(text);
    const original = copyCodeBtn.innerHTML;
    copyCodeBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied`;
    setTimeout(() => (copyCodeBtn.innerHTML = original), 1400);
  } catch (err) {
    console.error("Copy failed:", err);
  }
});

// ---------- Tab switching (Files / Code inside the modal) ----------
function activateTab(tab) {
  const isFiles = tab === "files";
  filesTabBtn.classList.toggle("active-tab", isFiles);
  codeTabBtn.classList.toggle("active-tab", !isFiles);
  filesTabPanel.classList.toggle("hidden", !isFiles);
  codeTabPanel.classList.toggle("hidden", isFiles);
}

filesTabBtn.addEventListener("click", () => activateTab("files"));
codeTabBtn.addEventListener("click", () => activateTab("code"));

closeDetailsBtn.addEventListener("click", () => detailsModal.classList.remove("active"));
detailsModal.addEventListener("click", (e) => {
  if (e.target === detailsModal) detailsModal.classList.remove("active");
});

// ---------- Helpers ----------
function getYoutubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function isDirectPreviewable(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.includes("drive.google.com") ||
    lower.includes("docs.google.com") ||
    /\.(png|jpe?g|gif|webp)(\?.*)?$/.test(lower)
  );
}

function getFileIcon(url) {
  if (getYoutubeId(url)) return "fa-circle-play";
  const lower = (url || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "fa-file-pdf";
  if (/\.(png|jpe?g|gif|webp)(\?.*)?$/.test(lower)) return "fa-file-image";
  return "fa-file-lines";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}
