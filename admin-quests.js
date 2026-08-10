import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getEffectivePermissions } from "./admin-permissions-shared.js";

const questsNoAccess = document.getElementById("questsNoAccess");
const questsContent = document.getElementById("questsContent");

const questForm = document.getElementById("questForm");
const questError = document.getElementById("questError");
const questFormHeading = document.getElementById("questFormHeading");
const questSubmitBtn = document.getElementById("questSubmitBtn");
const cancelQuestEditBtn = document.getElementById("cancelQuestEditBtn");
const questsTableBody = document.getElementById("questsTableBody");

const answerRowsContainer = document.getElementById("questAnswerRows");
const addAnswerRowBtn = document.getElementById("addAnswerRowBtn");

let currentRole = null;
let editingQuestId = null;
let questsDataCache = {};

// ---------- Answer row builder ----------
function createAnswerRow(text = "", correct = false) {
  const row = document.createElement("div");
  row.className = "answer-row";
  row.innerHTML = `
    <input type="radio" name="questCorrectAnswer" class="answer-correct-radio" ${correct ? "checked" : ""}>
    <input type="text" class="answer-text-input" placeholder="Answer" value="${escapeAttr(text)}">
    <button type="button" class="remove-file-row-btn remove-answer-row-btn"><i class="fa-solid fa-xmark"></i></button>
  `;
  row.querySelector(".remove-answer-row-btn").addEventListener("click", () => row.remove());
  return row;
}

answerRowsContainer.querySelectorAll(".remove-answer-row-btn").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest(".answer-row").remove());
});
addAnswerRowBtn.addEventListener("click", () => answerRowsContainer.appendChild(createAnswerRow()));

// ---------- Auth + role guard (mirrors admin-chat.js / admin-announcements.js) ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;

  // admin and moderator can access; student cannot (admin-auth.js already redirects students away)
  if (role !== "admin" && role !== "moderator") return;

  const permissions = getEffectivePermissions(role, snap.exists() ? snap.data() : {});
  if (!permissions.quests) {
    questsNoAccess.classList.remove("hidden");
    questsContent.classList.add("hidden");
    return;
  }
  questsNoAccess.classList.add("hidden");
  questsContent.classList.remove("hidden");

  currentRole = role;
  loadQuests();
});

// ---------- Add / Update quest ----------
questForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  questError.textContent = "";

  const title = document.getElementById("questTitle").value.trim();
  const subject = document.getElementById("questSubject").value.trim();
  const description = document.getElementById("questDesc").value.trim();
  const imageUrl = document.getElementById("questImage").value.trim();
  const points = Number(document.getElementById("questPoints").value) || 0;
  const expiryValue = document.getElementById("questExpiry").value;
  const question = document.getElementById("questQuestion").value.trim();

  const answers = [];
  answerRowsContainer.querySelectorAll(".answer-row").forEach((row) => {
    const text = row.querySelector(".answer-text-input").value.trim();
    const correct = row.querySelector(".answer-correct-radio").checked;
    if (text) answers.push({ text, correct });
  });

  if (!title) {
    questError.textContent = "Please enter a title for the quest.";
    return;
  }
  if (!question) {
    questError.textContent = "Please enter the question text.";
    return;
  }
  if (points < 1) {
    questError.textContent = "Please enter a valid points value (1 or more).";
    return;
  }
  if (answers.length < 2) {
    questError.textContent = "Please add at least 2 answers.";
    return;
  }
  if (!answers.some((a) => a.correct)) {
    questError.textContent = "Please mark which answer is correct.";
    return;
  }
  if (expiryValue && new Date(expiryValue).getTime() <= Date.now()) {
    questError.textContent = "Expiry time must be in the future.";
    return;
  }

  questSubmitBtn.disabled = true;
  questSubmitBtn.textContent = editingQuestId ? "Updating..." : "Adding...";

  try {
    const payload = { title, subject, description, imageUrl, points, question, answers };

    if (expiryValue) {
      payload.expiresAt = Timestamp.fromDate(new Date(expiryValue));
    } else if (editingQuestId) {
      // Editing an existing quest and the expiry field was cleared -> remove it
      payload.expiresAt = deleteField();
    }

    if (editingQuestId) {
      // Only admins should reach here (edit button only rendered for admin), but double-guard:
      if (currentRole !== "admin") throw new Error("Not authorized to edit quests.");
      await updateDoc(doc(db, "quests", editingQuestId), payload);
    } else {
      await addDoc(collection(db, "quests"), { ...payload, createdAt: serverTimestamp() });
    }

    exitEditMode();
    loadQuests();
  } catch (err) {
    console.error("Save quest error:", err);
    questError.textContent = "Failed to save quest. Please try again.";
  } finally {
    questSubmitBtn.disabled = false;
    questSubmitBtn.textContent = editingQuestId ? "Update Quest" : "Add Quest";
  }
});

cancelQuestEditBtn.addEventListener("click", exitEditMode);

function enterEditMode(id, quest) {
  editingQuestId = id;

  document.getElementById("questTitle").value = quest.title || "";
  document.getElementById("questSubject").value = quest.subject || "";
  document.getElementById("questDesc").value = quest.description || "";
  document.getElementById("questImage").value = quest.imageUrl || "";
  document.getElementById("questPoints").value = quest.points || 10;
  document.getElementById("questExpiry").value = quest.expiresAt?.toDate
    ? toDatetimeLocalValue(quest.expiresAt.toDate())
    : "";
  document.getElementById("questQuestion").value = quest.question || "";

  answerRowsContainer.innerHTML = "";
  if (quest.answers && quest.answers.length) {
    quest.answers.forEach((a) => answerRowsContainer.appendChild(createAnswerRow(a.text, a.correct)));
  } else {
    answerRowsContainer.appendChild(createAnswerRow("", true));
    answerRowsContainer.appendChild(createAnswerRow());
  }

  questFormHeading.textContent = "Edit Quest";
  questSubmitBtn.textContent = "Update Quest";
  cancelQuestEditBtn.classList.remove("hidden");
  questForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode() {
  editingQuestId = null;
  questForm.reset();
  document.getElementById("questExpiry").value = "";

  answerRowsContainer.innerHTML = "";
  answerRowsContainer.appendChild(createAnswerRow("", true));
  answerRowsContainer.appendChild(createAnswerRow());
  answerRowsContainer.appendChild(createAnswerRow());
  answerRowsContainer.appendChild(createAnswerRow());

  questFormHeading.textContent = "Add a Quest";
  questSubmitBtn.textContent = "Add Quest";
  cancelQuestEditBtn.classList.add("hidden");
}

// ---------- Load quests list ----------
async function loadQuests() {
  questsTableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const q = query(collection(db, "quests"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    // ---- Auto-delete quests whose expiry time has passed ----
    // Only the "quests" doc is removed here. questAttempts docs and each
    // user's earned points (users/{uid}.points) live in separate
    // collections/fields and are never touched, so points already earned
    // stay exactly as they are even after the quest itself disappears.
    const now = Date.now();
    const expiredIds = [];
    snapshot.forEach((docSnap) => {
      const expiresAt = docSnap.data().expiresAt;
      if (expiresAt?.toDate && expiresAt.toDate().getTime() <= now) {
        expiredIds.push(docSnap.id);
      }
    });
    if (expiredIds.length) {
      await Promise.all(expiredIds.map((id) => deleteDoc(doc(db, "quests", id))));
    }

    const liveDocs = snapshot.docs.filter((docSnap) => !expiredIds.includes(docSnap.id));

    if (!liveDocs.length) {
      questsTableBody.innerHTML = `<tr><td colspan="6">No quests added yet.</td></tr>`;
      return;
    }

    questsDataCache = {};
    let rows = "";
    liveDocs.forEach((docSnap) => {
      const n = docSnap.data();
      questsDataCache[docSnap.id] = n;
      const image = n.imageUrl || "https://placehold.co/60x60/1E1E1E/D4AF37?text=Quest";
      const expiresLabel = n.expiresAt?.toDate ? n.expiresAt.toDate().toLocaleString() : "Never";

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
          <td>${n.points || 0}</td>
          <td>${escapeHtml(expiresLabel)}</td>
          <td>${actions}</td>
        </tr>`;
    });

    questsTableBody.innerHTML = rows;

    if (currentRole === "admin") {
      questsTableBody.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const quest = questsDataCache[btn.dataset.id];
          if (quest) enterEditMode(btn.dataset.id, quest);
        });
      });

      questsTableBody.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this quest?")) return;
          await deleteDoc(doc(db, "quests", btn.dataset.id));
          if (editingQuestId === btn.dataset.id) exitEditMode();
          loadQuests();
        });
      });
    }
  } catch (err) {
    console.error("Failed to load quests:", err);
    questsTableBody.innerHTML = `<tr><td colspan="6">Failed to load quests.</td></tr>`;
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

// Formats a Date as "YYYY-MM-DDTHH:mm" (local time) for <input type="datetime-local">
function toDatetimeLocalValue(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
