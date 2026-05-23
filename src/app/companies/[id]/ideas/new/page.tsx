"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function NewIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = use(params);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, title, rawInput }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error?.formErrors?.join(", ") ?? "Failed to submit idea.");
      setSubmitting(false);
      return;
    }
    const data = (await res.json()) as { id: string };
    router.push(`/ideas/${data.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`/companies/${companyId}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to company
      </Link>
      <h1 className="mt-1 mb-8 text-2xl font-semibold tracking-tight">New idea</h1>
      <Card>
        <CardHeader>
          <CardTitle>Describe the idea</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                required
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Late-night study café"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="raw">Description</Label>
              <Textarea
                id="raw"
                rows={8}
                value={rawInput}
                required
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="What is it? Who's it for? What's the moment of value?"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for triage"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
