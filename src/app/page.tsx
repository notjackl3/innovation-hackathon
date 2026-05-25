import type { Metadata } from "next";
import { SiteHeader } from "@/components/landing/site-header";
import { Hero } from "@/components/landing/hero";
import { SocialProof } from "@/components/landing/social-proof";
import { MediaShowcase } from "@/components/landing/media-showcase";
import { Benefits } from "@/components/landing/benefits";
import { Testimonials } from "@/components/landing/testimonials";
import { FAQ } from "@/components/landing/faq";
import { FinalCTA } from "@/components/landing/final-cta";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = {
  title: "Spark — Turn raw ideas into things you can see",
  description:
    "Spark is the innovation visualization platform. Drop in an idea and a company profile, and Spark routes it into a Product, Service, or Software pipeline — turning concepts into 3D models, animated video, and click-through demos in minutes.",
  keywords: [
    "innovation visualization",
    "idea to prototype",
    "3D model generator",
    "click-through demo",
    "product visualization",
    "rapid prototyping",
    "AI prototyping platform",
  ],
  openGraph: {
    title: "Spark — Turn raw ideas into things you can see",
    description:
      "Route any innovation idea into an interactive Product, Service, or Software visualization in under five minutes.",
    type: "website",
    siteName: "Spark",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spark — Turn raw ideas into things you can see",
    description:
      "Route any innovation idea into an interactive Product, Service, or Software visualization in under five minutes.",
  },
};

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <SocialProof />
        <MediaShowcase />
        <Benefits />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
