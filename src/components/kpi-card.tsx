import clsx from "clsx";

interface KpiCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}

const toneClass = {
  neutral:
    "border-slate-300/35 bg-gradient-to-b from-slate-50/95 to-slate-100/80 text-slate-800",
  good: "border-emerald-300/35 bg-gradient-to-b from-emerald-50/90 to-emerald-100/65 text-emerald-900",
  warn: "border-amber-300/35 bg-gradient-to-b from-amber-50/90 to-amber-100/65 text-amber-900",
  danger:
    "border-rose-300/35 bg-gradient-to-b from-rose-50/90 to-rose-100/65 text-rose-900",
};

export default function KpiCard({
  label,
  value,
  subtext,
  tone = "neutral",
}: KpiCardProps) {
  return (
    <article
      className={clsx(
        "rounded-2xl border p-4 shadow-[0_1px_0_rgba(255,255,255,0.76)_inset,0_10px_20px_rgba(2,6,23,0.1)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_14px_26px_rgba(2,6,23,0.15)]",
        toneClass[tone],
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {subtext ? <p className="mt-1.5 text-sm opacity-80">{subtext}</p> : null}
    </article>
  );
}
