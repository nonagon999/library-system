import { apiFetch, formatDate, toast } from "./utils.js";

const filterForm = document.getElementById("filterForm");
const booksSummary = document.getElementById("booksSummary");
const booksTbody = document.getElementById("booksTbody");
const booksPrev = document.getElementById("booksPrev");
const booksNext = document.getElementById("booksNext");
const booksPageInfo = document.getElementById("booksPageInfo");

const bookForm = document.getElementById("bookForm");
const resetFormBtn = document.getElementById("resetFormBtn");
const deleteBookBtn = document.getElementById("deleteBookBtn");
const exportBtn = document.getElementById("exportBtn");
const csvInput = document.getElementById("csvInput");

let page = 1;
let totalPages = 1;
let currentItems = [];

async function ensureLoggedIn() {
  try {
    await apiFetch("/api/admin/me");
  } catch {
    window.location.href = "/admin/login.html";
  }
}

function fillForm(book) {
  bookForm.id.value = book.id || "";
  bookForm.title.value = book.title || "";
  bookForm.author.value = book.author || "";
  bookForm.publisher.value = book.publisher || "";
  bookForm.year_published.value = book.year_published || "";
  bookForm.isbn.value = book.isbn || "";
  bookForm.category.value = book.category || "";
  bookForm.accession_number.value = book.accession_number || "";
  bookForm.shelf_location.value = book.shelf_location || "";
  bookForm.date_acquired.value = book.date_acquired || "";
  bookForm.availability_status.value = book.availability_status || "";
}

function resetForm() {
  bookForm.reset();
  bookForm.id.value = "";
}

async function loadBooks() {
  const fd = new FormData(filterForm);
  const keyword = (fd.get("keyword") || "").toString().trim();

  const qs = new URLSearchParams();
  if (keyword) qs.set("keyword", keyword);
  qs.set("page", String(page));
  qs.set("pageSize", "20");

  try {
    const data = await apiFetch(`/api/admin/books?${qs.toString()}`);
    currentItems = data.items || [];
    totalPages = data.totalPages || 1;
    booksSummary.textContent = `Showing ${currentItems.length} of ${data.total} book${
      data.total === 1 ? "" : "s"
    }.`;
    booksPageInfo.textContent = `Page ${data.page} of ${data.totalPages}`;
    booksPrev.disabled = data.page <= 1;
    booksNext.disabled = data.page >= data.totalPages;

    booksTbody.innerHTML = currentItems
      .map(
        (b) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50">
        <td class="px-2 py-1.5 align-top">
          <button
            data-id="${b.id}"
            class="select-book text-left text-[11px] font-semibold text-slate-800 hover:text-navy line-clamp-2"
          >
            ${b.title}
          </button>
          <div class="text-[11px] text-slate-500 line-clamp-1">${b.author || ""}</div>
        </td>
        <td class="px-2 py-1.5 align-top text-[11px] text-slate-600">${b.author || ""}</td>
        <td class="px-2 py-1.5 align-top text-[11px] font-mono text-slate-700">${
          b.accession_number || ""
        }</td>
        <td class="px-2 py-1.5 align-top text-[11px]">
          <span class="inline-flex rounded-full px-2 py-0.5 border ${
            (b.availability_status || "").toLowerCase() === "available"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }">
            ${b.availability_status || "Available"}
          </span>
        </td>
        <td class="px-2 py-1.5 align-top text-[10px] text-slate-400">
          Added ${formatDate(b.date_acquired || b.created_at)}
        </td>
      </tr>`
      )
      .join("");
  } catch (err) {
    toast(err.message, "error");
  }
}

filterForm.addEventListener("submit", (e) => {
  e.preventDefault();
  page = 1;
  loadBooks();
});

booksPrev.addEventListener("click", () => {
  if (page > 1) {
    page -= 1;
    loadBooks();
  }
});

booksNext.addEventListener("click", () => {
  if (page < totalPages) {
    page += 1;
    loadBooks();
  }
});

booksTbody.addEventListener("click", (e) => {
  const btn = e.target.closest(".select-book");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const book = currentItems.find((b) => b.id === id);
  if (book) fillForm(book);
});

bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(bookForm);
  const payload = Object.fromEntries(fd.entries());
  const id = payload.id;
  if (!payload.title || !payload.author || !payload.accession_number) {
    toast("Title, author, and accession number are required.", "error");
    return;
  }
  if (!payload.year_published) delete payload.year_published;
  if (!payload.date_acquired) delete payload.date_acquired;

  try {
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/admin/books/${encodeURIComponent(id)}` : "/api/admin/books";
    const book = await apiFetch(url, {
      method,
      body: JSON.stringify(payload)
    });
    toast("Book saved.", "success");
    fillForm(book);
    loadBooks();
  } catch (err) {
    toast(err.message, "error");
  }
});

deleteBookBtn.addEventListener("click", async () => {
  const id = bookForm.id.value;
  if (!id) {
    toast("Select a book first.", "error");
    return;
  }
  if (!window.confirm("Delete this book? This cannot be undone.")) return;
  try {
    await apiFetch(`/api/admin/books/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("Book deleted (or could not be deleted if it has borrow history).", "success");
    resetForm();
    loadBooks();
  } catch (err) {
    toast(err.message, "error");
  }
});

resetFormBtn.addEventListener("click", () => {
  resetForm();
});

exportBtn.addEventListener("click", () => {
  window.location.href = "/api/admin/books/export-csv";
});

csvInput.addEventListener("change", async () => {
  const file = csvInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch("/api/admin/books/upload-csv", {
      method: "POST",
      body: formData,
      credentials: "same-origin"
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data && data.error ? data.error : "Upload failed");
    }
    toast(
      `CSV processed. Created: ${data.createdCount}, Skipped: ${data.skippedCount}, Errors: ${data.errorsCount}`,
      "success"
    );
    csvInput.value = "";
    loadBooks();
  } catch (err) {
    toast(err.message, "error");
  }
});

(async function init() {
  await ensureLoggedIn();
  loadBooks();
})();

