# Nivaran Ops Web

<p align="center">
  <img src="public/app_logo.png" alt="Nivaran Logo" width="120" />
</p>

<p align="center">
  Civic issue operations console for assignment, monitoring, and closure with Supabase-backed workflows.
</p>

## Overview

Nivaran Ops Web is the municipal operations dashboard for handling citizen-reported issues. It includes role-based visibility, assignment workflows, map-based monitoring, and AI-supported operational summaries.

The app uses Supabase as the runtime data source and an Edge Function + Database Webhook for automatic zonal officer assignment.

## Highlights

- Supabase-backed issue, user, event, comment, and notification flows
- Email + password login for ops_users admin accounts
- Role model: commissioner, department_head, zonal_officer, engineer
- Insert-only webhook automation to assign nearest zonal officer
- Engineer-only resolve flow requires mobile camera capture and evidence upload before status can move to Resolved
- Dashboard AI live operations summary with fallback heuristics
- Flood-risk panel with forecast + historical context
- Map layers for issues, risk alerts, hotspots, and 13 Delhi zone markers
- Zone-level unresolved counts and zone-to-issue connector lines

## Current Role Model

- commissioner: full operational visibility and controls
- department_head: department-scoped visibility
- zonal_officer: zone/assignment scoped visibility and actions
- engineer: own-assigned issue visibility and status updates

Note: zonal officers can access issues explicitly assigned to them even if inferred map zone is imperfect.

## Assignment Architecture

Department matching and assignment logic is not performed in the webapp.

Current flow:

1. Citizen-side app inserts issue with assigned_department_id.
2. Supabase Database Webhook (INSERT only on public.issues) triggers Edge Function auto-assign-issue.
3. Edge Function finds nearest zonal officer within that assigned department using ops_zones centroids and issue lat/lng.
4. Edge Function updates issues.assigned_to_id and writes ops_issue_events entry.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand
- Supabase (Postgres + Edge Functions)
- Recharts
- Google Maps JS API
- date-fns

## Key Folders

```text
Nivaran-Web/
  src/
    app/
      (app)/dashboard
      (app)/issues
      (app)/map
      api/flood-risk
      api/live-ops-status
    components/
      issues-map.tsx
    data/
      historical-flood-zones.json
      delhi-zones.json
    lib/
      access.ts
      store.ts
      supabase.ts
      supabase-admin.ts
      zones.ts
  scripts/
    supabase-ops-core.sql
    supabase-auto-assignment.sql
    supabase-auto-assignment-backfill.sql
    edge-function-auto-assign-issue.ts
  supabase/
    functions/auto-assign-issue/index.ts
```

## Database And Supporting Tables

Primary tables used by webapp:

- issues
- departments
- ops_users
- ops_notifications
- ops_issue_events
- ops_issue_comments
- ops_risk_alerts

Assignment support tables:

- ops_zones
- ops_department_rules

## Environment Variables

Create .env.local with at least:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
HISTORICAL_FLOOD_DATA_URL=
```

Notes:

- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for app runtime data.
- SUPABASE_SERVICE_ROLE_KEY is server-only. Never expose it with NEXT_PUBLIC.
- GEMINI_API_KEY is optional; fallback heuristics are used when unavailable.

## Getting Started

Prerequisites:

- Node.js 20+
- npm 10+
- Supabase project

Install and run:

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## Supabase Setup Runbook

1. Apply core schema support (if not already):

```sql
-- run scripts/supabase-ops-core.sql
```

2. Apply auto-assignment support tables:

```sql
-- run scripts/supabase-auto-assignment.sql
```

3. Ensure issues.assigned*to_id is compatible with ops_users.id (text IDs such as u*...):

```sql
alter table public.issues drop constraint if exists issues_assigned_to_id_fkey;
alter table public.issues alter column assigned_to_id type text using assigned_to_id::text;
alter table public.issues add constraint issues_assigned_to_id_fkey foreign key (assigned_to_id) references public.ops_users(id) on update cascade on delete set null;
```

4. Deploy edge function:

```bash
npx supabase functions deploy auto-assign-issue --no-verify-jwt
```

5. Set function secret (optional but recommended):

```bash
npx supabase secrets set AUTO_ASSIGN_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
```

6. Create Database Webhook:

- Type: Supabase Edge Functions
- Function: auto-assign-issue
- Table: public.issues
- Event: INSERT only
- Method: POST
- Header: x-webhook-secret = same value as AUTO_ASSIGN_WEBHOOK_SECRET (if enabled)

7. Create resolution evidence storage bucket:

```sql
insert into storage.buckets (id, name, public)
values ('resolved_images', 'resolved_images', true)
on conflict (id) do nothing;
```

Note: engineer resolve uploads now go through server API `/api/issues/[id]/resolve` using `SUPABASE_SERVICE_ROLE_KEY`, so client-side storage policies are not required for this flow.

## APIs

- POST /api/issues/[id]/resolve
  - Engineer-only resolution endpoint.
  - Accepts multipart form-data (`actorId`, optional `note`, `evidence` image file).
  - Uploads image to `resolved_images` bucket and updates `issues.evidence_images`.
  - Marks issue as `Resolved` only after successful evidence upload.

- POST /api/live-ops-status
  - Generates commissioner live status summary.
  - Uses Gemini when available; deterministic fallback otherwise.
  - Includes completion guard to avoid partial/dangling output.

- POST /api/flood-risk
  - Computes rainfall-linked flood risk alerts.
  - Uses historical flood zones with fallback chain.
  - Persists snapshots for operations visibility.

## Flood Risk Data Notes

- Local historical seed is in src/data/historical-flood-zones.json.
- Seed now contains Delhi-focused flood-prone areas and current department IDs (dept-2/dept-4/dept-6).
- If DB table ops_historical_flood_zones already has older rows, those may override local seed reads.

## Troubleshooting

Map does not load:

- Verify NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.

Live operations summary looks stale:

- Summary is signature-cached and regenerates when issue IDs/statuses change.

Live summary looks incomplete:

- Check GEMINI_API_KEY and /api/live-ops-status route logs.
- Fallback heuristic will be used when model response is incomplete.

Zonal officer cannot see assigned issue:

- Confirm issues.assigned_to_id matches ops_users.id exactly.
- Confirm latest access logic is deployed (assigned-user visibility override).

Webhook not assigning:

- Verify webhook is INSERT only on public.issues.
- Verify edge function deploy status and logs.
- Verify assigned_department_id is present in inserted issue row.

Evidence upload fails on mobile resolve page:

- Verify `resolved_images` bucket exists.
- Verify `SUPABASE_SERVICE_ROLE_KEY` is present in server environment.
- Confirm the app URL is secure (`https`) so camera capture is allowed.

## Run Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Admin Login Password Setup

The login screen now validates both email and password against `ops_users.login_password`.

Temporary bootstrap SQL (same password for all users):

```sql
alter table public.ops_users
add column if not exists login_password text;

update public.ops_users
set login_password = '12345678'
where login_password is null
  or login_password = '';
```

Note: this plaintext password setup is only for initial testing. Move to hashed passwords before production.

## Contributing

1. Create a focused branch.
2. Keep permission logic centralized in src/lib/access.ts.
3. Keep data flow logic centralized in src/lib/store.ts.
4. Run npm run build before PR.
