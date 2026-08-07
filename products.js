import { db } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const productsGrid = document.getElementById("productsGrid");
const productsEmpty = document.getElementById("productsEmpty");

const q = query(collection(db, "products"), orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
  if (snapshot.empty) {
    productsGrid.innerHTML = `<p class="products-empty">No products available yet.</p>`;
    return;
  }

  let cards = "";
  snapshot.forEach((docSnap) => {
    const p = docSnap.data();
    const price = typeof p.price === "number" ? p.price.toFixed(2) : p.price;
    const image = p.imageUrl || "https://placehold.co/400x300/1E1E1E/D4AF37?text=No+Image";

    cards += `
      <div class="product-card">
        <img src="${image}" alt="${escapeHtml(p.name)}" class="product-img">
        <div class="product-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p class="product-desc">${escapeHtml(p.description || "")}</p>
          <span class="product-price">Rs. ${price}</span>
        </div>
      </div>`;
  });

  productsGrid.innerHTML = cards;
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
