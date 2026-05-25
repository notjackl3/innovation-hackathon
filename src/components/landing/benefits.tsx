"use client";

import { Compass, Zap, Pencil, Share2, GitBranch, ShieldCheck } from "lucide-react";
import { RevealStagger } from "./reveal";

const BENEFITS = [
  {
    icon: Compass,
    title: "Smart triage",
    body: "Drop in an idea and a company profile. Spark scores market fit, feasibility, novelty, and brand alignment, then picks the right pipeline automatically.",
    className: "sm:col-span-2",
    tint: "from-primary/10",
    iconClass: "bg-primary/10 text-primary",
  },
  {
    icon: Zap,
    title: "Under 5 minutes",
    body: "Idea to interactive artifact before the meeting ends.",
    tint: "from-amber-100/60",
    iconClass: "bg-product/10 text-product",
  },
  {
    icon: Pencil,
    title: "Everything is editable",
    body: "Canvases, scenes, and screens are live — nudge them until they're right.",
    tint: "from-sky-100/60",
    iconClass: "bg-software/10 text-software",
  },
  {
    icon: Share2,
    title: "Share a real demo",
    body: "Publish a click-through link stakeholders can open and try, no login required.",
    tint: "from-emerald-100/60",
    iconClass: "bg-service/10 text-service",
  },
  {
    icon: GitBranch,
    title: "Three output formats",
    body: "3D models, animated video, or clickable software — from the same source idea.",
    tint: "from-primary/10",
    iconClass: "bg-primary/10 text-primary",
  },
  {
    icon: ShieldCheck,
    title: "Works offline-first",
    body: "Runs on deterministic mock outputs without API keys — plug in providers when you're ready.",
    className: "sm:col-span-2",
    tint: "from-muted",
    iconClass: "bg-foreground/10 text-foreground",
  },
];

export function Benefits() {
  return (
    <section className="bg-card/40 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Why teams reach for Spark
          </p>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Stop describing ideas. Start showing them.
          </h2>
        </div>

        <RevealStagger className="mt-12 grid gap-4 sm:grid-cols-4">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <RevealStagger.Item
                key={b.title}
                className={`sm:col-span-2 ${b.className ?? ""}`}
              >
                <div
                  className={`group h-full rounded-2xl border border-border bg-gradient-to-br ${b.tint} to-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-foreground/5`}
                >
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl ${b.iconClass} transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold tracking-tight">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
                </div>
              </RevealStagger.Item>
            );
          })}
        </RevealStagger>
      </div>
    </section>
  );
}
