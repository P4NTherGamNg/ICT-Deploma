import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ALL_PERMISSIONS, getEffectivePermissions } from "./admin-permissions-shared.js";

const permissionsNoAccess = document.getElementById("permissionsNoAccess");
const permissionsContent = document.getElementById("permissionsContent");
const moderatorPermissionsList = document.getElementById("moderatorPermissionsList");
const adminPermissionsList = document.getElementById("adminPermissionsList");

let isAdmin = false;

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  if (role !== "admin" && role !== "moderator") return;

  isAdmin = role === "admin";

  if (!isAdmin) {
    // Managing permissions is admin-only, always — a moderator can never
    // grant themselves (or anyone else) more access.
    permissionsNoAccess.classList.remove("hidden");
    permissionsContent.classList.add("hidden");
    return;
  }

  permissionsNoAccess.classList.add("hidden");
  permissionsContent.classList.remove("hidden");
  loadPermissionUsers();
});

async function loadPermissionUsers() {
  moderatorPermissionsList.innerHTML = `<p class="chat-empty">Loading...</p>`;
  adminPermissionsList.innerHTML = `<p class="chat-empty">Loading...</p>`;

  try {
    const q = query(collection(db, "users"), where("role", "in", ["moderator", "admin"]));
    const snapshot = await getDocs(q);

    const moderators = [];
    const admins = [];

    snapshot.forEach((docSnap) => {
      const data = { uid: docSnap.id, ...docSnap.data() };
      if (data.role === "admin") admins.push(data);
      else moderators.push(data);
    });

    moderators.sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
    admins.sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));

    moderatorPermissionsList.innerHTML = moderators.length
      ? moderators.map(renderUserCard).join("")
      : `<p class="chat-empty">No moderators yet. Promote a student from the Overview / Users tab first.</p>`;

    adminPermissionsList.innerHTML = admins.length
      ? admins.map(renderUserCard).join("")
      : `<p class="chat-empty">No admins found.</p>`;

    wireUpSaveButtons();
  } catch (err) {
    console.error("Failed to load users for permissions:", err);
    moderatorPermissionsList.innerHTML = `<p class="chat-empty">Failed to load moderators.</p>`;
    adminPermissionsList.innerHTML = `<p class="chat-empty">Failed to load admins.</p>`;
  }
}

function renderUserCard(u) {
  const perms = getEffectivePermissions(u.role, u);
  const checkboxes = ALL_PERMISSIONS.map(
    ({ key, label }) => `
      <label class="tab-toggle">
        <input type="checkbox" class="permission-checkbox" data-key="${key}" ${perms[key] ? "checked" : ""}>
        ${escapeHtml(label)}
      </label>`
  ).join("");

  return `
    <div class="permission-user-card" data-uid="${u.uid}">
      <div class="permission-user-header">
        <div class="permission-user-identity">
          <strong>${escapeHtml(u.name || "Unnamed")}</strong>
          <span class="role-badge role-${u.role}">${u.role}</span>
        </div>
        <span class="permission-user-email">${escapeHtml(u.email || "")}</span>
      </div>
      <div class="permission-grid">${checkboxes}</div>
      <div class="permission-card-footer">
        <p class="permission-save-msg" data-msg-for="${u.uid}"></p>
        <button type="button" class="btn auth-submit save-permissions-btn" data-uid="${u.uid}">
          <i class="fa-solid fa-floppy-disk"></i> Save Permissions
        </button>
      </div>
    </div>`;
}

function wireUpSaveButtons() {
  document.querySelectorAll(".save-permissions-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      const card = btn.closest(".permission-user-card");
      const msgEl = card.querySelector(`.permission-save-msg[data-msg-for="${uid}"]`);

      const newPermissions = {};
      card.querySelectorAll(".permission-checkbox").forEach((cb) => {
        newPermissions[cb.dataset.key] = cb.checked;
      });

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

      try {
        // Storing the full permissions map (not a partial update) keeps every
        // checkbox on the card in sync with what's actually saved.
        await updateDoc(doc(db, "users", uid), { permissions: newPermissions });
        msgEl.textContent = "Saved ✓";
        msgEl.classList.add("permission-save-ok");
        setTimeout(() => {
          msgEl.textContent = "";
          msgEl.classList.remove("permission-save-ok");
        }, 2000);
      } catch (err) {
        console.error("Failed to save permissions:", err);
        msgEl.textContent = "Failed to save. Try again.";
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
