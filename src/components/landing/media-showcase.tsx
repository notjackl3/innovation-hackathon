"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { BrowserFrame, ProductMock, ServiceMock, SoftwareMock } from "./frames";
import { Reveal } from "./reveal";

const EASE = [0.22, 1, 0.36, 1] as const;

const PIPELINES = [
  {
    id: "product",
    name: "Product",
    flow: "Sketch → editable canvas → 3D model",
    blurb: "Rough a concept on the canvas and watch it resolve into a rotatable 3D model your team can actually critique.",
    color: "text-product",
    Mock: ProductMock,
    url: "spark.app/product",
  },
  {
    id: "service",
    name: "Service",
    flow: "Storyboard → editable scenes → animated video",
    blurb: "Turn a service idea into a scene-by-scene storyboard, then render it as a narrated, animated walkthrough.",
    color: "text-service",
    Mock: ServiceMock,
    url: "spark.app/service",
  },
  {
    id: "software",
    name: "Software",
    flow: "Spec → editable screens → click-through demo",
    blurb: "Describe the app, get a structured spec and editable screens, and ship a clickable demo people can try.",
    color: "text-software",
    Mock: SoftwareMock,
    url: "spark.app/software",
  },
];

export function MediaShowcase() {
  const reduce = useReducedMotion();

  return (
    <section id="pipelines" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p id="how" className="scroll-mt-24 text-sm font-semibold uppercase tracking-widest text-primary">
            One idea, three ways to see it
          </p>
          <h2 className="mt-3 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Pick a pipeline. Get something real.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Spark triages every idea and routes it to the pipeline that fits — then generates an
            artifact you can edit, react to, and share.
          </p>
        </Reveal>

        <div className="mt-16 space-y-20">
          {PIPELINES.map((p, i) => {
            const flip = i % 2 === 1;
            const { Mock } = p;
            return (
              <div
                key={p.id}
                className="grid items-center gap-10 md:grid-cols-2"
              >
                <Reveal
                  className={flip ? "md:order-2" : ""}
                  delay={0.05}
                >
                  <div className={`text-sm font-semibold uppercase tracking-widest ${p.color}`}>
                    {`0${i + 1} · ${p.name}`}
                  </div>
                  <h3 className="mt-2 text-3xl font-bold tracking-tight">{p.flow}</h3>
                  <p className="mt-3 max-w-md text-muted-foreground">{p.blurb}</p>
                  <a
                    href="/companies/new"
                    className={`group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${p.color}`}
                  >
                    Try the {p.name.toLowerCase()} pipeline
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Reveal>

                <motion.div
                  className={flip ? "md:order-1" : ""}
                  initial={reduce ? false : { opacity: 0, y: 40, rotate: flip ? 2 : -2 }}
                  whileInView={{ opacity: 1, y: 0, rotate: flip ? -1.5 : 1.5 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.8, ease: EASE }}
                  whileHover={reduce ? undefined : { rotate: 0, scale: 1.02 }}
                >
                  <BrowserFrame url={p.url}>
                    <Mock />
                  </BrowserFrame>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
