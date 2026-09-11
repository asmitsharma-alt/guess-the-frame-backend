# Guess The Frame — Backend API & Realtime WebSockets

Production backend API and real-time WebSocket server for **Guess The Frame**, a cinematic movie frame guessing party game.

---

## Features

- **Express REST API:** Authentication (JWT + bcrypt), Room Management, Curated Movie Catalog, and Leaderboards.
- **Full-Duplex WebSockets (`/ws`):** Real-time lobby sync, room state updates, buzzer timers, and player events.
- **Fuzzy Matching & Spoiler Shield:** Intelligent answer evaluation using normalized Levenshtein distance, duplicate guess suppression, and live-chat spoiler filtering.
- **Prisma ORM:** Database abstraction supporting SQLite (development) and PostgreSQL (production).
- **Security Hardened:** Rate limiting (`express-rate-limit`), Helmet HTTP headers, CORS whitelisting, and input sanitization.
- **Health Check Endpoint (`/api/health`):** Live database status, process uptime, and memory monitoring.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `4000` (Local) / `10000` (Render) | Server port |
| `NODE_ENV` | Yes | `development` / `production` | Environment mode |
| `DATABASE_URL` | Yes | `file:./dev.db` (SQLite) or `postgresql://...` | Database connection string |
| `JWT_ACCESS_SECRET` | Yes | - | Secret key for JWT access tokens |
| `JWT_REFRESH_SECRET` | Yes | - | Secret key for JWT refresh tokens |
| `CORS_ORIGIN` | Yes | `*` | Allowed client origins (comma-separated or `*`) |

### 3. Initialize Database
```bash
npx prisma db push
node prisma/seed.js
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Run Automated Tests
```bash
npm test
```

---

## Deploying to Render

1. Create a **New Web Service** on [Render Dashboard](https://dashboard.render.com/).
2. Connect this repository (`asmitsharma-alt/guess-the-frame-backend`).
3. Set the following build and start configurations:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Add the following **Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `DATABASE_URL`: `file:./dev.db` (or link a Render PostgreSQL database)
   - `JWT_ACCESS_SECRET`: *(Generate a 32+ character random string)*
   - `JWT_REFRESH_SECRET`: *(Generate a 32+ character random string)*
   - `CORS_ORIGIN`: `*` (or your frontend Vercel URL)
5. Click **Deploy Web Service**.
