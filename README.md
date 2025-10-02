# Fitness Workout Tracker — Technical README

This repository contains a single-page React application for logging workouts, viewing history and progress charts, managing profiles and templates, and exporting/importing data. The app is built with Vite, React, Tailwind CSS and Recharts and persists data to localStorage with a small migration helper for legacy data.

---

## Contents
- Overview
- Tech stack
- Quick start (Windows)
- Scripts
- Project structure (key files)
- Data model & storage keys
- Important behaviors & features
- Development notes & troubleshooting
- Next steps / optional improvements

---

## Overview

This app is a compact fitness tracker with a sidebar-first layout and multi-profile support. It supports:
- Logging gym and cardio workouts (sets/reps/weight or distance/time)
- Per-profile workout history and templates
- Progress charts (per-exercise gym charts and cardio charts) using Recharts
- Small compact calendar heatmap showing recent workout consistency
- Export / import of full data (JSON)
- Simple rest timer and personal-record (PR) identification

## Tech stack
- React (17+/18+) with hooks
- Vite (dev server & build)
- Tailwind CSS for styling
- Recharts for charts
- Lucide React for icons
- LocalStorage for persistence

## Quick start (Windows)
Open a Command Prompt (cmd.exe) in the repository root and run:

    cd /d "C:\Users\jeevi\backend dev\new"
    npm install
    npm run dev

Notes:
- If PowerShell blocks scripts (execution policy), use cmd.exe instead — the dev server is run via npm.
- Dev server typically runs at http://localhost:5173 (or 5175). Vite prints the exact URL.

## Scripts
Common scripts in package.json (typical):
- `npm run dev` — start Vite dev server
- `npm run build` — produce a production build
- `npm run preview` — preview the production build locally

## Project structure (key files)
- `src/App.jsx` — main single-file app (profiles, tabs, data loading/saving, primary UI)
- `src/main.jsx` — app entry
- `src/index.css` — Tailwind + base styles
- `src/components/` — component folder (split pieces):
  - `StatsCards.jsx` — sidebar stats cards (Total, This week, Gym, Cardio)
  - `WorkoutForm.jsx` — the Log Workout form
  - `WorkoutHistory.jsx` — history list and delete
  - `ProgressCharts.jsx` — Recharts progress views
  - `CalendarHeatmap.jsx` — compact calendar heatmap (recent 30 days)

## Data model & storage keys
The app persists a combined structure under the single key:

- `STORAGE_KEY = 'fitnessTrackerStore'` — canonical key used by the current implementation.

For backward compatibility the app will attempt to read legacy data from:

- `LEGACY_KEY = 'fitnessTrackerWorkouts'` — older array-style store.

Canonical shape written to `fitnessTrackerStore` (JSON):

{
  "profiles": [ { "id": string, "name": string, "color": string, "emoji": string, "createdAt": string }, ... ],
  "currentProfileId": "profile-abc123",
  "profileWorkouts": {
    "profile-abc123": [ { id, type, date, timeOfDay, exercise/cardioType, sets, reps, weight, distance, time, notes, ... }, ... ]
  },
  "profileTemplates": { "profile-abc123": [ /* templates */ ] }
}

Legacy storage (older versions) used an array of workout objects at key `fitnessTrackerWorkouts`. On first run the app will try to detect legacy data and migrate it into a default profile automatically.

### Workout object (typical fields)
- `id`: string
- `type`: 'gym' | 'cardio'
- `date`: ISO timestamp
- `timeOfDay`: 'morning'|'afternoon'|'evening'
- `exercise`: string (for gym)
- `sets`, `reps`, `weight` (for gym)
- `cardioType`, `distance`, `time` (for cardio)
- `notes`

## Important behaviors & features
- Multi-profile support: add/switch/delete profiles. Workouts are stored per-profile.
- Migration: legacy arrays are migrated into a new default profile and saved under `fitnessTrackerStore`.
- Charts: Recharts is used to render per-exercise gym progress and cardio progress per cardio type.
- Compact calendar heatmap: a 30-day single-row compact heatmap was added; green cells indicate workout days, gray = rest, today has a purple outline. Hovering displays date and workout count via `title` attribute.
- Export / Import: you can export a full JSON backup and import it back (replace or merge). The import UI prompts for Merge vs Replace.
- Rest timer: small floating timer with notifications when finished.

## Development notes & troubleshooting
- If you see errors about duplicate variable declarations in `src/App.jsx`, it usually means the file was accidentally duplicated or contains leftover fragments from consolidation. Open `src/App.jsx` and check for duplicate imports or duplicated function/component definitions.
- If Vite fails to start because PowerShell blocks scripts, use a regular Command Prompt (cmd.exe) or adjust your execution policy.
- Tailwind classes are used throughout — if classes do not appear, ensure Tailwind is configured and the dev server is running.

## Port / environment
- Dev server default port: 5173 (Vite). If that port is already in use, Vite will pick another (check terminal output).

## Testing & linting ideas
- Add unit tests for persistence (migration) logic, e.g. jest tests that read/write the `STORAGE_KEY` payload and validate migrations.
- Add ESLint/Prettier for consistent style.

## Security & privacy
- All data persists locally to browser localStorage. There is no server or cloud component in this project by default. If you plan to share backups, be mindful of sensitive notes in workouts.

## Next steps / optional improvements
- Add per-profile calendar heatmap selection and month labels.
- Replace title-based tooltips with a small accessible tooltip component for better cross-device UX.
- Add unit/integration tests for import/export and migration.
- Add TypeScript for stronger types on the data model.

---

Generated on: Oct 02, 2025

