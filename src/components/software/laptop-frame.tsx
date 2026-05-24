"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Stylised SVG laptop chassis with a content area for the demo. Mimics a
 * macOS-style aluminium body with a notched display so the click-through
 * feels like a real product preview.
 */
export function LaptopFrame({
  children,
  title = "Spark Demo",
  className,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {/* Display */}
      <div className="relative mx-auto w-full max-w-5xl">
        <div className="rounded-t-2xl bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/10">
          {/* Screen bezel */}
          <div className="overflow-hidden rounded-xl bg-black">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-white/10 bg-neutral-800 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              <div className="mx-auto rounded-md bg-neutral-900/80 px-3 py-0.5 text-[11px] text-white/70">
                {title}
              </div>
              <span className="w-12" />
            </div>
            {/* Content area */}
            <div className="bg-white text-foreground">
              <div className="max-h-[640px] min-h-[420px] overflow-auto">{children}</div>
            </div>
          </div>
        </div>
        {/* Notch / camera */}
        <div className="absolute left-1/2 top-0 h-2 w-24 -translate-x-1/2 rounded-b-md bg-neutral-900" />
      </div>

      {/* Hinge + base */}
      <div className="mx-auto w-full max-w-[1200px]">
        <div
          className="mx-auto h-3 w-full rounded-b-[36px] bg-gradient-to-b from-neutral-700 via-neutral-400 to-neutral-300 shadow-lg"
          style={{ marginTop: "-2px" }}
        />
        <div className="mx-auto h-2 w-2/3 rounded-b-full bg-gradient-to-b from-neutral-300 to-neutral-400 opacity-80" />
      </div>
    </div>
  );
}
