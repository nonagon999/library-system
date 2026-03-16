# Deploy Library System Online (Free / Low Cost)

Get your library OPAC live so anyone can use it at a URL like `https://your-library.onrender.com` or a custom domain (e.g. `library.yourschool.edu`).

---

## Option 1: Render.com (Free Tier) — Recommended

**Cost:** Free  
**Limits:** Service sleeps after ~15 min of no traffic (wakes in ~1 min when someone visits). 750 free hours/month. Data in SQLite is **ephemeral** (resets on redeploy); for permanent data, add a [Persistent Disk](https://render.com/docs/disks) (paid) later or use a free Postgres DB.

### Step 1: Push your code to GitHub

1. Create a new repository on [GitHub](https://github.com/new) (e.g. `library-system`).
2. In your project folder, run:

```bash
cd C:\Users\ENDUSER\.cursor-tutor\library-system
git init
git add .
git commit -m "Library system ready for deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

(Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.)

### Step 2: Deploy on Render

1. Go to [Render](https://render.com) and sign up (free) — use “Sign up with GitHub”.
2. Click **Dashboard** → **New +** → **Web Service**.
3. Connect your GitHub account if asked, then select the **repository** that contains this project.
4. Configure:
   - **Name:** e.g. `library-system` (or `harris-library`).
   - **Region:** Choose closest to your users.
   - **Branch:** `main`.
   - **Runtime:** Node.
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free.
5. Click **Advanced** and add **Environment Variables**:
   - `SESSION_SECRET` — type a long random string (e.g. 32+ characters). Render can “Generate” one for you.
   - `PUBLIC_BASE_URL` — leave empty for now; you’ll set it after the first deploy (see Step 6).
6. Click **Create Web Service**. Render will build and deploy. Wait until the service shows **Live** and a URL like `https://library-system-xxxx.onrender.com`.

### Step 3: Set the public URL (for QR codes and links)

1. In the Render **Dashboard**, open your **Web Service** → **Environment**.
2. Add or edit:
   - **Key:** `PUBLIC_BASE_URL`  
   - **Value:** Your live URL, e.g. `https://library-system-xxxx.onrender.com` (no trailing slash).
3. Save. Render will redeploy once; after that, QR codes and links will use this URL.

### Step 4: Use the site

- **Public (students):** Open the URL → search books, view latest acquisitions, open book details (QR codes will point to this URL).
- **Librarian:** Go to `https://your-app.onrender.com/admin/login.html`  
  - Default login: **admin** / **admin123** — change the password after first login (e.g. add a “Change password” feature or create a new admin and remove the default in code).

### Step 5: Custom domain (e.g. library.harris.edu.ph)

1. In Render: **Web Service** → **Settings** → **Custom Domains** → **Add Custom Domain**.
2. Enter your domain (e.g. `library.harris.edu.ph`).
3. In your domain’s DNS, add the CNAME record Render shows (e.g. `library.harris.edu.ph` → `library-system-xxxx.onrender.com`).
4. Set **PUBLIC_BASE_URL** to `https://library.harris.edu.ph` and save so QR codes use the custom domain.

---

## Option 2: Railway (Free tier with limits)

**Cost:** Free trial / usage-based; low cost for light traffic.

1. Sign up at [Railway](https://railway.app).
2. **New Project** → **Deploy from GitHub** → select your repo.
3. Railway will detect Node and run `npm install` and `npm start`. Set:
   - `PORT` — Railway sets this automatically.
   - `SESSION_SECRET` — a long random string.
   - `PUBLIC_BASE_URL` — your Railway URL (e.g. `https://your-app.up.railway.app`) or custom domain.
4. After deploy, open the generated URL. Use **admin** / **admin123** at `/admin/login.html` and change the password when possible.

---

## Option 3: Fly.io (Free allowance)

**Cost:** Free tier with a monthly allowance; good for small apps.

1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).
2. In the project folder: `fly launch` (choose a region, don’t add a Postgres DB if you keep using SQLite).
3. Set secrets:
   - `fly secrets set SESSION_SECRET=your-long-random-string`
   - `fly secrets set PUBLIC_BASE_URL=https://your-app.fly.dev`
4. Deploy: `fly deploy`. Your site will be at `https://your-app.fly.dev`.

---

## After going live

- **Change default admin password** (admin / admin123) as soon as possible.
- **Backups:** On free tiers, SQLite data can be lost on redeploy. For a production school library, consider:
  - Render: add a **Persistent Disk** and store the database (and uploads) there, or
  - Use a free/cheap **Postgres** and switch the app to Postgres (code change).
- **HTTPS:** Render, Railway, and Fly provide HTTPS by default; no extra setup needed.

---

## Quick reference: environment variables

| Variable           | Required | Description |
|--------------------|----------|-------------|
| `PORT`             | No       | Set by the host (Render, Railway, Fly). |
| `SESSION_SECRET`   | Yes (prod) | Long random string for session cookies. |
| `PUBLIC_BASE_URL`  | Yes (prod) | Full public URL (e.g. `https://library.yourschool.edu`) for QR codes and links. |

Your app is already configured to use these; just set them in the host’s dashboard or via CLI.
