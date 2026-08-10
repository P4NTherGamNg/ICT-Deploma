// Shared permission definitions used across the admin panel.
// A single source of truth so every admin-*.js file (nav, users, notes,
// quests, announcements, chat) agrees on what each permission key means
// and how to compute a user's effective access.

export const ALL_PERMISSIONS = [
  { key: "overview", label: "Overview / Users" },
  { key: "notes", label: "Notes" },
  { key: "quests", label: "Quests" },
  { key: "announcements", label: "Announcements" },
  { key: "support", label: "Support Messages" },
  { key: "clearPublicChat", label: "Clear Public Chat" },
  { key: "clearAdminChat", label: "Clear Admin Support Chat" }
];

// Works out what a user can actually access right now.
// - Admins default to full access on every permission, unless an admin has
//   explicitly flipped one of their permissions to false in Firestore.
// - Moderators default to NO access, unless a permission has been
//   explicitly granted (set to true) in Firestore.
// - Legacy support: if permissions.support was never set, fall back to the
//   older canReplySupport flag so existing moderators don't lose access
//   the first time this ships.
export function getEffectivePermissions(role, userData) {
  const stored = (userData && userData.permissions) || {};
  const isAdmin = role === "admin";
  const perms = {};

  ALL_PERMISSIONS.forEach(({ key }) => {
    if (typeof stored[key] === "boolean") {
      perms[key] = stored[key];
      return;
    }
    if (key === "support" && typeof stored.support !== "boolean" && userData?.canReplySupport) {
      perms[key] = true;
      return;
    }
    perms[key] = isAdmin;
  });

  return perms;
}
