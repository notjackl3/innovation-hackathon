"use client";

import { useSyncExternalStore } from "react";

export interface JobSnapshot {
  id: string;
  kind: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress: number;
  logs: string[];
  output: unknown;
  error?: string | null;
}

export interface JobItem extends JobSnapshot {
  firstSeenAt: number;
  completedAt: number | null;
  dismissed: boolean;
}

let items: ReadonlyArray<JobItem> = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function isTerminal(status: JobSnapshot["status"]) {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}

export function publishJob(snap: JobSnapshot) {
  const existing = items.find((x) => x.id === snap.id);
  const now = Date.now();
  const completedAt = isTerminal(snap.status)
    ? existing?.completedAt ?? now
    : null;
  const next: JobItem = {
    ...snap,
    firstSeenAt: existing?.firstSeenAt ?? now,
    completedAt,
    dismissed: existing?.dismissed ?? false,
  };
  items = existing
    ? items.map((x) => (x.id === snap.id ? next : x))
    : [...items, next];
  emit();
}

export function dismissJob(id: string) {
  if (!items.some((x) => x.id === id && !x.dismissed)) return;
  items = items.map((x) => (x.id === id ? { ...x, dismissed: true } : x));
  emit();
}

export function removeJob(id: string) {
  if (!items.some((x) => x.id === id)) return;
  items = items.filter((x) => x.id !== id);
  emit();
}

export function subscribeJobsStore(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getJobsSnapshot(): ReadonlyArray<JobItem> {
  return items;
}

const EMPTY: ReadonlyArray<JobItem> = [];
function getServerSnapshot() {
  return EMPTY;
}

export function useJobsStore(): ReadonlyArray<JobItem> {
  return useSyncExternalStore(subscribeJobsStore, getJobsSnapshot, getServerSnapshot);
}
