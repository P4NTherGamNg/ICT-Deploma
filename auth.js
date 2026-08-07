import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Element refs ----------
const authModal = document.getElementById("authModal");
const openAuthBtn = document.getElementById("openAuthBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");
const closeAuthBtn = document.getElementById("closeAuthBtn");

const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");

const googleLoginBtn = document.getElementById("googleLoginBtn");
const googleSignupBtn = document.getElementById("googleSignupBtn");
const googleProvider = new GoogleAuthProvider();

const nameModal = document.getElementById("nameModal");
const nameModalInput = document.getElementById("nameModalInput");
const nameModalError = document.getElementById("nameModalError");
const nameModalSubmit = document.getElementById("nameModalSubmit");

// ---------- Modal open/close ----------
openAuthBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (auth.currentUser) {
    // already logged in -> log out on click
    signOut(auth);
    return;
  }
  authModal.classList.add("active");
});

closeAuthBtn.addEventListener("click", () => {
  authModal.classList.remove("active");
});

authModal.addEventListener("click", (e) => {
  if (e.target === authModal) authModal.classList.remove("active");
});

// ---------- Tab switching ----------
tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active-tab");
  tabSignup.classList.remove("active-tab");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  clearErrors();
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active-tab");
  tabLogin.classList.remove("active-tab");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearErrors();
});

function clearErrors() {
  loginError.textContent = "";
  signupError.textContent = "";
}

// ---------- Sign up ----------
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (password.length < 6) {
    signupError.textContent = "Password must be at least 6 characters.";
    return;
  }

  const submitBtn = signupForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    // Save extra user info to Firestore
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email,
      role: "student",
      createdAt: serverTimestamp()
    });

    authModal.classList.remove("active");
    signupForm.reset();
  } catch (err) {
    signupError.textContent = friendlyError(err.code);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
});

// ---------- Log in ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    authModal.classList.remove("active");
    loginForm.reset();
    await redirectIfAdmin();
  } catch (err) {
    loginError.textContent = friendlyError(err.code);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In";
  }
});

// ---------- Redirect admins/moderators to dashboard ----------
async function redirectIfAdmin() {
  const user = auth.currentUser;
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  if (role === "admin" || role === "moderator") {
    window.location.href = "admin.html";
  }
}

// ---------- Ask new Google users to pick a display name ----------
function promptForName(defaultName) {
  return new Promise((resolve) => {
    nameModalInput.value = defaultName || "";
    nameModalError.textContent = "";
    authModal.classList.remove("active");
    nameModal.classList.add("active");

    function onSubmit() {
      const value = nameModalInput.value.trim();
      if (!value) {
        nameModalError.textContent = "Please enter your name.";
        return;
      }
      nameModalSubmit.removeEventListener("click", onSubmit);
      nameModal.classList.remove("active");
      resolve(value);
    }

    nameModalSubmit.addEventListener("click", onSubmit);
  });
}

// ---------- Google sign-in ----------
async function handleGoogleSignIn() {
  clearErrors();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Save/update user info in Firestore (keep existing role if already set)
    const userRef = doc(db, "users", user.uid);
    const existing = await getDoc(userRef);

    let name;
    if (existing.exists()) {
      // Returning user -> keep their saved name
      name = existing.data().name || user.displayName || "";
    } else {
      // First-time Google sign-in -> ask them to confirm/enter a name
      name = await promptForName(user.displayName);
    }

    await setDoc(
      userRef,
      {
        name,
        email: user.email,
        role: existing.exists() ? existing.data().role || "student" : "student",
        createdAt: serverTimestamp()
      },
      { merge: true }
    );

    authModal.classList.remove("active");
    await redirectIfAdmin();
  } catch (err) {
    console.error("Google sign-in error:", err.code, err.message);
    const msg = friendlyError(err.code);
    loginError.textContent = msg;
    signupError.textContent = msg;
  }
}

googleLoginBtn.addEventListener("click", handleGoogleSignIn);
googleSignupBtn.addEventListener("click", handleGoogleSignIn);

// ---------- Auth state -> update nav button ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role : null;
    const displayName = snap.exists() && snap.data().name ? snap.data().name : (user.displayName || user.email);

    openAuthBtn.innerHTML = `<i class="fa-solid fa-user nav-user-icon"></i> <span class="btn-label">${displayName}</span> <i class="fa-solid fa-right-from-bracket logout-icon" title="Logout"></i>`;
    openAuthBtn.classList.add("is-logged-in");
    adminPanelBtn.classList.toggle("hidden", role !== "admin" && role !== "moderator");
  } else {
    openAuthBtn.innerHTML = `<i class="fa-solid fa-user nav-user-icon"></i> <span class="btn-label">Loging</span>`;
    openAuthBtn.classList.remove("is-logged-in");
    adminPanelBtn.classList.add("hidden");
  }
});

// ---------- Error messages (Sinhala/English friendly) ----------
function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Try signing in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Password is too weak (min 6 characters).";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/popup-closed-by-user":
      return "Google sign-in popup was closed before finishing.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Please allow popups for this site.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized in Firebase. Add it under Authentication > Settings > Authorized domains.";
    default:
      return "Something went wrong. Please try again.";
  }
}
