"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Environment, Stage } from "@react-three/drei";
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

export function MeshViewer({
  glbUrl,
  pending,
}: {
  glbUrl?: string | null;
  pending?: boolean;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);
  // Force re-mount when URL changes
  const [k, setK] = useState(0);
  useEffect(() => {
    setLoadError(null);
    setK((v) => v + 1);
  }, [glbUrl]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-neutral-900">
      <Canvas
        key={k}
        camera={{ position: [2.5, 1.6, 3], fov: 45 }}
        onCreated={({ gl }) => gl.setClearColor("#0a0a0c")}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <Stage adjustCamera={1.2} environment="city" intensity={0.5}>
            {glbUrl ? (
              <ModelOrFallback url={glbUrl} onError={(m) => setLoadError(m)} />
            ) : (
              <Placeholder />
            )}
          </Stage>
        </Suspense>
        <OrbitControls makeDefault enableDamping />
        <Environment preset="city" />
      </Canvas>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wide text-white/80">
        {glbUrl ? (loadError ? "load failed (placeholder)" : "3D model") : pending ? "Generating…" : "Placeholder"}
      </div>
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
  );
}

function ModelOrFallback({ url, onError }: { url: string; onError: (m: string) => void }) {
  try {
    return <Model url={url} />;
  } catch (e) {
    onError((e as Error).message);
    return <Placeholder />;
  }
}
