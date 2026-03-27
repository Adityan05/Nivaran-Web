// @ts-nocheck
// Deploy as Supabase Edge Function: auto-assign-issue
// Runtime: Deno
// Purpose:
// 1) Read assigned_department_id already provided by citizen app
// 2) Find nearest zonal officer within that department
// 3) Update issues.assigned_to_id

import { createClient } from "jsr:@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WEBHOOK_SECRET = Deno.env.get("AUTO_ASSIGN_WEBHOOK_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function normalize(text: unknown): string {
  return String(text ?? "").trim().toLowerCase();
}

function getField<T = unknown>(row: JsonRecord, ...keys: string[]): T | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function resolveNearestZonalOfficer(
  departmentId: string,
  issueLat: number | null,
  issueLng: number | null,
): Promise<{ officerId: string; zoneId: string } | null> {
  const { data: officers, error: officersError } = await admin
    .from("ops_users")
    .select("id, zone_id")
    .eq("role", "zonal_officer")
    .eq("department_id", departmentId)
    .eq("active", true);

  if (officersError || !officers?.length) {
    return null;
  }

  const zoneIds = officers
    .map((o) => normalize(o.zone_id))
    .filter((z) => z.length > 0);

  if (!zoneIds.length) {
    return null;
  }

  const { data: zones, error: zonesError } = await admin
    .from("ops_zones")
    .select("zone_id, lat, lng")
    .in("zone_id", zoneIds);

  if (zonesError || !zones?.length) {
    return null;
  }

  const zoneById = new Map<string, { lat: number; lng: number }>();
  for (const zone of zones) {
    const zoneId = normalize(zone.zone_id);
    const lat = toNumber(zone.lat);
    const lng = toNumber(zone.lng);
    if (!zoneId || lat === null || lng === null) continue;
    zoneById.set(zoneId, { lat, lng });
  }

  const candidates = officers
    .map((officer) => {
      const zoneId = normalize(officer.zone_id);
      const zone = zoneById.get(zoneId);
      if (!zone) return null;
      return {
        officerId: String(officer.id),
        zoneId,
        zoneLat: zone.lat,
        zoneLng: zone.lng,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (!candidates.length) {
    return null;
  }

  if (issueLat === null || issueLng === null) {
    return { officerId: candidates[0].officerId, zoneId: candidates[0].zoneId };
  }

  let best = candidates[0];
  let bestDistance = haversineKm(issueLat, issueLng, best.zoneLat, best.zoneLng);

  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const distance = haversineKm(issueLat, issueLng, candidate.zoneLat, candidate.zoneLng);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return { officerId: best.officerId, zoneId: best.zoneId };
}

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET) {
      const incomingSecret = req.headers.get("x-webhook-secret");
      if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const payload = (await req.json()) as JsonRecord;
    const eventType = normalize(getField(payload, "type"));
    const record = (getField(payload, "record") ?? payload) as JsonRecord;

    if (eventType !== "insert") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "insert_only" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const issueId = String(getField(record, "id") ?? "").trim();
    if (!issueId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_issue_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const existingAssignee = getField(record, "assigned_to_id", "assigned_to");
    if (existingAssignee) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_assigned" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const departmentId = String(getField(record, "assigned_department_id") ?? "").trim();
    if (!departmentId) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "missing_assigned_department_id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const issueLat = toNumber(getField(record, "location_lat", "lat"));
    const issueLng = toNumber(getField(record, "location_lng", "lng"));
    const nearest = await resolveNearestZonalOfficer(departmentId, issueLat, issueLng);

    if (!nearest) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_zonal_officer_found", issueId, departmentId }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const updates: JsonRecord = {
      assigned_to_id: nearest.officerId,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin.from("issues").update(updates).eq("id", issueId);
    if (updateError) {
      return new Response(JSON.stringify({ ok: false, error: updateError.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    await admin.from("ops_issue_events").insert({
      issue_id: issueId,
      type: "auto_assignment",
      title: "Auto-assigned by webhook",
      note: `Department=${departmentId}, Zonal Officer=${nearest.officerId}, Zone=${nearest.zoneId}`,
      actor_id: "system-auto-assign",
      actor_name: "System Auto Assignment",
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        issueId,
        departmentId,
        assignedToId: nearest.officerId,
        zoneId: nearest.zoneId,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
