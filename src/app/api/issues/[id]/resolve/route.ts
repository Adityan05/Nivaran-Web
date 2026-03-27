import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const TABLE_ISSUES = "issues";
const TABLE_USERS = "ops_users";
const TABLE_EVENTS = "ops_issue_events";
const TABLE_NOTIFICATIONS = "ops_notifications";

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeRole(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isEngineerRole(role: string): boolean {
  return (
    role === "engineer" ||
    role === "je" ||
    role === "junior engineer" ||
    role === "supervisor"
  );
}

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, { params }: RouteContext) {
  const resolvedParams = await Promise.resolve(params);
  const issueId = String(resolvedParams.id ?? "").trim();

  if (!issueId) {
    return NextResponse.json(
      { ok: false, message: "Missing issue ID." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Server is missing Supabase service-role configuration. Add SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body." },
      { status: 400 },
    );
  }

  const actorId = String(formData.get("actorId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const evidence = formData.get("evidence");

  if (!actorId) {
    return NextResponse.json(
      { ok: false, message: "Missing actor ID." },
      { status: 400 },
    );
  }

  if (!(evidence instanceof File) || evidence.size <= 0) {
    return NextResponse.json(
      { ok: false, message: "Evidence image is required." },
      { status: 400 },
    );
  }

  const { data: actor, error: actorError } = await admin
    .from(TABLE_USERS)
    .select("id, full_name, role")
    .eq("id", actorId)
    .maybeSingle();

  if (actorError || !actor) {
    return NextResponse.json(
      { ok: false, message: "Actor profile not found." },
      { status: 404 },
    );
  }

  const actorRole = normalizeRole(actor.role);
  if (!isEngineerRole(actorRole)) {
    return NextResponse.json(
      { ok: false, message: "Only engineers can resolve with evidence." },
      { status: 403 },
    );
  }

  const { data: issue, error: issueError } = await admin
    .from(TABLE_ISSUES)
    .select("id, status, assigned_to_id")
    .eq("id", issueId)
    .maybeSingle();

  if (issueError || !issue) {
    return NextResponse.json(
      { ok: false, message: "Issue not found." },
      { status: 404 },
    );
  }

  if (issue.assigned_to_id && String(issue.assigned_to_id) !== actorId) {
    return NextResponse.json(
      {
        ok: false,
        message: "You are not assigned to this issue, so you cannot resolve it.",
      },
      { status: 403 },
    );
  }

  const currentStatus = String(issue.status ?? "");
  if (currentStatus === "Resolved") {
    return NextResponse.json(
      { ok: true, message: "Issue is already resolved." },
      { status: 200 },
    );
  }

  if (currentStatus === "Rejected") {
    return NextResponse.json(
      { ok: false, message: "Rejected issues cannot be resolved." },
      { status: 400 },
    );
  }

  const storagePath = issueId;
  const { error: uploadError } = await admin.storage
    .from("resolved_images")
    .upload(storagePath, evidence, {
      contentType: evidence.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        ok: false,
        message: `Evidence upload failed: ${uploadError.message}`,
      },
      { status: 400 },
    );
  }

  const { data: publicData } = admin.storage
    .from("resolved_images")
    .getPublicUrl(storagePath);
  const evidenceUrl = publicData?.publicUrl;

  if (!evidenceUrl) {
    return NextResponse.json(
      {
        ok: false,
        message: "Evidence uploaded but URL generation failed.",
      },
      { status: 500 },
    );
  }

  const resolvedAt = nowISO();
  const issueBaseUpdate = {
    status: "Resolved",
    is_unresolved: false,
    resolution_timestamp: resolvedAt,
    last_status_update_at: resolvedAt,
    last_status_update_by: String(actor.full_name ?? "Engineer"),
    updated_at: resolvedAt,
  } as const;

  const evidenceCandidates: unknown[] = [
    [evidenceUrl],
    JSON.stringify([evidenceUrl]),
    evidenceUrl,
  ];

  let issueUpdateError: string | null = null;
  for (const evidenceValue of evidenceCandidates) {
    const { error } = await admin
      .from(TABLE_ISSUES)
      .update({
        ...issueBaseUpdate,
        evidence_images: evidenceValue,
      })
      .eq("id", issueId);

    if (!error) {
      issueUpdateError = null;
      break;
    }

    issueUpdateError = error.message;
  }

  if (issueUpdateError) {
    return NextResponse.json(
      {
        ok: false,
        message: `Evidence uploaded but issue update failed: ${issueUpdateError}`,
      },
      { status: 500 },
    );
  }

  const actorName = String(actor.full_name ?? "Engineer");
  const evidenceNote = note
    ? `${note}\nEvidence: ${evidenceUrl}`
    : `Evidence captured and uploaded. ${evidenceUrl}`;

  const { error: eventError } = await admin.from(TABLE_EVENTS).insert({
    issue_id: issueId,
    type: "status_change",
    title: "Status changed to Resolved",
    note: evidenceNote,
    actor_id: actorId,
    actor_name: actorName,
    created_at: resolvedAt,
  });

  if (eventError) {
    console.warn("Issue event persistence failed", eventError.message);
  }

  if (issue.assigned_to_id) {
    const { error: notificationError } = await admin
      .from(TABLE_NOTIFICATIONS)
      .insert({
        user_id: issue.assigned_to_id,
        title: "Status changed: Resolved",
        body: `${issueId} moved to Resolved.`,
        type: "status_change",
        issue_id: issueId,
        is_read: false,
        created_at: resolvedAt,
      });

    if (notificationError) {
      console.warn(
        "Notification persistence failed",
        notificationError.message,
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      evidenceUrl,
      resolvedAt,
      actorName,
    },
    { status: 200 },
  );
}
