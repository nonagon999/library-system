const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function applyBookFilters(query, filters) {
  const title = (filters.title ?? "").toString().trim();
  const author = (filters.author ?? "").toString().trim();
  const isbn = (filters.isbn ?? "").toString().trim();
  const category = (filters.category ?? "").toString().trim();
  const accessionNumber = (filters.accession_number ?? "").toString().trim();
  const keyword = (filters.keyword ?? filters.q ?? "").toString().trim();

  if (title) query = query.ilike("title", `%${title}%`);
  if (author) query = query.ilike("author", `%${author}%`);
  if (isbn) query = query.ilike("isbn", `%${isbn}%`);
  if (category) query = query.ilike("category", `%${category}%`);
  if (accessionNumber) query = query.ilike("accession_number", `%${accessionNumber}%`);

  if (keyword) {
    const escaped = keyword.replace(/,/g, "\\,");
    query = query.or(
      [
        `title.ilike.%${escaped}%`,
        `author.ilike.%${escaped}%`,
        `publisher.ilike.%${escaped}%`,
        `isbn.ilike.%${escaped}%`,
        `category.ilike.%${escaped}%`,
        `accession_number.ilike.%${escaped}%`
      ].join(",")
    );
  }

  return query;
}

function dbError(error, fallbackMessage) {
  if (!error) return null;
  const e = new Error(error.message || fallbackMessage || "Database error");
  e.code = error.code;
  e.details = error.details;
  return e;
}

async function ensureDefaultAdmin() {
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true });
  if (error) throw dbError(error, "Failed checking admin users");
  if (Number(count || 0) > 0) return;

  const password_hash = bcrypt.hashSync("admin123", 10);
  const { error: insertError } = await supabase
    .from("admin_users")
    .insert({ username: "admin", password_hash });
  if (insertError && insertError.code !== "23505") {
    throw dbError(insertError, "Failed seeding default admin");
  }
}

function initDb() {
  return {
    ready: ensureDefaultAdmin(),
    async listBooks(filters, page, pageSize, columns) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from("books")
        .select(columns, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      query = applyBookFilters(query, filters);
      const { data, error, count } = await query;
      if (error) throw dbError(error, "Failed loading books");
      return { items: data || [], total: Number(count || 0) };
    },
    async listLatestBooks(limit) {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, category, year_published, availability_status, date_acquired")
        .order("date_acquired", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw dbError(error, "Failed loading latest books");
      return data || [];
    },
    async getBookById(id) {
      const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      if (error) throw dbError(error, "Failed loading book");
      return data || null;
    },
    async insertBook(payload) {
      const { data, error } = await supabase.from("books").insert(payload).select("*").single();
      if (error) throw dbError(error, "Failed creating book");
      return data;
    },
    async updateBook(id, payload) {
      const { data, error } = await supabase
        .from("books")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw dbError(error, "Failed updating book");
      return data || null;
    },
    async deleteBook(id) {
      const { data, error } = await supabase.from("books").delete().eq("id", id).select("id");
      if (error) throw dbError(error, "Failed deleting book");
      return Array.isArray(data) ? data.length : 0;
    },
    async getAdminByUsername(username) {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw dbError(error, "Failed loading admin user");
      return data || null;
    },
    async listAllBooks() {
      const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
      if (error) throw dbError(error, "Failed loading all books");
      return data || [];
    },
    async createBorrowRecord(payload) {
      const { data, error } = await supabase
        .from("borrow_records")
        .insert(payload)
        .select("*, books:book_id(title)")
        .single();
      if (error) throw dbError(error, "Failed creating borrow record");
      return {
        ...data,
        book_title: data.books ? data.books.title : null
      };
    },
    async getBorrowRecordById(id) {
      const { data, error } = await supabase.from("borrow_records").select("*").eq("id", id).maybeSingle();
      if (error) throw dbError(error, "Failed loading borrow record");
      return data || null;
    },
    async getBorrowRecordByIdWithBook(id) {
      const { data, error } = await supabase
        .from("borrow_records")
        .select("*, books:book_id(title, author)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw dbError(error, "Failed loading borrow record details");
      if (!data) return null;
      return {
        ...data,
        book_title: data.books ? data.books.title : null,
        book_author: data.books ? data.books.author : null
      };
    },
    async updateBorrowRecord(id, payload) {
      const { data, error } = await supabase
        .from("borrow_records")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw dbError(error, "Failed updating borrow record");
      return data || null;
    },
    async listBorrowRecords({ status, from, to, page, pageSize }) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;
      let query = supabase
        .from("borrow_records")
        .select("*, books:book_id(title, author)", { count: "exact" })
        .order("date_borrowed", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end);
      if (status) query = query.eq("status", status);
      if (from) query = query.gte("date_borrowed", from);
      if (to) query = query.lte("date_borrowed", to);
      const { data, error, count } = await query;
      if (error) throw dbError(error, "Failed loading borrow records");
      const items = (data || []).map((x) => ({
        ...x,
        book_title: x.books ? x.books.title : null,
        book_author: x.books ? x.books.author : null
      }));
      return { items, total: Number(count || 0) };
    },
    async getReportsSummary() {
      const [totalBooksRes, borrowedRes, availableRes, latestRes] = await Promise.all([
        supabase.from("books").select("id", { count: "exact", head: true }),
        supabase
          .from("books")
          .select("id", { count: "exact", head: true })
          .eq("availability_status", "Borrowed"),
        supabase
          .from("books")
          .select("id", { count: "exact", head: true })
          .eq("availability_status", "Available"),
        supabase
          .from("books")
          .select("id, title, author, category, date_acquired, created_at")
          .order("date_acquired", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(8)
      ]);
      if (totalBooksRes.error) throw dbError(totalBooksRes.error, "Failed loading total books");
      if (borrowedRes.error) throw dbError(borrowedRes.error, "Failed loading borrowed books count");
      if (availableRes.error) throw dbError(availableRes.error, "Failed loading available books count");
      if (latestRes.error) throw dbError(latestRes.error, "Failed loading latest acquisitions");
      return {
        totalBooks: Number(totalBooksRes.count || 0),
        totalBorrowedBooks: Number(borrowedRes.count || 0),
        totalAvailableBooks: Number(availableRes.count || 0),
        latestAcquisitions: latestRes.data || []
      };
    }
  };
}

module.exports = {
  initDb,
  supabase
};
