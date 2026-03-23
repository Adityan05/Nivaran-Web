"use client";

import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import {
  AppNotification,
  IssueComment,
  IssueEvent,
  IssueRecord,
  IssueStatus,
  TeamMember,
} from "@/lib/types";
import {
  mockComments,
  mockDepartments,
  mockEvents,
  mockIssues,
  mockNotifications,
  mockTeamMembers,
} from "@/lib/mock-data";
import {
  canAssignToUser,
  canRerouteIssue,
  getAllowedStatusTransitions,
} from "@/lib/access";

type SessionUser = TeamMember | null;

interface AppState {
  initialized: boolean;
  sessionUser: SessionUser;
  users: TeamMember[];
  issues: IssueRecord[];
  events: IssueEvent[];
  comments: IssueComment[];
  notifications: AppNotification[];
  departments: typeof mockDepartments;
  initMockData: () => void;
  loginAs: (email: string) => { ok: boolean; message: string };
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
      departments: mockDepartments,

      initMockData: () => {
        if (get().initialized) {
          return;
        }
        set({
          initialized: true,
          users: mockTeamMembers,
          issues: mockIssues,
          events: mockEvents,
          comments: mockComments,
          notifications: mockNotifications,
          departments: mockDepartments,
          sessionUser: mockTeamMembers[0],
        });
      },

      loginAs: (email) => {
        const user = get().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
          return { ok: false, message: "User not found in mock directory." };
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

        set({
          issues: state.issues.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  assignedToId: assigneeId,
                  status:
                    issue.status === "Reported" && actor.role === "department_head"
                      ? "Acknowledged"
                      : issue.status,
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
            issue.id === issueId ? { ...issue, status } : issue,
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
      },

      markNotificationRead: (notificationId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        }));
      },
    }),
    {
      name: "nivaran-web-mock-store",
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
      }),
    },
  ),
);
