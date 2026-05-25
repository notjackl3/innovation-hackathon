# Spark Landing Page — Bold Editorial (Shopify-inspired)

Target: replace `/` with a marketing landing page. App entry stays via header/CTAs → `/dashboard` + `/companies/new`.
Aesthetic: light/warm, premium, huge Bricolage Grotesque headlines, burnt-orange + pipeline accents (amber/emerald/sky).
Motion: framer-motion staggered hero, scroll-reveal everywhere, count-up stats, hover lift, animated accordion. Respect prefers-reduced-motion.
Content: demo-polished (believable fabricated proof). No new deps.

## Slice 1 — Design system + primitives + header + hero
- [ ] Fonts: Bricolage Grotesque (display) + Space Grotesk (body) via next/font in layout.tsx
- [ ] globals.css: wire font vars, heading rule, reduced-motion guard, scrim/util helpers
- [ ] tailwind.config.ts: add `display` font family + pipeline accent colors
- [ ] `reveal.tsx` — reusable scroll-reveal (whileInView fade-up, staggered)
- [ ] `count-up.tsx` — animated number on view
- [ ] `site-header.tsx` — sticky, blur-on-scroll, animated logo, nav, CTA (element 2)
- [ ] `hero.tsx` — massive headline + subtitle + dual CTA + full-bleed media (elements 3,4)

## Slice 2 — Proof + media + benefits
- [ ] `social-proof.tsx` — count-up stats, avatar cluster + rating, logo strip (element 5)
- [ ] `media-showcase.tsx` — 3 pipeline output frames, tilt + parallax reveal (element 6)
- [ ] `benefits.tsx` — bento grid, pipeline-coded lucide icons (element 7)

## Slice 3 — Testimonials + FAQ + final CTA + footer
- [ ] `testimonials.tsx` — 5 believable quotes, gradient-ring avatars (element 8)
- [ ] `faq.tsx` — custom accordion, 7 Q&A (element 9)
- [ ] `final-cta.tsx` — full-width dramatic, email capture (element 10)
- [ ] `site-footer.tsx` — multi-column, social icons, newsletter, legal (element 11)

## Slice 4 — Wire + polish
- [ ] Rewrite `page.tsx` to compose sections; update metadata/SEO (element 1)
- [ ] typecheck + build green
- [ ] run dev, screenshot desktop + mobile, fix issues
- [ ] reduced-motion + a11y pass

## Review
- All 11 elements built as components under `src/components/landing/`, composed in `page.tsx`.
- Fonts: Bricolage Grotesque (display) + Space Grotesk (body) via next/font. Inter removed.
- Motion: staggered hero, scroll-reveal (whileInView), count-up stats, hover lift, animated FAQ accordion, floating frames. All gated behind prefers-reduced-motion.
- No new dependencies (framer-motion + lucide-react already present; accordion/avatar hand-rolled).
- Removed fabricated "Trusted by" logo strip per user request.
- Verified: dev compiles clean, 0 console errors, desktop + mobile render correctly, all sections lay out (scrollH 6926).
- NOT touched: pipelines, API, other routes. Pre-existing `@/lib/storage` typecheck errors are unrelated (left alone).
- App entry preserved via header/CTAs → /dashboard + /companies/new.
