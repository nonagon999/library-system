export function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

export function setParams(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  });
  window.history.replaceState({}, "", url.toString());
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

export async function apiFetch(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === "object" && data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className =
    "fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-sm shadow-lg border " +
    (type === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : type === "success"
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-white border-slate-200 text-slate-800");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

