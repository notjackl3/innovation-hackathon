import type { ReactNode } from "react";
import { Box, Play, Layers } from "lucide-react";

/** macOS-style browser chrome wrapper used to frame product mockups. */
export function BrowserFrame({
  url = "spark.app",
  children,
  className = "",
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10 ring-1 ring-black/[0.03] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 flex-1">
          <div className="mx-auto w-fit max-w-full rounded-md bg-background px-3 py-1 text-center text-[11px] text-muted-foreground">
            {url}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---- Product: sketch → 3D model ---- */
export function ProductMock() {
  return (
    <div className="relative aspect-[4/3] bg-gradient-to-br from-amber-50 to-background p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-product">
        <Box className="h-4 w-4" /> Product · 3D model
      </div>
      <div className="grid h-[calc(100%-1.75rem)] grid-cols-[1fr_auto] gap-4">
        <div className="grid place-items-center rounded-xl border border-amber-200/70 bg-white">
          {/* Faux wireframe cube */}
          <svg viewBox="0 0 120 120" className="h-28 w-28 text-product">
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M30 40 L60 25 L90 40 L60 55 Z" />
              <path d="M30 40 L30 80 L60 95 L60 55 Z" fill="hsl(38 92% 50% / 0.12)" />
              <path d="M90 40 L90 80 L60 95 L60 55 Z" fill="hsl(38 92% 50% / 0.2)" />
            </g>
          </svg>
        </div>
        <div className="flex w-12 flex-col gap-2">
          {["#f59e0b", "#fbbf24", "#fcd34d"].map((c) => (
            <span key={c} className="h-8 w-8 rounded-lg border border-black/5" style={{ background: c }} />
          ))}
          <div className="mt-auto h-8 w-8 rounded-lg bg-product/10" />
        </div>
      </div>
    </div>
  );
}

/* ---- Service: storyboard → video ---- */
export function ServiceMock() {
  return (
    <div className="relative aspect-[4/3] bg-gradient-to-br from-emerald-50 to-background p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-service">
        <Play className="h-4 w-4" /> Service · animated video
      </div>
      <div className="relative grid h-[calc(100%-1.75rem)] place-items-center overflow-hidden rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-100 to-emerald-50">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-service text-white shadow-lg shadow-service/30">
          <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
        </span>
        <div className="absolute inset-x-3 bottom-3 flex gap-1.5">
          {[40, 70, 55, 90, 45].map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-service/30"
              style={{ height: 4 }}
            />
          ))}
        </div>
        <div className="absolute left-3 top-3 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-7 w-10 rounded-md bg-white/70 ring-1 ring-service/20" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Software: spec → click-through demo ---- */
export function SoftwareMock() {
  return (
    <div className="relative aspect-[4/3] bg-gradient-to-br from-sky-50 to-background p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-software">
        <Layers className="h-4 w-4" /> Software · click-through demo
      </div>
      <div className="grid h-[calc(100%-1.75rem)] grid-cols-[auto_1fr] gap-3">
        <div className="flex w-16 flex-col gap-2 rounded-xl border border-sky-200/70 bg-white p-2">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-2.5 rounded-full ${i === 1 ? "bg-software" : "bg-software/20"}`}
            />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-sky-200/70 bg-white p-3">
          <div className="h-3 w-2/3 rounded-full bg-software/30" />
          <div className="h-2 w-full rounded-full bg-muted" />
          <div className="h-2 w-5/6 rounded-full bg-muted" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="h-10 rounded-lg bg-software/10" />
            <span className="h-10 rounded-lg bg-software/10" />
          </div>
          <span className="mt-2 inline-block rounded-lg bg-software px-3 py-1.5 text-[10px] font-semibold text-white">
            Continue
          </span>
        </div>
      </div>
    </div>
  );
}
