"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  AppNotification,
  Department,
  FloodRiskAlert,
  IssueComment,
  IssueEvent,
  IssueRecord,
  IssueStatus,
  TeamMember,
} from "@/lib/types";
import {
  mockDepartments,
} from "@/lib/mock-data";
import {
  canAssignToUser,
  canRerouteIssue,
  getAllowedStatusTransitions,
} from "@/lib/access";
import { db } from "@/lib/firebase";

type SessionUser = TeamMember | null;

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
  loginAs: (email: string) => Promise<{ ok: boolean; message: string }>;
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
  if (typeof input === "object") {
    const value = input as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    if (typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toISOString();
    }
    if (typeof value._seconds === "number") {
      return new Date(value._seconds * 1000).toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeRole(role: unknown): TeamMember["role"] | null {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "super_admin" || value === "superadmin") {
    return "super_admin";
  }
  if (value === "department_head" || value === "department head") {
    return "department_head";
  }
  if (value === "engineer" || value === "supervisor") {
    return "engineer";
  }
  return null;
}

function normalizeStatus(status: unknown): IssueStatus {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "reported") return "Reported";
  if (value === "acknowledged") return "Acknowledged";
  if (value === "in progress") return "In Progress";
  if (value === "resolved") return "Resolved";
  if (value === "rejected") return "Rejected";
  if (value === "assigned to department") return "Reported";
  if (value === "assigned to supervisor") return "Acknowledged";
  return "Reported";
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

        try {
          const [opsUsersSnap, opsDepartmentsSnap, opsIssuesSnap, eventsSnap, commentsSnap, opsNotificationsSnap] =
            await Promise.all([
              getDocs(collection(db, "ops_users")),
              getDocs(collection(db, "ops_departments")),
              getDocs(collection(db, "ops_issues")),
              getDocs(collectionGroup(db, "events")),
              getDocs(collectionGroup(db, "comments")),
              getDocs(collection(db, "ops_notifications")),
            ]);

          const users: TeamMember[] = opsUsersSnap.docs
            .map((d) => {
              const data = d.data();
              const role = normalizeRole(data.role);
              if (!role) {
                return null;
              }
              return {
                id: d.id,
                fullName: String(data.fullName ?? "Unknown"),
                email: String(data.email ?? ""),
                role,
                departmentId: String(data.departmentId ?? ""),
                area: String(data.areaId ?? data.area ?? ""),
                workload: Number(data.workload ?? 0),
                active: data.active !== false,
              };
            })
            .filter((user): user is TeamMember => user !== null);

          const departments: Department[] = opsDepartmentsSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              code: String(data.code ?? d.id.replace(/^dept_/, "").toUpperCase()),
              name: String(data.name ?? d.id),
            };
          });

          const issues: IssueRecord[] = opsIssuesSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title ?? "Civic issue report"),
              description: String(data.description ?? ""),
              category: String(data.category ?? "General"),
              urgency: (data.urgency as IssueRecord["urgency"]) ?? "Medium",
              status: normalizeStatus(data.status),
              area: String(data.area ?? ""),
              assignedDepartmentId: String(data.assignedDepartmentId ?? ""),
              assignedToId:
                typeof data.assignedToId === "string" && data.assignedToId
                  ? data.assignedToId
                  : undefined,
              reporterName: String(data.reporterName ?? "Citizen"),
              createdAt: asISO(data.createdAt),
              dueAt: asISO(data.dueAt),
              affectedUsersCount: Number(data.affectedUsersCount ?? 0),
              tags: Array.isArray(data.tags) ? data.tags : [],
              imageUrl: String(data.imageUrl ?? ""),
              locationAddress: String(data.locationAddress ?? ""),
              lat: Number(data.lat ?? 0),
              lng: Number(data.lng ?? 0),
              userId: data.userId,
              username: data.username,
              upvotes: Number(data.upvotes ?? 0),
              downvotes: Number(data.downvotes ?? 0),
              commentsCount: Number(data.commentsCount ?? 0),
              isUnresolved:
                typeof data.isUnresolved === "boolean"
                  ? data.isUnresolved
                  : !["Resolved", "Rejected"].includes(normalizeStatus(data.status)),
              lastStatusUpdateAt: data.lastStatusUpdateAt
                ? asISO(data.lastStatusUpdateAt)
                : undefined,
              lastStatusUpdateBy: data.lastStatusUpdateBy,
              assignedDepartment: data.assignedDepartment,
              affectedUserIds: Array.isArray(data.affectedUserIds)
                ? data.affectedUserIds
                : [],
              voters:
                data.voters && typeof data.voters === "object" ? data.voters : {},
              duplicateOfIssueId: data.duplicateOfIssueId,
            };
          });

          const events: IssueEvent[] = eventsSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              issueId:
                typeof data.issueId === "string"
                  ? data.issueId
                  : d.ref.parent.parent?.id ?? "",
              type: (data.type as IssueEvent["type"]) ?? "created",
              title: String(data.title ?? "Event"),
              note: data.note,
              actorId: String(data.actorId ?? "system"),
              actorName: String(data.actorName ?? "System"),
              createdAt: asISO(data.createdAt),
            };
          });

          const comments: IssueComment[] = commentsSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              issueId:
                typeof data.issueId === "string"
                  ? data.issueId
                  : d.ref.parent.parent?.id ?? "",
              actorId: String(data.actorId ?? "system"),
              actorName: String(data.actorName ?? "System"),
              text: String(data.text ?? ""),
              createdAt: asISO(data.createdAt),
            };
          });

          const notifications: AppNotification[] = opsNotificationsSnap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userId: String(data.userId ?? ""),
              title: String(data.title ?? "Notification"),
              body: String(data.body ?? ""),
              isRead: Boolean(data.isRead),
              createdAt: asISO(data.createdAt),
              issueId: data.issueId,
            };
          });

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
          console.error("Failed to load Firestore ops data.", error);
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

        // Avoid excessive API calls while allowing periodic refresh.
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

      loginAs: async (email) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) {
          return { ok: false, message: "Email is required." };
        }

        const user = get().users.find((u) => u.email.toLowerCase() === normalized);
        if (!user) {
          return { ok: false, message: "No matching ops user profile found for this email." };
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
          targetIssue.status === "Reported" && actor.role === "department_head"
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
          const issueRef = doc(db, "ops_issues", issueId);
          await setDoc(
            issueRef,
            {
              assignedToId: assigneeId,
              assignedToRole: assignee.role,
              status: nextStatus,
              lastStatusUpdateAt: serverTimestamp(),
              lastStatusUpdateBy: actor.fullName,
            },
            { merge: true },
          );

          await setDoc(
            doc(collection(issueRef, "events")),
            {
              issueId,
              type: "assignment",
              title: `Assigned to ${assignee.fullName}`,
              note: null,
              actorId,
              actorName: actor.fullName,
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );

          await setDoc(
            doc(db, "ops_notifications", uid("ntf")),
            {
              userId: assigneeId,
              title: "New assignment",
              body: `${issueId} has been assigned to you.`,
              type: "assignment",
              issueId,
              isRead: false,
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );
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
        const targetHeads = state.users.filter(
          (u) => u.role === "department_head" && u.departmentId === targetDepartmentId,
        );

        const rerouteNotifications = targetHeads.map((head) => ({
          id: uid("ntf"),
          userId: head.id,
          title: "Issue rerouted to your department",
          body: `${issueId} was rerouted by ${actor.fullName}. Please assign it to a JE.`,
          isRead: false,
          issueId,
          createdAt: nowISO(),
        }));

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  assignedDepartmentId: targetDepartmentId,
                  assignedDepartment: targetDepartment?.name,
                  assignedToId: undefined,
                  status:
                    issue.status === "Resolved" || issue.status === "Rejected"
                      ? issue.status
                      : "Reported",
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
          const issueRef = doc(db, "ops_issues", issueId);
          await setDoc(
            issueRef,
            {
              assignedDepartmentId: targetDepartmentId,
              assignedDepartment: targetDepartment?.name ?? null,
              assignedToId: null,
              assignedToRole: null,
              status:
                targetIssue.status === "Resolved" || targetIssue.status === "Rejected"
                  ? targetIssue.status
                  : "Reported",
              reroutedAt: serverTimestamp(),
              reroutedBy: actor.fullName,
              lastStatusUpdateAt: serverTimestamp(),
              lastStatusUpdateBy: actor.fullName,
            },
            { merge: true },
          );

          await setDoc(
            doc(collection(issueRef, "events")),
            {
              issueId,
              type: "reroute",
              title: `Rerouted to ${targetDepartment?.name ?? targetDepartmentId}`,
              note: note ?? null,
              actorId,
              actorName: actor.fullName,
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );

          if (targetHeads.length) {
            const batch = writeBatch(db);
            for (const head of targetHeads) {
              batch.set(doc(db, "ops_notifications", uid("ntf")), {
                userId: head.id,
                title: "Issue rerouted to your department",
                body: `${issueId} was rerouted by ${actor.fullName}. Please assign it to a JE.`,
                type: "reroute",
                issueId,
                isRead: false,
                createdAt: serverTimestamp(),
              });
            }
            await batch.commit();
          }
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
          const issueRef = doc(db, "ops_issues", issueId);
          await setDoc(
            issueRef,
            {
              status,
              lastStatusUpdateAt: serverTimestamp(),
              lastStatusUpdateBy: actor.fullName,
            },
            { merge: true },
          );

          await setDoc(
            doc(collection(issueRef, "events")),
            {
              issueId,
              type: "status_change",
              title: `Status changed to ${status}`,
              note: note || null,
              actorId,
              actorName: actor.fullName,
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );

          if (targetIssue.assignedToId) {
            await addDoc(collection(db, "ops_notifications"), {
              userId: targetIssue.assignedToId,
              title: `Status changed: ${status}`,
              body: `${issueId} moved to ${status}.`,
              type: "status_change",
              issueId,
              isRead: false,
              createdAt: serverTimestamp(),
            });
          }
        })().catch((error) => {
          console.error("Failed to persist status update", error);
        });
      },

      addComment: (issueId, actorId, text) => {
        const state = get();
        const actor = state.users.find((u) => u.id === actorId);
        if (!actor || !text.trim()) {
          return;
        }

        const cleanText = text.trim();

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
        });

        void (async () => {
          const issueRef = doc(db, "ops_issues", issueId);
          await addDoc(collection(issueRef, "comments"), {
            issueId,
            actorId,
            actorName: actor.fullName,
            text: cleanText,
            createdAt: serverTimestamp(),
          });

          await addDoc(collection(issueRef, "events"), {
            issueId,
            type: "comment",
            title: "Comment added",
            note: cleanText,
            actorId,
            actorName: actor.fullName,
            createdAt: serverTimestamp(),
          });

          await setDoc(
            issueRef,
            {
              commentsCount: increment(1),
            },
            { merge: true },
          );
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

        void setDoc(
          doc(db, "ops_notifications", notificationId),
          { isRead: true },
          { merge: true },
        ).catch((error) => {
          console.error("Failed to mark notification as read", error);
        });
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
