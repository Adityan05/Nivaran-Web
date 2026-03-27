"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import {
  AppNotification,
  Department,
  FloodRiskAlert,
  IssueComment,
  IssueEvent,
  IssueRecord,
  IssueStatus,
  TeamMember,
  Urgency,
} from "@/lib/types";
import { mockDepartments } from "@/lib/mock-data";
import {
  canAssignToUser,
  canRerouteIssue,
  getAllowedStatusTransitions,
} from "@/lib/access";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { inferZoneId } from "@/lib/zones";

type SessionUser = TeamMember | null;

type JsonObject = Record<string, unknown>;

const TABLE_USERS = "ops_users";
const TABLE_DEPARTMENTS = "departments";
const TABLE_ISSUES = "issues";
const TABLE_NOTIFICATIONS = "ops_notifications";
const TABLE_ISSUE_EVENTS = "ops_issue_events";
const TABLE_ISSUE_COMMENTS = "ops_issue_comments";

interface AppState {
  initialized: boolean;
  sessionUser: SessionUser;
  users: TeamMember[];
  issues: IssueRecord[];
  events: IssueEvent[];
  comments: IssueComment[];
  notifications: AppNotification[];
  departments: Department[];
  floodRiskAlerts: FloodRiskAlert[];
  floodRiskSummary: string | null;
  floodRiskUpdatedAt: string | null;
  floodRiskLoading: boolean;
  floodRiskAutomationNote: string | null;
  liveOpsStatusSummary: string | null;
  liveOpsStatusSignature: string | null;
  liveOpsStatusUpdatedAt: string | null;
  liveOpsStatusLoading: boolean;
  initMockData: () => Promise<void>;
  refreshFloodRiskAlerts: (issues: IssueRecord[]) => Promise<void>;
  refreshLiveOpsStatus: (issues: IssueRecord[]) => Promise<void>;
  loginAs: (email: string, password: string) => Promise<{ ok: boolean; message: string }>;
  logout: () => void;
  assignIssue: (issueId: string, assigneeId: string, actorId: string) => void;
  rerouteIssue: (
    issueId: string,
    targetDepartmentId: string,
    actorId: string,
    note?: string,
  ) => void;
  updateIssueStatus: (
    issueId: string,
    status: IssueStatus,
    actorId: string,
    note?: string,
  ) => void;
  resolveIssueWithEvidence: (
    issueId: string,
    actorId: string,
    imageBlob: Blob,
    note?: string,
  ) => Promise<{ ok: boolean; message: string }>;
  addComment: (issueId: string, actorId: string, text: string) => void;
  markNotificationRead: (notificationId: string) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function asISO(input: unknown): string {
  if (!input) {
    return new Date().toISOString();
  }

  if (typeof input === "string") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  return new Date().toISOString();
}

function normalizeRole(role: unknown): TeamMember["role"] | null {
  const value = String(role ?? "").trim().toLowerCase();

  if (value === "commissioner" || value === "super_admin" || value === "superadmin") {
    return "commissioner";
  }

  if (value === "department_head" || value === "department head") {
    return "department_head";
  }

  if (value === "zonal_officer" || value === "zonal officer" || value === "zone_officer") {
    return "zonal_officer";
  }

  if (value === "engineer" || value === "je" || value === "junior engineer" || value === "supervisor") {
    return "engineer";
  }

  return null;
}

function normalizeStatus(status: unknown): IssueStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "reported") return "Reported";
  if (value === "acknowledged") return "Acknowledged";
  if (value === "in progress" || value === "in_progress") return "In Progress";
  if (value === "resolved") return "Resolved";
  if (value === "verified") return "Verified";
  if (value === "rejected") return "Rejected";
  if (value === "assigned to department") return "Reported";
  if (value === "assigned to supervisor") return "Acknowledged";
  return "Reported";
}

function normalizeUrgency(urgency: unknown): Urgency {
  const value = String(urgency ?? "").trim().toLowerCase();
  if (value === "high") return "High";
  if (value === "low") return "Low";
  return "Medium";
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function normalizeVoters(value: unknown): Record<string, "upvote" | "downvote"> {
  let parsed: unknown = value;

  if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const source = parsed as Record<string, unknown>;
  const voters: Record<string, "upvote" | "downvote"> = {};

  for (const [key, vote] of Object.entries(source)) {
    const normalizedVote = String(vote ?? "").toLowerCase();
    if (normalizedVote === "up" || normalizedVote === "upvote") {
      voters[key] = "upvote";
      continue;
    }

    if (normalizedVote === "down" || normalizedVote === "downvote") {
      voters[key] = "downvote";
    }
  }

  return voters;
}

function dueAtFromRow(row: JsonObject): string {
  const due = row.due_at ?? row.dueAt;
  if (due) {
    return asISO(due);
  }

  const created = asISO(row.created_at ?? row.createdAt);
  const createdMs = new Date(created).getTime();
  if (!Number.isFinite(createdMs)) {
    return nowISO();
  }

  return new Date(createdMs + 24 * 60 * 60 * 1000).toISOString();
}

function mapDepartmentRow(row: JsonObject): Department {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: row.description ? String(row.description) : undefined,
    createdAt: row.created_at ? asISO(row.created_at) : undefined,
  };
}

function mapUserRow(row: JsonObject): TeamMember | null {
  const role = normalizeRole(row.role);
  if (!role) {
    return null;
  }

  const zoneId = inferZoneId({
    explicitZoneId: row.zone_id ?? row.zoneId,
    area: row.area ?? row.zone_name,
  });

  return {
    id: String(row.id ?? ""),
    fullName: String(row.full_name ?? row.fullName ?? row.name ?? "Unknown"),
    email: String(row.email ?? ""),
    password: row.login_password ? String(row.login_password) : undefined,
    role,
    departmentId: String(row.department_id ?? row.departmentId ?? ""),
    area: String(row.area ?? row.zone_name ?? ""),
    zoneId,
    workload: Number(row.workload ?? 0),
    active: row.active !== false && row.is_active !== false,
  };
}

function mapIssueRow(row: JsonObject): IssueRecord {
  const lat = Number(row.location_lat ?? row.lat ?? 0);
  const lng = Number(row.location_lng ?? row.lng ?? 0);
  const imageUrls = toStringArray(row.image_urls ?? row.imageUrls);
  const imageUrl = String(row.image_url ?? row.imageUrl ?? imageUrls[0] ?? "");
  const evidenceImages = toStringArray(row.evidence_images ?? row.evidenceImages);
  const status = normalizeStatus(row.status);
  const locationAddress = String(row.location_address ?? row.locationAddress ?? "");
  const zoneId = inferZoneId({
    explicitZoneId: row.zone_id ?? row.zoneId,
    area: row.area ?? locationAddress,
    lat,
    lng,
  });

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "Civic issue report"),
    description: String(row.description ?? ""),
    category: String(row.category ?? "General"),
    urgency: normalizeUrgency(row.urgency),
    status,
    area: String(row.area ?? ""),
    assignedDepartmentId: String(row.assigned_department_id ?? row.assignedDepartmentId ?? ""),
    assignedToId:
      typeof row.assigned_to_id === "string" && row.assigned_to_id
        ? row.assigned_to_id
        : typeof row.assignedToId === "string" && row.assignedToId
          ? row.assignedToId
          : undefined,
    reporterName: String(row.reporter_name ?? row.reporterName ?? row.username ?? "Citizen"),
    createdAt: asISO(row.created_at ?? row.createdAt),
    dueAt: dueAtFromRow(row),
    affectedUsersCount: Number(row.affected_users_count ?? row.affectedUsersCount ?? 0),
    tags: toStringArray(row.tags),
    imageUrl,
    locationAddress,
    zoneId,
    lat,
    lng,
    userId: row.user_id ? String(row.user_id) : row.userId ? String(row.userId) : undefined,
    username: row.username ? String(row.username) : undefined,
    upvotes: Number(row.upvotes ?? 0),
    downvotes: Number(row.downvotes ?? 0),
    commentsCount: Number(row.comments_count ?? row.commentsCount ?? 0),
    isUnresolved:
      typeof row.is_unresolved === "boolean"
        ? row.is_unresolved
        : typeof row.isUnresolved === "boolean"
          ? row.isUnresolved
          : !["Resolved", "Verified", "Rejected"].includes(status),
    lastStatusUpdateAt:
      row.last_status_update_at || row.lastStatusUpdateAt
        ? asISO(row.last_status_update_at ?? row.lastStatusUpdateAt)
        : undefined,
    lastStatusUpdateBy: row.last_status_update_by
      ? String(row.last_status_update_by)
      : row.lastStatusUpdateBy
        ? String(row.lastStatusUpdateBy)
        : undefined,
    assignedDepartment: row.assigned_department
      ? String(row.assigned_department)
      : row.assignedDepartment
        ? String(row.assignedDepartment)
        : undefined,
    affectedUserIds: toStringArray(row.affected_user_ids ?? row.affectedUserIds),
    voters: normalizeVoters(row.voters),
    duplicateOfIssueId: row.duplicate_of_issue_id
      ? String(row.duplicate_of_issue_id)
      : row.duplicateOfIssueId
        ? String(row.duplicateOfIssueId)
        : undefined,
    evidenceImages,
  };
}

function mapEventRow(row: JsonObject): IssueEvent {
  return {
    id: String(row.id ?? uid("evt")),
    issueId: String(row.issue_id ?? row.issueId ?? ""),
    type: (row.type as IssueEvent["type"]) ?? "created",
    title: String(row.title ?? "Event"),
    note: row.note ? String(row.note) : undefined,
    actorId: String(row.actor_id ?? row.actorId ?? "system"),
    actorName: String(row.actor_name ?? row.actorName ?? "System"),
    createdAt: asISO(row.created_at ?? row.createdAt),
  };
}

function mapCommentRow(row: JsonObject): IssueComment {
  return {
    id: String(row.id ?? uid("cmt")),
    issueId: String(row.issue_id ?? row.issueId ?? ""),
    actorId: String(row.actor_id ?? row.actorId ?? "system"),
    actorName: String(row.actor_name ?? row.actorName ?? "System"),
    text: String(row.text ?? ""),
    createdAt: asISO(row.created_at ?? row.createdAt),
  };
}

function mapNotificationRow(row: JsonObject): AppNotification {
  return {
    id: String(row.id ?? uid("ntf")),
    userId: String(row.user_id ?? row.userId ?? ""),
    title: String(row.title ?? "Notification"),
    body: String(row.body ?? ""),
    isRead: Boolean(row.is_read ?? row.isRead),
    createdAt: asISO(row.created_at ?? row.createdAt),
    issueId: row.issue_id ? String(row.issue_id) : row.issueId ? String(row.issueId) : undefined,
  };
}

function safeStorage(): StateStorage {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return localStorage;
}

async function insertEvent(event: {
  issueId: string;
  type: IssueEvent["type"];
  title: string;
  note?: string;
  actorId: string;
  actorName: string;
}) {
  const { error } = await supabase.from(TABLE_ISSUE_EVENTS).insert({
    issue_id: event.issueId,
    type: event.type,
    title: event.title,
    note: event.note ?? null,
    actor_id: event.actorId,
    actor_name: event.actorName,
    created_at: nowISO(),
  });

  if (error) {
    console.warn("Issue event persistence failed", error.message);
  }
}

async function insertNotifications(rows: Array<{
  userId: string;
  title: string;
  body: string;
  issueId?: string;
  type?: string;
}>) {
  if (!rows.length) {
    return;
  }

  const payload = rows.map((row) => ({
    user_id: row.userId,
    title: row.title,
    body: row.body,
    type: row.type ?? null,
    issue_id: row.issueId ?? null,
    is_read: false,
    created_at: nowISO(),
  }));

  const { error } = await supabase.from(TABLE_NOTIFICATIONS).insert(payload);
  if (error) {
    console.warn("Notification persistence failed", error.message);
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      initialized: false,
      sessionUser: null,
      users: [],
      issues: [],
      events: [],
      comments: [],
      notifications: [],
      departments: [],
      floodRiskAlerts: [],
      floodRiskSummary: null,
      floodRiskUpdatedAt: null,
      floodRiskLoading: false,
      floodRiskAutomationNote: null,
      liveOpsStatusSummary: null,
      liveOpsStatusSignature: null,
      liveOpsStatusUpdatedAt: null,
      liveOpsStatusLoading: false,

      initMockData: async () => {
        if (typeof window === "undefined") {
          return;
        }

        if (!isSupabaseConfigured) {
          console.warn(
            "Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
          );
          set({
            initialized: true,
            users: [],
            issues: [],
            events: [],
            comments: [],
            notifications: [],
            departments: mockDepartments,
            sessionUser: null,
          });
          return;
        }

        try {
          const [usersRes, departmentsRes, issuesRes, eventsRes, commentsRes, notificationsRes] =
            await Promise.all([
              supabase.from(TABLE_USERS).select("*"),
              supabase.from(TABLE_DEPARTMENTS).select("*"),
              supabase.from(TABLE_ISSUES).select("*").order("created_at", { ascending: false }),
              supabase.from(TABLE_ISSUE_EVENTS).select("*").order("created_at", { ascending: false }),
              supabase.from(TABLE_ISSUE_COMMENTS).select("*").order("created_at", { ascending: false }),
              supabase.from(TABLE_NOTIFICATIONS).select("*").order("created_at", { ascending: false }),
            ]);

          if (usersRes.error) {
            throw usersRes.error;
          }
          if (departmentsRes.error) {
            throw departmentsRes.error;
          }
          if (issuesRes.error) {
            throw issuesRes.error;
          }

          const userRows = (usersRes.data ?? []) as JsonObject[];
          const departmentRows = (departmentsRes.data ?? []) as JsonObject[];
          const issueRows = (issuesRes.data ?? []) as JsonObject[];
          const eventRows = (eventsRes.data ?? []) as JsonObject[];
          const commentRows = (commentsRes.data ?? []) as JsonObject[];
          const notificationRows = (notificationsRes.data ?? []) as JsonObject[];

          const users = userRows
            .map((row) => mapUserRow((row ?? {}) as JsonObject))
            .filter((user): user is TeamMember => user !== null);

          const departments =
            departmentRows.length > 0
              ? departmentRows.map((row) => mapDepartmentRow((row ?? {}) as JsonObject))
              : mockDepartments;

          const issues = issueRows.map((row) => mapIssueRow((row ?? {}) as JsonObject));

          const events = eventsRes.error
            ? []
            : eventRows.map((row) => mapEventRow((row ?? {}) as JsonObject));

          const comments = commentsRes.error
            ? []
            : commentRows.map((row) => mapCommentRow((row ?? {}) as JsonObject));

          const notifications = notificationsRes.error
            ? []
            : notificationRows.map((row) => mapNotificationRow((row ?? {}) as JsonObject));

          const currentSessionId = get().sessionUser?.id;
          const nextSession = currentSessionId
            ? users.find((u) => u.id === currentSessionId) ?? null
            : null;

          set({
            initialized: true,
            users,
            issues,
            events,
            comments,
            notifications,
            departments,
            sessionUser: nextSession,
          });
        } catch (error) {
          console.error("Failed to load Supabase ops data.", error);
          set({
            initialized: true,
            users: [],
            issues: [],
            events: [],
            comments: [],
            notifications: [],
            departments: [],
            sessionUser: null,
          });
        }
      },

      refreshFloodRiskAlerts: async (issues) => {
        const state = get();
        const now = Date.now();
        const lastUpdated = state.floodRiskUpdatedAt
          ? new Date(state.floodRiskUpdatedAt).getTime()
          : 0;

        if (state.floodRiskLoading || (lastUpdated && now - lastUpdated < 15 * 60 * 1000)) {
          return;
        }

        const payload = issues
          .filter((issue) => Number.isFinite(issue.lat) && Number.isFinite(issue.lng))
          .map((issue) => ({
            id: issue.id,
            title: issue.title,
            description: issue.description,
            category: issue.category,
            tags: issue.tags,
            createdAt: issue.createdAt,
            lat: issue.lat,
            lng: issue.lng,
            locationAddress: issue.locationAddress,
            area: issue.area,
          }));

        if (payload.length === 0) {
          set({
            floodRiskAlerts: [],
            floodRiskSummary: null,
            floodRiskUpdatedAt: nowISO(),
            floodRiskLoading: false,
            floodRiskAutomationNote: null,
          });
          return;
        }

        set({ floodRiskLoading: true });

        try {
          const response = await fetch("/api/flood-risk", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ issues: payload }),
          });

          if (!response.ok) {
            throw new Error(`Flood risk API failed with ${response.status}`);
          }

          const data = (await response.json()) as {
            alerts?: FloodRiskAlert[];
            summary?: string | null;
            automation?: {
              tasksCreated?: number;
              notificationsCreated?: number;
            };
          };

          const tasksCreated = Number(data.automation?.tasksCreated ?? 0);
          const notificationsCreated = Number(
            data.automation?.notificationsCreated ?? 0,
          );
          const automationNote =
            tasksCreated > 0 || notificationsCreated > 0
              ? `Auto-created ${tasksCreated} preventive task(s) and ${notificationsCreated} notification(s).`
              : "No new preventive tasks were required in this refresh.";

          set({
            floodRiskAlerts: Array.isArray(data.alerts) ? data.alerts : [],
            floodRiskSummary: data.summary ?? null,
            floodRiskUpdatedAt: nowISO(),
            floodRiskLoading: false,
            floodRiskAutomationNote: automationNote,
          });
        } catch (error) {
          console.error("Failed to refresh flood risk alerts.", error);
          set({
            floodRiskLoading: false,
            floodRiskUpdatedAt: nowISO(),
            floodRiskAutomationNote:
              "Risk refresh failed. Automation status could not be confirmed.",
          });
        }
      },

      refreshLiveOpsStatus: async (issues) => {
        const state = get();
        if (state.liveOpsStatusLoading) {
          return;
        }

        const signature = issues
          .map((issue) => `${issue.id}:${issue.status}`)
          .sort()
          .join("|");

        if (
          signature &&
          state.liveOpsStatusSignature === signature &&
          state.liveOpsStatusSummary
        ) {
          return;
        }

        const payload = issues.map((issue) => ({
          id: issue.id,
          status: issue.status,
          assignedDepartmentId: issue.assignedDepartmentId,
        }));

        set({ liveOpsStatusLoading: true });

        try {
          const response = await fetch("/api/live-ops-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              signature,
              issues: payload,
            }),
          });

          if (!response.ok) {
            throw new Error(`Live ops status API failed with ${response.status}`);
          }

          const data = (await response.json()) as {
            summary?: string;
            signature?: string;
          };

          set({
            liveOpsStatusSummary:
              data.summary ??
              "Operations summary is currently unavailable. Keep tracking open issue queues.",
            liveOpsStatusSignature: data.signature ?? signature,
            liveOpsStatusUpdatedAt: nowISO(),
            liveOpsStatusLoading: false,
          });
        } catch (error) {
          console.error("Failed to refresh live ops status.", error);
          set({
            liveOpsStatusLoading: false,
            liveOpsStatusUpdatedAt: nowISO(),
            liveOpsStatusSummary:
              state.liveOpsStatusSummary ??
              "Operations summary is currently unavailable. Keep tracking open issue queues.",
          });
        }
      },

      loginAs: async (email, password) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) {
          return { ok: false, message: "Email is required." };
        }
        if (!password) {
          return { ok: false, message: "Password is required." };
        }

        const user = get().users.find((u) => u.email.toLowerCase() === normalized);
        if (!user) {
          return { ok: false, message: "No matching ops user profile found for this email." };
        }
        if (!user.password || user.password !== password) {
          return { ok: false, message: "Invalid password." };
        }
        if (!user.active) {
          return { ok: false, message: "This account is deactivated." };
        }

        set({ sessionUser: user });
        return { ok: true, message: "Login successful." };
      },

      logout: () => set({ sessionUser: null }),

      assignIssue: (issueId, assigneeId, actorId) => {
        const state = get();
        const assignee = state.users.find((u) => u.id === assigneeId);
        const actor = state.users.find((u) => u.id === actorId);
        const targetIssue = state.issues.find((issue) => issue.id === issueId);
        if (!assignee || !actor || !targetIssue) {
          return;
        }

        if (!canAssignToUser(actor, assignee, targetIssue)) {
          return;
        }

        const nextStatus: IssueStatus =
          targetIssue.status === "Reported" &&
          (actor.role === "zonal_officer" || actor.role === "commissioner")
            ? "Acknowledged"
            : targetIssue.status;

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  assignedToId: assigneeId,
                  status: nextStatus,
                  lastStatusUpdateAt: nowISO(),
                  lastStatusUpdateBy: actor.fullName,
                }
              : issue,
          ),
          events: [
            {
              id: uid("evt"),
              issueId,
              type: "assignment",
              title: `Assigned to ${assignee.fullName}`,
              actorId,
              actorName: actor.fullName,
              createdAt: nowISO(),
            },
            ...state.events,
          ],
          notifications: [
            {
              id: uid("ntf"),
              userId: assigneeId,
              title: "New assignment",
              body: `${issueId} has been assigned to you.`,
              isRead: false,
              issueId,
              createdAt: nowISO(),
            },
            ...state.notifications,
          ],
        });

        void (async () => {
          const { error } = await supabase
            .from(TABLE_ISSUES)
            .update({
              assigned_to_id: assigneeId,
              assigned_department_id: targetIssue.assignedDepartmentId,
              status: nextStatus,
              last_status_update_at: nowISO(),
              last_status_update_by: actor.fullName,
              updated_at: nowISO(),
            })
            .eq("id", issueId);

          if (error) {
            throw error;
          }

          await insertEvent({
            issueId,
            type: "assignment",
            title: `Assigned to ${assignee.fullName}`,
            actorId,
            actorName: actor.fullName,
          });

          await insertNotifications([
            {
              userId: assigneeId,
              title: "New assignment",
              body: `${issueId} has been assigned to you.`,
              issueId,
              type: "assignment",
            },
          ]);
        })().catch((error) => {
          console.error("Failed to persist assignment update", error);
        });
      },

      rerouteIssue: (issueId, targetDepartmentId, actorId, note) => {
        const state = get();
        const actor = state.users.find((u) => u.id === actorId);
        const targetIssue = state.issues.find((issue) => issue.id === issueId);
        if (!actor || !targetIssue) {
          return;
        }

        if (!canRerouteIssue(actor, targetIssue)) {
          return;
        }

        if (targetIssue.assignedDepartmentId === targetDepartmentId) {
          return;
        }

        const targetDepartment = state.departments.find(
          (d) => d.id === targetDepartmentId,
        );

        const targetHandlers = state.users.filter(
          (u) =>
            u.departmentId === targetDepartmentId &&
            u.active &&
            (u.role === "zonal_officer" || u.role === "department_head"),
        );

        const rerouteNotifications = targetHandlers.map((handler) => ({
          id: uid("ntf"),
          userId: handler.id,
          title: "Issue rerouted to your department",
          body: `${issueId} was rerouted by ${actor.fullName}. Please route it in your zone workflow.`,
          isRead: false,
          issueId,
          createdAt: nowISO(),
        }));

        const nextStatus =
          targetIssue.status === "Resolved" || targetIssue.status === "Rejected"
            ? targetIssue.status
            : "Reported";

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  assignedDepartmentId: targetDepartmentId,
                  assignedDepartment: targetDepartment?.name,
                  assignedToId: undefined,
                  status: nextStatus,
                  lastStatusUpdateAt: nowISO(),
                  lastStatusUpdateBy: actor.fullName,
                }
              : issue,
          ),
          events: [
            {
              id: uid("evt"),
              issueId,
              type: "reroute",
              title: `Rerouted to ${targetDepartment?.name ?? targetDepartmentId}`,
              note,
              actorId,
              actorName: actor.fullName,
              createdAt: nowISO(),
            },
            ...state.events,
          ],
          notifications: [...rerouteNotifications, ...state.notifications],
        });

        void (async () => {
          const { error } = await supabase
            .from(TABLE_ISSUES)
            .update({
              assigned_department_id: targetDepartmentId,
              assigned_department: targetDepartment?.name ?? null,
              assigned_to_id: null,
              status: nextStatus,
              last_status_update_at: nowISO(),
              last_status_update_by: actor.fullName,
              updated_at: nowISO(),
            })
            .eq("id", issueId);

          if (error) {
            throw error;
          }

          await insertEvent({
            issueId,
            type: "reroute",
            title: `Rerouted to ${targetDepartment?.name ?? targetDepartmentId}`,
            note,
            actorId,
            actorName: actor.fullName,
          });

          await insertNotifications(
            targetHandlers.map((handler) => ({
              userId: handler.id,
              title: "Issue rerouted to your department",
              body: `${issueId} was rerouted by ${actor.fullName}. Please route it in your zone workflow.`,
              issueId,
              type: "reroute",
            })),
          );
        })().catch((error) => {
          console.error("Failed to persist reroute update", error);
        });
      },

      updateIssueStatus: (issueId, status, actorId, note) => {
        const state = get();
        const actor = state.users.find((u) => u.id === actorId);
        if (!actor) {
          return;
        }

        const targetIssue = state.issues.find((issue) => issue.id === issueId);
        if (!targetIssue) {
          return;
        }

        const allowed = getAllowedStatusTransitions(actor, targetIssue);
        if (!allowed.includes(status)) {
          return;
        }

        if (
          actor.role === "engineer" &&
          status === "Resolved" &&
          (!targetIssue.evidenceImages || targetIssue.evidenceImages.length === 0)
        ) {
          // Engineers must resolve through the camera evidence flow.
          return;
        }

        const nextNotifications = [...state.notifications];
        if (targetIssue.assignedToId) {
          nextNotifications.unshift({
            id: uid("ntf"),
            userId: targetIssue.assignedToId,
            title: `Status changed: ${status}`,
            body: `${issueId} moved to ${status}.`,
            isRead: false,
            issueId,
            createdAt: nowISO(),
          });
        }

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  status,
                  isUnresolved: status !== "Resolved" && status !== "Rejected",
                  lastStatusUpdateAt: nowISO(),
                  lastStatusUpdateBy: actor.fullName,
                }
              : issue,
          ),
          events: [
            {
              id: uid("evt"),
              issueId,
              type: "status_change",
              title: `Status changed to ${status}`,
              note,
              actorId,
              actorName: actor.fullName,
              createdAt: nowISO(),
            },
            ...state.events,
          ],
          notifications: nextNotifications,
        });

        void (async () => {
          const { error } = await supabase
            .from(TABLE_ISSUES)
            .update({
              status,
              is_unresolved: status !== "Resolved" && status !== "Rejected",
              resolution_timestamp: status === "Resolved" ? nowISO() : null,
              last_status_update_at: nowISO(),
              last_status_update_by: actor.fullName,
              updated_at: nowISO(),
            })
            .eq("id", issueId);

          if (error) {
            throw error;
          }

          await insertEvent({
            issueId,
            type: "status_change",
            title: `Status changed to ${status}`,
            note,
            actorId,
            actorName: actor.fullName,
          });

          if (targetIssue.assignedToId) {
            await insertNotifications([
              {
                userId: targetIssue.assignedToId,
                title: `Status changed: ${status}`,
                body: `${issueId} moved to ${status}.`,
                issueId,
                type: "status_change",
              },
            ]);
          }
        })().catch((error) => {
          console.error("Failed to persist status update", error);
        });
      },

      resolveIssueWithEvidence: async (issueId, actorId, imageBlob, note) => {
        const state = get();
        const actor = state.users.find((u) => u.id === actorId);
        if (!actor) {
          return { ok: false, message: "No active user session found." };
        }

        const targetIssue = state.issues.find((issue) => issue.id === issueId);
        if (!targetIssue) {
          return { ok: false, message: "Issue not found." };
        }

        const allowed = getAllowedStatusTransitions(actor, targetIssue);
        if (actor.role !== "engineer" || !allowed.includes("Resolved")) {
          return { ok: false, message: "You are not allowed to resolve this issue." };
        }

        if (!(imageBlob instanceof Blob) || imageBlob.size === 0) {
          return { ok: false, message: "Capture an evidence photo first." };
        }

        const formData = new FormData();
        formData.append("actorId", actorId);
        formData.append("note", note?.trim() ?? "");
        formData.append("evidence", imageBlob, `${issueId}.jpg`);

        let response: Response;
        try {
          response = await fetch(`/api/issues/${encodeURIComponent(issueId)}/resolve`, {
            method: "POST",
            body: formData,
          });
        } catch (error) {
          console.error("Failed to call issue resolve API", error);
          return {
            ok: false,
            message:
              "Could not reach resolution API. Check your internet/tunnel connection and try again.",
          };
        }

        let payload: {
          ok?: boolean;
          message?: string;
          evidenceUrl?: string;
          resolvedAt?: string;
          actorName?: string;
        } | null = null;

        try {
          payload = (await response.json()) as {
            ok?: boolean;
            message?: string;
            evidenceUrl?: string;
            resolvedAt?: string;
            actorName?: string;
          };
        } catch {
          payload = null;
        }

        if (!response.ok || !payload?.ok || !payload.evidenceUrl) {
          return {
            ok: false,
            message: payload?.message?.trim() || "Evidence upload failed.",
          };
        }

        const evidenceUrl = payload.evidenceUrl;
        const resolvedAt = payload.resolvedAt?.trim() || nowISO();
        const actorName = payload.actorName?.trim() || actor.fullName;

        const notificationBody = `${issueId} moved to Resolved.`;
        const nextNotifications = [...state.notifications];
        if (targetIssue.assignedToId) {
          nextNotifications.unshift({
            id: uid("ntf"),
            userId: targetIssue.assignedToId,
            title: "Status changed: Resolved",
            body: notificationBody,
            isRead: false,
            issueId,
            createdAt: nowISO(),
          });
        }

        const evidenceNote = note?.trim()
          ? `${note.trim()}\nEvidence: ${evidenceUrl}`
          : `Evidence captured and uploaded. ${evidenceUrl}`;

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  status: "Resolved",
                  isUnresolved: false,
                  evidenceImages: [evidenceUrl],
                  lastStatusUpdateAt: resolvedAt,
                  lastStatusUpdateBy: actorName,
                }
              : issue,
          ),
          events: [
            {
              id: uid("evt"),
              issueId,
              type: "status_change",
              title: "Status changed to Resolved",
              note: evidenceNote,
              actorId,
              actorName,
              createdAt: resolvedAt,
            },
            ...state.events,
          ],
          notifications: nextNotifications,
        });

        return { ok: true, message: "Issue resolved with evidence." };
      },

      addComment: (issueId, actorId, text) => {
        const state = get();
        const actor = state.users.find((u) => u.id === actorId);
        if (!actor || !text.trim()) {
          return;
        }

        const cleanText = text.trim();
        const issue = state.issues.find((item) => item.id === issueId);
        const nextCommentsCount = Number(issue?.commentsCount ?? 0) + 1;

        set({
          comments: [
            {
              id: uid("cmt"),
              issueId,
              actorId,
              actorName: actor.fullName,
              text: cleanText,
              createdAt: nowISO(),
            },
            ...state.comments,
          ],
          events: [
            {
              id: uid("evt"),
              issueId,
              type: "comment",
              title: "Comment added",
              note: cleanText,
              actorId,
              actorName: actor.fullName,
              createdAt: nowISO(),
            },
            ...state.events,
          ],
          issues: state.issues.map((item) =>
            item.id === issueId ? { ...item, commentsCount: nextCommentsCount } : item,
          ),
        });

        void (async () => {
          const { error: commentError } = await supabase.from(TABLE_ISSUE_COMMENTS).insert({
            issue_id: issueId,
            actor_id: actorId,
            actor_name: actor.fullName,
            text: cleanText,
            created_at: nowISO(),
          });

          if (commentError) {
            console.warn("Comment persistence failed", commentError.message);
          }

          await insertEvent({
            issueId,
            type: "comment",
            title: "Comment added",
            note: cleanText,
            actorId,
            actorName: actor.fullName,
          });

          const { error: issueError } = await supabase
            .from(TABLE_ISSUES)
            .update({ comments_count: nextCommentsCount, updated_at: nowISO() })
            .eq("id", issueId);

          if (issueError) {
            console.warn("Issue comment count update failed", issueError.message);
          }
        })().catch((error) => {
          console.error("Failed to persist comment", error);
        });
      },

      markNotificationRead: (notificationId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        }));

        void (async () => {
          const { error } = await supabase
            .from(TABLE_NOTIFICATIONS)
            .update({ is_read: true })
            .eq("id", notificationId);

            if (error) {
              console.error("Failed to mark notification as read", error);
            }
        })();
      },
    }),
    {
      name: "nivaran-web-store",
      storage: createJSONStorage(safeStorage),
      partialize: (state) => ({
        initialized: state.initialized,
        sessionUser: state.sessionUser,
        users: state.users,
        issues: state.issues,
        events: state.events,
        comments: state.comments,
        notifications: state.notifications,
        departments: state.departments,
        floodRiskAlerts: state.floodRiskAlerts,
        floodRiskSummary: state.floodRiskSummary,
        floodRiskUpdatedAt: state.floodRiskUpdatedAt,
        floodRiskAutomationNote: state.floodRiskAutomationNote,
        liveOpsStatusSummary: state.liveOpsStatusSummary,
        liveOpsStatusSignature: state.liveOpsStatusSignature,
        liveOpsStatusUpdatedAt: state.liveOpsStatusUpdatedAt,
      }),
    },
  ),
);
