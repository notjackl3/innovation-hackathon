"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyBrief } from "@/lib/schemas/brief";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Read-only "what we know about this company" view, populated by the research
 * agent. Includes an opt-in inline editor for the rare case the user wants to
 * tweak fields by hand.
 */
export function ResearchSummary({
  companyId,
  brief,
}: {
  companyId: string;
  brief: CompanyBrief;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyBrief>(brief);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: draft }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>What we know</CardTitle>
          <p className="text-xs text-muted-foreground">
            Compiled from the research agent. Edit any field if it&rsquo;s off.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {editing ? (
          <Editor draft={draft} setDraft={setDraft} saving={saving} onSave={save} />
        ) : (
          <ReadView brief={brief} />
        )}
      </CardContent>
    </Card>
  );
}

function ReadView({ brief }: { brief: CompanyBrief }) {
  const hasAny =
    brief.industry ||
    brief.oneLiner ||
    brief.valueProps.length ||
    brief.brandVoice.adjectives.length ||
    brief.visualStyle.palette.length ||
    brief.customers.length ||
    brief.constraints.length;

  if (!hasAny) {
    return (
      <p className="text-sm text-muted-foreground">
        No research data yet. Click <em>Edit</em> to fill in manually.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {brief.industry && (
        <Section label="Industry">
          <Badge variant="muted">{brief.industry}</Badge>
        </Section>
      )}
      {brief.oneLiner && (
        <Section label="One-liner">
          <p className="text-sm italic">&ldquo;{brief.oneLiner}&rdquo;</p>
        </Section>
      )}
      {brief.visualStyle.palette.length > 0 && (
        <Section label="Palette">
          <div className="flex flex-wrap gap-2">
            {brief.visualStyle.palette.map((c) => (
              <div key={c} className="flex items-center gap-1.5 rounded border bg-background px-2 py-1">
                <span className="h-4 w-4 rounded" style={{ background: c }} />
                <code className="text-[11px] tabular-nums">{c}</code>
              </div>
            ))}
          </div>
        </Section>
      )}
      {brief.valueProps.length > 0 && (
        <Section label="Value props">
          <div className="flex flex-wrap gap-1.5">
            {brief.valueProps.map((v) => (
              <Badge key={v} variant="outline">{v}</Badge>
            ))}
          </div>
        </Section>
      )}
      {brief.brandVoice.adjectives.length > 0 && (
        <Section label="Brand voice">
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {brief.brandVoice.adjectives.map((a) => (
                <Badge key={a} variant="default">{a}</Badge>
              ))}
            </div>
            {brief.brandVoice.doNots.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {brief.brandVoice.doNots.map((d) => (
                  <Badge key={d} variant="destructive">avoid: {d}</Badge>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}
      {(brief.visualStyle.sketchStyle || brief.visualStyle.photographyVibe || brief.visualStyle.typographyVibe) && (
        <Section label="Visual style">
          <dl className="space-y-1 text-sm">
            {brief.visualStyle.sketchStyle && <Pair label="Sketches" value={brief.visualStyle.sketchStyle} />}
            {brief.visualStyle.photographyVibe && <Pair label="Photography" value={brief.visualStyle.photographyVibe} />}
            {brief.visualStyle.typographyVibe && <Pair label="Typography" value={brief.visualStyle.typographyVibe} />}
          </dl>
        </Section>
      )}
      {brief.customers.length > 0 && (
        <Section label="Customer segments">
          <ul className="space-y-1.5 text-sm">
            {brief.customers.map((c, i) => (
              <li key={i} className="rounded-md border bg-muted/30 p-2">
                <div className="font-medium">{c.segment}</div>
                {c.needs.length > 0 && (
                  <div className="text-xs text-muted-foreground">{c.needs.join(" · ")}</div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {brief.constraints.length > 0 && (
        <Section label="Constraints">
          <ul className="space-y-1 text-sm">
            {brief.constraints.map((c, i) => (
              <li key={i} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}:</span>{" "}
      <span>{value}</span>
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  saving,
  onSave,
}: {
  draft: CompanyBrief;
  setDraft: (b: CompanyBrief) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <Field label="Industry">
        <Input value={draft.industry} onChange={(e) => setDraft({ ...draft, industry: e.target.value })} />
      </Field>
      <Field label="One-liner">
        <Input value={draft.oneLiner} onChange={(e) => setDraft({ ...draft, oneLiner: e.target.value })} />
      </Field>
      <Field label="Value props (comma-separated)">
        <Input
          value={draft.valueProps.join(", ")}
          onChange={(e) =>
            setDraft({ ...draft, valueProps: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
        />
      </Field>
      <Field label="Brand voice adjectives">
        <Input
          value={draft.brandVoice.adjectives.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              brandVoice: {
                ...draft.brandVoice,
                adjectives: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
      </Field>
      <Field label="Palette (hex, comma-separated)">
        <Input
          value={draft.visualStyle.palette.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              visualStyle: {
                ...draft.visualStyle,
                palette: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
      </Field>
      <Field label="Constraints (one per line)">
        <Textarea
          rows={3}
          value={draft.constraints.join("\n")}
          onChange={(e) => setDraft({ ...draft, constraints: e.target.value.split("\n").filter(Boolean) })}
        />
      </Field>
      <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
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
