"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobProgress, useJob } from "@/components/shared/job-progress";
import { BlockRenderer } from "./block-renderer";
import {
  DemoBundleSchema,
  ProductSpecSchema,
  type DemoBundle,
  type ProductSpec,
  type ScreenSpec,
} from "@/lib/schemas/screen";

interface VersionLite {
  id: string;
  contentJson: string | null;
  createdAt: string;
}

interface ArtifactLite {
  id: string;
  kind: string;
  currentVersionId: string | null;
  versions: VersionLite[];
}

export function SoftwareWorkspace({
  trackId,
  initialArtifacts,
}: {
  trackId: string;
  initialArtifacts: ArtifactLite[];
}) {
  const router = useRouter();
  const [artifacts] = useState(initialArtifacts);
  const [specJobId, setSpecJobId] = useState<string | null>(null);
  const [screensJobId, setScreensJobId] = useState<string | null>(null);
  const specJob = useJob(specJobId);
  const screensJob = useJob(screensJobId);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const specArtifact = useMemo(() => artifacts.find((a) => a.kind === "PRODUCT_SPEC"), [artifacts]);
  const bundleArtifact = useMemo(() => artifacts.find((a) => a.kind === "DEMO_BUNDLE"), [artifacts]);

  const spec: ProductSpec | null = useMemo(() => {
    const v = specArtifact?.versions.find((x) => x.id === specArtifact?.currentVersionId) ?? specArtifact?.versions[0];
    if (!v?.contentJson) return null;
    const parsed = ProductSpecSchema.safeParse(JSON.parse(v.contentJson));
    return parsed.success ? parsed.data : null;
  }, [specArtifact]);

  const bundle: DemoBundle | null = useMemo(() => {
    const v = bundleArtifact?.versions.find((x) => x.id === bundleArtifact?.currentVersionId) ?? bundleArtifact?.versions[0];
    if (!v?.contentJson) return null;
    const parsed = DemoBundleSchema.safeParse(JSON.parse(v.contentJson));
    return parsed.success ? parsed.data : null;
  }, [bundleArtifact]);

  const screenIndex: Record<string, ScreenSpec> = useMemo(
    () => Object.fromEntries((bundle?.screens ?? []).map((s) => [s.name, s])),
    [bundle]
  );

  useEffect(() => {
    if (specJob?.status === "SUCCEEDED" || screensJob?.status === "SUCCEEDED") {
      router.refresh();
    }
  }, [specJob?.status, screensJob?.status, router]);

  useEffect(() => {
    if (!activeScreen && bundle) setActiveScreen(bundle.startScreen);
  }, [bundle, activeScreen]);

  async function generateSpec() {
    const res = await fetch(`/api/tracks/${trackId}/software/spec`, { method: "POST" });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setSpecJobId(jobId);
  }

  async function publish() {
    if (!bundleArtifact) return;
    setPublishing(true);
    const res = await fetch(`/api/tracks/${trackId}/software/demo/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleArtifactId: bundleArtifact.id }),
    });
    setPublishing(false);
    if (!res.ok) return;
    const data = (await res.json()) as { url: string };
    setShareUrl(data.url);
  }

  async function generateScreens(onlyScreen?: string) {
    if (!specArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/software/screens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSpecArtifactId: specArtifact.id,
        bundleArtifactId: bundleArtifact?.id,
        onlyScreen,
      }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setScreensJobId(jobId);
  }

  const activeSpec = activeScreen ? screenIndex[activeScreen] : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product spec</h2>
            <p className="text-sm text-muted-foreground">
              Spark generates a structured spec, then renders screens block-by-block.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {specJobId && <JobProgress job={specJob} className="w-48" />}
            <Button onClick={generateSpec}>{spec ? "Regenerate spec" : "Generate spec"}</Button>
          </div>
        </CardContent>
      </Card>

      {spec && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">{spec.name}</h3>
                <p className="text-sm text-muted-foreground">{spec.tagline}</p>
              </div>
              <div className="flex items-center gap-3">
                {screensJobId && <JobProgress job={screensJob} className="w-48" />}
                <Button onClick={() => generateScreens()}>
                  {bundle ? "Regenerate all screens" : "Generate screens"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="text-muted-foreground">Screens:</span>
              {spec.screens.map((s) => (
                <Badge key={s} variant={screenIndex[s] ? "default" : "muted"}>
                  {s}
                </Badge>
              ))}
            </div>
            {bundle && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button size="sm" onClick={publish} disabled={publishing}>
                  {publishing ? "Publishing…" : "Publish demo"}
                </Button>
                {shareUrl && (
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Open share link → {shareUrl}
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {bundle && activeSpec && (
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <Card>
            <CardContent className="p-2">
              <ul className="space-y-1">
                {bundle.screens.map((s) => (
                  <li key={s.name}>
                    <button
                      onClick={() => setActiveScreen(s.name)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        activeScreen === s.name
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {s.navLabel}
                    </button>
                  </li>
                ))}
              </ul>
              {spec && (
                <div className="mt-2 border-t pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => activeScreen && generateScreens(activeScreen)}
                    className="w-full justify-start"
                  >
                    Regenerate this screen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between border-b pb-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Live demo · {activeSpec.title}
                </div>
                <Badge variant="muted">{activeSpec.blocks.length} blocks</Badge>
              </div>
              <BlockRenderer
                spec={activeSpec}
                screenIndex={screenIndex}
                onNavigate={(name) => setActiveScreen(name)}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
