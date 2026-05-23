# Spark — Innovation Visualization Platform

> **What it is:** An ambitious end-to-end platform that turns raw innovation ideas into tangible, interactive visualizations across **three first-class tracks**: physical Products (sketch → editable canvas → 3D model), Services (storyboard → editable scenes → animated video), and Software (spec → editable screens → click-through demo).
>
> **Track alignment:** Hackathon Track 1 — *Validating a Business Idea*. Spark covers the full pipeline from raw idea → triaged & scored brief → visualized concept the team can react to, edit, and ship to stakeholders. Optimized for end-to-end coverage, triage quality, speed, and demo clarity.
>
> **Tone:** This is a platform, not a demo. Every track is interactive, versioned, and exportable. The architecture is built to support all three tracks running in parallel for the same idea.

---

## 1. Product vision

Innovation teams collect thousands of ideas a year. Most die in spreadsheets because no one can *see* them. Spark closes that gap: paste an idea, get a real visualization within minutes, then iterate on it like a designer would. Every artifact is versioned, every generation is a job you can track, and every output (3D model, video, demo) is exportable and shareable.

The user lifecycle:

1. **Onboard the company** — upload PDFs, paste text, or link docs. Spark extracts industry, customers, brand voice, visual style, and constraints into a reusable **Company Brief**.
2. **Submit an idea** — short title + description + optional supporting docs.
3. **Triage** — GPT classifies (Product / Service / Software), expands into a structured **Idea Brief**, and scores on market fit, feasibility, novelty, and brand alignment.
4. **Visualize** — the idea routes into one of three interactive pipelines. The user can run more than one track for the same idea (e.g. "this is a product *and* a service") — multiple `VisualizationTrack` records per idea.
5. **Iterate** — every artifact is editable; every edit creates a new version; the user can roll back.
6. **Share** — export 3D model (GLB), video (mp4), software demo (hosted shareable URL), or a combined idea report (PDF).

---

## 2. The three first-class tracks

### 2a. Product track — Sketch ↔ Edit ↔ 3D loop

```
Idea Brief ──► gpt-image-1 ──► 4 sketch variations ──► user picks one
                                                           │
                                                           ▼
                                          ┌──────────────────────────────────┐
                                          │  Interactive canvas (tldraw)     │
                                          │  - sketch as locked bg layer     │
                                          │  - pen, shapes, text, masks      │
                                          │  - "AI refine" button anytime    │
                                          └──────────────────────────────────┘
                                                           │
                                ┌──────────────────────────┼──────────────────────────┐
                                ▼                                                     ▼
                  gpt-image-1 EDIT endpoint                                Meshy AI image-to-3D
                  (re-render with user strokes)                            (image with edits → GLB)
                                │                                                     │
                                ▼                                                     ▼
                       new sketch version                                3D viewer (react-three-fiber)
                                                                         OrbitControls + env + export GLB
```

**Interactive guarantees:**
- Multiple sketch variations, user picks/regenerates any of them.
- Pen, shapes, text, color, masks on top of the sketch.
- "Refine with AI" sends the canvas + user strokes back as an edit prompt → new version.
- "Generate 3D" sends the *current* flattened canvas to Meshy.
- 3D viewer supports orbit, zoom, lighting toggle, wireframe, download GLB.
- Every step versioned in `ArtifactVersion`.

**Why it's a differentiator:** existing sketch→3D demos (SAAM, soon) treat the sketch as fixed input. We let the user *co-design* on top of the AI sketch, and the 3D model reflects those edits.

### 2b. Service track — Storyboard ↔ Edit ↔ Animated preview

```
Idea Brief ──► GPT scene plan (6–10 scenes) ──► gpt-image-1 per scene ──► storyboard grid
                                                                              │
                                                                              ▼
                                                  ┌──────────────────────────────────────┐
                                                  │  Scene editor                        │
                                                  │  - reorder / add / remove scenes     │
                                                  │  - regenerate any single frame       │
                                                  │  - edit caption + narration per scene│
                                                  │  - pick scene duration + transition  │
                                                  └──────────────────────────────────────┘
                                                                              │
                          ┌───────────────────────────────────────────────────┴────┐
                          ▼                                                        ▼
              Animated preview (instant)                              Full video render (background job)
              Framer Motion + Ken Burns + TTS                         FFmpeg slideshow with motion + VO
              plays in-browser, no waiting                            optional upgrade: Runway / Luma / Kling
                                                                                │
                                                                                ▼
                                                                      MP4 download + share link
```

**Interactive guarantees:**
- Drag-to-reorder scenes, add/remove, regenerate any single frame, lock a frame.
- Edit captions + narration per scene; "rewrite this caption" GPT button.
- Instant animated preview always available while full render runs in background.
- Final MP4 export.

#### Service video pipeline — concrete assembly

The video is assembled by the `/services/renderer` Docker service (see §3b). Step by step for one render:

1. **Inputs collected by the API route** before enqueueing:
   - Ordered `Scene[]`, each with: `frameStorageKey`, `caption`, `narration`, `durationSec`, `transition` (`cut | fade | zoom`), and a TTS-rendered `audioStorageKey`.
   - Global `style` (font, caption position, brand color).
2. **Renderer pulls assets** from Vercel Blob via signed URLs into a temp dir.
3. **Per-scene clip** built with FFmpeg's `filter_complex`:
   - `scale=1920:1080` + `zoompan` filter for a Ken Burns push (subtle 1.0→1.08 scale over the scene duration).
   - `drawtext` overlay for the caption (or a pre-rasterised PNG caption — chosen per scene to avoid font availability issues), bottom-third with a soft gradient.
   - Audio: per-scene TTS clip, padded/trimmed to `durationSec`.
4. **Transitions** between clips using FFmpeg's `xfade` filter (`fade`, `fadeblack`, `zoomin`) with a 400ms duration; `cut` is no `xfade`.
5. **Concatenate** all transitioned clips into one timeline; mix all per-scene audio onto the master audio track with the same offsets.
6. **Encode** with `libx264`, CRF 20, preset `medium`, `+faststart` for web playback; audio `aac` 128k.
7. **Output** `result.mp4`, upload to Vercel Blob under `companies/<id>/ideas/<id>/tracks/<id>/videos/<versionId>.mp4`, return the signed URL.
8. **Job completion** writes a new `Artifact (kind=VIDEO)` + `ArtifactVersion` with `storageKey` = the Blob key. UI swaps in the rendered MP4.

While the render runs (typically 20–60s for 8 scenes), the user always has the **in-browser preview**: a React component that loops through frames with Framer Motion's `motion.img` (opacity + scale crossfade), plays per-scene TTS via `<audio>` elements, and renders captions as overlays. This is generated 100% client-side from the same `Scene[]` data, so the user never waits to see motion — they wait only for the *exportable* MP4.

The renderer service exposes:
```
POST /assemble
  body: { scenes: Scene[], style: Style, outputKey: string }
  returns: { signedUrl, durationSec, sizeBytes }
GET /health
```
It runs as a Docker container (`node:20-slim` + `apt-get install ffmpeg`), single endpoint, ~80 lines of Node. Deployable to Fly.io with one `fly launch`.

### 2c. Software track — Spec ↔ Edit ↔ Click-through demo

```
Idea Brief ──► GPT product spec (problem, users, features, screens)
                                       │
                                       ▼
              ┌────────────────────────────────────────────────────────┐
              │  Screen graph editor                                    │
              │  - 4–8 screens, each with structured ScreenSpec JSON    │
              │  - edit screen purpose, components, copy, nav links     │
              │  - regenerate any single screen                         │
              └────────────────────────────────────────────────────────┘
                                       │
                                       ▼
          Renderer: ScreenSpec JSON → safe React components (shadcn/ui)
                                       │
                                       ▼
              ┌────────────────────────────────────────────────────────┐
              │  Click-through mini-app inside sandboxed iframe         │
              │  - working navigation between generated screens         │
              │  - mock data, mock interactions                         │
              │  - "Record walkthrough" → narrated mp4 (stretch)        │
              │  - "Share demo" → hosted URL                            │
              └────────────────────────────────────────────────────────┘
```

**Why structured JSON instead of raw generated code:** safer (no eval of LLM-generated JS), faster (re-render on edit), versionable. We define a `ScreenSpec` schema (Hero, Stat, Table, Form, Chart, Nav, etc.) and the LLM picks blocks. This is also how we make screens *editable* — the user changes structured fields, not a code blob.

**Hard rule for v1:** the renderer never executes LLM-generated JavaScript or imports LLM-generated modules. Every visible component on a generated screen comes from a fixed registry in `components/software/blocks/`. The LLM's only freedom is picking blocks, ordering them, and filling structured props (text, mock data, link targets). If a model returns something off-schema, we drop the block and log it; we do not eval. This is non-negotiable for v1.

The `ScreenSpec` schema (validated with zod on every read and write):

```ts
type ScreenSpec = {
  name: string;              // unique within the demo
  title: string;
  navLabel: string;
  blocks: Block[];
};
type Block =
  | { type: "Hero"; headline: string; sub?: string; ctaLabel?: string; ctaTo?: string }
  | { type: "Stats"; items: { label: string; value: string; delta?: string }[] }
  | { type: "Table"; columns: string[]; rows: string[][] }
  | { type: "Form"; fields: { label: string; kind: "text" | "select" | "textarea"; options?: string[] }[]; submitLabel: string; submitTo?: string }
  | { type: "Chart"; kind: "bar" | "line"; series: { label: string; data: number[] }[]; xLabels: string[] }
  | { type: "Card"; title: string; body: string; ctaLabel?: string; ctaTo?: string }
  | { type: "List"; items: { title: string; sub?: string; to?: string }[] }
  | { type: "Detail"; title: string; sections: { heading: string; body: string }[] };
```

Every `ctaTo`/`submitTo`/`to` is a screen `name`, so navigation between screens is just a lookup. The demo iframe is a standalone Next.js route (`/demo/[bundleId]`) reading the `DEMO_BUNDLE` artifact and rendering blocks via a `switch (block.type)`.

**Interactive guarantees:**
- Edit any screen's purpose, blocks, copy; regenerate any single screen.
- Live click-through inside the app — the demo *is* a working mini-app.
- Hosted share URL per demo.
- Stretch: scripted walkthrough recording → narrated mp4.

---

## 3. Architecture

### 3a. System overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js 15 (App Router, TS)                         │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Onboarding   │  │ Ideas        │  │ Visualizer   │  │ Dashboard /  │    │
│  │ pages        │  │ pages        │  │ pages (3)    │  │ Share        │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│         │                 │                  │                 │            │
│         └─────────────────┴──────────────────┴─────────────────┘            │
│                                  │                                          │
│                          React Query / SWR                                  │
│                                  │                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  REST API routes (app/api/...) + server actions for form posts       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                       │                              │            │
│         ▼                       ▼                              ▼            │
│  ┌─────────────┐   ┌──────────────────────────┐    ┌───────────────────┐   │
│  │ Prisma ORM  │   │  Job queue (BullMQ        │    │ Storage adapter   │   │
│  │ + SQLite    │   │  + Redis  OR  in-process  │    │ (local fs / blob) │   │
│  │ (Postgres   │   │  worker for dev)          │    │                   │   │
│  │  in prod)   │   └──────────────────────────┘    └───────────────────┘   │
│  └─────────────┘                  │                                         │
│                                   ▼                                         │
│       ┌───────────────────────────────────────────────────────────┐         │
│       │  Generation pipeline (reusable)                            │         │
│       │  Steps: prompt build → model call → post-process → persist │         │
│       │  Logs every call to PromptLog                              │         │
│       └───────────────────────────────────────────────────────────┘         │
│                                   │                                         │
│       ┌────────────┬──────────────┼──────────────┬────────────┬────────┐    │
│       ▼            ▼              ▼              ▼            ▼        ▼    │
│  ┌─────────┐  ┌─────────┐   ┌──────────┐   ┌──────────┐  ┌───────┐ ┌─────┐ │
│  │ OpenAI  │  │ OpenAI  │   │ Meshy AI │   │ FFmpeg   │  │ TTS   │ │Runwy│ │
│  │ GPT-4o  │  │ Images  │   │ img→3D   │   │ (server) │  │(OAI)  │ │Luma │ │
│  └─────────┘  └─────────┘   └──────────┘   └──────────┘  └───────┘ └─────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3b. Async generation jobs (dev → Vercel)

Every long-running call (image gen, Meshy, video render) goes through a thin job abstraction:

- **`GenerationJob`** row created with `status = queued`, `kind`, `inputRef`, `params`.
- A handler transitions it through `running → succeeded | failed`, writes `progress` (0–100) and `logs`.
- Result is written as a new `Artifact` + `ArtifactVersion` and linked back to the job.
- Frontend polls `/api/jobs/[id]` every 1.5s and renders progress + intermediate previews where possible (e.g. streaming GPT classification text).

**The abstraction is a single `JobRunner` interface** with two implementations, both writing to the same `GenerationJob` rows:

| Env | Runner | How it works | Why it's safe on Vercel |
|---|---|---|---|
| **Local dev** | `InProcessRunner` — fires immediately in the API route, no background process | API route awaits short jobs (≤ Vercel's 10s/60s function timeout for fast classification) or returns `jobId` and continues in `waitUntil` for slightly longer ones | No infra needed; fast iteration |
| **Production (Vercel)** | **Inngest** (primary recommendation) — `inngest.send({ name: "job/run", data: { jobId } })` enqueues; an Inngest function (defined in our repo, hosted by Inngest) processes the job and can run for up to 2h | Avoids Vercel function timeout entirely; built-in retries, step durability, observability dashboard. Free tier covers a hackathon. | Inngest is purpose-built for this on Vercel |
| **Production fallback** | **QStash** (Upstash) — POST to QStash, which calls back our `/api/jobs/[id]/run` route on a schedule with at-least-once delivery | Simpler than Inngest, no SDK, just HTTPS; same callback contract | If we want to avoid one more vendor SDK |

**Meshy** is itself an async API (we POST → get a Meshy task id → poll). On Vercel we don't want to hold a function open polling for 60+ seconds, so the Meshy job is split into two steps via the runner: `submitMeshyTask` (fast, returns externalRef) and `pollMeshyTask` (re-scheduled every ~5s by Inngest until done). This pattern generalises to any async third-party (Runway, Luma, Kling).

**FFmpeg video rendering** cannot run inside a Vercel serverless function (no native FFmpeg binary, no long execution). Options:

1. **Inngest step + a separate Render service** — a tiny Node service deployed on Fly.io / Railway / Render with FFmpeg installed; Inngest calls it via HTTP. Simple, cheap, durable.
2. **Modal / Replicate** — invoke a Modal function or a Replicate model that wraps FFmpeg. Pay-per-use.

We will start with option (1): a single Dockerfile in `/services/renderer` that exposes `POST /assemble` taking `{frames[], audio?, captions[], transitions[]}` and returning a signed URL to the rendered MP4 in Vercel Blob. The Inngest step calls this URL.

**Decision rule:** if a call is < 5s, run it inline in the API route. If it's 5–60s, run it inline but return early with `jobId` and use `after()/waitUntil()`. If it's longer or third-party-async, enqueue to Inngest.

### 3c. Reusable generation pipeline

```ts
type PipelineStep<I, O> = (ctx: Ctx, input: I) => Promise<O>;

// Composable, each step logs to PromptLog
const productSketchPipeline = compose(
  buildSketchPrompt,        // brief + company brand → prompt
  callImageModel,           // gpt-image-1, n=4
  persistAsArtifact,        // creates Artifact + 4 ArtifactVersions
);
```

Every pipeline step has: input schema (zod), output schema, retry policy, and writes a `PromptLog` (model, prompt, params, latency, cost estimate, output ref). This makes the system observable, debuggable, and consistent across the three tracks.

### 3d. Artifact versioning

- `Artifact` is a logical handle (e.g. "the chosen sketch for idea X").
- `ArtifactVersion` rows hang off it. Every edit, regeneration, or AI refinement creates a new version with a `parentVersionId`.
- The UI always shows the latest version but exposes a version history dropdown.
- Downstream artifacts (e.g. 3D model) record `sourceVersionId` so we know exactly which sketch version produced which model.

### 3e. Storage

- **Storage adapter** interface (`put`, `get`, `signedUrl`, `delete`) with two implementations:
  - **Local FS** (`/storage/<companyId>/<ideaId>/<artifactId>/<versionId>.<ext>`) for dev.
  - **Vercel Blob / S3** for prod.
- Stored: uploaded source docs, generated images (sketches, frames, screen mocks), GLB 3D models, MP4 videos, screen JSON specs, exported PDFs.
- Metadata (mime, size, hash) on `Artifact`.

---

## 4. Data model (Prisma)

```prisma
model Company {
  id           String     @id @default(cuid())
  name         String
  rawProfile   String     // pasted text
  briefJson    Json       // GPT-extracted: industry, customers, brand voice, visual style, constraints
  styleTokens  Json?      // color palette, typography vibes, sketch style descriptors
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  documents    Document[]
  ideas        Idea[]
}

model Document {
  id            String   @id @default(cuid())
  companyId     String
  company       Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  kind          String   // pdf | text | url | image
  storageKey    String   // adapter key
  filename      String
  extractedText String?
  summary       String?  // GPT summary, fed back into Company.briefJson
  createdAt     DateTime @default(now())
}

model Idea {
  id          String   @id @default(cuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  title       String
  rawInput    String
  briefJson   Json?    // problem, audience, key features, constraints
  scoresJson  Json?    // marketFit, feasibility, novelty, brandAlignment + rationales
  primaryType IdeaType?
  status      IdeaStatus @default(DRAFT)
  documents   IdeaDocument[]
  tracks      VisualizationTrack[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model IdeaDocument {
  id            String   @id @default(cuid())
  ideaId        String
  idea          Idea     @relation(fields: [ideaId], references: [id], onDelete: Cascade)
  documentId    String?  // optional reuse of an existing company Document
  storageKey    String
  filename      String
  extractedText String?
  createdAt     DateTime @default(now())
}

model VisualizationTrack {
  id        String     @id @default(cuid())
  ideaId    String
  idea      Idea       @relation(fields: [ideaId], references: [id], onDelete: Cascade)
  kind      IdeaType   // PRODUCT | SERVICE | SOFTWARE — an idea can have multiple
  status    TrackStatus @default(PENDING)
  artifacts Artifact[]
  jobs      GenerationJob[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Artifact {
  id               String     @id @default(cuid())
  trackId          String
  track            VisualizationTrack @relation(fields: [trackId], references: [id], onDelete: Cascade)
  kind             ArtifactKind  // SKETCH | EDITED_SKETCH | MESH | SCENE_FRAME | VIDEO | SCREEN_SPEC | DEMO_BUNDLE | REPORT
  label            String?
  currentVersionId String?    // FK to ArtifactVersion (latest)
  versions         ArtifactVersion[]
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
}

model ArtifactVersion {
  id              String   @id @default(cuid())
  artifactId      String
  artifact        Artifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)
  parentVersionId String?
  parent          ArtifactVersion?  @relation("VersionTree", fields: [parentVersionId], references: [id])
  children        ArtifactVersion[] @relation("VersionTree")
  storageKey      String?  // for binary content (image, glb, mp4)
  contentJson     Json?    // for structured content (ScreenSpec, scene plan, caption)
  meta            Json     // model, prompt hash, params, source artifact versions
  createdBy       String   // "user" | "ai"
  createdAt       DateTime @default(now())
}

model GenerationJob {
  id          String     @id @default(cuid())
  trackId     String?
  track       VisualizationTrack? @relation(fields: [trackId], references: [id], onDelete: SetNull)
  kind        JobKind
  status      JobStatus  @default(QUEUED)
  progress    Int        @default(0)
  inputJson   Json       // params, artifact refs
  outputJson  Json?      // result refs (artifactId, versionId)
  logs        String[]   @default([])
  error       String?
  attempts    Int        @default(0)
  externalRef String?    // e.g. Meshy task id
  startedAt   DateTime?
  finishedAt  DateTime?
  createdAt   DateTime   @default(now())
  promptLogs  PromptLog[]
}

model PromptLog {
  id        String   @id @default(cuid())
  jobId     String?
  job       GenerationJob? @relation(fields: [jobId], references: [id], onDelete: SetNull)
  provider  String   // "openai" | "meshy" | "runway" | "ffmpeg" | "tts"
  model     String
  prompt    String?
  params    Json
  latencyMs Int?
  costUsd   Decimal? @db.Decimal(10, 4)
  result    Json?
  createdAt DateTime @default(now())
}

enum IdeaType    { PRODUCT SERVICE SOFTWARE }
enum IdeaStatus  { DRAFT TRIAGED VISUALIZING READY ARCHIVED }
enum TrackStatus { PENDING RUNNING READY FAILED }
enum ArtifactKind {
  SKETCH EDITED_SKETCH MESH
  SCENE_PLAN SCENE_FRAME NARRATION VIDEO
  PRODUCT_SPEC SCREEN_SPEC DEMO_BUNDLE
  REPORT
}
enum JobKind {
  CLASSIFY_IDEA SCORE_IDEA EXTRACT_DOC
  GEN_SKETCHES REFINE_SKETCH GEN_MESH
  GEN_SCENE_PLAN GEN_SCENE_FRAME GEN_NARRATION ASSEMBLE_VIDEO RENDER_VIDEO_HIGH
  GEN_PRODUCT_SPEC GEN_SCREEN_SPEC RENDER_DEMO RECORD_WALKTHROUGH
  EXPORT_REPORT
}
enum JobStatus  { QUEUED RUNNING SUCCEEDED FAILED CANCELLED }
```

---

## 5. API surface

REST routes under `app/api/`. Server actions used for simple form posts; everything that triggers a long-running job returns a `jobId` for polling.

### Companies & documents

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/companies` | Create company (name + raw profile text) |
| PATCH | `/api/companies/[id]` | Update profile; re-extract brief |
| GET | `/api/companies/[id]` | Get company + brief + style tokens |
| POST | `/api/companies/[id]/documents` | Upload PDF / text / URL → returns jobId for extraction |
| GET | `/api/companies/[id]/documents` | List documents + extraction status |
| POST | `/api/companies/[id]/brief/rebuild` | Re-summarize brief from all docs (jobId) |

### Ideas

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ideas` | Create idea (title, rawInput, companyId, optional docs) |
| GET | `/api/ideas/[id]` | Get idea with tracks + artifacts (latest versions) |
| POST | `/api/ideas/[id]/documents` | Attach supporting doc → extraction jobId |
| POST | `/api/ideas/[id]/triage` | Classify + score → jobId. Auto-creates default `VisualizationTrack` for `primaryType` |
| POST | `/api/ideas/[id]/tracks` | Manually add a track of a given kind (PRODUCT/SERVICE/SOFTWARE) |

### Product track

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tracks/[id]/product/sketches` | Generate N sketch variations → jobId |
| POST | `/api/tracks/[id]/product/sketches/choose` | Mark a sketch version as the chosen one |
| POST | `/api/tracks/[id]/product/sketches/refine` | Send canvas (base + user strokes) to image edit model → new version |
| POST | `/api/tracks/[id]/product/mesh` | Send current chosen sketch version to Meshy → jobId (polls Meshy externally) |
| GET | `/api/tracks/[id]/product/mesh/[versionId]` | Get GLB URL + meta |

### Service track

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tracks/[id]/service/scene-plan` | Generate scene plan (6–10 scenes) → jobId |
| PATCH | `/api/tracks/[id]/service/scene-plan` | Update scene order / add / remove / lock |
| POST | `/api/tracks/[id]/service/scenes/[index]/frame` | Generate or regenerate one frame → jobId |
| PATCH | `/api/tracks/[id]/service/scenes/[index]/caption` | Edit caption / narration |
| POST | `/api/tracks/[id]/service/narration` | Generate TTS for all scenes → jobId |
| POST | `/api/tracks/[id]/service/video/assemble` | FFmpeg slideshow render → jobId |
| POST | `/api/tracks/[id]/service/video/render-high` | (optional) Runway / Luma upgrade → jobId |

### Software track

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tracks/[id]/software/spec` | Generate product spec → jobId |
| PATCH | `/api/tracks/[id]/software/spec` | Edit spec fields |
| POST | `/api/tracks/[id]/software/screens` | Generate the full screen graph → jobId |
| POST | `/api/tracks/[id]/software/screens/[name]` | Regenerate one screen → jobId |
| PATCH | `/api/tracks/[id]/software/screens/[name]` | Edit ScreenSpec JSON directly |
| POST | `/api/tracks/[id]/software/demo/publish` | Publish demo → returns shareable URL |
| POST | `/api/tracks/[id]/software/walkthrough` | (stretch) record narrated mp4 → jobId |

### Jobs & artifacts (shared)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs/[id]` | Poll a job: status, progress, logs, output refs |
| GET | `/api/jobs?trackId=...` | List jobs for a track |
| GET | `/api/artifacts/[id]` | Artifact + version history |
| GET | `/api/artifacts/[id]/versions/[versionId]/content` | Serve binary or JSON content |
| POST | `/api/artifacts/[id]/rollback` | Set a previous version as current |

### Export & share

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ideas/[id]/report` | Generate idea report PDF (brief + scores + visual artifacts) → jobId |
| POST | `/api/ideas/[id]/share` | Create public share link |
| GET | `/s/[slug]` | Public read-only view |

---

## 6. Document & company ingestion (deep dive)

Company context is the secret sauce: it's what makes a sketch *for Tim Hortons* look different from a sketch *for Patagonia*. Ingestion has its own pipeline.

### 6a. Upload formats
- **PDF** — parsed with `pdf-parse` (server) → text.
- **Text / Markdown** — direct.
- **URL** — fetched server-side, readable text extracted (`@mozilla/readability`).
- **Image** (logo, brand sheet) — GPT-4o vision description; informs style tokens.

### 6b. Extraction pipeline (per document)
1. `EXTRACT_DOC` job: parse → `extractedText`.
2. GPT call: summarize the document, extract any of {industry, customer segments, value props, brand voice adjectives, visual style cues, constraints, banned topics}.
3. Append to `Document.summary` + merge into `Company.briefJson` (with conflict resolution: newer wins, but keep a `sources` array per field so we can show provenance).

### 6c. Company brief schema (`Company.briefJson`)
```ts
{
  industry: string,
  oneLiner: string,
  customers: { segment: string, needs: string[] }[],
  valueProps: string[],
  brandVoice: { adjectives: string[], doNots: string[] },
  visualStyle: {
    palette: string[],          // hex
    typographyVibe: string,     // e.g. "modern geometric sans"
    sketchStyle: string,        // e.g. "clean industrial line art, minimal shading"
    photographyVibe: string,    // e.g. "warm, golden hour, lifestyle"
  },
  constraints: string[],        // regulatory, supply chain, etc.
  sources: Record<string, string[]>  // field path → list of documentIds
}
```

### 6d. How company context flows into each generation

| Generation step | Company fields used |
|---|---|
| Idea classification | `industry`, `valueProps`, `customers` (helps disambiguate "service vs product") |
| Idea scoring | `valueProps`, `customers`, `constraints` → brand alignment & feasibility |
| Product sketch prompt | `visualStyle.sketchStyle`, `visualStyle.palette`, `brandVoice.adjectives` |
| Service scene prompt | `visualStyle.photographyVibe`, `customers`, `brandVoice` |
| Service narration | `brandVoice.adjectives`, `brandVoice.doNots` |
| Software screen spec | `brandVoice`, `customers` (for sample data realism) |
| Software screen render | `visualStyle.palette`, `visualStyle.typographyVibe` |
| Idea report | full brief as cover context |

### 6e. Manual fallback
If extraction fails or no docs are uploaded, the user can fill the brief form manually — same schema, same downstream effect. Brief is editable at any time and re-renders future generations.

---

## 7. Frontend structure

```
app/
  layout.tsx
  page.tsx                       # marketing landing → "Start your company"
  (app)/
    layout.tsx                   # app shell: sidebar with company switcher, ideas list
    companies/
      new/page.tsx
      [id]/
        page.tsx                 # company overview, brief editor, documents
        documents/page.tsx
    ideas/
      new/page.tsx               # title + raw input + doc upload
      [id]/
        page.tsx                 # triage result, scores, track picker
        product/page.tsx         # sketch picker + tldraw editor + 3D viewer
        service/page.tsx         # storyboard editor + video preview
        software/page.tsx        # spec + screen editor + demo iframe
    dashboard/page.tsx           # all ideas, filter by status/type/score
  s/[slug]/page.tsx              # public share page
  api/...                        # routes per §5
components/
  shell/...
  ideas/...
  product/(SketchPicker, CanvasEditor, ModelViewer)
  service/(StoryboardGrid, SceneCard, VideoPreview)
  software/(SpecEditor, ScreenGraph, DemoFrame)
  shared/(JobProgress, ArtifactHistory, BriefEditor, DocumentDrop)
lib/
  ai/(openai, meshy, ffmpeg, tts, runway)
  pipelines/(productSketch, productRefine, productMesh, sceneplan, frame, video, spec, screen, render)
  jobs/(runner, queue, handlers)
  storage/(adapter, local, blob)
  db/(prisma client)
  schemas/(zod schemas shared frontend/backend)
prisma/
  schema.prisma
  migrations/...
storage/                         # dev only
```

---

## 8. Interaction details per track (what "interactive" means concretely)

### Product
- Sketch picker shows 4 cards; each has "use this", "regenerate this one", "regenerate all".
- Canvas (tldraw): pen, eraser, rect, ellipse, arrow, text, color picker, opacity, undo/redo, "fit to view".
- Toolbar buttons: **AI Refine** (sends canvas + a freeform instruction), **Lock background**, **Show only my edits**, **Generate 3D**.
- 3D viewer: orbit, pan, zoom, env lighting toggle (studio / outdoor), wireframe toggle, screenshot, download GLB, "regenerate from current sketch".
- Version history rail on the right: thumbnails of every sketch version + every 3D model, click to restore.

### Service
- Storyboard grid: drag to reorder, lock icon per scene, regenerate icon per scene.
- Click a scene → side panel with editable caption, narration, duration (s), transition (cut/fade/zoom).
- Top bar: **Play preview** (in-browser animated preview, no render), **Render video**, **Export MP4**, **Add scene**.
- Render uses a background job; while it runs, the animated preview is always available.

### Software
- Left rail: list of screens; "+" to add; right-click → regenerate / delete.
- Center: live demo iframe with working nav (current screen highlighted in rail).
- Right rail: ScreenSpec editor with block list (Hero, Stats, Table, Form, Chart, etc.), each block has structured fields, edits live-update the iframe.
- Top bar: **Publish demo** (returns share URL), **Record walkthrough** (stretch), **Export ScreenSpec JSON**.

---

## 9. Execution phases

**Guiding principle: visible progress over infrastructure.** Every architectural piece exists because a user journey needs it. We build the schema, app shell, and one thin runner first — then immediately prove **one vertical slice per track** before deepening any of them. This prevents over-investing in job/queue/versioning machinery that hasn't yet earned its weight on a real flow.

Build order (all phases ship — Phase 3a is a non-negotiable proof gate before 3b/4b/5b):

| Phase | Goal | Gate |
|---|---|---|
| 1 | Shell, schema, ingestion | Company + brief works locally |
| 2 | Idea triage | Idea page shows scores |
| **3a** | **Vertical slice per track** (sketch / one frame / one screen) | All three render real AI output through the real pipeline |
| 3b | Deepen Product | Sketch ↔ edit ↔ 3D loop |
| 4b | Deepen Service | Storyboard + video export |
| 5b | Deepen Software | Multi-screen demo + share |
| 6 | Dashboard, export, polish, deploy | Public share link works |

All six phases ship; nothing optional. Phases 3b / 4b / 5b are designed to run in parallel work-streams — separate folders, only the shared job & artifact infra is gating.

### Phase 1 — Core shell, DB, ingestion (Days 1–2)
- Next.js 15 + TS + Tailwind + shadcn scaffolded.
- Prisma + SQLite with full schema from §4.
- Storage adapter (local).
- Job runner (in-process worker).
- Company create/edit + document upload + extraction pipeline.
- Brief editor UI.
- **Acceptance:** I can create a company, upload 2 PDFs, see the merged Brief, edit it, and have it persist. Job page shows extraction progress.

### Phase 2 — Idea triage (Day 3)
- Idea create form (title, rawInput, optional docs).
- Classification + scoring pipeline.
- Idea page: brief, scores with rationales, track picker, "start visualizing" buttons.
- Multi-track support (one idea can have PRODUCT + SERVICE tracks simultaneously).
- **Acceptance:** I can submit an idea, see it classified within 10s, see four scores with rationales, and spawn at least one VisualizationTrack.

### Phase 3a — Vertical slices, all three tracks (Day 3, gate before deepening)

The point of Phase 3a is to prove the **end-to-end plumbing** works for each track before we invest in any of the rich UX. Each slice goes through the real pipeline: API route → `GenerationJob` row → handler → `Artifact` + `ArtifactVersion` → UI re-fetch. Tiny scope, full stack.

- **Product slice:** click "Visualize" on a PRODUCT track → one sketch generated by `gpt-image-1` → displayed full-bleed on the page. No editor yet, no variations, no 3D.
- **Service slice:** click "Visualize" on a SERVICE track → GPT generates a 6-scene plan (JSON) + `gpt-image-1` generates a frame for *scene 0 only* → storyboard grid shows 6 cards, one rendered, the other 5 as placeholders. No reordering, no narration, no video.
- **Software slice:** click "Visualize" on a SOFTWARE track → GPT generates a 1-screen `ScreenSpec` (validated by zod) → renderer maps blocks to safe React components and shows it inside the demo iframe. No editor, no nav, no multi-screen.

**Acceptance:** for each of the three tracks, a brand-new idea reaches a real AI-generated artifact on the page with one click. If any slice fails, we fix the shared infra before deepening anything.

### Phase 3b — Deepen Product (Days 4–5, parallel with 4b & 5b)
- 4 sketch variations + picker UI.
- tldraw canvas editor with locked background + user strokes layer.
- AI Refine endpoint (gpt-image-1 edit) + new version.
- Meshy integration with polling job + GLB persistence (the split submit/poll pattern from §3b).
- react-three-fiber viewer with controls + download.
- Version history rail.
- **Acceptance:** Idea → 4 sketches → pick one → draw additions → AI refine → generate 3D → orbit and download GLB. Every step versioned.

### Phase 4b — Deepen Service (Days 4–5, parallel)
- Full 6–10 scene plan with all frames generated.
- Drag-to-reorder, add/remove, regenerate any single frame, lock a frame.
- Caption + narration editor with "rewrite caption" GPT button.
- TTS pipeline.
- In-browser animated preview (Framer Motion + Ken Burns) — always available.
- `/services/renderer` Docker service deployed; FFmpeg pipeline from §2b wired through Inngest step.
- MP4 export.
- High-quality render upgrade (Runway / Luma / Kling) if API key present.
- **Acceptance:** Idea → 8 scenes → reorder + regenerate one frame → edit captions → play in-browser preview → render MP4 → download.

### Phase 5b — Deepen Software (Days 4–5, parallel)
- Block registry complete (Hero, Stats, Table, Form, Chart, Nav, Card, List, Detail).
- Product spec generator.
- Screen graph generator (4–8 screens) with `ctaTo`/nav links.
- Per-screen regeneration.
- ScreenSpec editor UI (block-list editor with structured fields, zod-validated on save).
- Live click-through iframe with working navigation between screens.
- Publish demo → shareable hosted URL (`/demo/[bundleId]`).
- Stretch (Day 6): Playwright walkthrough → narrated mp4.
- **Acceptance:** Idea → spec → 6 screens → edit one block on the dashboard screen → see it update live in the iframe → publish → open share URL in incognito and click through. *No LLM JS is ever evaluated.*

### Phase 6 — Dashboard, history, export, polish (Days 6–7)
- Dashboard: all ideas with thumbnails, filter by type/status/score.
- Artifact version history viewer (per artifact).
- Idea report PDF export (brief + scores + key artifacts inline).
- Share page (`/s/[slug]`) — read-only.
- Empty states, loading skeletons, error toasts.
- Demo script + seed data for live demo.
- Deploy to Vercel; Postgres migration.
- **Acceptance:** Fresh user can complete the full journey for one idea across all three tracks within 15 minutes, with no console errors, and share a working public link.

---

## 10. Fallback strategies (without weakening ambition)

| Failure | Fallback | Why it preserves ambition |
|---|---|---|
| Meshy 3D job fails or times out | Keep edited sketch as the artifact; offer one-click retry; show "3D preview pending" with a placeholder rotating viewer | User never loses work; they still have a polished sketch to share |
| High-quality video model is slow / unavailable | Always render the FFmpeg slideshow as the *baseline* artifact; queue the Runway/Luma render as an *upgrade* that replaces the artifact when ready | User always has a video in hand; the upgrade is additive |
| In-browser preview unavailable | Server-side FFmpeg render starts immediately on scene save | Never blocks user from seeing motion |
| LLM-generated software code is unsafe | We never render generated JS. ScreenSpec is structured JSON rendered through a fixed library of safe React blocks (`registry/blocks/*`) | Demo still looks like a real app; safety is by construction |
| Document extraction fails (bad PDF, scanned image) | Vision fallback (`gpt-4o` image input) on the page renders; if still empty, surface a "fill brief manually" form | User can always proceed |
| Image generation produces off-brand result | Brief includes explicit `brandVoice.doNots` and `visualStyle` blocks fed into every prompt; user can "regenerate this one" without affecting other variations | Brand fidelity without manual prompt engineering |
| Job runner crashes mid-job | On boot, worker re-claims `RUNNING` jobs older than N minutes and marks them `FAILED` with a "resume" action that re-queues from the last completed step | No silent stuck jobs |
| OpenAI rate limit | Per-provider semaphore + exponential backoff in the pipeline runner; user sees a "queued" state rather than an error | Smooth UX under load |

---

## 11. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript + React 19 |
| Styling | Tailwind v4 + shadcn/ui + Radix primitives |
| State / data | React Query (TanStack Query) for client; server components for reads |
| Forms | React Hook Form + zod |
| DB | Prisma + SQLite (dev) / Postgres (prod) |
| Auth | **Deferred.** Schema has a `userId` field stubbed but no NextAuth wiring until all three tracks work end-to-end. Demo runs single-tenant. |
| Job queue | `InProcessRunner` (dev) / **Inngest** (prod). Same interface, swap via env. |
| Video rendering | Separate **`/services/renderer`** Docker service on Fly.io/Railway (has FFmpeg binary). Invoked from Inngest step. |
| Storage | Local FS adapter (dev) / Vercel Blob (prod) |
| LLM | OpenAI GPT-4o + `o4-mini` for cheap triage |
| Image gen | OpenAI `gpt-image-1` (supports generate + edit-with-mask) |
| 3D gen | Meshy AI image-to-3D v2 |
| 3D viewer | `@react-three/fiber` + `@react-three/drei` |
| Sketch canvas | `tldraw` |
| Video | `fluent-ffmpeg` server-side; optional Runway / Luma / Kling SDK |
| TTS | OpenAI TTS (`tts-1` / `tts-1-hd`) |
| PDF parsing | `pdf-parse` |
| URL extraction | `@mozilla/readability` + `jsdom` |
| Animations | Framer Motion |
| Deploy | Vercel |

---

## 12. Open questions (don't gate scaffolding, but I'd like answers)

1. **API keys available?** OpenAI + Meshy required; Runway/Luma/Kling optional (gates the high-quality video upgrade).
2. **Inngest vs QStash?** Defaulting to **Inngest** for prod job runner. OK, or do you prefer QStash (simpler, no SDK)?
3. **Renderer host.** Defaulting to **Fly.io** for the `/services/renderer` Docker service. OK, or Railway/Render?
4. **Auth.** Deferred — no NextAuth until all three tracks work end-to-end. OK?
5. **Deploy target.** Vercel + Vercel Blob + Vercel Postgres. OK?
6. **Name.** Going with **Spark** unless you say otherwise.
7. **Track 1 framing.** Including a visible scorecard + rationale on every idea, mapped to Track 1 rubric language. OK?
8. **Multi-track per idea.** Defaulting to *one* track auto-spawned from `primaryType`, user can add the others. OK?

---

**Next step:** green-light and I'll start Phase 1 — scaffold Next.js + Prisma schema + app shell + the `JobRunner` interface with the in-process implementation. Then Phase 2 (idea triage), then Phase 3a (one vertical slice per track as the gate), then Phases 3b/4b/5b run in parallel.
