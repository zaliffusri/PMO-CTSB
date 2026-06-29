# PMO-CTSB Architecture

Ringkasan struktur kod untuk backend (Express) dan frontend (React + Vite). Dokumen ini menjadi peta jalan apabila menambah ciri atau memecahkan fail besar.

## Ringkasan sistem

| Lapisan | Teknologi | Peranan |
|---------|-----------|---------|
| Frontend | React 18, Vite, React Router | UI workspace PMO |
| API | Express 4, ES modules | REST `/api/*` |
| Domain logic | `lib/` | Peraturan perniagaan, metrik, workflow |
| Data | `db/store.js`, `db/repositories/`, `db/runtime/` + Supabase (prod) | Persistensi & query |
| Auth | Bearer token + `sessions` | Login, role-based access |

---

## Backend

```
server.js                 # Bootstrap: CORS, JSON, error handler, static dist
routes/registerApi.js     # Daftar semua router API
middleware/
  authUtils.js            # getTokenFromHeader (shared)
  requireAuth.js          # Session validation → req.user
  requireRole.js          # requireAdmin, requirePmoOrAdmin, requireFinanceAccess, …
  asyncHandler.js         # Wrap async route handlers
routes/
  *.js                    # Satu router per domain (projects, issues, people, …)
lib/
  permissions.js          # Role checks (shared dengan frontend)
  issueWorkflow.js        # Helpdesk L1/L2, promote → backlog
  teamUserSync.js         # Sync users_app ↔ people
db/
  store.js                # Composer: gabung semua repository ke satu `store`
  repositories/           # Domain repositories (clients, projects, issues, …)
  runtime/                # dataState, Supabase sync, shared helpers
  schema.js               # initDb, seed demo
```

### Aliran request

1. `server.js` memanggil `registerApiRoutes(app)`.
2. `/api/auth` dan `/api/settings/public` — tanpa auth.
3. Semua `/api/*` lain melalui `requireAuth`.
4. Router domain mengendalikan CRUD + workflow.
5. `lib/*` mengandungi logik yang boleh diuji tanpa HTTP.

### Konvensyen route

- Gunakan `middleware/requireRole.js` untuk semak role — jangan salin `requirePmoOrAdmin` dalam setiap fail.
- Gunakan `asyncHandler` untuk handler `async` supaya ralat sampai ke error middleware.
- Audit: `store.appendAuditLog(req.user, { … })` untuk perubahan penting.

### Data store

`db/store.js` ialah composer nipis yang menggabungkan repository domain di `db/repositories/` (clients, projects, issues, people, …). Runtime bersama (muat data, simpan, sync Supabase) berada di `db/runtime/`. Pada production, data dimuat dari Supabase. Untuk dev tempatan: `ALLOW_LOCAL_STORE=1` + `db/data.json`.

---

## Frontend

```
src/
  main.jsx                # Entry + providers
  App.jsx                 # Auth gate + BrowserRouter
  layout/AppShell.jsx     # Sidebar, topbar, navigasi
  routes/AppRoutes.jsx    # Definisi Route
  pages/                  # Satu halaman per modul
  components/             # UI boleh guna semula (DataListShell, PageHeader, …)
  hooks/
    useSubmitLock.js      # Elak double-submit
    useAsyncData.js       # Load + error + reload standard
  utils/                  # downloadCsv, issueUi, …
  constants/              # roles, label UI
  navigation/             # pageTitles
  api.js                  # HTTP client + namespace API
  AuthContext.jsx
  context/BrandingContext.jsx
lib/                      # Logik dikongsi dengan backend (import dari src)
```

### Konvensyen halaman

| Corak | Komponen / hook |
|-------|-----------------|
| Loading pertama | `PageLoadingState` |
| Ralat load | `PageLoadError` + `onRetry` |
| Senarai data | `DataListShell`, `DataPanel`, `ModuleFilterBar` |
| Fetch data | `useAsyncData(loader, deps)` atau `useEffect` + `api.*` |
| Form submit | `useSubmitLock` |

### Fail besar (pecahan berperingkat)

| Fail | Baris ± | Cadangan |
|------|---------|----------|
| `Calendar.jsx` | 2000+ | Pecah ke `components/calendar/*` |
| `Issues.jsx` | 1000+ | Modal/promote ke komponen berasingan |
| `index.css` | 8000+ | Pecah per modul (`styles/pages/*.css`) |

---

## Peranan & kebenaran

Sumber kebenaran: `lib/permissions.js` (import di backend dan frontend).

| Role | Akses utama |
|------|-------------|
| admin | Semua modul + Users, History, Settings |
| pmo | Projek, helpdesk, team, clients |
| finance | Finance + laporan berkaitan |
| user | My work, helpdesk (terhad) |

Team roster (`people`) diselaraskan dengan login users melalui `POST /api/people/sync-from-users`.

---

## Helpdesk workflow (ringkas)

- **L1 / L2** — peringkat sokongan pada tiket.
- **Backlog** — kerja dev/data selepas *promote*; **staff wajib ditugaskan**.
- Tiada “L3” dalam UI; rekod legacy `L3` dipaparkan sebagai Backlog.

Lihat `docs/PMO-CTSB-System-Workflow.md` untuk aliran penuh.

---

## Ujian & migrasi

```bash
npm test                  # Unit tests (lib/, tests/)
npm run db:migrate:features   # SQL migrations (perlukan SUPABASE_DB_URL)
```

---

## Menambah ciri baharu

1. **API:** router dalam `routes/`, daftar dalam `registerApi.js` jika domain baru.
2. **Logik:** fungsi dalam `lib/`, bukan dalam route handler panjang.
3. **UI:** halaman dalam `pages/`, komponen kecil dalam `components/`.
4. **Shared labels:** `constants/` atau `lib/*Constants.js`.
5. **Dokumen:** kemas kini workflow doc jika aliran perniagaan berubah.
