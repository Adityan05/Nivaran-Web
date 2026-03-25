"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const initMockData = useAppStore((s) => s.initMockData);
  const loginAs = useAppStore((s) => s.loginAs);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void initMockData();
  }, [initMockData]);

  useEffect(() => {
    if (sessionUser) {
      router.replace("/dashboard");
    }
  }, [sessionUser, router]);

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_15%_20%,#d0dde8_0%,#f8fafc_38%,#e7edf4_100%)] p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-300/35 bg-linear-to-b from-slate-50/95 to-slate-100/80 p-7 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_18px_30px_rgba(2,6,23,0.14)] transition-all duration-300 ease-in-out">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          Nivaran Ops
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Admin Control Room Login
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Sign in with your official email from ops_users.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            const result = await loginAs(email);
            setSubmitting(false);
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
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="name@nivaran.gov.in"
            className="ui-select"
          />

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            className="ui-btn-primary w-full"
            disabled={submitting}
          >
            Continue to Control Room
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Access is restricted to active profiles present in ops_users.
        </p>
      </div>
    </div>
  );
}
