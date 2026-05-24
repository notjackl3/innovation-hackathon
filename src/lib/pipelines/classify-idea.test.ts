import { describe, it, expect } from "vitest";
import { guessType } from "./classify-idea";

interface Case {
  text: string;
  expected: "PRODUCT" | "SERVICE" | "SOFTWARE";
}

const CASES: Case[] = [
  // PRODUCT — physical objects, no service/software cues
  { text: "Reusable insulated water bottle for hikers with leak-proof lid", expected: "PRODUCT" },
  { text: "Smart sneakers with embedded GPS tracker", expected: "PRODUCT" },
  { text: "Compact espresso machine that fits on any countertop", expected: "PRODUCT" },
  { text: "A modular backpack with swappable compartments", expected: "PRODUCT" },
  { text: "Wireless noise-cancelling headphones for kids", expected: "PRODUCT" },

  // SERVICE — experience-led, subscription, on-demand, physical venue
  { text: "Late-night study cafe with quiet zones and a focus playlist for students", expected: "SERVICE" },
  { text: "Subscription dog grooming service that comes to your door", expected: "SERVICE" },
  { text: "On-demand massage delivery for office workers during lunch", expected: "SERVICE" },
  { text: "Monthly membership coaching program for first-time founders", expected: "SERVICE" },
  { text: "Concierge booking and pickup service for vintage rentals", expected: "SERVICE" },

  // SOFTWARE — apps, platforms, AI tools, dashboards
  { text: "SaaS dashboard for tracking inventory across multiple warehouses", expected: "SOFTWARE" },
  { text: "AI-powered code review chatbot that runs in Slack", expected: "SOFTWARE" },
  { text: "Mobile app for booking dog walkers in your neighbourhood", expected: "SOFTWARE" },
  { text: "Analytics platform with LLM-driven anomaly detection", expected: "SOFTWARE" },
  { text: "API for converting raw receipts into structured expense data", expected: "SOFTWARE" },
];

describe("guessType (mock-mode classifier)", () => {
  for (const c of CASES) {
    it(`classifies as ${c.expected}: ${c.text.slice(0, 60)}…`, () => {
      expect(guessType(c.text)).toBe(c.expected);
    });
  }

  it("defaults to PRODUCT when no keywords match", () => {
    expect(guessType("Some completely abstract concept words here")).toBe("PRODUCT");
  });

  it("is case-insensitive", () => {
    expect(guessType("SUBSCRIPTION COACHING")).toBe("SERVICE");
    expect(guessType("AI Platform")).toBe("SOFTWARE");
  });
});
