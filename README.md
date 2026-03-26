# Nivaran Ops Web

<p align="center">
  <img src="public/app_logo.png" alt="Nivaran Logo" width="120" />
</p>

<p align="center">
  Civic issue operations console for triage, assignment, reroute, monitoring, and closure.
</p>

<p align="center">
  <img alt="Version" title="App version from package.json" src="https://img.shields.io/badge/version-0.1.0-0f766e" />
  <img alt="Next.js" title="Framework" src="https://img.shields.io/badge/Next.js-16.1.7-111827" />
  <img alt="React" title="UI library" src="https://img.shields.io/badge/React-19.2.3-0ea5e9" />
  <img alt="TypeScript" title="Language" src="https://img.shields.io/badge/TypeScript-5.x-2563eb" />
  <img alt="Firebase" title="Data backend" src="https://img.shields.io/badge/Firebase-Firestore-ff8c00" />
  <img alt="State" title="State management" src="https://img.shields.io/badge/State-Zustand-4b5563" />
  <img alt="Status" title="Project status" src="https://img.shields.io/badge/status-active-16a34a" />
</p>

## Table Of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Role Model And Access](#role-model-and-access)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Model (Firestore)](#data-model-firestore)
- [AI And Prediction APIs](#ai-and-prediction-apis)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Run Commands](#run-commands)
- [Operational Flow](#operational-flow)
- [Troubleshooting](#troubleshooting)
- [Production Notes](#production-notes)
- [Contributing](#contributing)

## Overview

Nivaran Ops Web is an admin control room application for civic issue handling. It is designed for municipal workflows where issues are reviewed, assigned, rerouted across departments, tracked by SLA, and closed with a complete action trail.

This app currently uses Firebase Firestore collections for operations data and an email-only admin login flow against `ops_users` records.

## Key Features

### Issue Operations

- Issue inbox with status, urgency, and search filters
- Uniform issue cards with visual status differentiation
- Unassigned issue highlight with animated red attention border
- Issue details page with full context and timeline
- Assignment workflow with role-safe assignee filtering
- Department reroute workflow with notes and event logging
- Status transition controls with guardrails
- Comment support and event history

### Dashboards And Views

- Dashboard KPIs and summary widgets
- Superadmin-only live operations status summary (AI generated)
- Cached AI summary regeneration only when issue count/status changes
- Superadmin rainfall flood-risk warning panel with confidence + source tags
- Assignment board (kanban by status)
- Map view for location-based issue monitoring with layer toggles
- Predicted flood-risk overlays (Low/Moderate/High/Critical)
- Unassigned issue hotspot overlays
- Status-based marker animations (including active in-progress marker effect)
- Notifications inbox with read/unread state

### Governance And Permissions

- Access control by role and department scope
- Closed issue protections (resolved issues are non-assignable, non-reroutable)
- Action audit trail (`events` subcollections)

### UI/UX Improvements Included

- Responsive shell layout with desktop sidebar + mobile drawer navigation
- Notification badge in nav
- Better issue card density and readability
- Placeholder image fallback for unavailable media
- Unassigned issue pill glow animation for attention

### Intelligence And Automation

- Rainfall forecast ingestion for next 5 days (Open-Meteo)
- Historical flood-zone ingestion with fallback chain:
  - external URL feed
  - Firestore snapshot collection
  - local seed dataset
- Predictive risk scoring with confidence score
- Source tagging (forecast, history, issue trend, gemini summary)
- Risk snapshot persistence for timeline/audit
- Auto preventive task creation for High/Critical risk
- Auto department-head notifications for preventive tasks

## Role Model And Access

Current roles:

- `super_admin`
- `department_head`
- `engineer`

Assignment hierarchy:

- Super admin can assign to department heads in the mapped department.
- Department head can assign to engineers in their department.

Reroute permissions:

- Super admin: allowed
- Department head: allowed only for issues in their department
- Engineer: not allowed

Resolved issue protection:

- Assignment and reroute actions are blocked for resolved issues.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand (client state + persistence)
- Firebase Firestore (ops collections)
- Recharts (dashboard charts)
- Lucide React (icons)
- date-fns (time formatting)

## Project Structure

```text
Nivaran-Web/
  public/
    app_logo.png
    issue-placeholder.svg
  src/
    app/
      login/
      (app)/
        dashboard/
        issues/
        board/
        map/
        notifications/
    components/
      app-shell.tsx
      issues-map.tsx
    lib/
      access.ts
      firebase.ts
      firebase-admin.ts
      store.ts
      types.ts
    data/
      historical-flood-zones.json
    app/api/
      flood-risk/route.ts
      live-ops-status/route.ts
```

Important files:

- `src/lib/store.ts`: App state, Firestore reads/writes, operational actions
- `src/lib/access.ts`: Permission model and transition guards
- `src/lib/types.ts`: Domain types (issues, users, events, comments, notifications, flood risk)
- `src/lib/firebase-admin.ts`: Server-side privileged Firestore client initialization
- `src/app/(app)/issues/page.tsx`: Issue inbox cards
- `src/app/(app)/issues/[id]/page.tsx`: Detailed issue workspace
- `src/app/login/page.tsx`: Email-based login against ops users
- `src/app/api/flood-risk/route.ts`: Predictive flood-risk computation + automation
- `src/app/api/live-ops-status/route.ts`: Cached AI ops summary generation

## Data Model (Firestore)

Collections used by this app:

- `ops_users`
- `ops_departments`
- `ops_issues`
- `ops_notifications`
- `ops_risk_alerts` (persisted flood-risk snapshots)
- `ops_preventive_tasks` (auto-generated preventive actions)
- `ops_historical_flood_zones` (ingested/fallback historical flood references)

Subcollections:

- `ops_issues/{issueId}/events`
- `ops_issues/{issueId}/comments`

High-level shape:

- `ops_users`: identity, role, department, active flag
- `ops_departments`: department metadata
- `ops_issues`: issue core fields + assignment/status/reroute metadata
- `ops_notifications`: user alerts for assignments/reroutes/status changes
- `ops_risk_alerts`: AI risk snapshot timeline with alert arrays + summary
- `ops_preventive_tasks`: preventive work items generated from elevated risk
- `ops_historical_flood_zones`: normalized ward/drainage historical flood zones

## AI And Prediction APIs

- `POST /api/flood-risk`
  - Computes flood-risk alerts using forecast + historical + issue trend data
  - Generates concise summary text with Gemini (when key configured)
  - Persists risk snapshots and can auto-create preventive tasks + notifications

- `POST /api/live-ops-status`
  - Generates superadmin operations summary using Gemini 2.5 Flash
  - Falls back to deterministic heuristic summary when Gemini is unavailable
  - Client-side cache reuse is based on issue count/status signature

## Environment Variables

Create a `.env.local` file in the project root with the following keys:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Optional but recommended for AI + server automation
GEMINI_API_KEY=

# Optional external historical flood feed (JSON endpoint)
HISTORICAL_FLOOD_DATA_URL=

# Required for reliable server-side Admin writes in many deployments
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Notes:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is required for the map page.
- Firebase keys are required to load and mutate `ops_*` data.
- `GEMINI_API_KEY` enables AI summaries (live ops + flood warning narrative).
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are server-only credentials. Do not expose with `NEXT_PUBLIC_`.
- `FIREBASE_PRIVATE_KEY` must preserve newline formatting (escaped `\n` in env is supported).

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Firebase project with Firestore enabled

### Install

```bash
cd Nivaran-Web
npm install
```

### Configure Environment

1. Create `.env.local`.
2. Add all environment variables listed above.
3. Ensure your Firestore has the required `ops_*` collections.

### Start Development Server

```bash
npm run dev
```

Open http://localhost:3000.

## Run Commands

```bash
npm run dev      # Start development server
npm run build    # Production build check
npm run start    # Start production server after build
npm run lint     # Lint checks
```

## Operational Flow

1. Sign in with an email present in `ops_users` and marked active.
2. Review incoming issues in Issue Inbox.
3. Assign within hierarchy (super_admin -> department_head -> engineer).
4. Reroute cross-department issues when needed.
5. Superadmin monitors live AI status and predictive flood-risk alerts.
6. Elevated risk auto-creates preventive tasks and notifies relevant department heads.
7. Track timeline, comments, and notifications.
8. Move issue through statuses until closure.

## Troubleshooting

### Images show fallback placeholder

Likely cause: upstream image URL is inaccessible or Firebase Storage permissions are misconfigured.

Quick checks:

- Open image URL directly in browser.
- Verify Firebase Storage service account permissions.
- Confirm bucket configuration in Firebase console.

### Map not loading

- Verify `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Confirm Maps API is enabled for the key.

### Live Ops Status is not AI-generated

- Ensure `GEMINI_API_KEY` is set.
- If unavailable, app intentionally uses a deterministic fallback summary.

### Flood prediction works but no historical context is reflected

- Set `HISTORICAL_FLOOD_DATA_URL` to a valid JSON feed, or
- Populate `ops_historical_flood_zones`, or
- rely on local seed file fallback (`src/data/historical-flood-zones.json`).

### Preventive tasks are not being created

- Verify server-side admin credentials (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) or ADC setup.
- Confirm Firestore write permissions for `ops_preventive_tasks` and `ops_notifications`.

### Login fails for valid-looking email

- Ensure user exists in `ops_users`.
- Ensure `active` is not false.
- Match email exactly (case-insensitive in app logic).

### Route appears inaccessible after reroute

This is expected if the issue moves outside your department scope. The app now shows an access-changed message instead of a hard 404.

## Production Notes

- Add robust Firestore security rules before production rollout.
- Add monitoring/alerts around failed writes and permission denials.
- Consider moving sensitive write paths to Cloud Functions.
- Add integration tests for assignment/reroute/status workflows.
- Add scheduled background refresh for risk snapshots (cron/worker) for zero-latency dashboard loads.
- Consider queue-based execution for preventive automation at larger scale.

## Contributing

1. Create a feature branch.
2. Make focused, tested changes.
3. Run `npm run build` and `npm run lint` before opening a PR.
4. Keep permission and workflow logic centralized in `src/lib/access.ts` and `src/lib/store.ts`.
