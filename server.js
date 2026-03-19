const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { parse } = require("csv-parse");
const QRCode = require("qrcode");

const { initDb } = require("./server/database.js");

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  (process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : `http://localhost:${PORT}`);

const app = express();
const db = initDb();

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

async function generateBookQrDataUrl(bookId) {
  const url = `${PUBLIC_BASE_URL}/book.html?id=${encodeURIComponent(bookId)}`;
  return await QRCode.toDataURL(url, { margin: 1, width: 320 });
}

function buildBooksWhereClause(filters) {
  const where = [];
  const params = {};

  const addLike = (field, key) => {
    const v = (filters[key] ?? "").toString().trim();
    if (!v) return;
    where.push(`${field} LIKE @${key}`);
    params[key] = `%${v}%`;
  };

  addLike("title", "title");
  addLike("author", "author");
  addLike("isbn", "isbn");
  addLike("category", "category");

  const keyword = (filters.keyword ?? filters.q ?? "").toString().trim();
  if (keyword) {
    where.push(
      `(title LIKE @kw OR author LIKE @kw OR publisher LIKE @kw OR isbn LIKE @kw OR category LIKE @kw OR accession_number LIKE @kw)`
    );
    params.kw = `%${keyword}%`;
  }

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// Public OPAC APIs
app.get("/api/books", (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 12)));
  const offset = (page - 1) * pageSize;

  const { whereSql, params } = buildBooksWhereClause(req.query);

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM books ${whereSql}`)
    .get(params).c;

  const items = db
    .prepare(
      `SELECT id, title, author, category, year_published, isbn, availability_status, date_acquired
       FROM books
       ${whereSql}
       ORDER BY datetime(created_at) DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset });

  res.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items
  });
});

app.get("/api/books/latest", (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
  const items = db
    .prepare(
      `SELECT id, title, author, category, year_published, availability_status, date_acquired
       FROM books
       ORDER BY COALESCE(date_acquired, created_at) DESC, datetime(created_at) DESC
       LIMIT ?`
    )
    .all(limit);
  res.json({ items });
});

app.get("/api/books/:id", (req, res) => {
  const id = Number(req.params.id);
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!book) return res.status(404).json({ error: "Not found" });
  res.json(book);
});

// Admin auth
app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

  const user = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  req.session.adminUserId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ id: req.session.adminUserId, username: req.session.username });
});

// Admin books CRUD
app.get("/api/admin/books", requireAdmin, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const { whereSql, params } = buildBooksWhereClause(req.query);
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM books ${whereSql}`)
    .get(params).c;

  const items = db
    .prepare(
      `SELECT *
       FROM books
       ${whereSql}
       ORDER BY datetime(created_at) DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset });

  res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), items });
});

app.post("/api/admin/books", requireAdmin, (req, res) => {
  const b = req.body || {};
  const title = String(b.title || "").trim();
  const author = String(b.author || "").trim();
  const accession_number = String(b.accession_number || "").trim();
  if (!title || !author || !accession_number) {
    return res.status(400).json({ error: "title, author, and accession_number are required" });
  }

  const info = db
    .prepare(
      `INSERT INTO books
        (title, author, publisher, year_published, isbn, category, accession_number, shelf_location, date_acquired, availability_status)
       VALUES
        (@title, @author, @publisher, @year_published, @isbn, @category, @accession_number, @shelf_location, @date_acquired, @availability_status)`
    )
    .run({
      title,
      author,
      publisher: b.publisher ? String(b.publisher).trim() : null,
      year_published: b.year_published ? Number(b.year_published) : null,
      isbn: b.isbn ? String(b.isbn).trim() : null,
      category: b.category ? String(b.category).trim() : null,
      accession_number,
      shelf_location: b.shelf_location ? String(b.shelf_location).trim() : null,
      date_acquired: toIsoDateOrNull(b.date_acquired),
      availability_status: normalizeAvailability(b.availability_status)
    });

  const id = info.lastInsertRowid;
  generateBookQrDataUrl(id)
    .then((qr) => {
      db.prepare("UPDATE books SET qr_code = ? WHERE id = ?").run(qr, id);
      const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
      res.json(book);
    })
    .catch((e) => res.status(500).json({ error: String(e.message || e) }));
});

app.put("/api/admin/books/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const b = req.body || {};
  const title = b.title != null ? String(b.title).trim() : existing.title;
  const author = b.author != null ? String(b.author).trim() : existing.author;
  const accession_number =
    b.accession_number != null ? String(b.accession_number).trim() : existing.accession_number;

  if (!title || !author || !accession_number) {
    return res.status(400).json({ error: "title, author, and accession_number are required" });
  }

  db.prepare(
    `UPDATE books SET
      title=@title,
      author=@author,
      publisher=@publisher,
      year_published=@year_published,
      isbn=@isbn,
      category=@category,
      accession_number=@accession_number,
      shelf_location=@shelf_location,
      date_acquired=@date_acquired,
      availability_status=@availability_status
     WHERE id=@id`
  ).run({
    id,
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

  // regenerate QR (in case base URL changed, or just keep consistent)
  generateBookQrDataUrl(id)
    .then((qr) => {
      db.prepare("UPDATE books SET qr_code = ? WHERE id = ?").run(qr, id);
      res.json(db.prepare("SELECT * FROM books WHERE id = ?").get(id));
    })
    .catch((e) => res.status(500).json({ error: String(e.message || e) }));
});

app.delete("/api/admin/books/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  try {
    const info = db.prepare("DELETE FROM books WHERE id = ?").run(id);
    res.json({ ok: true, deleted: info.changes });
  } catch (e) {
    res.status(400).json({ error: "Cannot delete book with borrow history." });
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

  const insertStmt = db.prepare(
    `INSERT INTO books
      (title, author, publisher, year_published, isbn, category, accession_number, shelf_location, date_acquired, availability_status)
     VALUES
      (@title, @author, @publisher, @year_published, @isbn, @category, @accession_number, @shelf_location, @date_acquired, 'Available')`
  );

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

  const tx = db.transaction(async () => {
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
          const info = insertStmt.run({
            title,
            author,
            publisher: r.Publisher ? String(r.Publisher).trim() : null,
            year_published: r.Year ? Number(r.Year) : null,
            isbn: r.ISBN ? String(r.ISBN).trim() : null,
            category: r.Category ? String(r.Category).trim() : null,
            accession_number,
            shelf_location: r.ShelfLocation ? String(r.ShelfLocation).trim() : null,
            date_acquired: toIsoDateOrNull(r.DateAcquired)
          });
          const id = Number(info.lastInsertRowid);
          const qr = await generateBookQrDataUrl(id);
          db.prepare("UPDATE books SET qr_code=? WHERE id=?").run(qr, id);
          created.push({ id, accession_number, title });
        } catch (e) {
          if (String(e.message || "").toLowerCase().includes("unique")) {
            skipped.push({ accession_number, title, reason: "Duplicate accession_number" });
          } else {
            errors.push({ row: r, error: String(e.message || e) });
          }
        }
      } catch (e) {
        errors.push({ row: r, error: String(e.message || e) });
      }
    }
  });

  try {
    await tx();
  } finally {
    fs.unlink(filePath, () => {});
  }

  res.json({ ok: true, createdCount: created.length, skippedCount: skipped.length, errorsCount: errors.length, created, skipped, errors });
});

// Export books to CSV
app.get("/api/admin/books/export-csv", requireAdmin, (req, res) => {
  const books = db.prepare("SELECT * FROM books ORDER BY datetime(created_at) DESC").all();
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
});

// Borrowing management
app.post("/api/admin/borrow", requireAdmin, (req, res) => {
  const student_name = String(req.body.student_name || "").trim();
  const student_id = String(req.body.student_id || "").trim();
  const book_id = Number(req.body.book_id);
  const due_date = toIsoDateOrNull(req.body.due_date);

  if (!student_name || !student_id || !book_id || !due_date) {
    return res.status(400).json({ error: "student_name, student_id, book_id, due_date required" });
  }

  const book = db.prepare("SELECT * FROM books WHERE id=?").get(book_id);
  if (!book) return res.status(404).json({ error: "Book not found" });
  if (String(book.availability_status).toLowerCase() !== "available") {
    return res.status(400).json({ error: "Book is not available" });
  }

  const now = new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO borrow_records
          (student_name, student_id, book_id, accession_number, date_borrowed, due_date, status)
         VALUES
          (?, ?, ?, ?, ?, ?, 'Borrowed')`
      )
      .run(student_name, student_id, book_id, book.accession_number, now, due_date);
    db.prepare("UPDATE books SET availability_status='Borrowed' WHERE id=?").run(book_id);
    return Number(info.lastInsertRowid);
  });

  const recordId = tx();
  const record = db
    .prepare(
      `SELECT br.*, b.title AS book_title
       FROM borrow_records br
       JOIN books b ON b.id = br.book_id
       WHERE br.id = ?`
    )
    .get(recordId);

  res.json(record);
});

app.post("/api/admin/return", requireAdmin, (req, res) => {
  const record_id = Number(req.body.record_id);
  if (!record_id) return res.status(400).json({ error: "record_id required" });

  const rec = db.prepare("SELECT * FROM borrow_records WHERE id=?").get(record_id);
  if (!rec) return res.status(404).json({ error: "Record not found" });
  if (String(rec.status).toLowerCase() === "returned") {
    return res.status(400).json({ error: "Already returned" });
  }

  const date_returned = toIsoDateOrNull(req.body.date_returned) || new Date().toISOString().slice(0, 10);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE borrow_records
       SET date_returned=?, status='Returned'
       WHERE id=?`
    ).run(date_returned, record_id);
    db.prepare("UPDATE books SET availability_status='Available' WHERE id=?").run(rec.book_id);
  });
  tx();

  const record = db
    .prepare(
      `SELECT br.*, b.title AS book_title
       FROM borrow_records br
       JOIN books b ON b.id = br.book_id
       WHERE br.id = ?`
    )
    .get(record_id);
  res.json(record);
});

app.get("/api/admin/borrow-records", requireAdmin, (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const status = String(req.query.status || "").trim();
  const from = toIsoDateOrNull(req.query.from);
  const to = toIsoDateOrNull(req.query.to);

  const where = [];
  const params = {};
  if (status) {
    where.push("br.status = @status");
    params.status = status;
  }
  if (from) {
    where.push("br.date_borrowed >= @from");
    params.from = from;
  }
  if (to) {
    where.push("br.date_borrowed <= @to");
    params.to = to;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM borrow_records br
       ${whereSql}`
    )
    .get(params).c;

  const items = db
    .prepare(
      `SELECT br.*, b.title AS book_title, b.author AS book_author
       FROM borrow_records br
       JOIN books b ON b.id = br.book_id
       ${whereSql}
       ORDER BY datetime(br.date_borrowed) DESC, br.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset });

  res.json({ page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), items });
});

// Dashboard reports
app.get("/api/admin/reports/summary", requireAdmin, (req, res) => {
  const totalBooks = db.prepare("SELECT COUNT(*) AS c FROM books").get().c;
  const totalBorrowedBooks = db
    .prepare("SELECT COUNT(*) AS c FROM books WHERE availability_status='Borrowed'")
    .get().c;
  const totalAvailableBooks = db
    .prepare("SELECT COUNT(*) AS c FROM books WHERE availability_status='Available'")
    .get().c;
  const latestAcquisitions = db
    .prepare(
      `SELECT id, title, author, category, date_acquired, created_at
       FROM books
       ORDER BY COALESCE(date_acquired, created_at) DESC, datetime(created_at) DESC
       LIMIT 8`
    )
    .all();

  res.json({ totalBooks, totalBorrowedBooks, totalAvailableBooks, latestAcquisitions });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Library system running on ${PUBLIC_BASE_URL}`);
});

