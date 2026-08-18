import { db, auth } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { openDetailsModal } from "./note-details.js";

const notesGrid = document.getElementById("notesGrid");

let notesCache = {};

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

    const image = n.imageUrl || "notes.png";

    cards += `
      <div class="product-card note-card" data-id="${docSnap.id}">
        <img src="${image}" alt="${escapeHtml(n.title)}" class="product-img">
        <div class="product-info">
          ${n.subject ? `<span class="note-subject-badge">${escapeHtml(n.subject)}</span>` : ""}
          <h3>${escapeHtml(n.title)}</h3>
          <p class="product-desc">${escapeHtml(truncate(n.description || "", 220))}</p>
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

  openDetailsModal(note);
});

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
