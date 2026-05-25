"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "How does Spark decide which pipeline an idea goes into?",
    a: "When you submit an idea with a company profile, Spark triages it — scoring market fit, feasibility, novelty, and brand alignment — and recommends Product, Service, or Software. You can always override the routing.",
  },
  {
    q: "Do I need API keys to try it?",
    a: "No. Spark ships with a deterministic mock mode that generates representative outputs without any keys, so you can walk the entire flow first. Add OpenAI or other providers when you want real generation.",
  },
  {
    q: "What exactly do I get at the end of each pipeline?",
    a: "Product gives you an editable sketch canvas that resolves into a 3D model. Service produces a storyboard and an animated, narrated video. Software produces a spec, editable screens, and a shareable click-through demo.",
  },
  {
    q: "Can stakeholders view a demo without an account?",
    a: "Yes. Software demos publish to a public click-through link that anyone can open and interact with — no login required.",
  },
  {
    q: "Is the generated artifact editable, or is it one-shot?",
    a: "Everything is editable. Canvases, scenes, and screens are live surfaces you can refine, regenerate, or rearrange until the visualization matches the intent.",
  },
  {
    q: "How long does it take to go from idea to demo?",
    a: "Most ideas reach an interactive artifact in under five minutes. There's no project setup — start a company, add an idea, and generate.",
  },
  {
    q: "Can one idea produce more than one format?",
    a: "Yes. The same source idea can run through multiple pipelines, so you can show software to the board and an animated video to marketing from one concept.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="scroll-mt-20 bg-card/40 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Questions, answered
          </p>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Everything you might ask.
          </h2>
        </Reveal>

        <Reveal delay={0.05} className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="text-base font-semibold text-foreground">{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                      isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduce ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-[15px] leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
