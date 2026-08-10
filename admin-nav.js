import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getEffectivePermissions } from "./admin-permissions-shared.js";

// Maps a sidebar/dropdown section id to the permission key that unlocks it.
// "section-permissions" isn't in here on purpose — only admins can manage
// permissions, and that isn't itself something you can grant via permissions
// (that would let a moderator hand themselves more access).
const SECTION_PERMISSION_KEY = {
  "section-overview": "overview",
  "section-notes": "notes",
  "section-quests": "quests",
  "section-announcements": "announcements",
  "section-support": "support"
};

document.addEventListener("DOMContentLoaded", () => {
  const sidebarLinks = document.querySelectorAll(".sidebar-link");
  const sectionSelect = document.getElementById("adminSectionSelect");
  const sections = document.querySelectorAll(".admin-content > section[id]");
  const adminContent = document.querySelector(".admin-content");
  const permissionsSidebarLink = document.querySelector('.sidebar-link[href="#section-permissions"]');
  const permissionsSelectOption = sectionSelect ? sectionSelect.querySelector('option[value="section-permissions"]') : null;

  let allowedIds = null; // null until we know the user's permissions

  function showSection(id) {
    sections.forEach((section) => {
      section.classList.toggle("hidden", section.id !== id);
    });

    sidebarLinks.forEach((link) => {
      link.classList.toggle("active-sidebar-link", link.getAttribute("href") === `#${id}`);
    });

    if (sectionSelect && sectionSelect.value !== id) {
      sectionSelect.value = id;
    }

    if (adminContent) adminContent.scrollTop = 0;
    window.scrollTo(0, 0);

    if (history.replaceState) {
      history.replaceState(null, "", `#${id}`);
    }
  }

  function applyAccessGating(role, permissions) {
    // Hide any sidebar link / dropdown option the user doesn't have permission for
    sidebarLinks.forEach((link) => {
      const id = link.getAttribute("href").slice(1);
      const permKey = SECTION_PERMISSION_KEY[id];
      const allowed = !permKey || permissions[permKey];
      link.classList.toggle("hidden", !allowed);
    });

    if (sectionSelect) {
      Array.from(sectionSelect.options).forEach((opt) => {
        const permKey = SECTION_PERMISSION_KEY[opt.value];
        const allowed = !permKey || permissions[permKey];
        opt.classList.toggle("hidden", !allowed);
        opt.disabled = !allowed;
      });
    }

    // Permissions management is admin-only, always — never opened up via the
    // permission system itself.
    const canManagePermissions = role === "admin";
    if (permissionsSidebarLink) permissionsSidebarLink.classList.toggle("hidden", !canManagePermissions);
    if (permissionsSelectOption) {
      permissionsSelectOption.classList.toggle("hidden", !canManagePermissions);
      permissionsSelectOption.disabled = !canManagePermissions;
    }

    allowedIds = Array.from(sections)
      .map((s) => s.id)
      .filter((id) => {
        if (id === "section-permissions") return canManagePermissions;
        const permKey = SECTION_PERMISSION_KEY[id];
        return !permKey || permissions[permKey];
      });

    // Land on whichever section the URL hash points to, if it's allowed —
    // otherwise fall back to the first section this user can actually see.
    const initialId = window.location.hash ? window.location.hash.slice(1) : "";
    const target = allowedIds.includes(initialId) ? initialId : allowedIds[0];
    if (target) showSection(target);
  }

  // ---- Sidebar link clicks (desktop) ----
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("href").slice(1);
      if (allowedIds && !allowedIds.includes(id)) return;
      showSection(id);
    });
  });

  // ---- Dropdown change (mobile) ----
  if (sectionSelect) {
    sectionSelect.addEventListener("change", () => {
      const id = sectionSelect.value;
      if (allowedIds && !allowedIds.includes(id)) return;
      showSection(id);
    });
  }

  // ---- Work out what this user can see, then gate the nav accordingly ----
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    if (role !== "admin" && role !== "moderator") return;

    const permissions = getEffectivePermissions(role, snap.exists() ? snap.data() : {});
    applyAccessGating(role, permissions);
  });
});
