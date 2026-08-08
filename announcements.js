import { db } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const banner = document.getElementById("announcementBanner");
const bannerIcon = document.getElementById("announcementIcon");
const bannerTitle = document.getElementById("announcementTitle");
const bannerMessage = document.getElementById("announcementMessage");
const closeBtn = document.getElementById("announcementCloseBtn");
const linkBtn = document.getElementById("announcementLinkBtn");

const viewAllBtn = document.getElementById("viewAllAnnouncementsBtn");
const allAnnouncementsModal = document.getElementById("allAnnouncementsModal");
const closeAllBtn = document.getElementById("closeAllAnnouncementsBtn");
const announcementsList = document.getElementById("announcementsList");

const DISMISSED_KEY = "dismissedAnnouncements";

function getDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY)) || [];
  } catch {
    return [];
  }
}

function markDismissed(id) {
  const dismissed = getDismissed();
  if (!dismissed.includes(id)) dismissed.push(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
}

const ICONS = {
  info: "fa-circle-info",
  warning: "fa-triangle-exclamation",
  urgent: "fa-bullhorn"
};

// ---------- Small notification "ping" sound (generated, no audio file needed) ----------
function playNotifySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    // Some browsers block audio until the user has interacted with the page — safe to ignore.
  }
}

const q = query(
  collection(db, "announcements"),
  orderBy("createdAt", "desc"),
  limit(10)
);

let currentId = null;
let isInitialLoad = true;
let lastNotifiedId = null;

onSnapshot(q, (snapshot) => {
  // Find the most recent announcement that's still active (filtered client-side
  // to avoid needing a Firestore composite index for where + orderBy together).
  const activeDoc = snapshot.docs.find((d) => d.data().active === true);

  if (!activeDoc) {
    banner.classList.add("hidden");
    currentId = null;
    isInitialLoad = false;
    return;
  }

  const a = activeDoc.data();
  currentId = activeDoc.id;

  const isDismissed = getDismissed().includes(currentId);

  // Play a ping only for a genuinely new announcement arriving while the
  // page is already open — never on the initial page load/refresh.
  if (!isInitialLoad && currentId !== lastNotifiedId && !isDismissed) {
    playNotifySound();
  }
  lastNotifiedId = currentId;
  isInitialLoad = false;

  if (isDismissed) {
    banner.classList.add("hidden");
    return;
  }

  const type = a.type || "info";
  banner.classList.remove("announce-info", "announce-warning", "announce-urgent");
  banner.classList.add(`announce-${type}`);
  bannerIcon.className = `fa-solid ${ICONS[type] || ICONS.info} announcement-icon`;

  bannerTitle.textContent = a.title || "";
  bannerMessage.textContent = a.message || "";

  if (a.linkUrl) {
    linkBtn.href = a.linkUrl;
    linkBtn.textContent = a.linkLabel || "Open Link";
    linkBtn.classList.remove("hidden");
  } else {
    linkBtn.classList.add("hidden");
  }

  banner.classList.remove("hidden");
});

closeBtn.addEventListener("click", () => {
  if (currentId) markDismissed(currentId);
  banner.classList.add("hidden");
});

// ---------- View all announcements (history) ----------
const TYPE_LABELS = {
  info: "Info",
  warning: "Warning",
  urgent: "Urgent"
};

viewAllBtn.addEventListener("click", async () => {
  allAnnouncementsModal.classList.add("active");
  announcementsList.innerHTML = `<p class="chat-empty">Loading...</p>`;

  try {
    const allQ = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50));
    const snapshot = await getDocs(allQ);

    if (snapshot.empty) {
      announcementsList.innerHTML = `<p class="chat-empty">No announcements yet.</p>`;
      return;
    }

    announcementsList.innerHTML = snapshot.docs
      .map((docSnap) => {
        const a = docSnap.data();
        const type = a.type || "info";
        const date = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : "";
        return `
        <div class="announcement-item announce-${type}">
          <div class="announcement-item-top">
            <span class="announcement-item-badge">${TYPE_LABELS[type] || "Info"}</span>
            <span class="announcement-item-date">${date}</span>
          </div>
          <strong>${escapeHtml(a.title)}</strong>
          <p>${escapeHtml(a.message)}</p>
          ${a.linkUrl ? `<a href="${a.linkUrl}" target="_blank" rel="noopener" class="announcement-link-btn">${escapeHtml(a.linkLabel || "Open Link")}</a>` : ""}
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load announcement history:", err);
    announcementsList.innerHTML = `<p class="chat-empty">Failed to load announcements.</p>`;
  }
});

closeAllBtn.addEventListener("click", () => allAnnouncementsModal.classList.remove("active"));
allAnnouncementsModal.addEventListener("click", (e) => {
  if (e.target === allAnnouncementsModal) allAnnouncementsModal.classList.remove("active");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
