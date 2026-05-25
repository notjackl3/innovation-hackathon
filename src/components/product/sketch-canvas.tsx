"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";

export interface SketchCanvasHandle {
  exportComposite: () => Promise<string>;
  hasStrokes: () => boolean;
  clear: () => void;
}

interface Props {
  backgroundUrl: string;
}

type Tool = "pen" | "eraser" | "line" | "rect" | "ellipse" | "fill";

interface Point {
  x: number;
  y: number;
}

type Shape =
  | { kind: "pen"; color: string; size: number; points: Point[] }
  | { kind: "eraser"; size: number; points: Point[] }
  | { kind: "line"; color: string; size: number; start: Point; end: Point }
  | { kind: "rect"; color: string; size: number; start: Point; end: Point; filled: boolean }
  | { kind: "ellipse"; color: string; size: number; start: Point; end: Point; filled: boolean }
  /** Bucket fill: result is a transparent overlay-sized canvas with fill pixels only. */
  | { kind: "fill"; canvas: HTMLCanvasElement };

function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      255,
    ];
  }
  return [255, 255, 255, 255];
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { backgroundUrl },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const redoStackRef = useRef<Shape[]>([]);
  const drawingRef = useRef(false);
  const previewRef = useRef<Shape | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#d24b2d");
  const [size, setSize] = useState(4);
  const [filled, setFilled] = useState(false);
  const [version, setVersion] = useState(0);

  useImperativeHandle(ref, () => ({
    async exportComposite() {
      const overlay = overlayRef.current;
      if (!overlay) return "";
      const w = overlay.width;
      const h = overlay.height;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d")!;
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
      return shapesRef.current.length > 0;
    },
    clear() {
      shapesRef.current = [];
      redoStackRef.current = [];
      previewRef.current = null;
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
    redraw();
  }

  function applyShapeToCtx(ctx: CanvasRenderingContext2D, shape: Shape, dpr: number) {
    // Save composite state so eraser doesn't leak into next shape.
    const prev = ctx.globalCompositeOperation;
    if (shape.kind === "fill") {
      // Fill canvas is already at device size — blit 1:1 ignoring the dpr scale.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(shape.canvas, 0, 0);
      ctx.restore();
      return;
    }
    // Everything else is drawn in CSS coords with the dpr scale active.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (shape.kind === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.size;
      strokePath(ctx, shape.points);
    } else if (shape.kind === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = shape.size;
      strokePath(ctx, shape.points);
    } else if (shape.kind === "line") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.size;
      ctx.beginPath();
      ctx.moveTo(shape.start.x, shape.start.y);
      ctx.lineTo(shape.end.x, shape.end.y);
      ctx.stroke();
    } else if (shape.kind === "rect") {
      ctx.globalCompositeOperation = "source-over";
      const x = Math.min(shape.start.x, shape.end.x);
      const y = Math.min(shape.start.y, shape.end.y);
      const w = Math.abs(shape.end.x - shape.start.x);
      const h = Math.abs(shape.end.y - shape.start.y);
      if (shape.filled) {
        ctx.fillStyle = shape.color;
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.size;
        ctx.strokeRect(x, y, w, h);
      }
    } else if (shape.kind === "ellipse") {
      ctx.globalCompositeOperation = "source-over";
      const cx = (shape.start.x + shape.end.x) / 2;
      const cy = (shape.start.y + shape.end.y) / 2;
      const rx = Math.abs(shape.end.x - shape.start.x) / 2;
      const ry = Math.abs(shape.end.y - shape.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (shape.filled) {
        ctx.fillStyle = shape.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.size;
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = prev;
  }

  function strokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
    if (points.length === 0) return;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    // Single-point: draw a dot so taps register.
    if (points.length === 1) {
      ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
    }
    ctx.stroke();
  }

  function redraw() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const s of shapesRef.current) applyShapeToCtx(ctx, s, dpr);
    if (previewRef.current) applyShapeToCtx(ctx, previewRef.current, dpr);
  }

  useEffect(() => {
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrl]);

  function pointer(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function commitShape(shape: Shape) {
    shapesRef.current.push(shape);
    redoStackRef.current = []; // any new action invalidates the redo stack
    previewRef.current = null;
    redraw();
    setVersion((v) => v + 1);
  }

  function undo() {
    const s = shapesRef.current.pop();
    if (!s) return;
    redoStackRef.current.push(s);
    redraw();
    setVersion((v) => v + 1);
  }

  function redo() {
    const s = redoStackRef.current.pop();
    if (!s) return;
    shapesRef.current.push(s);
    redraw();
    setVersion((v) => v + 1);
  }

  function bucketFill(seedCss: Point) {
    const overlay = overlayRef.current;
    const bg = bgImgRef.current;
    if (!overlay || !bg) return;
    const w = overlay.width;
    const h = overlay.height;
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.floor(seedCss.x * dpr);
    const sy = Math.floor(seedCss.y * dpr);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

    // Build a device-sized composite (background stretched to fill + current overlay).
    const composite = document.createElement("canvas");
    composite.width = w;
    composite.height = h;
    const cctx = composite.getContext("2d")!;
    try {
      cctx.drawImage(bg, 0, 0, w, h);
    } catch {
      // CORS or not-yet-loaded — fall back to just the overlay.
    }
    cctx.drawImage(overlay, 0, 0);

    let img: ImageData;
    try {
      img = cctx.getImageData(0, 0, w, h);
    } catch {
      // Tainted canvas (background image cross-origin without proper headers).
      // Bucket fill needs pixel access, so abort gracefully.
      // eslint-disable-next-line no-console
      console.warn("Bucket fill unavailable: canvas is tainted (cross-origin background).");
      return;
    }
    const data = img.data;
    const seedIdx = (sy * w + sx) * 4;
    const tr = data[seedIdx];
    const tg = data[seedIdx + 1];
    const tb = data[seedIdx + 2];
    const fill = hexToRgba(color);
    if (tr === fill[0] && tg === fill[1] && tb === fill[2]) return;

    // Output canvas: overlay-sized, transparent except where the fill applies.
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    const fillImg = octx.createImageData(w, h);
    const fd = fillImg.data;

    // Iterative BFS with a stack — recursive flood-fill blows the JS stack
    // for any non-trivial region.
    const tol = 24; // per-channel tolerance squared budget
    const tolSq = tol * tol * 3;
    const visited = new Uint8Array(w * h);
    const stack: number[] = [sy * w + sx];
    while (stack.length) {
      const p = stack.pop()!;
      if (visited[p]) continue;
      visited[p] = 1;
      const di = p * 4;
      const dr = data[di] - tr;
      const dg = data[di + 1] - tg;
      const db = data[di + 2] - tb;
      if (dr * dr + dg * dg + db * db > tolSq) continue;
      fd[di] = fill[0];
      fd[di + 1] = fill[1];
      fd[di + 2] = fill[2];
      fd[di + 3] = fill[3];
      const px = p % w;
      const py = (p - px) / w;
      if (px > 0) stack.push(p - 1);
      if (px < w - 1) stack.push(p + 1);
      if (py > 0) stack.push(p - w);
      if (py < h - 1) stack.push(p + w);
    }
    octx.putImageData(fillImg, 0, 0);
    commitShape({ kind: "fill", canvas: out });
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = pointer(e);
    if (tool === "fill") {
      bucketFill(p);
      return;
    }
    drawingRef.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (tool === "pen") {
      previewRef.current = { kind: "pen", color, size, points: [p] };
    } else if (tool === "eraser") {
      previewRef.current = { kind: "eraser", size: size * 3, points: [p] };
    } else if (tool === "line") {
      previewRef.current = { kind: "line", color, size, start: p, end: p };
    } else if (tool === "rect") {
      previewRef.current = { kind: "rect", color, size, start: p, end: p, filled };
    } else if (tool === "ellipse") {
      previewRef.current = { kind: "ellipse", color, size, start: p, end: p, filled };
    }
    redraw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !previewRef.current) return;
    const p = pointer(e);
    const s = previewRef.current;
    if (s.kind === "pen" || s.kind === "eraser") {
      s.points.push(p);
    } else if (s.kind === "line" || s.kind === "rect" || s.kind === "ellipse") {
      s.end = p;
    }
    redraw();
  }

  function onUp() {
    if (!drawingRef.current || !previewRef.current) return;
    drawingRef.current = false;
    commitShape(previewRef.current);
  }

  // Keyboard shortcuts: tools + undo/redo. Only when canvas area has focus
  // or when the user isn't typing in an input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (meta) return;
      switch (e.key.toLowerCase()) {
        case "p": setTool("pen"); break;
        case "e": setTool("eraser"); break;
        case "l": setTool("line"); break;
        case "r": setTool("rect"); break;
        case "o": setTool("ellipse"); break;
        case "b":
        case "g": setTool("fill"); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tools: { key: Tool; label: string; hint: string }[] = [
    { key: "pen", label: "Pen", hint: "Freehand stroke (P)" },
    { key: "eraser", label: "Eraser", hint: "Erase strokes (E)" },
    { key: "line", label: "Line", hint: "Straight line (L)" },
    { key: "rect", label: "Rect", hint: "Rectangle (R)" },
    { key: "ellipse", label: "Ellipse", hint: "Ellipse / circle (O)" },
    { key: "fill", label: "Fill", hint: "Bucket fill (B)" },
  ];

  const supportsFillToggle = tool === "rect" || tool === "ellipse";
  const supportsSize = tool !== "fill";
  const supportsColor = tool !== "eraser";
  const canUndo = shapesRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.hint}
              onClick={() => setTool(t.key)}
              className={`px-2.5 py-1 text-xs ${
                tool === t.key ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {supportsColor && (
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border"
            title="Stroke / fill color"
          />
        )}

        {supportsSize && (
          <input
            type="range"
            min={1}
            max={36}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10))}
            className="h-7"
            title={`Size: ${size}px`}
          />
        )}

        {supportsFillToggle && (
          <label className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
            <input
              type="checkbox"
              checked={filled}
              onChange={(e) => setFilled(e.target.checked)}
            />
            Filled
          </label>
        )}

        <div className="flex overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
          >
            ↷ Redo
          </button>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            shapesRef.current = [];
            redoStackRef.current = [];
            previewRef.current = null;
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
          ref={bgImgRef}
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
