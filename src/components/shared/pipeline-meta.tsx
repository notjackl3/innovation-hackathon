import { Box, Play, Layers, type LucideIcon } from "lucide-react";

export type PipelineKind = "PRODUCT" | "SERVICE" | "SOFTWARE";

type Meta = {
  label: string;
  flow: string;
  icon: LucideIcon;
  /** text color */
  text: string;
  /** soft chip bg + text */
  chip: string;
  /** icon tile bg + text */
  tile: string;
};

const META: Record<PipelineKind, Meta> = {
  PRODUCT: {
    label: "Product",
    flow: "Sketch → 3D model",
    icon: Box,
    text: "text-product",
    chip: "bg-product/10 text-product",
    tile: "bg-product/10 text-product",
  },
  SERVICE: {
    label: "Service",
    flow: "Storyboard → video",
    icon: Play,
    text: "text-service",
    chip: "bg-service/10 text-service",
    tile: "bg-service/10 text-service",
  },
  SOFTWARE: {
    label: "Software",
    flow: "Spec → click-through demo",
    icon: Layers,
    text: "text-software",
    chip: "bg-software/10 text-software",
    tile: "bg-software/10 text-software",
  },
};

export function pipelineMeta(kind: string | null | undefined): Meta | null {
  if (!kind) return null;
  return META[kind as PipelineKind] ?? null;
}
