import { apiFetch, formatDate } from "./utils.js";

const grid = document.getElementById("homeLatestGrid");

async function loadLatest() {
  if (!grid) return;
  try {
    const data = await apiFetch("/api/books/latest?limit=4");
    const items = data.items || [];
    if (!items.length) {
      grid.innerHTML =
        '<div class="rounded-2xl border border-blue-100 bg-white p-4 text-sm text-slate-600">No recent books yet.</div>';
      return;
    }

    grid.innerHTML = items
      .map(
        (b) => `
      <a href="/book.html?id=${encodeURIComponent(b.id)}" class="group rounded-2xl border border-blue-100 bg-white p-4 hover:border-secondary hover:shadow-md transition flex flex-col justify-between">
        <div>
          <div class="text-sm font-semibold text-primary group-hover:text-hoverblue line-clamp-2">${b.title}</div>
          <div class="mt-1 text-xs text-slate-600 line-clamp-1">${b.author || "Unknown author"}</div>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>${b.category || "Uncategorized"}</span>
          <span>${formatDate(b.date_acquired || b.created_at)}</span>
        </div>
      </a>`
      )
      .join("");
  } catch (err) {
    grid.innerHTML =
      '<div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load latest books.</div>';
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

loadLatest();

