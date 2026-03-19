const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "database", "library.db");

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      publisher TEXT,
      year_published INTEGER,
      isbn TEXT,
      category TEXT,
      accession_number TEXT UNIQUE NOT NULL,
      shelf_location TEXT,
      date_acquired TEXT,
      availability_status TEXT NOT NULL DEFAULT 'Available',
      qr_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS borrow_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      book_id INTEGER NOT NULL,
      accession_number TEXT NOT NULL,
      date_borrowed TEXT NOT NULL,
      due_date TEXT NOT NULL,
      date_returned TEXT,
      status TEXT NOT NULL DEFAULT 'Borrowed',
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
    CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
    CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
    CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
    CREATE INDEX IF NOT EXISTS idx_books_date_acquired ON books(date_acquired);
    CREATE INDEX IF NOT EXISTS idx_borrow_records_book_id ON borrow_records(book_id);
    CREATE INDEX IF NOT EXISTS idx_borrow_records_status ON borrow_records(status);
  `);

  // Seed a default admin if none exists.
  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM admin_users").get().c;
  if (adminCount === 0) {
    const username = "admin";
    const password = "admin123";
    const password_hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)").run(
      username,
      password_hash
    );
  }
}

function initDb() {
  const db = openDb();
  migrate(db);
  return db;
}

module.exports = {
  DB_PATH,
  initDb
};

