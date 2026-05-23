# Spark — Implementation Log

End-state of the initial build pass. All six phases shipped against the plan in `plan.md`.

## Phase 1 — Core shell, DB, ingestion
- Next.js 15.5 + React 19 + TS + Tailwind v3 + manual shadcn primitives (Button, Card, Input, Textarea, Label, Badge).
- Prisma + SQLite, all models from the plan: `Company`, `Document`, `Idea`, `VisualizationTrack`, `Artifact`, `ArtifactVersion` (with `parentVersionId` tree), `GenerationJob`, `PromptLog`, `SharedDemo`.
- `LocalStorageAdapter` with path-traversal protection (unit-tested).
- `JobRunner` interface + in-process implementation (`enqueueJob`, `runJob`, `registerHandler`). Inngest is the planned prod runner — same contract.
- Company create + document upload (PDF/text) + extraction pipeline (`EXTRACT_DOC`) merging into the structured Company Brief with provenance.
- Brief editor UI with manual fields (industry, value props, brand voice, visual style, palette swatches, constraints).
- Verified end-to-end via curl: company → doc → extraction job succeeds → brief enriched.

## Phase 2 — Idea triage
- Idea create form + `CLASSIFY_IDEA` pipeline (Product / Service / Software classification + four-axis scorecard + recommendation, all zod-validated).
- Auto-creates the primary `VisualizationTrack`.
- Idea page renders brief, scorecard (with progress bars + rationales), and a three-card TrackLauncher (add/open Product, Service, Software).
- Verified end-to-end: idea triaged → SERVICE detected → scores populated → SERVICE track auto-spawned.

## Phase 3a — Vertical slices (gate)
All three tracks produce a real AI-generated artifact through the real pipeline:
- **Product:** `GEN_SKETCHES` → SVG sketch saved as `Artifact(SKETCH) + ArtifactVersion`, served at `/api/storage/...`.
- **Service:** `GEN_SCENE_PLAN` → JSON plan with N scenes, plus `GEN_SCENE_FRAME` for any scene.
- **Software:** `GEN_PRODUCT_SPEC` → `GEN_SCREEN_SPEC` → zod-validated `DemoBundle`, rendered through safe block registry.
Phase 3a gate passed → deepening continued.

## Phase 3b — Deepen Product
- 4 sketch variations + version-history picker rail.
- Custom lightweight `SketchCanvas` (no tldraw dep): locked background image + transparent draw layer, pen / eraser / color / size / clear, composite export to PNG.
- `REFINE_SKETCH` accepts an instruction + optional edited canvas → `editImage` → new `ArtifactVersion` linked to parent.
- `GEN_MESH_SUBMIT` + `GEN_MESH_POLL` two-step job pattern (production-safe — works the same when run via Inngest steps).
- `MeshViewer` using `@react-three/fiber` + `@react-three/drei` `<Stage>` + `OrbitControls`. Falls back to a rotating placeholder cube if GLB load fails.
- Verified end-to-end via curl: 4 variations → refine → mesh submit returns `pollJobId` → poll succeeds → GLB stored.

## Phase 4b — Deepen Service
- Full scene plan generation, per-scene regenerate, lock toggle, drag-equivalent move (↑/↓), delete, edit caption/narration/duration.
- `GEN_NARRATION` pipeline (OpenAI TTS or mock bytes), stores per-scene audio.
- In-browser `ScenePreview` using Framer Motion `<AnimatePresence>` crossfades + Ken Burns scale + synced `<audio>` playback. Always available; never blocks on the renderer service.
- `ASSEMBLE_VIDEO` pipeline calls `RENDERER_URL` (the separate Docker FFmpeg service) when configured, else writes a JSON manifest as a working fallback so the artifact still exists.
- Verified end-to-end: narration + assemble video + render single frame + plan reorder PATCH — all create proper version lineage.

## Phase 5b — Deepen Software
- `ScreenSpec` schema with 8 safe block types (`Hero`, `Stats`, `Table`, `Form`, `Chart`, `Card`, `List`, `Detail`), all zod-validated, all rendered by a fixed component registry. **No LLM JS is ever executed**.
- Multi-screen `DemoBundle` with navigation via `ctaTo` / `submitTo` / `to` referencing screen names.
- Live click-through preview inside the workspace + per-screen regenerate.
- `POST /api/tracks/[id]/software/demo/publish` → creates a public `/demo/[slug]` route rendering the bundle read-only.
- `safeParseBlocks` defense-in-depth drops any block that doesn't match the schema.
- Verified end-to-end: 4 screens generated with varied block types → publish returns `slug` → `/demo/<slug>` renders all screens.

## Phase 6 — Dashboard, polish
- `/dashboard` page lists all ideas across companies with score average, type, track summary, relative timestamps.
- Public `/demo/[slug]` share page works in incognito (no auth required by design).
- Lint clean (`next lint`).
- 21 unit tests pass (`vitest`).
- TypeScript clean (`tsc --noEmit`).
- Production build succeeds (`next build`).

## Deferred / next steps
- **Auth:** intentionally skipped per the directive; schema has no `userId` column but the layout supports adding one.
- **Inngest production runner:** plumbing ready (single `JobRunner` interface); the in-process runner is what fires today.
- **`/services/renderer` Docker service:** spec is in §2b of the plan; the API + fallback are in place so we can ship the service later without changing app code.
- **Walkthrough mp4 recording:** stretch goal from §5b, not implemented.
- **Idea report PDF + version-history viewer UI:** dashboard ships; deeper history exploration can hang off `Artifact.versions` already returned in `GET /api/tracks/[id]`.

## How to run
```bash
npm install --legacy-peer-deps
npx prisma migrate dev
npm run dev
# open http://localhost:3000
```
Set `MOCK_AI=false` and provide `OPENAI_API_KEY` to use real models; `MESHY_API_KEY` for real 3D.

## Verified user journey
1. Create company → upload note → brief auto-fills.
2. Create idea → triage → scores + primary track.
3. Add Product / Service / Software tracks → each renders real artifacts.
4. Product: generate 4 sketches → pick one → draw on canvas → AI refine → generate 3D.
5. Service: generate plan → render frames → edit captions → narrate → in-browser preview.
6. Software: generate spec → render screens → click through → publish → share URL.
