"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { BrowserFrame, SoftwareMock, ProductMock, ServiceMock } from "./frames";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
  };

  return (
    <section className="relative overflow-hidden">
      {/* Ambient color glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-0 top-10 h-[26rem] w-[26rem] rounded-full bg-software/15 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 h-[24rem] w-[24rem] rounded-full bg-service/10 blur-[120px]" />
      </div>
      <div className="absolute inset-0 -z-10 bg-grain opacity-60" aria-hidden />

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pb-28 md:pt-24">
        <motion.div variants={reduce ? undefined : container} initial={reduce ? false : "hidden"} animate="show">
          <motion.div variants={reduce ? undefined : item}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Innovation visualization platform
            </span>
          </motion.div>

          <motion.h1
            variants={reduce ? undefined : item}
            className="mt-5 text-balance text-5xl font-extrabold leading-[0.98] tracking-tight text-foreground sm:text-6xl lg:text-7xl"
          >
            Turn raw ideas
            <br />
            into things
            <br />
            you can{" "}
            <span className="relative inline-block text-primary">
              see
              <motion.svg
                aria-hidden
                viewBox="0 0 200 18"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3 w-full text-primary"
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.7, ease: EASE }}
              >
                <motion.path
                  d="M3 13 C 50 4, 150 4, 197 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </motion.svg>
            </span>
            .
          </motion.h1>

          <motion.p
            variants={reduce ? undefined : item}
            className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground"
          >
            Spark takes an innovation idea and a company profile, then routes it into one of three
            interactive pipelines — <span className="font-semibold text-product">Product</span>,{" "}
            <span className="font-semibold text-service">Service</span>, or{" "}
            <span className="font-semibold text-software">Software</span>. React to a real
            visualization, not another spreadsheet row.
          </motion.p>

          <motion.div variants={reduce ? undefined : item} className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/companies/new"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.03] hover:shadow-xl hover:shadow-primary/30"
            >
              Start a company
              <ArrowRight className="h-5 w-5 nudge-x" />
            </Link>
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-3.5 text-base font-semibold text-foreground transition-all duration-300 hover:border-foreground/30 hover:shadow-md"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:scale-110">
                <Play className="h-3.5 w-3.5 translate-x-px" fill="currentColor" />
              </span>
              See a live demo
            </Link>
          </motion.div>

          <motion.p variants={reduce ? undefined : item} className="mt-5 text-sm text-muted-foreground">
            No setup. Idea to interactive demo in{" "}
            <span className="font-semibold text-foreground">under 5 minutes</span>.
          </motion.p>
        </motion.div>

        {/* Layered product visual */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.8, ease: EASE }}
          className="relative mx-auto w-full max-w-md md:max-w-none"
        >
          <FloatingFrame className="relative z-20" delay={0}>
            <BrowserFrame url="spark.app/software/demo">
              <SoftwareMock />
            </BrowserFrame>
          </FloatingFrame>

          <FloatingFrame
            className="absolute -bottom-10 -left-8 z-30 w-40 sm:w-52"
            delay={0.4}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-foreground/10">
              <ProductMock />
            </div>
          </FloatingFrame>

          <FloatingFrame
            className="absolute -right-6 -top-8 z-10 hidden w-40 sm:block sm:w-52"
            delay={0.7}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-foreground/10">
              <ServiceMock />
            </div>
          </FloatingFrame>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingFrame({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduce ? undefined : { y: [0, -10, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}
