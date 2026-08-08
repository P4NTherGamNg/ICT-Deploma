import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const chatFab = document.getElementById("chatFab");
const chatFabBadge = document.getElementById("chatFabBadge");
const chatWidget = document.getElementById("chatWidget");
const chatWidgetClose = document.getElementById("chatWidgetClose");

const publicChatTabBtn = document.getElementById("publicChatTabBtn");
const adminChatTabBtn = document.getElementById("adminChatTabBtn");
const publicChatPanel = document.getElementById("publicChatPanel");
const adminChatPanel = document.getElementById("adminChatPanel");

const publicChatMessages = document.getElementById("publicChatMessages");
const publicChatForm = document.getElementById("publicChatForm");
const publicChatInput = document.getElementById("publicChatInput");

const adminChatMessages = document.getElementById("adminChatMessages");
const adminChatForm = document.getElementById("adminChatForm");
const adminChatInput = document.getElementById("adminChatInput");

let currentUserName = "";
let currentUserRole = "";
let unsubscribeAdminChat = null;
let unsubscribePublicChat = null;
let unsubscribeProfile = null;

// ---------- Unread tracking ----------
let widgetOpen = false;
let activeTab = "public"; // "public" | "admin"
let publicUnread = 0;
let adminUnread = 0;
let publicChatInitialLoad = true;
let adminChatInitialLoad = true;

function updateBadge() {
  const total = publicUnread + adminUnread;
  chatFabBadge.textContent = total > 9 ? "9+" : total;
  chatFabBadge.classList.toggle("hidden", total === 0);
}

// ---------- Show/hide chat button based on login ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    chatFab.classList.remove("hidden");
    listenToUserProfile(user);
    listenToAdminChat(user);
    listenToPublicChat();
  } else {
    chatFab.classList.add("hidden");
    chatWidget.classList.add("hidden");
    widgetOpen = false;
    if (unsubscribeAdminChat) unsubscribeAdminChat();
    if (unsubscribePublicChat) unsubscribePublicChat();
    if (unsubscribeProfile) unsubscribeProfile();
    currentUserName = "";
    currentUserRole = "";
    publicUnread = 0;
    adminUnread = 0;
    publicChatInitialLoad = true;
    adminChatInitialLoad = true;
    updateBadge();
  }
});

function listenToUserProfile(user) {
  unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
    currentUserName = snap.exists() && snap.data().name ? snap.data().name : (user.displayName || user.email);
    currentUserRole = snap.exists() ? snap.data().role || "student" : "student";
  });
}

// ---------- Widget open/close ----------
chatFab.addEventListener("click", () => {
  chatWidget.classList.toggle("hidden");
  widgetOpen = !chatWidget.classList.contains("hidden");

  if (widgetOpen) {
    scrollToBottom(publicChatMessages);
    scrollToBottom(adminChatMessages);
    clearUnreadForActiveTab();
  }
});

chatWidgetClose.addEventListener("click", () => {
  chatWidget.classList.add("hidden");
  widgetOpen = false;
});

function clearUnreadForActiveTab() {
  if (activeTab === "public") {
    publicUnread = 0;
  } else {
    adminUnread = 0;
  }
  updateBadge();
}

// ---------- Tab switching ----------
publicChatTabBtn.addEventListener("click", () => {
  publicChatTabBtn.classList.add("active-tab");
  adminChatTabBtn.classList.remove("active-tab");
  publicChatPanel.classList.remove("hidden");
  adminChatPanel.classList.add("hidden");
  activeTab = "public";
  clearUnreadForActiveTab();
});

adminChatTabBtn.addEventListener("click", () => {
  adminChatTabBtn.classList.add("active-tab");
  publicChatTabBtn.classList.remove("active-tab");
  adminChatPanel.classList.remove("hidden");
  publicChatPanel.classList.add("hidden");
  activeTab = "admin";
  clearUnreadForActiveTab();
});

// ---------- Public chat (shared, real-time via Firestore) ----------
function listenToPublicChat() {
  const messagesRef = collection(db, "publicChat");
  const q = query(messagesRef, orderBy("createdAt", "asc"), limit(100));

  unsubscribePublicChat = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      publicChatMessages.innerHTML = `<p class="chat-empty">No messages yet. Say hello!</p>`;
    } else {
      publicChatMessages.innerHTML = snapshot.docs
        .map((docSnap) => {
          const m = docSnap.data();
          const mine = m.uid === auth.currentUser?.uid;
          return `
          <div class="chat-bubble ${mine ? "chat-bubble-mine" : ""}">
            <span class="chat-bubble-name">${escapeHtml(m.name)}</span>
            <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
          </div>`;
        })
        .join("");

      scrollToBottom(publicChatMessages);
    }

    // Count unread only for genuinely new messages after the first load,
    // from other people, while this tab isn't the one currently being viewed.
    if (!publicChatInitialLoad) {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const m = change.doc.data();
        if (m.uid === auth.currentUser?.uid) return;
        if (widgetOpen && activeTab === "public") return;
        publicUnread++;
      });
      updateBadge();
    }
    publicChatInitialLoad = false;
  });
}

publicChatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = publicChatInput.value.trim();
  if (!text || !auth.currentUser) return;

  publicChatInput.value = "";

  try {
    await addDoc(collection(db, "publicChat"), {
      uid: auth.currentUser.uid,
      name: currentUserName || "User",
      text,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to send public message:", err);
  }
});

// ---------- Private admin support chat (Firestore, real-time) ----------
function listenToAdminChat(user) {
  const messagesRef = collection(db, "supportChats", user.uid, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  unsubscribeAdminChat = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      adminChatMessages.innerHTML = `<p class="chat-empty">No messages yet. Ask us anything!</p>`;
    } else {
      adminChatMessages.innerHTML = snapshot.docs
        .map((docSnap) => {
          const m = docSnap.data();
          const mine = m.senderUid === user.uid;
          return `
          <div class="chat-bubble ${mine ? "chat-bubble-mine" : ""}">
            <span class="chat-bubble-name">${escapeHtml(m.senderName)}${m.senderRole && m.senderRole !== "student" ? " (Admin)" : ""}</span>
            <p class="chat-bubble-text">${escapeHtml(m.text)}</p>
          </div>`;
        })
        .join("");

      scrollToBottom(adminChatMessages);
    }

    if (!adminChatInitialLoad) {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const m = change.doc.data();
        if (m.senderUid === user.uid) return; // ignore own messages
        if (widgetOpen && activeTab === "admin") return;
        adminUnread++;
      });
      updateBadge();
    }
    adminChatInitialLoad = false;
  });
}

adminChatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = adminChatInput.value.trim();
  const user = auth.currentUser;
  if (!text || !user) return;

  adminChatInput.value = "";

  try {
    // Keep a summary doc for the admin's inbox list
    await setDoc(
      doc(db, "supportChats", user.uid),
      {
        studentUid: user.uid,
        studentName: currentUserName || user.email,
        studentEmail: user.email,
        lastMessage: text,
        lastMessageAt: serverTimestamp()
      },
      { merge: true }
    );

    await addDoc(collection(db, "supportChats", user.uid, "messages"), {
      senderUid: user.uid,
      senderName: currentUserName || "User",
      senderRole: currentUserRole || "student",
      text,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to send support message:", err);
  }
});

function scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
