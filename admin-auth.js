import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const guardOverlay = document.getElementById("guardOverlay");
const dashboard = document.getElementById("dashboard");
const adminNameEl = document.getElementById("adminName");
const adminRoleBadge = document.getElementById("adminRoleBadge");
const logoutBtn = document.getElementById("adminLogoutBtn");
const usersTableBody = document.getElementById("usersTableBody");
const totalUsersEl = document.getElementById("totalUsers");

const noteForm = document.getElementById("noteForm");
const noteError = document.getElementById("noteError");
const noteFormHeading = document.getElementById("noteFormHeading");
const noteSubmitBtn = document.getElementById("noteSubmitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const notesTableBody = document.getElementById("notesTableBody");

const fileRowsContainer = document.getElementById("fileRows");
const addFileRowBtn = document.getElementById("addFileRowBtn");
const codeRowsContainer = document.getElementById("codeRows");
const addCodeRowBtn = document.getElementById("addCodeRowBtn");

let currentRole = null;
let editingNoteId = null;
let notesDataCache = {};

// ---------- Row builders ----------
function createFileRow(title = "", url = "") {
  const row = document.createElement("div");
  row.className = "file-row";
  row.innerHTML = `
    <input type="text" class="file-title-input" placeholder="File title (e.g. Chapter 1 Notes)" value="${escapeAttr(title)}">
    <input type="url" class="file-url-input" placeholder="File URL (PDF / Drive link)" value="${escapeAttr(url)}">
    <button type="button" class="remove-file-row-btn"><i class="fa-solid fa-xmark"></i></button>
  `;
  row.querySelector(".remove-file-row-btn").addEventListener("click", () => row.remove());
  return row;
}

function createCodeRow(title = "", content = "") {
  const row = document.createElement("div");
  row.className = "code-row";
  row.innerHTML = `
    <input type="text" class="code-title-input" placeholder="Block title (e.g. Sample Java Code)" value="${escapeAttr(title)}">
    <textarea class="code-content-input" placeholder="Paste text or code here..." rows="4"></textarea>
    <button type="button" class="remove-code-row-btn"><i class="fa-solid fa-xmark"></i></button>
  `;
  row.querySelector(".code-content-input").value = content;
  row.querySelector(".remove-code-row-btn").addEventListener("click", () => row.remove());
  return row;
}

fileRowsContainer.querySelectorAll(".remove-file-row-btn").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".file-row").remove());
});
addFileRowBtn.addEventListener("click", () => fileRowsContainer.appendChild(createFileRow()));

codeRowsContainer.querySelectorAll(".remove-code-row-btn").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".code-row").remove());
});
addCodeRowBtn.addEventListener("click", () => codeRowsContainer.appendChild(createCodeRow()));

logoutBtn.addEventListener("click", () => signOut(auth));

// ---------- Auth + role guard ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;

  // admin and moderator can access the panel; student (or legacy "customer") cannot
  if (role !== "admin" && role !== "moderator") {
    window.location.href = "index.html";
    return;
  }

  currentRole = role;

  guardOverlay.classList.add("hidden");
  dashboard.classList.remove("hidden");
  adminNameEl.textContent = (snap.exists() && snap.data().name) ? snap.data().name : (user.displayName || user.email);
  adminRoleBadge.textContent = role;
  adminRoleBadge.className = `role-badge role-${role}`;

  loadUsers();
  loadProducts();
});

// ---------- Users ----------
async function loadUsers() {
  usersTableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      usersTableBody.innerHTML = `<tr><td colspan="6">No users found.</td></tr>`;
      totalUsersEl.textContent = "0";
      return;
    }

    let rows = "";
    snapshot.forEach((docSnap) => {
      const u = docSnap.data();
      const uid = docSnap.id;
      const role = u.role || "student";
      const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : "-";
      const canReplySupport = !!u.canReplySupport;

      if (currentRole === "admin") {
        rows += `
          <tr>
            <td><input type="text" class="edit-name-input" data-uid="${uid}" value="${escapeAttr(u.name || "")}"></td>
            <td>${escapeHtml(u.email || "-")}</td>
            <td>
              <select class="edit-role-select" data-uid="${uid}">
                <option value="student" ${role === "student" ? "selected" : ""}>student</option>
                <option value="moderator" ${role === "moderator" ? "selected" : ""}>moderator</option>
                <option value="admin" ${role === "admin" ? "selected" : ""}>admin</option>
              </select>
            </td>
            <td class="support-access-cell">
              <input type="checkbox" class="edit-support-checkbox" data-uid="${uid}" ${canReplySupport ? "checked" : ""}>
            </td>
            <td>${created}</td>
            <td><button class="save-user-btn" data-uid="${uid}"><i class="fa-solid fa-check"></i></button></td>
          </tr>`;
      } else {
        // moderator view: read-only, can only promote a student to moderator
        rows += `
          <tr>
            <td>${escapeHtml(u.name || "-")}</td>
            <td>${escapeHtml(u.email || "-")}</td>
            <td><span class="role-badge role-${role}">${role}</span></td>
            <td>${role === "moderator" ? (canReplySupport ? "✅" : "❌") : "-"}</td>
            <td>${created}</td>
            <td>${role === "student" ? `<button class="promote-btn" data-uid="${uid}">Promote to Moderator</button>` : "-"}</td>
          </tr>`;
      }
    });

    usersTableBody.innerHTML = rows;
    totalUsersEl.textContent = snapshot.size;

    if (currentRole === "admin") {
      usersTableBody.querySelectorAll(".save-user-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = btn.dataset.uid;
          const row = btn.closest("tr");
          const newName = row.querySelector(".edit-name-input").value.trim();
          const newRole = row.querySelector(".edit-role-select").value;
          const canReplySupport = row.querySelector(".edit-support-checkbox").checked;

          btn.disabled = true;
          try {
            await updateDoc(doc(db, "users", uid), { name: newName, role: newRole, canReplySupport });
            loadUsers();
          } catch (err) {
            console.error("Failed to update user:", err);
            alert("Failed to update user. Please try again.");
            btn.disabled = false;
          }
        });
      });
    } else {
      usersTableBody.querySelectorAll(".promote-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = btn.dataset.uid;
          btn.disabled = true;
          btn.textContent = "Promoting...";
          try {
            await updateDoc(doc(db, "users", uid), { role: "moderator" });
            loadUsers();
          } catch (err) {
            console.error("Failed to promote user:", err);
            alert("Failed to promote user. Please try again.");
            btn.disabled = false;
            btn.textContent = "Promote to Moderator";
          }
        });
      });
    }
  } catch (err) {
    console.error("Failed to load users:", err);
    usersTableBody.innerHTML = `<tr><td colspan="6">Failed to load users.</td></tr>`;
  }
}

// ---------- Add / Update note ----------
noteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  noteError.textContent = "";

  const title = document.getElementById("noteTitle").value.trim();
  const subject = document.getElementById("noteSubject").value.trim();
  const description = document.getElementById("noteDesc").value.trim();
  const imageUrl = document.getElementById("noteImage").value.trim();
  const showFilesTab = document.getElementById("showFilesTabToggle").checked;
  const showCodeTab = document.getElementById("showCodeTabToggle").checked;

  const files = [];
  fileRowsContainer.querySelectorAll(".file-row").forEach((row) => {
    const fTitle = row.querySelector(".file-title-input").value.trim();
    const fUrl = row.querySelector(".file-url-input").value.trim();
    if (fUrl) files.push({ title: fTitle || "Download", url: fUrl });
  });

  const codeBlocks = [];
  codeRowsContainer.querySelectorAll(".code-row").forEach((row) => {
    const cTitle = row.querySelector(".code-title-input").value.trim();
    const cContent = row.querySelector(".code-content-input").value;
    if (cContent.trim()) codeBlocks.push({ title: cTitle || "Untitled", content: cContent });
  });

  if (!title) {
    noteError.textContent = "Please enter a title for the note.";
    return;
  }

  noteSubmitBtn.disabled = true;
  noteSubmitBtn.textContent = editingNoteId ? "Updating..." : "Adding...";

  try {
    const payload = { title, subject, description, files, codeBlocks, imageUrl, showFilesTab, showCodeTab };

    if (editingNoteId) {
      // Only admins should reach here (edit button only rendered for admin), but double-guard:
      if (currentRole !== "admin") throw new Error("Not authorized to edit notes.");
      await updateDoc(doc(db, "notes", editingNoteId), payload);
    } else {
      await addDoc(collection(db, "notes"), { ...payload, createdAt: serverTimestamp() });
    }

    exitEditMode();
    loadProducts();
  } catch (err) {
    console.error("Save note error:", err);
    noteError.textContent = "Failed to save note. Please try again.";
  } finally {
    noteSubmitBtn.disabled = false;
    noteSubmitBtn.textContent = editingNoteId ? "Update Note" : "Add Note";
  }
});

cancelEditBtn.addEventListener("click", exitEditMode);

function enterEditMode(id, note) {
  editingNoteId = id;

  document.getElementById("noteTitle").value = note.title || "";
  document.getElementById("noteSubject").value = note.subject || "";
  document.getElementById("noteDesc").value = note.description || "";
  document.getElementById("noteImage").value = note.imageUrl || "";
  document.getElementById("showFilesTabToggle").checked = note.showFilesTab !== false;
  document.getElementById("showCodeTabToggle").checked = note.showCodeTab !== false;

  fileRowsContainer.innerHTML = "";
  if (note.files && note.files.length) {
    note.files.forEach((f) => fileRowsContainer.appendChild(createFileRow(f.title, f.url)));
  } else {
    fileRowsContainer.appendChild(createFileRow());
  }

  codeRowsContainer.innerHTML = "";
  if (note.codeBlocks && note.codeBlocks.length) {
    note.codeBlocks.forEach((b) => codeRowsContainer.appendChild(createCodeRow(b.title, b.content)));
  } else {
    codeRowsContainer.appendChild(createCodeRow());
  }

  noteFormHeading.textContent = "Edit Note";
  noteSubmitBtn.textContent = "Update Note";
  cancelEditBtn.classList.remove("hidden");
  noteForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode() {
  editingNoteId = null;
  noteForm.reset();

  fileRowsContainer.innerHTML = "";
  fileRowsContainer.appendChild(createFileRow());

  codeRowsContainer.innerHTML = "";
  codeRowsContainer.appendChild(createCodeRow());

  noteFormHeading.textContent = "Add a Note";
  noteSubmitBtn.textContent = "Add Note";
  cancelEditBtn.classList.add("hidden");
}

// ---------- Load notes list ----------
async function loadProducts() {
  notesTableBody.innerHTML = `<tr><td colspan="4">Loading...</td></tr>`;
  try {
    const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      notesTableBody.innerHTML = `<tr><td colspan="4">No notes added yet.</td></tr>`;
      return;
    }

    notesDataCache = {};
    let rows = "";
    snapshot.forEach((docSnap) => {
      const n = docSnap.data();
      notesDataCache[docSnap.id] = n;
      const image = n.imageUrl || "https://placehold.co/60x60/1E1E1E/D4AF37?text=Note";

      const actions =
        currentRole === "admin"
          ? `<button class="edit-btn" data-id="${docSnap.id}"><i class="fa-solid fa-pen"></i></button>
             <button class="delete-btn" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i></button>`
          : `-`;

      rows += `
        <tr>
          <td><img src="${image}" alt="" class="product-thumb"></td>
          <td>${escapeHtml(n.title)}</td>
          <td>${escapeHtml(n.subject || "-")}</td>
          <td>${actions}</td>
        </tr>`;
    });

    notesTableBody.innerHTML = rows;

    if (currentRole === "admin") {
      notesTableBody.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const note = notesDataCache[btn.dataset.id];
          if (note) enterEditMode(btn.dataset.id, note);
        });
      });

      notesTableBody.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this note?")) return;
          await deleteDoc(doc(db, "notes", btn.dataset.id));
          if (editingNoteId === btn.dataset.id) exitEditMode();
          loadProducts();
        });
      });
    }
  } catch (err) {
    console.error("Failed to load notes:", err);
    notesTableBody.innerHTML = `<tr><td colspan="4">Failed to load notes.</td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}
