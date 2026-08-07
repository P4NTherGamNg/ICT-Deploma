import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const supportHeadingRow = document.querySelector(".support-heading-row");
const clearPublicChatBtn = document.getElementById("clearPublicChatBtn");
const supportNoAccess = document.getElementById("supportNoAccess");
const supportChatWrap = document.getElementById("supportChatWrap");
const supportThreads = document.getElementById("supportThreads");
const supportConvHeader = document.getElementById("supportConvHeader");
const supportConvName = document.getElementById("supportConvName");
const clearThreadBtn = document.getElementById("clearThreadBtn");
const supportMessages = document.getElementById("supportMessages");
const supportReplyForm = document.getElementById("supportReplyForm");
const supportReplyInput = document.getElementById("supportReplyInput");

let currentAdminName = "";
let currentAdminRole = "";
let canAccessSupport = false;
let isAdmin = false;
let selectedUid = null;
let unsubscribeMessages = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  const data = snap.exists() ? snap.data() : {};
  currentAdminName = data.name || user.displayName || user.email;
  currentAdminRole = data.role || "";
  isAdmin = currentAdminRole === "admin";
  canAccessSupport = isAdmin || (currentAdminRole === "moderator" && !!data.canReplySupport);

  if (!canAccessSupport) {
    supportNoAccess.classList.remove("hidden");
    supportChatWrap.classList.add("hidden");
    clearPublicChatBtn.classList.add("hidden");
    return;
  }

  supportNoAccess.classList.add("hidden");
  supportChatWrap.classList.remove("hidden");
  clearPublicChatBtn.classList.toggle("hidden", !isAdmin);

  loadThreads();
});

function loadThreads() {
  const q = query(collection(db, "supportChats"), orderBy("lastMessageAt", "desc"));

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      supportThreads.innerHTML = `<p class="chat-empty">No conversations yet.</p>`;
      return;
    }

    supportThreads.innerHTML = snapshot.docs
      .map((docSnap) => {
        const t = docSnap.data();
        const active = docSnap.id === selectedUid ? "active-thread" : "";
        return `
        <button type="button" class="support-thread-item ${active}" data-uid="${docSnap.id}" data-name="${escapeAttr(t.studentName || t.studentEmail || "Unknown")}">
          <span class="support-thread-name">${escapeHtml(t.studentName || t.studentEmail || "Unknown")}</span>
          <span class="support-thread-preview">${escapeHtml(t.lastMessage || "")}</span>
        </button>`;
      })
      .join("");

    supportThreads.querySelectorAll(".support-thread-item").forEach((btn) => {
      btn.addEventListener("click", () => openThread(btn.dataset.uid, btn.dataset.name));
    });
  });
}

function openThread(uid, name) {
  selectedUid = uid;
  supportReplyForm.classList.remove("hidden");
  supportConvHeader.classList.remove("hidden");
  supportConvName.textContent = name;
  clearThreadBtn.classList.toggle("hidden", !isAdmin);

  supportThreads.querySelectorAll(".support-thread-item").forEach((btn) => {
    btn.classList.toggle("active-thread", btn.dataset.uid === uid);
  });

  if (unsubscribeMessages) unsubscribeMessages();

  const messagesRef = collection(db, "supportChats", uid, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      supportMessages.innerHTML = `<p class="chat-empty">No messages yet.</p>`;
      return;
    }

    supportMessages.innerHTML = snapshot.docs
      .map((docSnap) => {
        const m = docSnap.data();
        const fromAdmin = m.senderRole === "admin" || m.senderRole === "moderator";
        return `
        <div class="chat-bubble ${fromAdmin ? "chat-bubble-mine" : ""}">
          <span class="chat-bubble-name">${escapeHtml(m.senderName)}${fromAdmin ? " (Staff)" : ""}</span>
          <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
        </div>`;
      })
      .join("");

    supportMessages.scrollTop = supportMessages.scrollHeight;
  });
}

supportReplyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = supportReplyInput.value.trim();
  if (!text || !selectedUid) return;

  supportReplyInput.value = "";

  try {
    await setDoc(
      doc(db, "supportChats", selectedUid),
      {
        lastMessage: text,
        lastMessageAt: serverTimestamp()
      },
      { merge: true }
    );

    await addDoc(collection(db, "supportChats", selectedUid, "messages"), {
      senderUid: auth.currentUser.uid,
      senderName: currentAdminName || "Admin",
      senderRole: currentAdminRole || "admin",
      text,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to send reply:", err);
  }
});

// ---------- Clear a single user's support chat (admin only) ----------
clearThreadBtn.addEventListener("click", async () => {
  if (!isAdmin || !selectedUid) return;
  if (!confirm(`Remove the conversation with ${supportConvName.textContent}? This can't be undone.`)) return;

  clearThreadBtn.disabled = true;
  try {
    const messagesRef = collection(db, "supportChats", selectedUid, "messages");
    const snapshot = await getDocs(messagesRef);
    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));

    // Remove the parent thread doc too so it disappears from the admin list
    await deleteDoc(doc(db, "supportChats", selectedUid));

    if (unsubscribeMessages) unsubscribeMessages();
    selectedUid = null;
    supportMessages.innerHTML = `<p class="chat-empty">Select a conversation to view it.</p>`;
    supportConvHeader.classList.add("hidden");
    supportReplyForm.classList.add("hidden");
  } catch (err) {
    console.error("Failed to remove conversation:", err);
    alert("Failed to remove this conversation. Please try again.");
  } finally {
    clearThreadBtn.disabled = false;
  }
});

// ---------- Clear the shared public chat (admin only) ----------
clearPublicChatBtn.addEventListener("click", async () => {
  if (!isAdmin) return;
  if (!confirm("Clear ALL public chat messages for everyone? This can't be undone.")) return;

  clearPublicChatBtn.disabled = true;
  try {
    const snapshot = await getDocs(collection(db, "publicChat"));
    await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
  } catch (err) {
    console.error("Failed to clear public chat:", err);
    alert("Failed to clear public chat. Please try again.");
  } finally {
    clearPublicChatBtn.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}
