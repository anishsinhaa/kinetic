# KINETIC — Track. Recover. Progress.

[![CI/CD](https://github.com/anishsinhaa/kinetic/actions/workflows/ci.yml/badge.svg)](https://github.com/anishsinhaa/kinetic/actions/workflows/ci.yml)

![KINETIC Logo](./src/assets/full_logo.png)

**Live:** [https://kinetic-tracker.netlify.app](https://kinetic-tracker.netlify.app)

Personal fitness tracker for logging workouts, daily metrics, and recovery — built as a mobile-first PWA with offline sync and timezone-aware Web Push reminders. No social feeds, ads, or fluff.

---

## Daily workflow

1. **Daily records** — morning weight, calories, protein, sleep, notes  
2. **Workout** — start with a type chip, log sets (prefilled from last session + PR), rest timer between sets  
3. **Recovery check-in** — fatigue, soreness by muscle, optional pain flag  
4. **Progress / History** — charts, PRs, weekly volume, past sessions  

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
├── layouts/           # Sidebar / bottom nav + route transitions
├── lib/
│   ├── supabase/      # Client + row types
│   └── offline/       # localStorage mutation queue + flush
└── store/             # Zustand app store
```

RLS is enabled on user data tables — each user only sees their own rows. Schema evolves via `supabase/migrations/` (CI `db push`). Standalone scripts such as `supabase/cron_reminders.sql` and `supabase/v2_data_model.sql` are applied manually when needed.

---

## Features

### Workout
- One-tap start; **workout type chips** (Push / Pull / Legs / …, reorderable in Settings)
- Exercises from library or custom; multi-select add
- Sets autosave on change; **prefill from last session**; shows last performance + **PR**
- **PR rule:** heavier weight wins; same weight + more reps wins (**no estimated 1RM**)
- Volume from **completed sets only**
- Rest timer (ring UI + optional local notification when done)
- Finish flow with feel/note; session persisted in localStorage across refresh

### Daily records & recovery
- Inline daily log on Dashboard (weight, calories, protein, sleep, notes)
- Recovery check-in: fatigue, per-muscle soreness, pain flag — nothing counts until submitted
- History tabs for daily logs, per-exercise sessions, and recovery

### Progress
- Per-exercise best-set weight + session volume charts
- Weekly volume (ISO weeks), body-weight trend, all-time PR list

### Settings
- Workout types, rest timer default, weight step, kg/lb
- Reminders: morning weight, night recovery, optional workout days — **wall-clock times in `user_settings.timezone`** (browser TZ persisted when missing/UTC)
- Web Push: enable → subscribe + upsert `push_subscriptions`; test notification via Edge Function
- **Data:** export JSON / CSV / Excel; import Excel/CSV with preview (Daily Log + Exercises Log → history best sets); idempotent re-import; summary of imported/skipped

### PWA & offline
- Installable on Android; service worker precache + SPA navigation fix for deep routes
- Offline queue for set upserts and daily logs (dedupe by set id / user+date); flushes when online

### Notifications
- Scheduled reminders: Edge Function `send-reminders` + **pg_cron** (Bearer `CRON_SECRET`)
- Deployed with `--no-verify-jwt` so cron can call it; browser test path verifies the user JWT inside the function
- Matches reminder times in each user’s timezone

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
