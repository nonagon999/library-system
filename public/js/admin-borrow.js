import { apiFetch, formatDate, toast } from "./utils.js";

const borrowForm = document.getElementById("borrowForm");
const recordIdInput = document.getElementById("recordId");
const studentNameInput = document.getElementById("studentName");
const studentIdInput = document.getElementById("studentId");
const accessionNumberInput = document.getElementById("accessionNumber");
const dueDateInput = document.getElementById("dueDate");

const borrowBtn = document.getElementById("borrowBtn");
const returnBtn = document.getElementById("returnBtn");

const historyFilterForm = document.getElementById("historyFilterForm");
const historySummary = document.getElementById("historySummary");
const historyTbody = document.getElementById("historyTbody");
const historyPrev = document.getElementById("historyPrev");
const historyNext = document.getElementById("historyNext");
const historyPageInfo = document.getElementById("historyPageInfo");

let page = 1;
let totalPages = 1;

async function ensureLoggedIn() {
  try {
    await apiFetch("/api/admin/me");
  } catch {
    window.location.href = "/admin/login.html";
  }
}

async function recordBorrow() {
  const student_name = studentNameInput.value.trim();
  const student_id = studentIdInput.value.trim();
  const accession_number = accessionNumberInput.value.trim();
  const due_date = dueDateInput.value;

  if (!student_name || !student_id || !accession_number || !due_date) {
    toast("Student, accession number, and due date are required.", "error");
    return;
  }

  try {
    // Look up book by accession number
    const books = await apiFetch(
      `/api/admin/books?accession_number=${encodeURIComponent(accession_number)}&page=1&pageSize=1`
    );
    const book = (books.items || [])[0];
    if (!book) {
      toast("Book not found for that accession number.", "error");
      return;
    }

    const record = await apiFetch("/api/admin/borrow", {
      method: "POST",
      body: JSON.stringify({
        student_name,
        student_id,
        book_id: book.id,
        due_date
      })
    });

    toast("Borrow record saved.", "success");
    recordIdInput.value = record.id;
    loadHistory();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function markReturned() {
  const record_id = Number(recordIdInput.value);
  if (!record_id) {
    toast("You must select a borrow record first.", "error");
    return;
  }
  try {
    await apiFetch("/api/admin/return", {
      method: "POST",
      body: JSON.stringify({ record_id })
    });
    toast("Book marked as returned.", "success");
    loadHistory();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function loadHistory() {
  const fd = new FormData(historyFilterForm);
  const status = (fd.get("status") || "").toString().trim();
  const from = (fd.get("from") || "").toString().trim();
  const to = (fd.get("to") || "").toString().trim();

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page", String(page));
  params.set("pageSize", "20");

  try {
    const data = await apiFetch(`/api/admin/borrow-records?${params.toString()}`);
    const items = data.items || [];
    totalPages = data.totalPages || 1;

    historySummary.textContent = `Showing ${items.length} of ${data.total} record${
      data.total === 1 ? "" : "s"
    }.`;
    historyPageInfo.textContent = `Page ${data.page} of ${data.totalPages}`;
    historyPrev.disabled = data.page <= 1;
    historyNext.disabled = data.page >= data.totalPages;

    historyTbody.innerHTML = items
      .map(
        (r) => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-[11px]">
        <td class="px-2 py-1.5 align-top">
          <div class="font-semibold">${r.student_name}</div>
          <div class="text-slate-500">${r.student_id}</div>
        </td>
        <td class="px-2 py-1.5 align-top">
          <div class="font-semibold">${r.book_title}</div>
          <div class="text-slate-500 font-mono">${r.accession_number}</div>
        </td>
        <td class="px-2 py-1.5 align-top text-slate-600">${formatDate(r.date_borrowed)}</td>
        <td class="px-2 py-1.5 align-top text-slate-600">${formatDate(r.due_date)}</td>
        <td class="px-2 py-1.5 align-top text-slate-600">${formatDate(r.date_returned)}</td>
        <td class="px-2 py-1.5 align-top">
          <button
            data-id="${r.id}"
            class="select-record inline-flex items-center rounded-full px-2 py-0.5 border ${
              (r.status || "").toLowerCase() === "borrowed"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }"
          >
            ${r.status}
          </button>
        </td>
      </tr>`
      )
      .join("");
  } catch (err) {
    toast(err.message, "error");
  }
}

borrowBtn.addEventListener("click", () => {
  recordBorrow();
});

returnBtn.addEventListener("click", () => {
  markReturned();
});

historyFilterForm.addEventListener("submit", (e) => {
  e.preventDefault();
  page = 1;
  loadHistory();
});

historyPrev.addEventListener("click", () => {
  if (page > 1) {
    page -= 1;
    loadHistory();
  }
});

historyNext.addEventListener("click", () => {
  if (page < totalPages) {
    page += 1;
    loadHistory();
  }
});

historyTbody.addEventListener("click", (e) => {
  const btn = e.target.closest(".select-record");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const row = btn.closest("tr");
  if (!row) return;
  // Populate basic info from row when selecting a record
  recordIdInput.value = id;
  const studentCell = row.children[0];
  const bookCell = row.children[1];
  studentNameInput.value = studentCell.querySelector("div.font-semibold")?.textContent || "";
  studentIdInput.value = studentCell.querySelector("div.text-slate-500")?.textContent || "";
  accessionNumberInput.value =
    bookCell.querySelector("div.font-mono")?.textContent || accessionNumberInput.value;
});

(async function init() {
  await ensureLoggedIn();
  loadHistory();
})();

