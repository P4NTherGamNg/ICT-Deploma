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
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getEffectivePermissions } from "./admin-permissions-shared.js";

const guardOverlay = document.getElementById("guardOverlay");
const dashboard = document.getElementById("dashboard");
const adminNameEl = document.getElementById("adminName");
const adminRoleBadge = document.getElementById("adminRoleBadge");
const logoutBtn = document.getElementById("adminLogoutBtn");
const usersTableBody = document.getElementById("usersTableBody");
const totalUsersEl = document.getElementById("totalUsers");
const totalStudentsEl = document.getElementById("totalStudents");
const totalModeratorsEl = document.getElementById("totalModerators");
const totalAdminsEl = document.getElementById("totalAdmins");
const totalPendingEl = document.getElementById("totalPending");
const userSearchInput = document.getElementById("userSearchInput");
const roleFilterTabs = document.getElementById("roleFilterTabs");
const usersNoResults = document.getElementById("usersNoResults");
const pendingApprovalsBlock = document.getElementById("pendingApprovalsBlock");
const pendingUsersTableBody = document.getElementById("pendingUsersTableBody");
const pendingUsersEmpty = document.getElementById("pendingUsersEmpty");
const pendingCountBadge = document.getElementById("pendingCountBadge");
const overviewNoAccess = document.getElementById("overviewNoAccess");
const overviewContent = document.getElementById("overviewContent");
const notesNoAccess = document.getElementById("notesNoAccess");
const notesContent = document.getElementById("notesContent");

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
let currentPermissions = null;
let editingNoteId = null;
let notesDataCache = {};
let usersDataCache = []; // [{ uid, ...userData }], loaded once then filtered/rendered client-side
let userSearchText = "";
let activeRoleFilter = "all";

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
  const permissions = getEffectivePermissions(role, snap.exists() ? snap.data() : {});
  currentPermissions = permissions;

  // Let other admin scripts (nav, quests, announcements, chat) read the same
  // permissions without each one needing its own extra Firestore read.
  window.__adminAuth = { uid: user.uid, role, permissions };
  document.dispatchEvent(new CustomEvent("admin:auth-ready", { detail: window.__adminAuth }));

  guardOverlay.classList.add("hidden");
  dashboard.classList.remove("hidden");
  adminNameEl.textContent = (snap.exists() && snap.data().name) ? snap.data().name : (user.displayName || user.email);
  adminRoleBadge.textContent = role;
  adminRoleBadge.className = `role-badge role-${role}`;

  if (permissions.overview) {
    overviewNoAccess.classList.add("hidden");
    overviewContent.classList.remove("hidden");
    loadUsers();
  } else {
    overviewNoAccess.classList.remove("hidden");
    overviewContent.classList.add("hidden");
  }

  if (permissions.notes) {
    notesNoAccess.classList.add("hidden");
    notesContent.classList.remove("hidden");
    loadProducts();
  } else {
    notesNoAccess.classList.remove("hidden");
    notesContent.classList.add("hidden");
  }
});

// ---------- Users ----------
async function loadUsers() {
  usersTableBody.innerHTML = `<tr><td colspan="7">Loading...</td></tr>`;
  usersNoResults.classList.add("hidden");
  try {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    usersDataCache = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
    updateUserStats();
    renderPendingUsers();
    renderUsersTable();
  } catch (err) {
    console.error("Failed to load users:", err);
    usersTableBody.innerHTML = `<tr><td colspan="7">Failed to load users.</td></tr>`;
  }
}

function updateUserStats() {
  totalUsersEl.textContent = usersDataCache.length;
  totalStudentsEl.textContent = usersDataCache.filter((u) => (u.role || "student") === "student").length;
  totalModeratorsEl.textContent = usersDataCache.filter((u) => u.role === "moderator").length;
  totalAdminsEl.textContent = usersDataCache.filter((u) => u.role === "admin").length;
  if (totalPendingEl) {
    totalPendingEl.textContent = usersDataCache.filter((u) => u.status === "pending").length;
  }
}

// ---------- Pending approvals (new signups awaiting admin review) ----------
// Gated by the "pendingApprovals" permission (see admin-permissions-shared.js),
// not just role — an admin can grant this to a specific moderator from the
// Permissions tab. Admins get it by default; moderators need it granted.
// Note: this block lives inside the Overview / Users section, so it also
// requires the "overview" permission just to reach this code path at all.
function renderPendingUsers() {
  if (!pendingApprovalsBlock || !pendingUsersTableBody) return;

  const canManagePending = !!(currentPermissions && currentPermissions.pendingApprovals);
  if (!canManagePending) {
    pendingApprovalsBlock.classList.add("hidden");
    return;
  }
  pendingApprovalsBlock.classList.remove("hidden");

  const pending = usersDataCache.filter((u) => u.status === "pending");
  if (pendingCountBadge) pendingCountBadge.textContent = pending.length;

  if (!pending.length) {
    pendingUsersTableBody.innerHTML = "";
    if (pendingUsersEmpty) pendingUsersEmpty.classList.remove("hidden");
    return;
  }
  if (pendingUsersEmpty) pendingUsersEmpty.classList.add("hidden");

  let rows = "";
  pending.forEach((u) => {
    const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : "-";
    const method = u.authProvider === "google" ? "Google" : "Email / Password";

    rows += `
      <tr>
        <td>${escapeHtml(u.name || "-")}</td>
        <td>${escapeHtml(u.email || "-")}</td>
        <td>${method}</td>
        <td>${created}</td>
        <td class="pending-actions-cell">
          <button class="approve-btn" data-uid="${u.uid}" style="background:#2e7d32;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin-right:6px;"><i class="fa-solid fa-check"></i> Approve</button>
          <button class="reject-btn" data-uid="${u.uid}" style="background:#b71c1c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;"><i class="fa-solid fa-xmark"></i> Reject</button>
        </td>
      </tr>`;
  });
  pendingUsersTableBody.innerHTML = rows;

  pendingUsersTableBody.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Approving...";
      try {
        await updateDoc(doc(db, "users", btn.dataset.uid), { status: "approved" });
        loadUsers();
      } catch (err) {
        console.error("Failed to approve user:", err);
        alert("Failed to approve user. Please try again.");
        btn.disabled = false;
      }
    });
  });

  pendingUsersTableBody.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Reject this account? They won't be able to log in.")) return;
      btn.disabled = true;
      btn.textContent = "Rejecting...";
      try {
        await updateDoc(doc(db, "users", btn.dataset.uid), { status: "rejected" });
        loadUsers();
      } catch (err) {
        console.error("Failed to reject user:", err);
        alert("Failed to reject user. Please try again.");
        btn.disabled = false;
      }
    });
  });
}

// ---------- Render the users table from the cache, applying the current search + role filter ----------
function renderUsersTable() {
  const search = userSearchText.trim().toLowerCase();

  const filtered = usersDataCache.filter((u) => {
    const role = u.role || "student";
    if (activeRoleFilter !== "all" && role !== activeRoleFilter) return false;
    if (!search) return true;
    const name = (u.name || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  if (!filtered.length) {
    usersTableBody.innerHTML = "";
    usersNoResults.textContent = usersDataCache.length
      ? "No users match your search/filter."
      : "No users found.";
    usersNoResults.classList.remove("hidden");
    return;
  }
  usersNoResults.classList.add("hidden");

  let rows = "";
  filtered.forEach((u) => {
    const uid = u.uid;
    const role = u.role || "student";
    const created = u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : "-";
    const canReplySupport = !!u.canReplySupport;
    const points = u.points || 0;
    const statusBadge =
      u.status === "pending"
        ? ' <span style="color:#f9a825;font-size:0.8em;">(pending)</span>'
        : u.status === "rejected"
        ? ' <span style="color:#e53935;font-size:0.8em;">(rejected)</span>'
        : "";

    if (currentRole === "admin") {
      rows += `
        <tr>
          <td><input type="text" class="edit-name-input" data-uid="${uid}" value="${escapeAttr(u.name || "")}"></td>
          <td>${escapeHtml(u.email || "-")}${statusBadge}</td>
          <td>${created}</td>
          <td>
            <select class="edit-role-select" data-uid="${uid}">
              <option value="student" ${role === "student" ? "selected" : ""}>student</option>
              <option value="moderator" ${role === "moderator" ? "selected" : ""}>moderator</option>
              <option value="admin" ${role === "admin" ? "selected" : ""}>admin</option>
            </select>
          </td>
          <td class="support-access-cell">
            <input type="checkbox" class="edit-support-checkbox" data-uid="${uid}" ${canReplySupport ? "checked" : ""} ${role !== "moderator" ? "disabled" : ""}>
          </td>
          <td class="points-cell">${points} pts</td>
          <td class="user-actions-cell">
            <button class="save-user-btn" data-uid="${uid}" title="Save changes"><i class="fa-solid fa-check"></i></button>
            <button class="reset-points-btn" data-uid="${uid}" data-name="${escapeAttr(u.name || u.email || "this user")}" title="Reset points &amp; quest progress"><i class="fa-solid fa-rotate-left"></i></button>
            ${uid !== auth.currentUser?.uid ? `<button class="delete-user-btn" data-uid="${uid}" data-name="${escapeAttr(u.name || u.email || "this user")}" title="Delete account" style="background:#b71c1c;color:#fff;border:none;"><i class="fa-solid fa-trash"></i></button>` : ""}
          </td>
        </tr>`;
    } else {
      // moderator view: read-only, can only promote a student to moderator
      rows += `
        <tr>
          <td>${escapeHtml(u.name || "-")}</td>
          <td>${escapeHtml(u.email || "-")}${statusBadge}</td>
          <td>${created}</td>
          <td><span class="role-badge role-${role}">${role}</span></td>
          <td class="support-access-cell">${role === "moderator" ? (canReplySupport ? "✅" : "❌") : "—"}</td>
          <td class="points-cell">${points} pts</td>
          <td>${role === "student" ? `<button class="promote-btn" data-uid="${uid}">Promote to Moderator</button>` : "-"}</td>
        </tr>`;
    }
  });

  usersTableBody.innerHTML = rows;

  if (currentRole === "admin") {
    // Role select changes: Support Access checkbox is only meaningful for
    // moderators, so keep it disabled (and unchecked-looking) for anyone else
    // until they're switched to that role.
    usersTableBody.querySelectorAll(".edit-role-select").forEach((select) => {
      select.addEventListener("change", () => {
        const row = select.closest("tr");
        const checkbox = row.querySelector(".edit-support-checkbox");
        const isModerator = select.value === "moderator";
        checkbox.disabled = !isModerator;
        if (!isModerator) checkbox.checked = false;
      });
    });

    usersTableBody.querySelectorAll(".save-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const row = btn.closest("tr");
        const newName = row.querySelector(".edit-name-input").value.trim();
        const newRole = row.querySelector(".edit-role-select").value;
        const canReplySupport = newRole === "moderator" && row.querySelector(".edit-support-checkbox").checked;

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

    // Reset a user's points back to 0 and clear their quest attempts so they can retake quests
    usersTableBody.querySelectorAll(".reset-points-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        if (!confirm(`Reset ${name}'s points to 0 and clear their quest progress? This can't be undone.`)) return;

        btn.disabled = true;
        try {
          await updateDoc(doc(db, "users", uid), { points: 0 });

          const attemptsQuery = query(collection(db, "questAttempts"), where("uid", "==", uid));
          const attemptsSnap = await getDocs(attemptsQuery);
          await Promise.all(attemptsSnap.docs.map((d) => deleteDoc(d.ref)));

          loadUsers();
        } catch (err) {
          console.error("Failed to reset points:", err);
          alert("Failed to reset points. Please try again.");
          btn.disabled = false;
        }
      });
    });

    // Delete a user account. Admin-only. This removes their Firestore
    // profile (name/role/status/points) and quest progress, which cuts off
    // their access to the app — but it does NOT delete the underlying
    // Firebase Authentication account itself (that requires the Admin SDK,
    // e.g. via a Cloud Function, since a client app can't delete another
    // user's auth credentials). If you also want the login credential
    // gone for good, remove them from Firebase Console > Authentication,
    // or set up a Cloud Function for this.
    usersTableBody.querySelectorAll(".delete-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.uid;
        const name = btn.dataset.name;
        if (!confirm(`Delete ${name}'s account? This removes their profile and app access and can't be undone.\n\nNote: their Firebase login credential itself will still exist unless also removed from Firebase Console.`)) return;

        btn.disabled = true;
        try {
          const attemptsQuery = query(collection(db, "questAttempts"), where("uid", "==", uid));
          const attemptsSnap = await getDocs(attemptsQuery);
          await Promise.all(attemptsSnap.docs.map((d) => deleteDoc(d.ref)));

          await deleteDoc(doc(db, "users", uid));
          loadUsers();
        } catch (err) {
          console.error("Failed to delete user:", err);
          alert("Failed to delete user. Please try again.");
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
}

// ---------- Search + role filter controls ----------
if (userSearchInput) {
  userSearchInput.addEventListener("input", () => {
    userSearchText = userSearchInput.value;
    renderUsersTable();
  });
}

if (roleFilterTabs) {
  roleFilterTabs.querySelectorAll(".role-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeRoleFilter = btn.dataset.role;
      roleFilterTabs.querySelectorAll(".role-filter-btn").forEach((b) => {
        b.classList.toggle("active-role-filter", b === btn);
      });
      renderUsersTable();
    });
  });
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
