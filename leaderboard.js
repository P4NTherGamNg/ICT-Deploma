import { db, auth } from "./firebase-init.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const leaderboardWrap = document.getElementById("leaderboardWrap");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardToggleBtn = document.getElementById("leaderboardToggleBtn");

let unsubscribeLeaderboard = null;

// ---------- Mobile slide-in drawer toggle ----------
leaderboardToggleBtn.addEventListener("click", () => {
  const isOpen = leaderboardWrap.classList.toggle("leaderboard-open");
  leaderboardToggleBtn.innerHTML = isOpen
    ? `<i class="fa-solid fa-chevron-left"></i>`
    : `<i class="fa-solid fa-chevron-right"></i>`;
});

// Tapping anywhere outside the open drawer (on mobile) closes it again
document.addEventListener("click", (e) => {
  if (!leaderboardWrap.classList.contains("leaderboard-open")) return;
  if (leaderboardWrap.contains(e.target)) return;
  leaderboardWrap.classList.remove("leaderboard-open");
  leaderboardToggleBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Leaderboard is only shown to logged-in users
    leaderboardWrap.classList.add("hidden");
    if (unsubscribeLeaderboard) {
      unsubscribeLeaderboard();
      unsubscribeLeaderboard = null;
    }
    return;
  }

  leaderboardWrap.classList.remove("hidden");
  listenToLeaderboard(user.uid);
});

function listenToLeaderboard(currentUid) {
  if (unsubscribeLeaderboard) unsubscribeLeaderboard();

  const q = query(
    collection(db, "users"),
    where("points", ">", 0),
    orderBy("points", "desc"),
    limit(10)
  );

  unsubscribeLeaderboard = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        leaderboardList.innerHTML = `<li class="chat-empty">No points earned yet.</li>`;
        return;
      }

      leaderboardList.innerHTML = snapshot.docs
        .map((docSnap, i) => {
          const u = docSnap.data();
          const isMe = docSnap.id === currentUid;
          const name = u.name || u.email || "Student";
          const points = u.points || 0;
          return `
          <li class="leaderboard-item ${isMe ? "leaderboard-me" : ""}">
            <span class="leaderboard-rank">${i + 1}</span>
            <span class="leaderboard-name">${escapeHtml(name)}${isMe ? " (You)" : ""}</span>
            <span class="leaderboard-points">${points} pts</span>
          </li>`;
        })
        .join("");
    },
    (err) => {
      console.error("Failed to load leaderboard:", err);
      leaderboardList.innerHTML = `<li class="chat-empty">Failed to load leaderboard.</li>`;
    }
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
