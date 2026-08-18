import { db, auth } from "./firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const questsGrid = document.getElementById("questsGrid");

let questsCache = {}; // questId -> quest data
let questsOrder = []; // keeps Firestore's createdAt-desc order
let attemptsCache = {}; // questId -> this user's saved attempt (if any)
let unsubscribeAttempts = null;

// ---------- Load quests (public, real-time) ----------
const questsQuery = query(collection(db, "quests"), orderBy("createdAt", "desc"));

onSnapshot(questsQuery, (snapshot) => {
  questsCache = {};
  questsOrder = [];

  // ---- Skip (and clean up) any quest whose expiry time has passed ----
  // Deleting the "quests" doc only removes the quest itself. It never
  // touches the "questAttempts" collection or a user's "points" field,
  // so points already earned before expiry are never affected.
  const now = Date.now();
  const expiredIds = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const expiresAt = data.expiresAt;
    if (expiresAt?.toDate && expiresAt.toDate().getTime() <= now) {
      expiredIds.push(docSnap.id);
      return; // don't render it
    }
    questsCache[docSnap.id] = data;
    questsOrder.push(docSnap.id);
  });

  renderGrid();

  if (expiredIds.length) {
    expiredIds.forEach((id) => {
      deleteDoc(doc(db, "quests", id)).catch((err) =>
        console.error("Failed to delete expired quest:", err)
      );
    });
  }
}, (err) => {
  console.error("Failed to load quests:", err);
});

// ---------- Load THIS user's saved attempts, so answered quests stay locked ----------
onAuthStateChanged(auth, (user) => {
  if (unsubscribeAttempts) {
    unsubscribeAttempts();
    unsubscribeAttempts = null;
  }

  if (!user) {
    attemptsCache = {};
    renderGrid();
    return;
  }

  const attemptsQuery = query(collection(db, "questAttempts"), where("uid", "==", user.uid));
  unsubscribeAttempts = onSnapshot(
    attemptsQuery,
    (snapshot) => {
      attemptsCache = {};
      snapshot.forEach((docSnap) => {
        const a = docSnap.data();
        attemptsCache[a.questId] = a;
      });
      renderGrid();
    },
    (err) => {
      console.error("Failed to load your quest attempts:", err);
    }
  );
});

// ---------- Render the grid (quests + this user's completed state, if any) ----------
function renderGrid() {
  if (!questsOrder.length) {
    questsGrid.innerHTML = `<p class="products-empty">No quests available yet.</p>`;
    return;
  }

  let cards = "";

  questsOrder.forEach((questId) => {
    const n = questsCache[questId];
    const image = n.imageUrl || "quest.png";
    const answers = n.answers || [];
    const correctIndex = answers.findIndex((a) => a.correct);
    const attempt = attemptsCache[questId];

    const answersHtml = answers.length
      ? answers
          .map((a, i) => {
            let stateClass = "";
            if (attempt) {
              if (i === correctIndex) stateClass = "quest-answer-correct";
              else if (attempt.selectedIndex === i) stateClass = "quest-answer-incorrect";
            }
            return `
        <button type="button" class="quest-answer-btn ${stateClass}" data-index="${i}" ${attempt ? "disabled" : ""}>
          <span class="quest-answer-letter">${String.fromCharCode(65 + i)}</span>
          <span class="quest-answer-text">${escapeHtml(a.text || "")}</span>
        </button>`;
          })
          .join("")
      : `<p class="cart-empty">No answers added for this quest yet.</p>`;

    let feedbackHtml = `<p class="quest-feedback hidden"></p>`;
    if (attempt) {
      if (attempt.correct) {
        feedbackHtml = `<p class="quest-feedback quest-feedback-correct">Correct! 🎉 You earned ${attempt.pointsEarned || 0} points.</p>`;
      } else {
        const correctText = answers[correctIndex]?.text || "-";
        feedbackHtml = `<p class="quest-feedback quest-feedback-incorrect">You've already answered this — correct answer: ${escapeHtml(correctText)}</p>`;
      }
    }

    cards += `
      <div class="product-card quest-card" data-id="${questId}">
        <img src="${image}" alt="${escapeHtml(n.title)}" class="product-img">
        <div class="product-info">
          <div class="quest-card-top">
            ${n.subject ? `<span class="note-subject-badge">${escapeHtml(n.subject)}</span>` : "<span></span>"}
            <span class="quest-points-badge"><i class="fa-solid fa-star"></i> ${n.points || 0} pts</span>
          </div>
          <h3>${escapeHtml(n.title)}</h3>
          <p class="quest-question">${escapeHtml(n.question || "")}</p>
          <div class="quest-answers ${attempt ? "answered" : ""}" data-id="${questId}">${answersHtml}</div>
          ${feedbackHtml}
        </div>
      </div>`;
  });

  questsGrid.innerHTML = cards;
}

// ---------- Answer click -> save the attempt permanently (one shot per user per quest) ----------
questsGrid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".quest-answer-btn");
  if (!btn) return;

  const user = auth.currentUser;
  if (!user) {
    document.getElementById("authModal").classList.add("active");
    return;
  }

  const answersWrap = btn.closest(".quest-answers");
  const questId = answersWrap.dataset.id;

  if (answersWrap.classList.contains("answered") || answersWrap.classList.contains("submitting")) return;
  if (attemptsCache[questId]) return; // already answered per our local cache

  const quest = questsCache[questId];
  if (!quest) return;

  const answers = quest.answers || [];
  const correctIndex = answers.findIndex((a) => a.correct);
  const selectedIndex = Number(btn.dataset.index);
  const isCorrect = selectedIndex === correctIndex;
  const pointsEarned = isCorrect ? quest.points || 0 : 0;

  // Lock the UI immediately so a fast double-click can't fire two writes
  answersWrap.classList.add("submitting");
  answersWrap.querySelectorAll(".quest-answer-btn").forEach((b) => (b.disabled = true));

  const attemptRef = doc(db, "questAttempts", `${user.uid}_${questId}`);

  try {
    // Guard against this user having already answered (e.g. on another tab/device)
    const existing = await getDoc(attemptRef);
    if (existing.exists()) {
      return; // the questAttempts listener will re-render with the saved state
    }

    await setDoc(attemptRef, {
      uid: user.uid,
      questId,
      selectedIndex,
      correct: isCorrect,
      pointsEarned,
      answeredAt: serverTimestamp()
    });

    // Add the earned points onto the user's running total (used by the leaderboard)
    if (pointsEarned > 0) {
      await updateDoc(doc(db, "users", user.uid), { points: increment(pointsEarned) });
    }
    // No manual re-render needed here — the questAttempts onSnapshot listener
    // above will pick up the new doc and re-render the card as "completed".
  } catch (err) {
    console.error("Failed to save quest attempt:", err);
    answersWrap.classList.remove("submitting");
    answersWrap.querySelectorAll(".quest-answer-btn").forEach((b) => (b.disabled = false));
    alert("Something went wrong saving your answer. Please try again.");
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
