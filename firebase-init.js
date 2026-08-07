// Firebase initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqCmB9jmvBGq_uptAqhLa-nFCawyDcISk",
  authDomain: "dumindu-store.firebaseapp.com",
  projectId: "dumindu-store",
  storageBucket: "dumindu-store.firebasestorage.app",
  messagingSenderId: "1046289945451",
  appId: "1:1046289945451:web:6a76360f52163244c0b22e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
