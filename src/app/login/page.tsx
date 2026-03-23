"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const initMockData = useAppStore((s) => s.initMockData);
  const users = useAppStore((s) => s.users);
  const departments = useAppStore((s) => s.departments);
  const loginAs = useAppStore((s) => s.loginAs);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const [email, setEmail] = useState("anita@nivaran.gov");
  const [error, setError] = useState("");

  useEffect(() => {
    initMockData();
  }, [initMockData]);

  useEffect(() => {
    if (sessionUser) {
      router.replace("/dashboard");
    }
  }, [sessionUser, router]);

  const rolePreview = useMemo(() => {
    return users.find((u) => u.email === email)?.role ?? "unknown";
  }, [users, email]);

  const departmentPreview = useMemo(() => {
    const selectedUser = users.find((u) => u.email === email);
    if (!selectedUser || selectedUser.role !== "department_head") {
      return null;
    }
    return (
      departments.find((d) => d.id === selectedUser.departmentId)?.name ??
      selectedUser.departmentId
    );
  }, [users, departments, email]);

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_15%_20%,#d0dde8_0%,#f8fafc_38%,#e7edf4_100%)] p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 p-7 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_18px_30px_rgba(2,6,23,0.14)] transition-all duration-300 ease-in-out">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          Nivaran Ops
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Admin Control Room Login
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Mock mode is enabled. Choose a team account and continue.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const result = loginAs(email);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push("/dashboard");
          }}
        >
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="email"
          >
            Account
          </label>
          <select
            id="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="ui-select"
          >
            {users.map((user) => (
              <option key={user.id} value={user.email}>
                {user.fullName} ({user.role.replace("_", " ")})
              </option>
            ))}
          </select>

          <div className="ui-card-muted p-3 text-xs text-slate-700">
            Role preview:{" "}
            <span className="font-semibold">
              {rolePreview.replace("_", " ")}
            </span>
            {departmentPreview ? (
              <p className="mt-1 text-slate-600">
                Department: {departmentPreview}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button type="submit" className="ui-btn-primary w-full">
            Continue to Control Room
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Next step: replace this with Firebase Auth and custom role claims once
          you share env credentials.
        </p>
      </div>
    </div>
  );
}
