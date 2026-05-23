"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyBrief } from "@/lib/schemas/brief";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function BriefEditor({ companyId, initialBrief }: { companyId: string; initialBrief: CompanyBrief }) {
  const router = useRouter();
  const [brief, setBrief] = useState(initialBrief);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function update<K extends keyof CompanyBrief>(key: K, value: CompanyBrief[K]) {
    setBrief({ ...brief, [key]: value });
  }

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <Field label="Industry">
        <Input value={brief.industry} onChange={(e) => update("industry", e.target.value)} />
      </Field>
      <Field label="One-liner">
        <Input value={brief.oneLiner} onChange={(e) => update("oneLiner", e.target.value)} />
      </Field>
      <Field label="Value props (comma-separated)">
        <Input
          value={brief.valueProps.join(", ")}
          onChange={(e) => update("valueProps", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      </Field>
      <Field label="Brand voice adjectives">
        <Input
          value={brief.brandVoice.adjectives.join(", ")}
          onChange={(e) =>
            update("brandVoice", {
              ...brief.brandVoice,
              adjectives: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      </Field>
      <Field label="Brand voice do-nots">
        <Input
          value={brief.brandVoice.doNots.join(", ")}
          onChange={(e) =>
            update("brandVoice", {
              ...brief.brandVoice,
              doNots: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
      </Field>
      <Field label="Visual style — sketch">
        <Input
          value={brief.visualStyle.sketchStyle}
          onChange={(e) => update("visualStyle", { ...brief.visualStyle, sketchStyle: e.target.value })}
        />
      </Field>
      <Field label="Visual style — photography">
        <Input
          value={brief.visualStyle.photographyVibe}
          onChange={(e) => update("visualStyle", { ...brief.visualStyle, photographyVibe: e.target.value })}
        />
      </Field>
      <Field label="Palette (hex, comma-separated)">
        <Input
          value={brief.visualStyle.palette.join(", ")}
          onChange={(e) =>
            update("visualStyle", {
              ...brief.visualStyle,
              palette: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            })
          }
        />
        <div className="mt-1 flex gap-1">
          {brief.visualStyle.palette.map((c) => (
            <span key={c} className="h-4 w-4 rounded" style={{ background: c }} title={c} />
          ))}
        </div>
      </Field>
      <Field label="Constraints">
        <Textarea
          rows={2}
          value={brief.constraints.join("\n")}
          onChange={(e) => update("constraints", e.target.value.split("\n").filter(Boolean))}
        />
      </Field>

      <div className="flex items-center justify-between">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Saving…" : "Save brief"}
        </Button>
        {savedAt && <Badge variant="muted">Saved {savedAt}</Badge>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
