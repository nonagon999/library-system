import { apiFetch, formatDate, toast } from "./utils.js";

const grid = document.getElementById("latestGrid");

async function loadLatest() {
  if (!grid) return;
  try {
    const data = await apiFetch("/api/books/latest?limit=30");
    const items = data.items || [];
    if (!items.length) {
      grid.innerHTML =
        '<div class="rounded-2xl border border-blue-100 bg-white p-4 text-sm text-slate-600">No books have been added yet.</div>';
      return;
    }

    grid.innerHTML = items
      .map(
        (b) => `
      <a href="/book.html?id=${encodeURIComponent(
        b.id
      )}" class="group rounded-2xl border border-blue-100 bg-white p-4 hover:border-secondary hover:shadow-md transition flex flex-col justify-between">
        <div>
          <div class="text-sm font-semibold text-primary group-hover:text-hoverblue line-clamp-2">${
            b.title
          }</div>
          <div class="mt-1 text-xs text-slate-600 line-clamp-1">${
            b.author || "Unknown author"
          }</div>
        </div>
        <div class="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>${b.category || "Uncategorized"}</span>
          <span>${formatDate(b.date_acquired || b.created_at)}</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">
          ${b.year_published ? `Year: ${b.year_published}` : ""}
        </div>
      </a>`
      )
      .join("");
  } catch (err) {
    toast(err.message, "error");
  }
}

loadLatest();

