# Nivaran Ops Web (Mock-First MVP)

This folder contains a working admin web app for civic issue operations.

The app is currently in mock mode (local persisted data), so your team can start UI and workflow testing immediately. It is already structured to switch to Firebase once you provide env values.

## What Is Implemented

- Role-based login simulator (super admin, department head, engineer)
- Dashboard with KPI cards and charts
- Issue inbox with filters and search
- Issue details workspace
  - assignment
  - status updates
  - comments
  - timeline/audit trail
- Assignment board (kanban-style by status)
- Notifications inbox with read state
- Re-route action for super admins and department heads
- Local persistence via Zustand middleware

## Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Zustand (state + persistence)
- Recharts (dashboard charts)
- date-fns
- lucide-react

## Run Locally

```bash
cd web-app
npm install
npm run dev
```

Open http://localhost:3000

## Build Check

```bash
npm run build
```

## Mock Accounts

Use the dropdown on login page. Example accounts:

- anita@nivaran.gov (super admin)
- ajay@nivaran.gov (department head)
- ritika@nivaran.gov (department head)
- maya@nivaran.gov (engineer)

## Important Files

- src/lib/types.ts
- src/lib/mock-data.ts
- src/lib/store.ts
- src/app/login/page.tsx
- src/app/(app)/dashboard/page.tsx
- src/app/(app)/issues/page.tsx
- src/app/(app)/issues/[id]/page.tsx

## Next Step: Firebase Integration

1. Copy .env.example to .env.local and fill your values.
2. Replace login mock with Firebase Auth.
3. Replace Zustand-only data writes with Firestore + Cloud Functions.
4. Keep current UI and workflow actions unchanged.

This way, you keep speed while moving to real backend without rewriting screens.
