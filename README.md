# KINETIC — Track. Recover. Progress.

[![CI/CD](https://github.com/anishsinhaa/kinetic/actions/workflows/ci.yml/badge.svg)](https://github.com/anishsinhaa/kinetic/actions/workflows/ci.yml)

![KINETIC Logo](./src/assets/full_logo.png)

**Live:** [https://kinetic-tracker.netlify.app](https://kinetic-tracker.netlify.app)

Personal fitness tracker for logging workouts, daily metrics, and recovery — built as a mobile-first PWA with offline sync and timezone-aware Web Push reminders. No social feeds, ads, or fluff.

---

## Daily workflow

1. **Home** — one big Start / Resume button; "Log day" and "Recovery update" a tap away  
2. **Workout** — pick a type, log sets (prefilled from last session + PR), rest timer between sets  
3. **Progress** — charts, PRs, past workouts, daily logs  

### Navigation

Four tabs: **Home**, **Workout**, **Progress**, **Settings** (bottom bar on mobile, sidebar on desktop).

| Route | Screen |
|---|---|
| `/` | Home |
| `/workout` | Session (idle screen / active workout / summary) |
| `/workout/recovery` | Recovery check-in |
| `/workout/library` | Exercise library |
| `/progress` | Overview (charts, PRs, per-exercise sessions) |
| `/progress/history` | Workout history cards |
| `/progress/logs` | Daily logs (weight, calories, protein, sleep) + recovery |
| `/settings` | Settings |

Old URLs redirect: `/exercises` → `/workout/library`, `/feedback` → `/workout/recovery`, `/history` → `/progress/history`. Deep links `?start=1`, `?type=Push` and `?repeat=1` on `/workout` still work.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Client state | Zustand (workout session + auth mirror; localStorage persistence) |
| Server state | TanStack Query v5 |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions, pg_cron) |
| Charts | Recharts |
| Excel I/O | ExcelJS |
| Motion | Framer Motion (`prefers-reduced-motion` respected) |
| PWA | vite-plugin-pwa + custom service worker |
| Push | Web Push API + `send-reminders` Edge Function |
| CI/CD | GitHub Actions → Netlify CLI + Supabase CLI |

### Architecture

Supabase is never called from React components. UI → hooks → **service layer** (`src/features/*/services/`) → Supabase client.

```
src/
├── features/
│   ├── auth/          # Session, login, admin email allow-list for library import
│   ├── dailyLog/      # Daily metrics upsert
│   ├── workout/       # Sessions, sets, rest timer, PR detection, volume
│   ├── exercises/     # Library import (API Ninjas) + custom exercises
│   ├── feedback/      # Recovery / body feedback
│   ├── history/       # Daily logs, exercise history queries
│   ├── progress/      # Aggregators for charts + PR list
│   └── settings/      # Preferences, Web Push, import/export
├── pages/             # Lazy-loaded routes
├── layouts/           # Main layout (4-tab nav, route transitions) + section sub-tabs
├── lib/
│   ├── supabase/      # Client + row types
│   └── offline/       # localStorage mutation queue + flush
└── store/             # Zustand app store
```

RLS is enabled on user data tables — each user only sees their own rows. Schema evolves via `supabase/migrations/` (CI `db push`). Standalone scripts such as `supabase/cron_reminders.sql` and `supabase/v2_data_model.sql` are applied manually when needed.

---

## Features

### Home
- Start / Resume button — **Resume appears only for a real, unfinished session** (checked against the database; stale local sessions are reset)
- "Log day" and "Recovery update" sheets, each showing whether today is already logged
- Tiles: 7-day average weight, workouts this week, streak, last workout (opens Progress → History), recovery

### Workout
- Idle screen: type pill (opens a type sheet; defaults to the suggested next type), **Start workout**, "Repeat last workout", last-workout summary
- Warmup is an optional, dismissible card inside the session — not a separate step
- Compact header: type, timer, **Finish**; finish confirmation is a sheet with a saving state
- Sets autosave; **prefill from last session**; completed sets can be edited in place (rest timer is not restarted)
- Deleting a set shows an **Undo** toast; 44px steppers; weights are rounded to your weight step (`100 kg × 5`, `PR 226 lb × 5 · 18 Oct`)
- Exercise picker: fixed-height sheet, search across the whole library (name **or** aliases in `exercises.search_terms`), removable type filter, recents first
- **PR rule:** heavier weight wins; same weight + more reps wins (**no estimated 1RM**). A first-ever log is reported as "First log", not a PR
- Volume from **completed sets only**
- Rest timer (large panel, default from Settings, +/-15s, hidden while the finish sheet is open)
- Summary: workout type (or "Workout"), per-exercise breakdown, feel + note

### Recovery & daily records
- **Recovery** (Workout → Recovery, or Home → Recovery update): fatigue, per-muscle soreness, pain flag and sleep hours — nothing counts until submitted
- **Daily logs** (Progress → Daily logs): one card per day with Edit / Delete for the log and the recovery check-in, plus "Log today"

### Progress
- **Overview:** per-exercise best-set weight + session volume charts, searchable exercise picker, every session of the exercise; weekly volume; body weight, calories, protein and sleep charts over 7 / 30 / 90 days; all-time PR list
- **History:** completed workouts as cards (expand for exercises and sets, delete with confirmation)
- **Daily logs:** see above

### Settings
- Workout types, rest timer default, weight step, kg/lb
- Reminders: morning weight, night recovery, optional workout days — **wall-clock times in `user_settings.timezone`** (browser TZ persisted when missing/UTC)
- Web Push: enable → subscribe + upsert `push_subscriptions`; test notification via Edge Function
- **Data:** export JSON / CSV / Excel; import Excel/CSV with preview (Daily Log + Exercises Log → history best sets); idempotent re-import; summary of imported/skipped

### PWA & offline
- Installable on Android; service worker precache + SPA navigation fix for deep routes
- Offline queue for set upserts and daily logs (dedupe by set id / user+date); flushes when online

### Notifications
- Scheduled reminders: Edge Function `send-reminders` + **pg_cron** (Bearer `CRON_SECRET`), triggered **every 5 minutes**
- A reminder fires when its local time falls inside the current 5-minute window (in the user's timezone), so exact-minute cron jitter never skips one
- `reminder_deliveries` (user, kind, local date) dedupes overlapping windows — at most one reminder of each kind per day
- Deployed with `--no-verify-jwt` so cron can call it; browser test path verifies the user JWT inside the function

---

## Getting started

**Prerequisites:** Node.js 20+, a Supabase project, optional [API Ninjas](https://api-ninjas.com) key for library import.

```bash
git clone https://github.com/anishsinhaa/kinetic.git
cd kinetic
npm install
cp .env.example .env
npm run dev
```

### Local env vars (names only)

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_VAPID_PUBLIC_KEY` | Web Push (required for production build) |
| `VITE_ADMIN_EMAILS` | Comma-separated emails that can import the exercise library |
| `VITE_EXERCISES_API_KEY` | API Ninjas key for library import |

Edge Function secrets (Supabase dashboard, not Vite): `VAPID_PRIVATE_KEY`, `CRON_SECRET`, plus standard Supabase function env.

---

## CI/CD

Workflow: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml). **Netlify Git auto-builds are off** — production publishes only from Actions via `netlify deploy --prod`.

| Job | When | What |
|---|---|---|
| **Lint, Test & Build** | Every PR + push to `main` | `lint` → `typecheck` → `test` → `build` (dummy Vite env) → `npm audit --audit-level=high` |
| **Deploy Netlify** | Push to `main` after checks | Rebuild with production `VITE_*` secrets → `netlify deploy --prod --dir=dist` |
| **Deploy Supabase** | Push to `main` after checks | `supabase db push` if `supabase/migrations/**` changed; `supabase functions deploy send-reminders --no-verify-jwt` if `supabase/functions/**` changed |

### GitHub Actions secrets (names only)

**Netlify deploy:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_ADMIN_EMAILS`, `VITE_EXERCISES_API_KEY`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`

**Supabase deploy:** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`

Project ref used by CI: `nubzkvbwmcxtnfrgvxei`.

---

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

---

## Design

- Neon green `#CCFF00` on near-black `#0B0B0B`
- Large touch targets (≥44px), minimal typing, inline editing
- Bottom nav on mobile; sidebar on desktop

---

## License

Personal project. Not licensed for redistribution.
