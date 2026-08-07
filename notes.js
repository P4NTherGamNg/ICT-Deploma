import { db, auth } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const notesGrid = document.getElementById("notesGrid");

const detailsModal = document.getElementById("noteDetailsModal");
const closeDetailsBtn = document.getElementById("closeNoteDetailsBtn");
const detailsBanner = document.getElementById("detailsBanner");
const detailsSubject = document.getElementById("detailsSubject");
const detailsTitle = document.getElementById("detailsTitle");
const detailsDate = document.getElementById("detailsDate");
const detailsDesc = document.getElementById("detailsDesc");
const detailsLinks = document.getElementById("detailsLinks");
const codeBlocksList = document.getElementById("codeBlocksList");
const codeBlockViewer = document.getElementById("codeBlockViewer");
const codeBlockTitle = document.getElementById("codeBlockTitle");
const detailsCode = document.getElementById("detailsCode");
const codeBackBtn = document.getElementById("codeBackBtn");

const filesTabBtn = document.getElementById("filesTabBtn");
const codeTabBtn = document.getElementById("codeTabBtn");
const filesTabPanel = document.getElementById("filesTabPanel");
const codeTabPanel = document.getElementById("codeTabPanel");

let notesCache = {};
let currentCodeBlocks = [];

const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
  if (snapshot.empty) {
    notesGrid.innerHTML = `<p class="products-empty">No notes available yet.</p>`;
    return;
  }

  let cards = "";
  notesCache = {};

  snapshot.forEach((docSnap) => {
    const n = docSnap.data();
    notesCache[docSnap.id] = n;

    const image = n.imageUrl || "https://placehold.co/400x300/1E1E1E/D4AF37?text=Notes";

    cards += `
      <div class="product-card note-card" data-id="${docSnap.id}">
        <img src="${image}" alt="${escapeHtml(n.title)}" class="product-img">
        <div class="product-info">
          ${n.subject ? `<span class="note-subject-badge">${escapeHtml(n.subject)}</span>` : ""}
          <h3>${escapeHtml(n.title)}</h3>
          <p class="product-desc">${escapeHtml(truncate(n.description || "", 90))}</p>
          <button class="btn add-to-cart-btn view-details-btn"><i class="fa-solid fa-eye"></i> View Details</button>
        </div>
      </div>`;
  });

  notesGrid.innerHTML = cards;
});

// ---------- Card click -> open details popup (login required) ----------
notesGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".note-card");
  if (!card) return;

  if (!auth.currentUser) {
    document.getElementById("authModal").classList.add("active");
    return;
  }

  const note = notesCache[card.dataset.id];
  if (!note) return;

  const bannerImage = note.imageUrl || "https://placehold.co/700x300/1E1E1E/D4AF37?text=Notes";
  detailsBanner.style.backgroundImage = `url('${bannerImage}')`;

  detailsTitle.textContent = note.title || "";
  detailsSubject.textContent = note.subject || "";
  detailsSubject.classList.toggle("hidden", !note.subject);

  detailsDesc.textContent = note.description || "No description provided.";

  const date = note.createdAt?.toDate ? note.createdAt.toDate().toLocaleDateString() : "";
  detailsDate.textContent = date ? `Added on ${date}` : "";

  // Files tab
  if (note.files && note.files.length) {
    detailsLinks.innerHTML = note.files
      .map(
        (f) => `
      <a href="${f.url}" target="_blank" rel="noopener" class="file-card">
        <i class="fa-solid fa-file-lines"></i>
        <span>${escapeHtml(f.title || "Download")}</span>
        <i class="fa-solid fa-arrow-up-right-from-square file-card-icon"></i>
      </a>`
      )
      .join("");
  } else {
    detailsLinks.innerHTML = `<p class="cart-empty">No files attached.</p>`;
  }

  // Code / Text tab -> render as a card list
  if (note.codeBlocks && note.codeBlocks.length) {
    codeBlocksList.innerHTML = note.codeBlocks
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
  currentCodeBlocks = note.codeBlocks || [];
  codeBlocksList.classList.remove("hidden");
  codeBlockViewer.classList.add("hidden");

  // Reset to Files tab by default each time it's opened
  activateTab("files");

  detailsModal.classList.add("active");
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

// ---------- Tab switching ----------
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

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
