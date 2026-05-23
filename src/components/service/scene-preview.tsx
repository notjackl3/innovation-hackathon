"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Scene } from "@/lib/schemas/scene";
import { Button } from "@/components/ui/button";

export function ScenePreview({ scenes }: { scenes: Scene[] }) {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!playing) return;
    const scene = scenes[index];
    if (!scene) {
      setPlaying(false);
      return;
    }
    // Schedule next scene
    const ms = (scene.durationSec ?? 4) * 1000;
    const t = setTimeout(() => {
      if (index + 1 >= scenes.length) {
        setPlaying(false);
      } else {
        setIndex(index + 1);
      }
    }, ms);
    // Audio
    if (audioRef.current && scene.audioStorageKey) {
      audioRef.current.src = `/api/storage/${scene.audioStorageKey}`;
      audioRef.current.play().catch(() => {});
    }
    return () => clearTimeout(t);
  }, [index, playing, scenes]);

  const scene = scenes[index];

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-neutral-900">
        <AnimatePresence mode="wait">
          {scene?.frameStorageKey ? (
            <motion.img
              key={scene.frameStorageKey}
              src={`/api/storage/${scene.frameStorageKey}`}
              alt={scene.title}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1.0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.5 }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-white/60">
              Scene {scene?.index ?? 0 + 1} (no frame yet)
            </div>
          )}
        </AnimatePresence>
        {scene?.caption && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <div className="mx-auto max-w-2xl text-center text-lg font-semibold text-white drop-shadow">
              {scene.caption}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Scene {index + 1} of {scenes.length}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            ←
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (playing) {
                setPlaying(false);
                audioRef.current?.pause();
              } else {
                if (index >= scenes.length - 1) setIndex(0);
                setPlaying(true);
              }
            }}
          >
            {playing ? "Pause" : "Play preview"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndex((i) => Math.min(scenes.length - 1, i + 1))}
            disabled={index >= scenes.length - 1}
          >
            →
          </Button>
        </div>
      </div>
      <audio ref={audioRef} />
    </div>
  );
}
