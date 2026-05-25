"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function FinalCTA() {
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="px-6 py-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-foreground px-6 py-16 text-center text-background sm:py-20"
      >
        {/* glow */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/40 blur-[100px]" />
          <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-software/30 blur-[100px]" />
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" />
            Your next idea, visualized
          </span>
          <h2 className="mx-auto mt-5 max-w-2xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            See your idea before you build it.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-background/70">
            Start a company, drop in an idea, and get an interactive demo in minutes. Free to try, no
            keys required.
          </p>

          {submitted ? (
            <p className="mx-auto mt-8 max-w-md rounded-full bg-background/10 px-6 py-4 font-semibold">
              You&apos;re on the list — we&apos;ll be in touch at {email}.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) setSubmitted(true);
              }}
              className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-[3.25rem] flex-1 rounded-full border border-background/20 bg-background/10 px-5 py-3.5 text-background placeholder:text-background/50 outline-none transition focus:border-background/50 focus:bg-background/15"
              />
              <button
                type="submit"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:scale-[1.03]"
              >
                Get early access
                <ArrowRight className="h-5 w-5 nudge-x" />
              </button>
            </form>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-background/60">
            <Link href="/companies/new" className="font-semibold text-background underline-offset-4 hover:underline">
              or start a company now →
            </Link>
            <span className="hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Limited onboarding slots this month
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
