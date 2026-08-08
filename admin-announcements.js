import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const announcementForm = document.getElementById("announcementForm");
const announceTitle = document.getElementById("announceTitle");
const announceMessage = document.getElementById("announceMessage");
const announceType = document.getElementById("announceType");
const announceLinkUrl = document.getElementById("announceLinkUrl");
const announceLinkLabel = document.getElementById("announceLinkLabel");
const announceError = document.getElementById("announceError");
const announcementsTableBody = document.getElementById("announcementsTableBody");

// Find the whole "Send Announcement" section to hide it for non-admins
const announcementSection = announcementForm.closest(".admin-main");

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;

  if (role !== "admin") {
    // Only admins can send/manage announcements
    announcementSection.classList.add("hidden");
    return;
  }

  loadAnnouncements();
});

announcementForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  announceError.textContent = "";

  const title = announceTitle.value.trim();
  const message = announceMessage.value.trim();
  const type = announceType.value;
  const linkUrl = announceLinkUrl.value.trim();
  const linkLabel = announceLinkLabel.value.trim();

  if (!title || !message) {
    announceError.textContent = "Please fill in both a title and a message.";
    return;
  }

  const submitBtn = announcementForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    await addDoc(collection(db, "announcements"), {
      title,
      message,
      type,
      linkUrl,
      linkLabel,
      active: true,
      createdAt: serverTimestamp()
    });
    announcementForm.reset();
    loadAnnouncements();
  } catch (err) {
    console.error("Failed to send announcement:", err);
    announceError.textContent = "Failed to send. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send to Everyone";
  }
});

async function loadAnnouncements() {
  announcementsTableBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;
  try {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      announcementsTableBody.innerHTML = `<tr><td colspan="5">No announcements sent yet.</td></tr>`;
      return;
    }

    let rows = "";
    snapshot.forEach((docSnap) => {
      const a = docSnap.data();
      const sent = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : "-";

      rows += `
        <tr>
          <td>${escapeHtml(a.title)}</td>
          <td><span class="role-badge announce-badge-${a.type || "info"}">${a.type || "info"}</span></td>
          <td>${a.active ? "🟢 Active" : "⚪ Inactive"}</td>
          <td>${sent}</td>
          <td class="announce-actions-cell">
            <button class="edit-btn toggle-announce-btn" data-id="${docSnap.id}" data-active="${a.active ? "1" : "0"}">
              ${a.active ? "Deactivate" : "Activate"}
            </button>
            <button class="edit-btn renotify-btn" data-id="${docSnap.id}"><i class="fa-solid fa-bell"></i> Re-notify</button>
            <button class="delete-btn" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
    });

    announcementsTableBody.innerHTML = rows;

    announcementsTableBody.querySelectorAll(".toggle-announce-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const isActive = btn.dataset.active === "1";
        await updateDoc(doc(db, "announcements", btn.dataset.id), { active: !isActive });
        loadAnnouncements();
      });
    });

    announcementsTableBody.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this announcement?")) return;
        await deleteDoc(doc(db, "announcements", btn.dataset.id));
        loadAnnouncements();
      });
    });

    // Re-notify: re-sends this announcement as a fresh one so it pops up
    // (with sound) for everyone again, even people who already dismissed it.
    announcementsTableBody.querySelectorAll(".renotify-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;

        try {
          const snap = await getDoc(doc(db, "announcements", btn.dataset.id));
          if (snap.exists()) {
            const a = snap.data();
            await addDoc(collection(db, "announcements"), {
              title: a.title,
              message: a.message,
              type: a.type || "info",
              linkUrl: a.linkUrl || "",
              linkLabel: a.linkLabel || "",
              active: true,
              createdAt: serverTimestamp()
            });
            loadAnnouncements();
          }
        } catch (err) {
          console.error("Failed to re-notify:", err);
          alert("Failed to re-notify. Please try again.");
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    });
  } catch (err) {
    console.error("Failed to load announcements:", err);
    announcementsTableBody.innerHTML = `<tr><td colspan="5">Failed to load announcements.</td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
