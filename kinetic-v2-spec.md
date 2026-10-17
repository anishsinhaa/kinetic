# Kinetic v2 Spec (Oct 2026)

Goal: replace the owner's Excel gym log. Simple, fast, mobile-first (Android at the gym), works equally well on laptop. Primary action: start a workout. Keep existing stack (React 19 + TS, Vite, Tailwind, Zustand, TanStack Query, Supabase with RLS, service-layer pattern: no Supabase calls in components). Don't list dark mode as a feature anywhere.

## Reference: the Excel being replaced
- Daily Log: Date, Weight (kg), Calories, Protein (g), Workout Type (Push/Pull/Legs/Upper/Lower/Mixed Upper/Rest...), Workout Duration (min), Sleep (hours), Journal Notes.
- Exercises Log: owner's own ~55 exercises grouped PUSH / PULL / LEGS, each with Best Set (weight x reps), Next Session target (Maintain/Increase), Notes, Updated date.

## 1. Dashboard (home, opens by default)
- Big primary "Start Workout" button, thumb-reachable at bottom on mobile (sticky), prominent on desktop.
- Last workout card: type, relative date ("2 days ago"), duration, exercise count, volume.
- Suggested next type based on recent split rotation (e.g. after Push, Pull -> suggest Legs). Just a hint, pre-highlights a chip.
- Today card: morning weight + recovery check-in status, one tap to log each.
- Mini charts: 7-day weight trend, workouts this week, streak.
- If a workout is in progress, show "Resume workout" instead.

## 2. Workout flow (one workout record holds everything)
1. Type picker: tappable chips. Defaults: Push, Pull, Legs, Upper, Lower, Full Body, Mixed, Cardio, Free. No free-text typing here. Custom types managed in Settings.
2. Warmup step: Start Warmup / Skip. Big running timer, optional note, End Warmup. Warmup duration + note saved on the workout.
3. Exercises: picker filtered by workout type (muscle groups mapped per type), owner's previously used exercises first (recents/favourites), search for the rest, custom exercises allowed. Bottom sheet / modal on mobile, NOT a page navigation.
4. Each added exercise pre-fills sets from the last session of that exercise; shows "Last: 40x6 - Target: 40x8" and the PR. Optional per-exercise "next time" target (Maintain / Increase weight / Increase reps) and note, like the Excel.
5. Set entry: large +/- steppers for weight (2.5 kg step, configurable) and reps, plus direct input that selects existing value on focus. Big check button to complete a set. Completing a set auto-starts the rest timer.
6. Rest timer: visible countdown ring, +15s/-15s, skip; vibration + notification when done (works with screen locked/app backgrounded where the platform allows).
7. Finish: confirmation, then summary screen: total duration, warmup time, volume, sets, PRs hit (with celebration animation), optional "how did it feel" (1-5) + note.
- Running workout clock in header. In-progress workout persists across refresh / phone lock (local persistence + server sync). Only one active workout at a time.
- Data model: workouts (type, started_at, ended_at, warmup_started_at, warmup_ended_at, warmup_note, feel, note), workout_exercises (order, target, note), sets (weight, reps, failed, completed_at). Add migrations; keep RLS on all tables.

## 3. Daily records
- Daily log row: weight, calories, protein, sleep hours, note. Workout type + duration derived automatically from that day's workout(s); day with no workout shows as Rest.
- Recovery check-in: quick card (fatigue, soreness by muscle, pain flag). No pre-filled fake values; nothing counts as logged until submitted. Drop the separate 1-10 sleep quality OR merge it so sleep is not entered twice in two forms (keep hours on daily log; optional quality).

## 4. Settings
- Workout types: add, rename, hide, reorder.
- Reminders, each with enable toggle + time: morning weight, night recovery check-in. (Optional: workout reminder on chosen days.)
- Rest timer default duration, weight step, units kg/lb.
- Import from Excel (.xlsx) with preview: Daily Log sheets -> daily logs; Exercises Log -> exercises + best sets as history entries. Export all data (JSON/CSV).
- Account, logout.

## 5. Platform
- PWA: installable on Android, offline support for logging at the gym with background sync when online, app icon/splash.
- Notifications: Web Push (service worker). Scheduled reminders need a server side sender: Supabase Edge Function + pg_cron (or scheduled function) storing push subscriptions per user. Rest timer notification can be local (service worker / Notification API).
- Fully responsive: mobile-first layouts with bottom nav on mobile, sidebar/wider grid on desktop.

## 6. Progress
- Progress page: per-exercise chart (best set / estimated 1RM / volume over time), PR list, body weight trend, weekly volume.

## 7. Motion and UI
- Framer Motion: page transitions, bottom sheets, timer ring animation, set-complete micro-interaction, PR celebration, charts animating in, number tickers on summary. Respect prefers-reduced-motion.
- Clean, high-contrast, large touch targets (min 44px), minimal typing.
- Later (separate): Remotion promo/demo video for portfolio and README.

## 8. Bugs to fix (found in testing)
1. Reps typed right after weight are lost if user moves on quickly (autosave race). Sets must never lose data.
2. Workout volume counts only fully saved sets (wrong totals). Compute from all completed sets.
3. Typing into a prefilled weight appends ("80" + "85" = "8085"). Select on focus.
4. "Save Type" button does nothing; workout type is free-text with no suggestions. Replaced by chips.
5. "Start Workout" needs 2 presses + type + Begin. Should be 1 tap then type chip.
6. Feedback page shows pre-selected fatigue/sleep values while "Not logged yet".
7. When Supabase session refresh fails, app hangs on "Loading..." with a refresh loop. Sign out and show login instead.
8. workouts.started_at never set.
9. Library glitches: alphabetical obscure-first ordering, "Quads" chip highlighted while "All" active.

## 9. Engineering quality
- Lint clean, npm audit fixed, tests for core logic (volume, PRs, suggestion, import parsing) + a few component tests, GitHub Actions CI (lint, typecheck, test, build), code splitting.
- README updated with features, screenshots, architecture. No secrets committed.
