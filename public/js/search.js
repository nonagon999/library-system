import { apiFetch, getParam, setParams, formatDate, toast } from "./utils.js";

const form = document.getElementById("searchForm");
const keywordInput = document.getElementById("keyword");
const categoryInput = document.getElementById("category");
const resultsGrid = document.getElementById("resultsGrid");
const resultsSummary = document.getElementById("resultsSummary");
const paginationControls = document.getElementById("paginationControls");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

let currentPage = 1;

function readFiltersFromUrl() {
  keywordInput.value = getParam("keyword") || "";
  categoryInput.value = getParam("category") || "";
  const p = Number(getParam("page") || "1");
  currentPage = Number.isNaN(p) || p < 1 ? 1 : p;
}

async function loadResults() {
  const keyword = keywordInput.value.trim();
  const category = categoryInput.value.trim();

  setParams({ keyword: keyword || null, category: category || null, page: currentPage > 1 ? currentPage : null });

  if (!keyword && !category) {
    resultsSummary.textContent = "Type a keyword or category to search the catalog.";
    resultsGrid.innerHTML = "";
    paginationControls.hidden = true;
    return;
  }

  try {
    const data = await apiFetch(
      `/api/books?keyword=${encodeURIComponent(keyword)}&category=${encodeURIComponent(
        category
      )}&page=${currentPage}&pageSize=12`
    );

    const items = data.items || [];
    if (!items.length) {
      resultsSummary.textContent = "No books found. Try another keyword or category.";
      resultsGrid.innerHTML = "";
      paginationControls.hidden = true;
      return;
    }

    resultsSummary.textContent = `Showing ${items.length} of ${data.total} result${
      data.total === 1 ? "" : "s"
    }.`;
    paginationControls.hidden = false;
    pageInfo.textContent = `Page ${data.page} of ${data.totalPages}`;
    prevBtn.disabled = data.page <= 1;
    nextBtn.disabled = data.page >= data.totalPages;

    resultsGrid.innerHTML = items
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
          <span>${b.year_published || ""}</span>
        </div>
        <div class="mt-2 text-[11px]">
          <span class="inline-flex items-center rounded-full px-2 py-0.5 border text-[11px] ${
            (b.availability_status || "").toLowerCase() === "available"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }">
            ${b.availability_status || "Available"}
          </span>
          <span class="ml-2 text-slate-400">${formatDate(b.date_acquired)}</span>
        </div>
      </a>`
      )
      .join("");
  } catch (err) {
    toast(err.message, "error");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  currentPage = 1;
  loadResults();
});

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadResults();
  }
});

nextBtn.addEventListener("click", () => {
  currentPage += 1;
  loadResults();
});

// Initialize from URL and load if there are filters
readFiltersFromUrl();
if (keywordInput.value || categoryInput.value) {
  loadResults();
}

