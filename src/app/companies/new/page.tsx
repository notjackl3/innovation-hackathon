"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function NewCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rawProfile, setRawProfile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rawProfile }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error?.formErrors?.join(", ") ?? "Failed to create company.");
      setSubmitting(false);
      return;
    }
    const data = (await res.json()) as { id: string };
    router.push(`/companies/${data.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">New company</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Start by giving Spark a sense of who you are. You can paste a profile now and refine the brief
        from uploaded documents on the next page.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Company name</Label>
              <Input
                id="name"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tim Hortons"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rawProfile">Profile (paste anything)</Label>
              <Textarea
                id="rawProfile"
                rows={8}
                value={rawProfile}
                onChange={(e) => setRawProfile(e.target.value)}
                placeholder="Industry, customers, value props, brand voice, visual style cues…"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create company"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
