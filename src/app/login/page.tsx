"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DecryptedText from "@/components/decrypted-text";
import { useAppStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const initMockData = useAppStore((s) => s.initMockData);
  const loginAs = useAppStore((s) => s.loginAs);
  const sessionUser = useAppStore((s) => s.sessionUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [brandText, setBrandText] = useState<"Nivaran" | "निवारण">("Nivaran");

  useEffect(() => {
    void initMockData();
  }, [initMockData]);

  useEffect(() => {
    if (sessionUser) {
      router.replace("/dashboard");
    }
  }, [sessionUser, router]);

  useEffect(() => {
    const id = setInterval(() => {
      setBrandText((prev) => (prev === "Nivaran" ? "निवारण" : "Nivaran"));
    }, 2800);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_15%_20%,#d0dde8_0%,#f8fafc_38%,#e7edf4_100%)] p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-300/35 bg-linear-to-b from-slate-50/95 to-slate-100/80 p-7 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_18px_30px_rgba(2,6,23,0.14)] transition-all duration-300 ease-in-out">
        <div className="mb-5 flex flex-col items-center justify-center gap-2.5">
          <Image
            src="/app_logo.png"
            alt="Nivaran logo"
            width={60}
            height={60}
            className="h-14 w-14 rounded-2xl border border-slate-300/45 bg-white/80 p-1.5 object-contain shadow-[0_6px_14px_rgba(15,23,42,0.12)]"
            priority
          />
          <div className="text-center text-2xl font-semibold tracking-tight text-slate-900">
            <DecryptedText
              key={brandText}
              text={brandText}
              animateOn="view"
              sequential
              revealDirection="center"
              speed={46}
              maxIterations={14}
              className="text-slate-900"
              encryptedClassName="text-slate-500"
              parentClassName="inline-flex"
            />
          </div>
        </div>
        <h1 className="mt-1 text-center text-xl font-semibold tracking-tight text-slate-900">
          Admin Login
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          Sign in with your official email and password.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            const result = await loginAs(email, password);
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
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="name@nivaran.gov.in"
            className="ui-select"
          />

          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="Enter password"
            className="ui-select"
          />

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            className="ui-btn-primary w-full"
            disabled={submitting || !email.trim() || !password}
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
