const path = require("path");
const fs = require("fs");
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { parse } = require("csv-parse");
const QRCode = require("qrcode");

const { initDb, supabase } = require("./database.js");

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const HAS_SUPABASE_URL = Boolean(process.env.SUPABASE_URL);
const HAS_SUPABASE_ANON_KEY = Boolean(process.env.SUPABASE_ANON_KEY);
const HAS_SUPABASE_SERVICE_ROLE_KEY = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : `http://localhost:${PORT}`);

const app = express();
const db = initDb();
// eslint-disable-next-line no-console
console.log("Supabase env check:", {
  hasSupabaseUrl: HAS_SUPABASE_URL,
  hasSupabaseAnonKey: HAS_SUPABASE_ANON_KEY,
  hasSupabaseServiceRoleKey: HAS_SUPABASE_SERVICE_ROLE_KEY,
  usingServiceRoleKey: HAS_SUPABASE_SERVICE_ROLE_KEY
});
db.ready.catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Database initialization failed:", e.message || e);
});

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: "libsid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.use("/image", express.static(path.join(__dirname, "..", "image")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminUserId) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeAvailability(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "Available";
  if (v.includes("borrow")) return "Borrowed";
  if (v.includes("unavail")) return "Unavailable";
  return "Available";
}

function mapDbErrorToHttp(e, fallbackMessage) {
  if (e && e.code === "23505") return { status: 409, error: "Duplicate value violates unique constraint." };
  if (e && e.code === "23503") return { status: 400, error: "Cannot delete or update because of related records." };
  return { status: 500, error: fallbackMessage || String((e && e.message) || e) };
}

async function generateBookQrDataUrl(bookId) {
  const url = `${PUBLIC_BASE_URL}/book.html?id=${encodeURIComponent(bookId)}`;
  return await QRCode.toDataURL(url, { margin: 1, width: 320 });
}

// Public OPAC APIs
app.get("/api/books", async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 12)));
  try {
    const { items, total } = await db.listBooks(
      req.query,
      page,
      pageSize,
      "id, title, author, category, year_published, isbn, availability_status, date_acquired"
    );
    // eslint-disable-next-line no-console
    console.log("/api/books supabase response:", {
      page,
      pageSize,
      total,
      count: items.length,
      firstItemId: items[0] ? items[0].id : null
    });
    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/books supabase error:", {
      message: e && e.message ? e.message : String(e),
      code: e && e.code ? e.code : null,
      details: e && e.details ? e.details : null
    });
    if (e && e.message) return res.status(500).json({ error: e.message });
    return res.status(500).json({ error: "Failed to load books" });
  }
});

app.get("/api/test-db", async (req, res) => {
  try {
    const { items, total } = await db.listBooks({}, 1, 5, "id, title, accession_number, created_at");
    // eslint-disable-next-line no-console
    console.log("/api/test-db supabase response:", {
      total,
      sampleCount: items.length
    });
    res.json({
      ok: true,
      message: "Supabase connection is working.",
      env: {
        hasSupabaseUrl: HAS_SUPABASE_URL,
        hasSupabaseAnonKey: HAS_SUPABASE_ANON_KEY,
        hasSupabaseServiceRoleKey: HAS_SUPABASE_SERVICE_ROLE_KEY,
        usingServiceRoleKey: HAS_SUPABASE_SERVICE_ROLE_KEY
      },
      totalBooks: total,
      sample: items,
      hints:
        total === 0
          ? [
              "books table is empty",
              "verify data exists in Supabase",
              "if data exists but sample is empty, check RLS policy for anon select"
            ]
          : []
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("/api/test-db supabase error:", {
      message: e && e.message ? e.message : String(e),
      code: e && e.code ? e.code : null,
      details: e && e.details ? e.details : null
    });
    if (e && e.message) return res.status(500).json({ error: e.message });
    return res.status(500).json({ error: "Database test failed" });
  }
});

app.get("/api/books/latest", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
  try {
    const items = await db.listLatestBooks(limit);
    res.json({ items });
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to load latest books");
    res.status(err.status).json({ error: err.error });
  }
});

app.get("/api/books/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const book = await db.getBookById(id);
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to load book");
    res.status(err.status).json({ error: err.error });
  }
});

// Admin auth
app.post("/api/admin/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

  try {
    const user = await db.getAdminByUsername(username);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    req.session.adminUserId = user.id;
    req.session.username = user.username;
    res.json({ ok: true, username: user.username });
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to login");
    res.status(err.status).json({ error: err.error });
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ id: req.session.adminUserId, username: req.session.username });
});

// Admin books CRUD
app.get("/api/admin/books", requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  try {
    const { items, total } = await db.listBooks(req.query, page, pageSize, "*");
    res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), items });
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to load admin books");
    res.status(err.status).json({ error: err.error });
  }
});

app.post("/api/admin/books", requireAdmin, async (req, res) => {
  const b = req.body || {};
  // eslint-disable-next-line no-console
  console.log("Incoming data:", req.body);
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Invalid or empty JSON body" });
  }
  const title = String(b.title || "").trim();
  const author = String(b.author || "").trim();
  const accession_number = String(b.accession_number || "").trim();
  const yearRaw = b.year_published != null ? b.year_published : b.year;
  const year_published = yearRaw != null && String(yearRaw).trim() !== "" ? Number(yearRaw) : null;
  if (!title || !author || !accession_number) {
    return res.status(400).json({ error: "title, author, and accession_number are required" });
  }
  if (year_published != null && Number.isNaN(year_published)) {
    return res.status(400).json({ error: "year_published must be a number" });
  }

  try {
    const { data, error } = await supabase
      .from("books")
      .insert([
        {
          title,
          author,
          publisher: b.publisher ? String(b.publisher).trim() : null,
          year_published,
          isbn: b.isbn ? String(b.isbn).trim() : null,
          category: b.category ? String(b.category).trim() : null,
          accession_number,
          shelf_location: b.shelf_location ? String(b.shelf_location).trim() : null,
          date_acquired: toIsoDateOrNull(b.date_acquired),
          availability_status: normalizeAvailability(b.availability_status)
        }
      ])
      .select();

    if (error) {
      // eslint-disable-next-line no-console
      console.error("Supabase insert error:", error);
      if (error.code === "42501") {
        return res.status(500).json({
          error:
            "Insert blocked by Supabase permissions/RLS. Verify policies allow INSERT for this role or use service_role key on backend."
        });
      }
      return res.status(500).json({ error: error.message });
    }

    const inserted = Array.isArray(data) ? data[0] : null;
    if (!inserted || !inserted.id) {
      return res.status(500).json({ error: "Insert succeeded but no row was returned" });
    }

    const qr = await generateBookQrDataUrl(inserted.id);
    await db.updateBook(inserted.id, { qr_code: qr });
    const refreshed = await db.getBookById(inserted.id);
    if (refreshed) return res.json([refreshed]);
    return res.json(data);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to create book");
    res.status(err.status).json({ error: err.error });
  }
});

app.put("/api/admin/books/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.getBookById(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const b = req.body || {};
  const title = b.title != null ? String(b.title).trim() : existing.title;
  const author = b.author != null ? String(b.author).trim() : existing.author;
  const accession_number =
    b.accession_number != null ? String(b.accession_number).trim() : existing.accession_number;

  if (!title || !author || !accession_number) {
    return res.status(400).json({ error: "title, author, and accession_number are required" });
  }

  try {
    await db.updateBook(id, {
      title,
      author,
      publisher: b.publisher != null ? String(b.publisher).trim() : existing.publisher,
      year_published: b.year_published != null ? Number(b.year_published) : existing.year_published,
      isbn: b.isbn != null ? String(b.isbn).trim() : existing.isbn,
      category: b.category != null ? String(b.category).trim() : existing.category,
      accession_number,
      shelf_location: b.shelf_location != null ? String(b.shelf_location).trim() : existing.shelf_location,
      date_acquired: b.date_acquired != null ? toIsoDateOrNull(b.date_acquired) : existing.date_acquired,
      availability_status:
        b.availability_status != null
          ? normalizeAvailability(b.availability_status)
          : existing.availability_status
    });
    const qr = await generateBookQrDataUrl(id);
    const book = await db.updateBook(id, { qr_code: qr });
    res.json(book);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to update book");
    res.status(err.status).json({ error: err.error });
  }
});

app.delete("/api/admin/books/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const deleted = await db.deleteBook(id);
    res.json({ ok: true, deleted });
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Cannot delete book with borrow history.");
    res.status(err.status).json({ error: err.error });
  }
});

// CSV upload (acquisitions)
const upload = multer({ dest: uploadsDir });

app.post("/api/admin/books/upload-csv", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  const filePath = req.file.path;

  const created = [];
  const skipped = [];
  const errors = [];

  const readStream = fs.createReadStream(filePath);
  const parser = parse({
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const rows = [];
  readStream.pipe(parser);

  for await (const record of parser) {
    rows.push(record);
  }

  try {
    for (const r of rows) {
      try {
        const title = String(r.Title || "").trim();
        const author = String(r.Author || "").trim();
        const accession_number = String(r.AccessionNumber || "").trim();
        if (!title || !author || !accession_number) {
          errors.push({ row: r, error: "Missing Title/Author/AccessionNumber" });
          continue;
        }

        try {
          const createdBook = await db.insertBook({
            title,
            author,
            publisher: r.Publisher ? String(r.Publisher).trim() : null,
            year_published: r.Year ? Number(r.Year) : null,
            isbn: r.ISBN ? String(r.ISBN).trim() : null,
            category: r.Category ? String(r.Category).trim() : null,
            accession_number,
            shelf_location: r.ShelfLocation ? String(r.ShelfLocation).trim() : null,
            date_acquired: toIsoDateOrNull(r.DateAcquired),
            availability_status: "Available"
          });
          const qr = await generateBookQrDataUrl(createdBook.id);
          await db.updateBook(createdBook.id, { qr_code: qr });
          created.push({ id: createdBook.id, accession_number, title });
        } catch (e) {
          if (e && e.code === "23505") {
            skipped.push({ accession_number, title, reason: "Duplicate accession_number" });
          } else {
            errors.push({ row: r, error: String(e.message || e) });
          }
        }
      } catch (e) {
        errors.push({ row: r, error: String(e.message || e) });
      }
    }
  } finally {
    fs.unlink(filePath, () => {});
  }

  res.json({ ok: true, createdCount: created.length, skippedCount: skipped.length, errorsCount: errors.length, created, skipped, errors });
});

// Export books to CSV
app.get("/api/admin/books/export-csv", requireAdmin, async (req, res) => {
  try {
    const books = await db.listAllBooks();
    const header =
      "Title,Author,Publisher,Year,ISBN,Category,AccessionNumber,ShelfLocation,DateAcquired,AvailabilityStatus\n";
    const escapeCsv = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (/[\",\\n]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
      return s;
    };
    const lines = books.map((b) =>
      [
        b.title,
        b.author,
        b.publisher,
        b.year_published,
        b.isbn,
        b.category,
        b.accession_number,
        b.shelf_location,
        b.date_acquired,
        b.availability_status
      ]
        .map(escapeCsv)
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="books-export.csv"');
    res.send(header + lines.join("\n"));
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to export books");
    res.status(err.status).json({ error: err.error });
  }
});

// Borrowing management
app.post("/api/admin/borrow", requireAdmin, async (req, res) => {
  const student_name = String(req.body.student_name || "").trim();
  const student_id = String(req.body.student_id || "").trim();
  const book_id = Number(req.body.book_id);
  const due_date = toIsoDateOrNull(req.body.due_date);

  if (!student_name || !student_id || !book_id || !due_date) {
    return res.status(400).json({ error: "student_name, student_id, book_id, due_date required" });
  }

  const book = await db.getBookById(book_id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  if (String(book.availability_status).toLowerCase() !== "available") {
    return res.status(400).json({ error: "Book is not available" });
  }

  const now = new Date().toISOString().slice(0, 10);

  try {
    const record = await db.createBorrowRecord({
      student_name,
      student_id,
      book_id,
      accession_number: book.accession_number,
      date_borrowed: now,
      due_date,
      status: "Borrowed"
    });
    await db.updateBook(book_id, { availability_status: "Borrowed" });
    res.json(record);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to borrow book");
    res.status(err.status).json({ error: err.error });
  }
});

app.post("/api/admin/return", requireAdmin, async (req, res) => {
  const record_id = Number(req.body.record_id);
  if (!record_id) return res.status(400).json({ error: "record_id required" });

  const rec = await db.getBorrowRecordById(record_id);
  if (!rec) return res.status(404).json({ error: "Record not found" });
  if (String(rec.status).toLowerCase() === "returned") {
    return res.status(400).json({ error: "Already returned" });
  }

  const date_returned = toIsoDateOrNull(req.body.date_returned) || new Date().toISOString().slice(0, 10);

  try {
    await db.updateBorrowRecord(record_id, { date_returned, status: "Returned" });
    await db.updateBook(rec.book_id, { availability_status: "Available" });
    const record = await db.getBorrowRecordByIdWithBook(record_id);
    res.json(record);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to return book");
    res.status(err.status).json({ error: err.error });
  }
});

app.get("/api/admin/borrow-records", requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

  const status = String(req.query.status || "").trim();
  const from = toIsoDateOrNull(req.query.from);
  const to = toIsoDateOrNull(req.query.to);

  try {
    const { items, total } = await db.listBorrowRecords({
      status,
      from,
      to,
      page,
      pageSize
    });
    res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), items });
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to load borrow records");
    res.status(err.status).json({ error: err.error });
  }
});

// Dashboard reports
app.get("/api/admin/reports/summary", requireAdmin, async (req, res) => {
  try {
    const summary = await db.getReportsSummary();
    res.json(summary);
  } catch (e) {
    const err = mapDbErrorToHttp(e, "Failed to load dashboard summary");
    res.status(err.status).json({ error: err.error });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Library system running on ${PUBLIC_BASE_URL}`);
});

