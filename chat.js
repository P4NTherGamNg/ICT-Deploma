import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
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

// ---------- Show/hide chat button based on login ----------
onAuthStateChanged(auth, (user) => {
  if (user) {
    chatFab.classList.remove("hidden");
    getUserProfile(user);
    listenToAdminChat(user);
    listenToPublicChat();
  } else {
    chatFab.classList.add("hidden");
    chatWidget.classList.add("hidden");
    if (unsubscribeAdminChat) unsubscribeAdminChat();
    if (unsubscribePublicChat) unsubscribePublicChat();
    currentUserName = "";
    currentUserRole = "";
  }
});

async function getUserProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    currentUserName = snap.exists() && snap.data().name ? snap.data().name : (user.displayName || user.email);
    currentUserRole = snap.exists() ? snap.data().role || "student" : "student";
  } catch (err) {
    currentUserName = user.displayName || user.email;
    currentUserRole = "student";
  }
}

// ---------- Widget open/close ----------
chatFab.addEventListener("click", () => {
  chatWidget.classList.toggle("hidden");
  if (!chatWidget.classList.contains("hidden")) {
    scrollToBottom(publicChatMessages);
    scrollToBottom(adminChatMessages);
  }
});

chatWidgetClose.addEventListener("click", () => chatWidget.classList.add("hidden"));

// ---------- Tab switching ----------
publicChatTabBtn.addEventListener("click", () => {
  publicChatTabBtn.classList.add("active-tab");
  adminChatTabBtn.classList.remove("active-tab");
  publicChatPanel.classList.remove("hidden");
  adminChatPanel.classList.add("hidden");
});

adminChatTabBtn.addEventListener("click", () => {
  adminChatTabBtn.classList.add("active-tab");
  publicChatTabBtn.classList.remove("active-tab");
  adminChatPanel.classList.remove("hidden");
  publicChatPanel.classList.add("hidden");
});

// ---------- Public chat (shared, real-time via Firestore) ----------
function listenToPublicChat() {
  const messagesRef = collection(db, "publicChat");
  const q = query(messagesRef, orderBy("createdAt", "asc"), limit(100));

  unsubscribePublicChat = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      publicChatMessages.innerHTML = `<p class="chat-empty">No messages yet. Say hello!</p>`;
      return;
    }

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
      return;
    }

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
