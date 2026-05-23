"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";

export interface SketchCanvasHandle {
  /** Returns a data URL PNG of the composite (background + strokes). */
  exportComposite: () => Promise<string>;
  /** Returns true if the user has drawn anything. */
  hasStrokes: () => boolean;
  clear: () => void;
}

interface Props {
  /** Background sketch URL (locked layer). */
  backgroundUrl: string;
}

interface Stroke {
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { backgroundUrl },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [color, setColor] = useState("#d24b2d");
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [version, setVersion] = useState(0);

  useImperativeHandle(ref, () => ({
    async exportComposite() {
      const overlay = overlayRef.current;
      if (!overlay) return "";
      // Composite the background with strokes onto an offscreen canvas, then export.
      const w = overlay.width;
      const h = overlay.height;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d")!;
      // Draw background
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h);
          ctx.drawImage(overlay, 0, 0);
          resolve();
        };
        img.onerror = () => {
          ctx.drawImage(overlay, 0, 0);
          resolve();
        };
        img.src = backgroundUrl;
      });
      return out.toDataURL("image/png");
    },
    hasStrokes() {
      return strokesRef.current.length > 0;
    },
    clear() {
      strokesRef.current = [];
      redraw();
      setVersion((v) => v + 1);
    },
  }));

  function fit() {
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!overlay || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    overlay.width = cssW * dpr;
    overlay.height = cssH * dpr;
    overlay.style.width = `${cssW}px`;
    overlay.style.height = `${cssH}px`;
    const ctx = overlay.getContext("2d")!;
    ctx.scale(dpr, dpr);
    redraw();
  }

  function redraw() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.scale(dpr, dpr);
    for (const s of strokesRef.current) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.size;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  useEffect(() => {
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrl]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const p = pointer(e);
    strokesRef.current.push({
      color: tool === "eraser" ? "rgba(0,0,0,1)" : color,
      size: tool === "eraser" ? size * 4 : size,
      points: [p],
    });
    if (tool === "eraser") {
      // simulate erasing — we draw with destination-out
      const ctx = overlayRef.current!.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-out";
    }
    redraw();
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    stroke.points.push(pointer(e));
    redraw();
  }
  function onUp() {
    drawing.current = false;
    const ctx = overlayRef.current?.getContext("2d");
    if (ctx) ctx.globalCompositeOperation = "source-over";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          <button
            className={`px-3 py-1 text-xs ${tool === "pen" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            className={`px-3 py-1 text-xs ${tool === "eraser" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
        </div>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border"
        />
        <input
          type="range"
          min={1}
          max={24}
          value={size}
          onChange={(e) => setSize(parseInt(e.target.value, 10))}
          className="h-7"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            strokesRef.current = [];
            redraw();
            setVersion((v) => v + 1);
          }}
        >
          Clear
        </Button>
        <div className="text-xs text-muted-foreground">v{version}</div>
      </div>

      <div ref={containerRef} className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundUrl}
          alt="Locked sketch background"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          crossOrigin="anonymous"
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
      </div>
    </div>
  );
});
