"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { canViewSettings } from "@/lib/access";

export default function SettingsPage() {
  const sessionUser = useAppStore((s) => s.sessionUser);
  const [ackSla, setAckSla] = useState(4);
  const [resolveSla, setResolveSla] = useState(48);
  const [autoEscalation, setAutoEscalation] = useState(true);

  if (!canViewSettings(sessionUser)) {
    return (
      <div className="ui-card rounded-xl border-dashed p-8 text-center text-slate-600">
        Only super admins can access policy settings.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="ui-card p-5">
        <h3 className="ui-page-title">Ops Settings (Mock)</h3>
        <p className="ui-page-subtitle">
          These controls are local-only for now. In production they will be
          stored in Firestore policy docs.
        </p>
      </header>

      <section className="ui-card p-5">
        <h4 className="font-semibold">SLA Policy</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">
              Acknowledge SLA (hours)
            </span>
            <input
              type="number"
              value={ackSla}
              onChange={(e) => setAckSla(Number(e.target.value))}
              className="ui-input"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">
              Resolve SLA (hours)
            </span>
            <input
              type="number"
              value={resolveSla}
              onChange={(e) => setResolveSla(Number(e.target.value))}
              className="ui-input"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoEscalation}
            onChange={(e) => setAutoEscalation(e.target.checked)}
          />
          Enable automatic escalation for SLA breaches
        </label>

        <button
          type="button"
          className="ui-btn-primary mt-4"
          onClick={() => {
            window.alert(
              "Saved in mock mode. Next step: wire to backend policy collection.",
            );
          }}
        >
          Save Policy
        </button>
      </section>
    </div>
  );
}
