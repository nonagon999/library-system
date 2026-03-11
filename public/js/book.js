import { apiFetch, getParam, formatDate, toast } from "./utils.js";

const id = getParam("id");
const titleEl = document.getElementById("bookTitle");
const metaEl = document.getElementById("bookMeta");
const availabilityEl = document.getElementById("availability");
const detailsEl = document.getElementById("details");
const qrImg = document.getElementById("qrImg");

async function loadBook() {
  if (!id) {
    toast("Missing book id in URL.", "error");
    return;
  }
  try {
    const b = await apiFetch(`/api/books/${encodeURIComponent(id)}`);
    if (titleEl) titleEl.textContent = b.title || "Book";
    if (metaEl) {
      const parts = [];
      if (b.author) parts.push(b.author);
      if (b.year_published) parts.push(String(b.year_published));
      if (b.category) parts.push(b.category);
      metaEl.textContent = parts.join(" • ") || "—";
    }
    if (availabilityEl) {
      const status = (b.availability_status || "Available").toString();
      const isAvailable = status.toLowerCase() === "available";
      availabilityEl.innerHTML = `
        <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          isAvailable
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
            : "bg-amber-50 text-amber-800 border border-amber-200"
        }">
          ${status}
        </span>
      `;
    }
    if (qrImg && b.qr_code) {
      qrImg.src = b.qr_code;
    }
    if (detailsEl) {
      const fields = [
        ["Title", b.title],
        ["Author", b.author],
        ["Publisher", b.publisher],
        ["Year Published", b.year_published],
        ["ISBN", b.isbn],
        ["Category", b.category],
        ["Accession Number", b.accession_number],
        ["Shelf Location", b.shelf_location],
        ["Date Acquired", formatDate(b.date_acquired)],
        ["Availability", b.availability_status]
      ];
      detailsEl.innerHTML = fields
        .map(
          ([label, value]) => `
          <div class="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div class="text-xs font-semibold text-slate-500">${label}</div>
            <div class="mt-1 text-sm text-slate-800 break-words">${
              value != null && value !== "" ? value : "—"
            }</div>
          </div>`
        )
        .join("");
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

loadBook();

