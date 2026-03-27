import { NextResponse } from "next/server";
import historicalZonesSeed from "@/data/historical-flood-zones.json";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type {
  FloodRiskAlert,
  FloodRiskLevel,
  FloodRiskSourceTag,
  IssueRecord,
} from "@/lib/types";

interface DailyForecast {
  time: string[];
  precipitation_sum?: number[];
}

interface OpenMeteoResponse {
  daily?: DailyForecast;
}

type RiskHotspot = {
  area: string;
  lat: number;
  lng: number;
  totalSignals: number;
  recentSignals: number;
};

type HistoricalZone = {
  id: string;
  area: string;
  wardCode?: string;
  drainageZone?: string;
  lat: number;
  lng: number;
  severityWeight: number;
  historicalFloodCount: number;
  targetDepartmentId: string;
};

const floodKeywords = [
  "flood",
  "water logging",
  "waterlogging",
  "drain",
  "drainage",
  "sewage",
  "overflow",
  "rain",
  "stagnant",
  "puddle",
];

function nowISO(): string {
  return new Date().toISOString();
}

function isFloodRelated(issue: IssueRecord): boolean {
  const haystack = [issue.title, issue.description, issue.category, ...(issue.tags ?? [])]
    .join(" ")
    .toLowerCase();
  return floodKeywords.some((keyword) => haystack.includes(keyword));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function riskLevelFromScore(score: number): FloodRiskLevel {
  if (score >= 0.8) return "Critical";
  if (score >= 0.6) return "High";
  if (score >= 0.35) return "Moderate";
  return "Low";
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * earth * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toHistoricalZone(raw: unknown, index: number): HistoricalZone | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: String(data.id ?? `zone-${index}`),
    area: String(data.area ?? "Unknown area"),
    wardCode: data.wardCode ? String(data.wardCode) : undefined,
    drainageZone: data.drainageZone ? String(data.drainageZone) : undefined,
    lat,
    lng,
    severityWeight: clamp(Number(data.severityWeight ?? 0.5), 0, 1),
    historicalFloodCount: Math.max(0, Number(data.historicalFloodCount ?? 0)),
    targetDepartmentId: String(data.targetDepartmentId ?? "dept-6"),
  };
}

async function loadHistoricalZones(): Promise<{
  zones: HistoricalZone[];
  source: "external" | "supabase" | "seed";
}> {
  const admin = getSupabaseAdmin();
  const externalUrl = process.env.HISTORICAL_FLOOD_DATA_URL;

  if (externalUrl) {
    try {
      const response = await fetch(externalUrl, { cache: "no-store" });
      if (response.ok) {
        const raw = (await response.json()) as unknown;
        const rows = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown[] }).data)
            ? (raw as { data: unknown[] }).data
            : [];

        const zones = rows
          .map((row, index) => toHistoricalZone(row, index))
          .filter((zone): zone is HistoricalZone => zone !== null)
          .slice(0, 25);

        if (zones.length > 0) {
          if (admin) {
            const payload = zones.map((zone) => ({
              id: zone.id,
              area: zone.area,
              ward_code: zone.wardCode ?? null,
              drainage_zone: zone.drainageZone ?? null,
              lat: zone.lat,
              lng: zone.lng,
              severity_weight: zone.severityWeight,
              historical_flood_count: zone.historicalFloodCount,
              target_department_id: zone.targetDepartmentId,
              data_source: "external",
              ingested_at: nowISO(),
            }));

            const { error } = await admin
              .from("ops_historical_flood_zones")
              .upsert(payload, { onConflict: "id" });

            if (error) {
              console.warn("Historical zone upsert failed", error.message);
            }
          }
          return { zones, source: "external" };
        }
      }
    } catch {
      // fall through to Supabase/seed fallback
    }
  }

  if (admin) {
    try {
      const { data, error } = await admin
        .from("ops_historical_flood_zones")
        .select("*")
        .limit(25);

      if (!error && Array.isArray(data) && data.length > 0) {
        const zones = data
          .map((row, index) =>
            toHistoricalZone(
              {
                id: row.id,
                area: row.area,
                wardCode: row.ward_code ?? row.wardCode,
                drainageZone: row.drainage_zone ?? row.drainageZone,
                lat: row.lat,
                lng: row.lng,
                severityWeight: row.severity_weight ?? row.severityWeight,
                historicalFloodCount: row.historical_flood_count ?? row.historicalFloodCount,
                targetDepartmentId: row.target_department_id ?? row.targetDepartmentId,
              },
              index,
            ),
          )
          .filter((zone): zone is HistoricalZone => zone !== null);

        if (zones.length > 0) {
          return { zones, source: "supabase" };
        }
      }
    } catch {
      // fall through to seed fallback
    }
  }

  const seedZones = historicalZonesSeed
    .map((row, index) => toHistoricalZone(row, index))
    .filter((zone): zone is HistoricalZone => zone !== null);
  return { zones: seedZones, source: "seed" };
}

function groupFloodHotspots(issues: IssueRecord[]): RiskHotspot[] {
  const grouped = new Map<string, RiskHotspot>();
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  for (const issue of issues) {
    if (!isFloodRelated(issue)) continue;
    if (!Number.isFinite(issue.lat) || !Number.isFinite(issue.lng)) continue;

    const cellKey = `${issue.lat.toFixed(3)}:${issue.lng.toFixed(3)}`;
    const existing = grouped.get(cellKey);
    const isRecent = now - new Date(issue.createdAt).getTime() <= thirtyDaysMs;

    if (!existing) {
      grouped.set(cellKey, {
        area: issue.locationAddress || issue.area || "Unknown location",
        lat: issue.lat,
        lng: issue.lng,
        totalSignals: 1,
        recentSignals: isRecent ? 1 : 0,
      });
      continue;
    }

    existing.totalSignals += 1;
    if (isRecent) existing.recentSignals += 1;
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.totalSignals - a.totalSignals)
    .slice(0, 6);
}

async function fetchRainForecast(lat: number, lng: number): Promise<{ date: string; rainMm: number }> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "precipitation_sum",
    timezone: "auto",
    forecast_days: "5",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Forecast API failed with ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const times = data.daily?.time ?? [];
  const sums = data.daily?.precipitation_sum ?? [];

  let maxIndex = 0;
  for (let i = 1; i < sums.length; i += 1) {
    if ((sums[i] ?? 0) > (sums[maxIndex] ?? 0)) {
      maxIndex = i;
    }
  }

  return {
    date: times[maxIndex] ?? new Date().toISOString().slice(0, 10),
    rainMm: Number((sums[maxIndex] ?? 0).toFixed(1)),
  };
}

function buildWarning(level: FloodRiskLevel, rainMm: number, date: string, area: string): string {
  const readableDate = new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  if (level === "Critical") {
    return `Warning: Very heavy rain around ${readableDate} can trigger flooding and severe water logging near ${area}.`;
  }
  if (level === "High") {
    return `Warning: Heavy rainfall around ${readableDate} may cause flooding and water logging near ${area}.`;
  }
  if (level === "Moderate") {
    return `Alert: Rainfall risk on ${readableDate} may create local drainage stress in ${area}.`;
  }

  return `Advisory: Rainfall forecast near ${rainMm} mm around ${readableDate} shows low flood risk in ${area}.`;
}

async function summarizeWithGemini(alerts: FloodRiskAlert[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || alerts.length === 0) {
    return null;
  }

  const top = alerts
    .slice(0, 3)
    .map(
      (a, idx) =>
        `${idx + 1}. ${a.area} | level=${a.riskLevel} | score=${a.riskScore.toFixed(2)} | rain=${a.expectedRainMm}mm | date=${a.expectedDate}`,
    )
    .join("\n");

  const prompt = [
    "You are assisting a municipal commissioner dashboard.",
    "Write one concise operational warning paragraph (max 65 words).",
    "Mention the highest-risk location first and include the expected date.",
    "Keep tone factual, no hype.",
    "Data:",
    top,
  ].join("\n");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 120,
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function persistRiskSnapshot(alerts: FloodRiskAlert[], summary: string | null): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }

  try {
    const { data, error } = await admin
      .from("ops_risk_alerts")
      .insert({
        created_at: nowISO(),
        summary: summary ?? null,
        alerts_count: alerts.length,
        alerts,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data?.id ? String(data.id) : null;
  } catch (error) {
    console.error("Failed to persist risk snapshot", error);
    return null;
  }
}

async function runPreventiveAutomation(alerts: FloodRiskAlert[]): Promise<{ tasksCreated: number; notificationsCreated: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { tasksCreated: 0, notificationsCreated: 0 };
  }

  let tasksCreated = 0;
  let notificationsCreated = 0;

  const { data: usersData } = await admin.from("ops_users").select("*");
  const users = Array.isArray(usersData) ? usersData : [];

  for (const alert of alerts) {
    if (!(alert.riskLevel === "High" || alert.riskLevel === "Critical")) {
      continue;
    }

    const dedupeKey = `${alert.id}:${alert.expectedDate}`;

    const { data: existingRows, error: dedupeError } = await admin
      .from("ops_preventive_tasks")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .limit(1);

    if (dedupeError) {
      console.warn("Preventive task dedupe check failed", dedupeError.message);
      continue;
    }

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      continue;
    }

    const { error: taskError } = await admin.from("ops_preventive_tasks").insert({
      dedupe_key: dedupeKey,
      created_at: nowISO(),
      status: "Open",
      type: "flood_prevention",
      title: `Preventive flood readiness for ${alert.area}`,
      area: alert.area,
      risk_level: alert.riskLevel,
      expected_date: alert.expectedDate,
      risk_score: alert.riskScore,
      confidence_score: alert.confidenceScore,
      target_department_id: alert.targetDepartmentId,
      recommended_action: alert.recommendedAction,
      source_tags: alert.sourceTags,
    });

    if (taskError) {
      console.warn("Preventive task insert failed", taskError.message);
      continue;
    }

    tasksCreated += 1;

    const handlers = users.filter((user) => {
      const role = String(user.role ?? "").toLowerCase();
      const departmentId = String(user.department_id ?? user.departmentId ?? "");
      const active = user.active !== false && user.is_active !== false;
      if (!active) {
        return false;
      }
      if (departmentId !== alert.targetDepartmentId) {
        return false;
      }
      return role === "zonal_officer" || role === "department_head";
    });

    if (!handlers.length) {
      continue;
    }

    const notificationRows = handlers.map((handler) => ({
      user_id: String(handler.id),
      title: `Preventive task created (${alert.riskLevel})`,
      body: `Flood-risk readiness task created for ${alert.area}.`,
      type: "preventive_task",
      is_read: false,
      created_at: nowISO(),
    }));

    const { error: notificationError } = await admin
      .from("ops_notifications")
      .insert(notificationRows);

    if (notificationError) {
      console.warn("Preventive notification insert failed", notificationError.message);
      continue;
    }

    notificationsCreated += notificationRows.length;
  }

  return { tasksCreated, notificationsCreated };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { issues?: IssueRecord[] };
    const issues = Array.isArray(body.issues) ? body.issues : [];

    if (issues.length === 0) {
      return NextResponse.json({ alerts: [], summary: null });
    }

    const hotspots = groupFloodHotspots(issues);
    const { zones, source } = await loadHistoricalZones();
    const alerts: FloodRiskAlert[] = [];

    for (const zone of zones.slice(0, 8)) {
      try {
        const forecast = await fetchRainForecast(zone.lat, zone.lng);
        const nearbySignals = hotspots.filter(
          (hotspot) => distanceKm(zone.lat, zone.lng, hotspot.lat, hotspot.lng) <= 1.8,
        );
        const totalSignals = nearbySignals.reduce((acc, item) => acc + item.totalSignals, 0);
        const recentSignals = nearbySignals.reduce((acc, item) => acc + item.recentSignals, 0);

        const rainNorm = clamp(forecast.rainMm / 80, 0, 1);
        const historicalNorm = clamp(
          zone.severityWeight * 0.6 + clamp(zone.historicalFloodCount / 15, 0, 1) * 0.4,
          0,
          1,
        );
        const trendNorm = clamp(recentSignals / Math.max(1, totalSignals || 1), 0, 1);
        const riskScore = clamp(
          0.45 * rainNorm + 0.35 * historicalNorm + 0.2 * trendNorm,
          0,
          1,
        );

        const level = riskLevelFromScore(riskScore);
        const confidenceScore = clamp(
          0.35 + 0.3 * historicalNorm + 0.2 * rainNorm + 0.15 * trendNorm,
          0,
          1,
        );

        const sourceTags: FloodRiskSourceTag[] = ["forecast"];
        if (source === "external" || source === "supabase" || source === "seed") {
          sourceTags.push("history");
        }
        if (totalSignals > 0) {
          sourceTags.push("issue_trend");
        }

        alerts.push({
          id: `risk-${zone.id}`,
          area: zone.area,
          wardCode: zone.wardCode,
          drainageZone: zone.drainageZone,
          lat: zone.lat,
          lng: zone.lng,
          riskLevel: level,
          riskScore: Number(riskScore.toFixed(2)),
          confidenceScore: Number(confidenceScore.toFixed(2)),
          sourceTags,
          expectedDate: forecast.date,
          expectedRainMm: forecast.rainMm,
          historicalFloodSignals: zone.historicalFloodCount + totalSignals,
          warning: buildWarning(level, forecast.rainMm, forecast.date, zone.area),
          recommendedAction:
            level === "Critical" || level === "High"
              ? "Pre-position pumping teams, clear drains, and place emergency response staff on standby."
              : "Monitor drainage complaints and keep field teams ready for quick dispatch.",
          targetDepartmentId: zone.targetDepartmentId,
        });
      } catch {
        continue;
      }
    }

    if (alerts.length === 0) {
      for (const hotspot of hotspots.slice(0, 4)) {
        try {
          const forecast = await fetchRainForecast(hotspot.lat, hotspot.lng);
          const rainNorm = clamp(forecast.rainMm / 80, 0, 1);
          const trendNorm = clamp(
            hotspot.recentSignals / Math.max(1, hotspot.totalSignals),
            0,
            1,
          );
          const riskScore = clamp(0.75 * rainNorm + 0.25 * trendNorm, 0, 1);
          const level = riskLevelFromScore(riskScore);

          alerts.push({
            id: `risk-hotspot-${hotspot.lat.toFixed(3)}-${hotspot.lng.toFixed(3)}`,
            area: hotspot.area,
            lat: hotspot.lat,
            lng: hotspot.lng,
            riskLevel: level,
            riskScore: Number(riskScore.toFixed(2)),
            confidenceScore: Number((0.45 + 0.35 * rainNorm + 0.2 * trendNorm).toFixed(2)),
            sourceTags: ["forecast", "issue_trend"],
            expectedDate: forecast.date,
            expectedRainMm: forecast.rainMm,
            historicalFloodSignals: hotspot.totalSignals,
            warning: buildWarning(level, forecast.rainMm, forecast.date, hotspot.area),
            recommendedAction:
              level === "Critical" || level === "High"
                ? "Pre-position pumping teams and monitor drainage chokepoints proactively."
                : "Continue monitoring rainfall and complaint inflow.",
            targetDepartmentId: "dept-6",
          });
        } catch {
          continue;
        }
      }
    }

    alerts.sort((a, b) => b.riskScore - a.riskScore);
    const summary = await summarizeWithGemini(alerts);
    const topAlerts = alerts.slice(0, 4);

    if (summary) {
      for (const alert of topAlerts) {
        if (!alert.sourceTags.includes("gemini_summary")) {
          alert.sourceTags.push("gemini_summary");
        }
      }
    }

    const snapshotId = await persistRiskSnapshot(topAlerts, summary);
    const automation = await runPreventiveAutomation(topAlerts);

    return NextResponse.json({
      alerts: topAlerts,
      summary,
      snapshotId,
      automation,
      historySource: source,
    });
  } catch (error) {
    console.error("Failed to compute flood risk alerts", error);
    return NextResponse.json(
      { error: "Failed to compute flood risk alerts" },
      { status: 500 },
    );
  }
}
