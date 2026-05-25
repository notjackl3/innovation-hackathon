"use client";

import { Quote } from "lucide-react";
import { RevealStagger } from "./reveal";

const TESTIMONIALS = [
  {
    quote:
      "We used to lose a week turning a pitch into something visual. With Spark a product lead walks out of the room with a rotatable 3D model.",
    name: "Amara Koffi",
    role: "Head of Innovation",
    company: "Northwind",
    gradient: "from-amber-500 to-rose-500",
  },
  {
    quote:
      "The triage scoring alone changed our intake. It tells us which ideas are worth a real prototype before anyone burns a sprint.",
    name: "Marcus Reyes",
    role: "VP Product",
    company: "Lumen",
    gradient: "from-emerald-500 to-sky-500",
  },
  {
    quote:
      "Stakeholders click the demo link and just get it. No more squinting at static slides trying to imagine the flow.",
    name: "Jia Tan",
    role: "Design Director",
    company: "Vela",
    gradient: "from-indigo-500 to-pink-500",
  },
  {
    quote:
      "Three formats from one idea is the unlock. Same concept, shown as software for the board and as video for marketing.",
    name: "Sofia Delgado",
    role: "Founder",
    company: "Cobalt",
    gradient: "from-orange-500 to-yellow-500",
  },
  {
    quote:
      "It runs without any API keys in mock mode, so we trialed the whole flow before procurement even got involved.",
    name: "Daniel Okafor",
    role: "Eng Lead",
    company: "Meridian",
    gradient: "from-sky-500 to-violet-500",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

export function Testimonials() {
  return (
    <section id="stories" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            What teams are saying
          </p>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Ideas, finally visible.
          </h2>
        </div>

        <RevealStagger className="mt-14 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
          {TESTIMONIALS.map((t) => (
            <RevealStagger.Item key={t.name} className="break-inside-avoid">
              <figure className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-foreground/5">
                <Quote className="h-7 w-7 text-primary/30" fill="currentColor" />
                <blockquote className="mt-3 text-[15px] leading-relaxed text-foreground">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br ${t.gradient} text-sm font-bold text-white`}
                  >
                    {initials(t.name)}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.role} · {t.company}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </RevealStagger.Item>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
