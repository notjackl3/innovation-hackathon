"use client";

import React, { Suspense, useEffect, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Bounds } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Button } from "@/components/ui/button";

function Model({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} />;
}

function Placeholder() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#d24b2d" />
    </mesh>
  );
}

/**
 * Class ErrorBoundary — necessary because `useLoader` throws via Suspense and
 * try/catch in render does not catch async/Suspense errors. Without this, a
 * bad GLB (including the mock SVG-as-GLB) crashes the whole client render and
 * shows the raw parser error.
 */
class CanvasErrorBoundary extends React.Component<
  { onError: (msg: string) => void; children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message || "Failed to load 3D model");
  }
  componentDidUpdate(prev: { children: React.ReactNode }) {
    if (prev.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface BgPreset {
  name: string;
  color: string;
  /** Text label color for the top-left chip so it stays legible. */
  fg: "light" | "dark";
}

const PRESETS: BgPreset[] = [
  { name: "Dark", color: "#0a0a0c", fg: "light" },
  { name: "Slate", color: "#1f2937", fg: "light" },
  { name: "Light", color: "#f5f5f4", fg: "dark" },
  { name: "Cream", color: "#f1e9d8", fg: "dark" },
  { name: "Studio", color: "#2a2a2a", fg: "light" },
  { name: "Sky", color: "#bfe1ff", fg: "dark" },
  { name: "Sage", color: "#c9d8c5", fg: "dark" },
  { name: "Blush", color: "#f4c8c8", fg: "dark" },
];

export function MeshViewer({
  glbUrl,
  pending,
}: {
  glbUrl?: string | null;
  pending?: boolean;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bg, setBg] = useState<string>(PRESETS[0].color);
  // Force re-mount of the Canvas tree when URL changes so the error boundary resets.
  const [k, setK] = useState(0);
  useEffect(() => {
    setLoadError(null);
    setK((v) => v + 1);
  }, [glbUrl]);

  const isLightBg = (() => {
    // Compute brightness for chip contrast.
    const hex = bg.replace("#", "");
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  })();

  const label = glbUrl
    ? loadError
      ? "Preview unavailable (placeholder)"
      : "3D model"
    : pending
      ? "Generating…"
      : "Placeholder";

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-md border"
        style={{ background: bg }}
      >
        <Canvas key={k} camera={{ position: [2.5, 1.6, 3], fov: 45 }}>
          <color attach="background" args={[bg]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1.0} />
          <directionalLight position={[-5, 3, -5]} intensity={0.4} />
          <hemisphereLight args={["#ffffff", "#444466", 0.6]} />
          <Suspense fallback={<Placeholder />}>
            <Bounds fit clip observe margin={1.2}>
              {glbUrl && !loadError ? (
                <CanvasErrorBoundary onError={(m) => setLoadError(m)} fallback={<Placeholder />}>
                  <Model url={glbUrl} />
                </CanvasErrorBoundary>
              ) : (
                <Placeholder />
              )}
            </Bounds>
          </Suspense>
          <OrbitControls makeDefault enableDamping />
        </Canvas>
        <div
          className={`pointer-events-none absolute left-2 top-2 rounded px-2 py-1 text-[10px] uppercase tracking-wide ${
            isLightBg ? "bg-black/50 text-white/90" : "bg-black/50 text-white/80"
          }`}
        >
          {label}
        </div>
        {loadError && (
          <div className="pointer-events-none absolute inset-x-2 top-9 max-w-[260px] rounded bg-black/60 px-2 py-1 text-[10px] leading-relaxed text-white/70">
            The stored asset isn&rsquo;t a valid glTF. This is expected when{" "}
            <code className="rounded bg-white/10 px-1">MOCK_AI=true</code> or{" "}
            <code className="rounded bg-white/10 px-1">MESHY_API_KEY</code> is unset.
          </div>
        )}
        {glbUrl && !loadError && (
          <div className="pointer-events-auto absolute bottom-2 right-2">
            <Button asChild size="sm" variant="secondary">
              <a href={glbUrl} download="model.glb">
                Download GLB
              </a>
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto rounded-md border bg-muted/30 px-3 py-2.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          BG
        </span>
        {PRESETS.map((p) => {
          const isActive = bg.toLowerCase() === p.color.toLowerCase();
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => setBg(p.color)}
              title={p.name}
              aria-label={`${p.name} background`}
              className={`h-6 w-6 shrink-0 rounded-full border transition ${
                isActive ? "ring-2 ring-primary ring-offset-2" : "hover:scale-110"
              }`}
              style={{ background: p.color }}
            />
          );
        })}
        <input
          type="color"
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          title="Custom color"
          aria-label="Custom background color"
          className="h-6 w-6 shrink-0 cursor-pointer rounded-full border bg-transparent p-0"
        />
      </div>
    </div>
  );
}
