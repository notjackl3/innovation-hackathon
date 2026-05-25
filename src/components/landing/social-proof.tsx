"use client";

import { Star } from "lucide-react";
import { CountUp } from "./count-up";
import { Reveal } from "./reveal";

const STATS = [
  { to: 2400, suffix: "+", label: "ideas visualized" },
  { to: 180, suffix: "+", label: "teams onboard" },
  { to: 5, prefix: "<", suffix: " min", label: "idea to demo" },
  { to: 3, label: "output pipelines" },
];

const AVATARS = [
  { initials: "AK", from: "#f59e0b", to: "#ef4444" },
  { initials: "MR", from: "#10b981", to: "#0ea5e9" },
  { initials: "JT", from: "#6366f1", to: "#ec4899" },
  { initials: "SD", from: "#f97316", to: "#eab308" },
];

export function SocialProof() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <Reveal className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-4xl font-extrabold tracking-tight text-foreground font-display tabular-nums">
                  <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 md:flex-col md:items-end">
            <div className="flex -space-x-2.5">
              {AVATARS.map((a) => (
                <span
                  key={a.initials}
                  className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-card"
                  style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                >
                  {a.initials}
                </span>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-0.5 text-primary">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4" fill="currentColor" />
                ))}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">4.9/5</span> from product teams
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
