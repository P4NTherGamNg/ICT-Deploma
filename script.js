const searchInput = document.getElementById("searchInput");
const notesSection = document.getElementById("notes");
let hasScrolledToNotes = false;

if (searchInput) {
    searchInput.addEventListener("keyup", function(){

        let searchValue = searchInput.value.toLowerCase();
        let products = document.querySelectorAll(".product-card");

        // Auto-scroll down to the notes section once the user starts typing
        if (searchValue.length > 0 && !hasScrolledToNotes) {
            if (notesSection) {
                notesSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            hasScrolledToNotes = true;
        } else if (searchValue.length === 0) {
            hasScrolledToNotes = false;
        }

        products.forEach(product => {

            let titleEl = product.querySelector("h3");
            let subjectEl = product.querySelector(".note-subject-badge");

            let title = titleEl ? titleEl.textContent.toLowerCase() : "";
            let subject = subjectEl ? subjectEl.textContent.toLowerCase() : "";

            if(title.includes(searchValue) || subject.includes(searchValue)){

                product.style.display="flex";

            }else{

                product.style.display="none";

            }

        });

    });
}
