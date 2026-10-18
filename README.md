# Spine Asset Inspector

`MIT` `Vite 8` `React 19` `TypeScript 5.9` `Tailwind CSS 4` `Zustand 5` `spine-webgl 4.2` `100% Offline` `Strict CSP`

[English](#english) | [繁體中文](#繁體中文)

---

## English

A front-end only, fully offline inspection and editing workbench for Spine skeletal animation assets in 2D games. It provides animation preview, frame-by-frame control, transition and multi-track mix tuning, skin composition, slot and attachment inspection, debug overlays, custom event monitoring, atlas unpacking and live texture replacement, performance auditing, audio-to-event alignment, animation editing, and PNG / PNG sequence / Sprite Sheet / WebM export with transparent backgrounds. All parsing and rendering happen locally in the browser; no asset is ever uploaded.

### Contents

1. [Features](#features)
2. [Quick Start](#quick-start)
3. [Supported Formats and Loading Rules](#supported-formats-and-loading-rules)
4. [Interface and Shortcuts](#interface-and-shortcuts)
5. [Architecture](#architecture)
6. [Directory Layout](#directory-layout)
7. [File and Code Conventions](#file-and-code-conventions)
8. [Performance Audit Budgets](#performance-audit-budgets)
9. [Security and Privacy](#security-and-privacy)
10. [Testing](#testing)
11. [Known Limitations](#known-limitations)
12. [License](#license)

### Features

| Module | Components | Capabilities |
| --- | --- | --- |
| AssetLoader | `core/assets/*`, `TopBar`, `StageView` | Drag in or pick `.json` / `.skel` + `.atlas` + `.png`, a whole `.zip`, or a folder; skeletons, atlases and texture pages are paired automatically; the Spine version is detected and incompatibilities are reported |
| StageRenderer | `core/render/*`, `StageView` | WebGL rendering (`@esotericsoftware/spine-webgl`), high-DPI canvas, cursor-anchored wheel zoom, drag to pan, double-click to fit, 1:1 zoom, four backgrounds (transparent checkerboard, dark, light, green screen), origin axes |
| Demo Asset | `core/demo/*` | A procedurally generated test skeleton (18 bones, 18 slots, 7 skins, 7 animations, 3 events, a mesh, a bounding box, slot color and attachment timelines), so the app works fully without external files |
| MotionPlayer / PlaybackController | `HierarchyPanel`, `PlaybackBar`, `TimelineScrubber` | Switch animations from the tree or a dropdown, play / pause, loop, 0.1x to 2.0x speed, single-frame step forward and back, timeline scrubbing (without firing events), seconds and frame display, event markers |
| Animation Mix Lab | `MixLabPanel` | defaultMix, A-to-B transition tests (mix duration and A hold time), live mix progress, per-pair from / to mix table, tracks 1 to 3 layered on top (animation, alpha, replace / add, loop, mute) |
| Skins & Attachments | `HierarchyPanel`, `PropertiesPanel`, `SlotInspectorPanel` | Single or combined skins (`Skin.addSkin`), slots listed in draw order, live current attachment, hide a slot or force an attachment, highlight the selected slot on stage |
| Debug Overlays | `DebugPanel`, `core/render/debugOverlay.ts` | Bone axes, slot points, region outlines, mesh hulls, mesh wireframes, bounding boxes, paths, clipping |
| Event Monitor | `EventMonitorPanel` | Logs custom events (timestamp, track, animation, animation time, int / float / string / audio values), optionally start / interrupt / end / complete lifecycle events, with filtering, pause, clear and per-event counters |
| Atlas Toolkit | `core/atlas/*`, `core/image/*`, `AtlasPanel` | Atlas page preview and region list; lossless reconstruction of every region from `bounds`, `rotate` and `offsets` (optionally restoring trimmed whitespace), single download or a full ZIP (with `atlas-manifest.json`); drop a PNG to hot-replace a region, affecting every region / mesh attachment that uses it, and applied to exports too |
| Auditor | `core/audit/*`, `AuditPanel` | Counts bones, slots, current vertices and triangles, total asset vertices, meshes, weight influences, clipping, IK / Transform / Path / Physics constraints, atlas pages, estimated draw calls and animations against mobile budgets, with good / warning / heavy ratings per metric and overall |
| Audio Sync | `core/audio/*`, `controller/audioBackend.ts`, `AudioPanel` | Drop in WAV / MP3 / OGG / M4A / FLAC; waveform, onsets and playhead in the panel and main timeline; audio offset, synced playback from 0 s, automatic offset suggestion from events; per-event millisecond difference to the nearest onset and alignment status; events can be bound to sounds and are triggered and counted during playback |
| AssetExporter | `core/export/*`, `ExportDialog` | Four export types: PNG sequence ZIP (with `manifest.json`), Sprite Sheet (one image + TexturePacker JSON), current frame PNG, WebM clip; size by scale, fixed width / height in pixels, or a custom crop rectangle; fps, start and end frame, padding, transparent or solid background, sheet columns, WebM repeat count; cancellable. A live preview on the right renders the output with a frame slider, canvas / padding / content guides, an overflow warning, center / bottom alignment and horizontal / vertical offsets (applied to the real export). The custom crop mode mirrors the Spine export viewport: crop X, Y, width, height in skeleton units and an output scale; the area outside the crop is dimmed, dragging an edge or corner moves only that edge, dragging inside moves the whole crop, and the character never rescales |
| Editor (animation editing, stage 1) | `core/editor/*`, `controller/features/editorFeature.ts`, `PropertiesPanel`, `HistoryPanel` | Keeps the original Spine 4.2 JSON as an editable document (3.6 binaries are editable after upgrade); every step is recorded as reversible patch operations (set, insert, remove, rename with key order kept) with undo, redo, jump to any history step, merging of consecutive edits to the same field, and up to 200 steps; edit bone names and setup pose, slot names, colors, default attachments and blend modes, event names and defaults, rename / duplicate / delete animations, skeleton fps; renames update every reference (parent bones, slots, IK / Transform / Path / Physics constraints, skins, animation timelines, draw order, clipping end slots, event keys); save as standard Spine 4.2 JSON or a project ZIP with JSON, atlas and textures; exports always use the edited skeleton |
| Setup Mode (stage 2) | `core/gizmo/*`, `core/render/gizmoOverlay.ts`, `controller/features/gizmoFeature.ts`, `ViewportToolbar`, `StageView` | Stops the animation and shows the setup pose; pick bones on stage (the tree expands to them) and drag the gizmo: translate (parent-space X / Y arrows and free center), rotate (ring handle, continuous past 180 degrees), scale (uniform center and bone X / Y axes); live redraw with children and attachments following, live values in the properties panel and on stage; one history entry on release, Esc cancels; snapping (integer translation, 15 degree rotation, 0.1 scale) via the toolbar or by holding Shift |
| Animate Mode / Dopesheet (stage 3) | `core/animation/*`, `controller/features/animateFeature.ts`, `components/dopesheet/Dopesheet.tsx` | Pauses the animation and opens the dopesheet; gizmo drags or edits to "current frame pose" write translate / rotate / scale keys at the current frame (auto key, on by default); with auto key off, changes are staged until K and discarded on frame change; key selected bones (K) or all bones (Shift+K); bones and channels with timelines on the left, frame ruler and key diamonds on the right; click, Ctrl / Shift multi-select, box select, drag to move (handling collisions and Bezier scaling), Delete, Ctrl+C / Ctrl+V to paste at the current frame, click the ruler or empty space to jump; every key change supports undo / redo |
| Curve Editor / Extended Channels (stage 4) | `core/animation/curveShape.ts`, `components/dopesheet/CurveEditor.tsx`, `EventKeyEditor.tsx`, `SlotKeyEditor` in `PropertiesPanel` | A transition curve panel beside the dopesheet: linear / stepped / Bezier, drag in and out handles (one history entry on release), ease in / ease out / ease in-out / bounce / anticipate / snap presets applied to all selected segments, written back to 4.2 `curve` arrays; segment types are drawn as line styles. Slot attachment and color keys (switch or hide attachments, RGBA, alpha; slots already using split `rgb` / `alpha` or two-color timelines use those channels), event keys (add from the toolbar, drag, delete, copy and paste, edit name and int / float / string / volume / balance), all with undo / redo |
| Constraints / Draw Order / Mesh Deform / Skins (stage 5) | `core/animation/drawOrder.ts`, `meshDeform.ts`, `core/editor/structureCommands.ts`, `controller/features/meshFeature.ts`, `components/properties/AdvancedEditors.tsx` | A constraint group in the tree: bones, target and setup values of IK and Transform constraints (mix, softness, bend direction, compress / stretch; every transform mix) are editable, and animate mode keys them with sliders or values; dragging an IK target solves the chain live. Slot draw order can move one layer forward / back or reset, written as draw order keys (minimal 4.x `offsets`). Select a mesh attachment, then click / Shift-click vertices on stage and drag them; the world delta is converted per bone weight into deform keys (weighted meshes supported), with select all and reset deform for the frame. Create blank animations, add / rename skins (deform timelines and linked mesh references follow), and bind attachments from other skins to a skin or remove them |
| Delete Objects | `core/editor/deleteCommands.ts`, `InspectorController.deleteSelection`, `PropertiesPanel` | Select a bone, slot, attachment, constraint, skin, event or animation and press Delete (or the Delete button in the properties header): bones go with their children and slots, slots with their attachments in every skin, attachments are removed from all skins; timelines, skin references, path / physics constraints, clipping end slots and deform timelines are cleaned up, draw order keys are recomputed for the new slot order, and weighted mesh bone indices are remapped. The root bone and bones that remaining meshes are weighted to are refused. One undoable step |
| Hierarchy / Properties | `components/tree/*`, `components/properties/*` | A Spine-editor style tree (bones with child bones and slots, slots with attachments, skins, animations, events, constraints) and a properties panel (setup pose, live values, slot visibility and attachments, skin activation, animation info with one-click export, event usage), highlighting the selected bone or slot on stage |

### Quick Start

Requires Node.js 20 or later.

```bash
npm ci
npm run dev
```

Open the URL printed in the terminal; the demo asset loads automatically.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (no CSP, so HMR works) |
| `npm run build` | Type check, then build to `dist/` with the CSP meta injected |
| `npm run preview` | Serve the production build with the full security headers (including `frame-ancestors`) |
| `npm run typecheck` | TypeScript strict type check |
| `npm run lint:rules` | No-comment and zero-emoji rule checks |
| `npm run test` | Vitest unit and component tests |
| `npm run test:coverage` | Unit test coverage (v8) |
| `npm run test:e2e` | Playwright E2E tests (builds automatically and runs against the preview server) |
| `npm run verify` | Runs all of the checks above in order |

`dist/` is plain static files. Host it on any internal static server, or open it through a local server (not `file://`).

### Supported Formats and Loading Rules

| Type | Extensions |
| --- | --- |
| Skeleton (JSON) | `.json`, `.json.txt` (must contain a `skeleton` or `bones` structure; other JSON is skipped) |
| Skeleton (binary) | `.skel`, `.skel.bytes` |
| Atlas | `.atlas`, `.atlas.txt` |
| Textures | `.png`, `.webp`, `.jpg`, `.jpeg`, `.avif` |
| Archives | `.zip` (one nested level; `__MACOSX` and `._*` are ignored) |
| Audio | `.wav`, `.mp3`, `.ogg`, `.oga`, `.m4a`, `.aac`, `.flac` (dropping one on the stage adds it to the audio panel without replacing the asset) |

Loading rules:

- Skeleton and atlas pairing priority: same folder and same base name, same base name anywhere, same folder, then the first atlas.
- Atlas page textures are matched by path relative to the atlas, file name, then base name, all case-insensitive.
- With several skeletons, the first is loaded and a dropdown in the asset panel switches between them.
- Missing skeletons, atlases, textures or pages are listed in an error notice, and the current asset stays loaded.
- The runtime is Spine 4.2. The version is read from JSON `skeleton.spine` or the binary header (4.x and 3.x header formats).

| File version | Support |
| --- | --- |
| 4.2.x (JSON / binary) | Parsed directly |
| 3.6.x binary `.skel` | Upgraded to the 4.2 structure on load, with an `UPGRADED 4.2` badge and notice |
| 4.0 / 4.1 / 4.3 | Parsed with a version warning; may fail |
| 3.x JSON, 3.7 / 3.8 binary | Not supported yet; a clear error asks you to re-export as 4.2 from the Spine editor |

- The 3.6 upgrade follows how the Spine editor imports old files: rotation keys are unwrapped with the 3.x shortest-path rule, normalized 3.x Bezier curves become 4.x absolute curves, and constraint mixes, two-color tint, deform, draw order and events are all mapped; 3.6 `.atlas` fields are read by the runtime directly.
- Atlases with `pma: true` are rendered and exported with premultiplied alpha.
- With a region selected in the Atlas tab, a PNG dropped on the stage replaces that region instead of loading a new asset.
- Safety limits: 512 MB total input, 512 MB unzipped, 4096 entries, nesting depth 2.

### Interface and Shortcuts

The UI text is Traditional Chinese, and the layout follows Spine editor habits: the stage in the middle, the hierarchy tree and properties on the right, playback and timeline at the bottom. Less common tools live in "Advanced Tools", which opens a drawer on the right side of the stage.

Common tasks:

- Change animation: click a name under "Animations" on the right, or use the dropdown at the left of the playback bar.
- Inspect bones or slots: select them in the tree; the stage highlights them and the properties panel shows the setup pose and live values.
- Change outfits: tick skins under "Skins"; several can be combined.
- Hide or swap attachments: select a slot, then use "Hide this slot" or the "Assign attachment" menu in the properties panel.
- Export: click "Export" at the top right, or "Export this animation" in an animation's properties. The right side of the dialog is a live preview: scrub frames with the slider; the amber dashed line is padding, the violet box is the content range and the green dashed box is the current pose; a warning appears when content leaves the canvas, and alignment and offsets fine-tune the position. You can also drag the crop frame directly in the preview, like the Spine export viewport: dragging an edge or corner moves only that edge, dragging inside moves the frame, double-click resets it to the character bounds, and the output size is crop size x scale.
- Setup mode: click "Setup Mode" at the top left of the stage (or `S`); the animation stops and the setup pose is shown. Select a bone on stage or in the tree to get the gizmo; `W` / `E` / `R` switch translate / rotate / scale. Values update live while dragging, one step is recorded on release (Ctrl+Z to undo), and Esc cancels a drag. Playing or switching animations leaves setup mode.
- Animate mode: choose an animation, click "Animate Mode" (or `A`) and the dopesheet appears. Click the ruler to pick a frame, then drag the gizmo or edit "current frame pose" values to write keys. In the dopesheet you can click, box select and drag keys, `Delete` them, and `Ctrl+C` / `Ctrl+V` paste at the current frame.
- Curves and extended channels: select keys in the dopesheet and use the transition curve panel to switch linear / stepped / Bezier, drag the violet handles or apply presets. With a slot selected, "current frame" in the properties panel sets that frame's attachment, color and alpha. Pick an event in the dopesheet toolbar and click "Add event"; click an event diamond to edit its values.
- Constraints, draw order, mesh deform and skins: select an IK or Transform constraint under "Constraints" in the tree to edit its mixes; in animate mode, a selected slot's draw order can be changed for the frame; select a mesh attachment and drag its yellow vertices on stage; the "Create" section of the skeleton properties adds blank animations and skins, and skin properties rename skins and bind or remove attachments.
- Delete: select a bone, slot, attachment, constraint, skin, event or animation and press `Delete`, or click "Delete" at the top right of the properties panel; a bone is deleted together with its child bones and their slots. `Ctrl+Z` restores it.
- Edit: change names or values in the properties panel; Enter or leaving the field applies, Esc cancels. Undo, redo and "Save JSON" are at the top right, an "unsaved changes" badge appears when needed, and closing the tab asks for confirmation. The "History" tab in Advanced Tools lists every step; click one to return to it. "Export project ZIP" in the skeleton properties writes JSON, atlas and textures together.

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `Left` / `Right` | Step back / forward 1 frame |
| `Shift + Left` / `Shift + Right` | Step back / forward 10 frames |
| `Home` | Go to frame 0 |
| `L` | Toggle loop |
| `F` | Fit view |
| `0` | Zoom 100% |
| `B` | Bone overlay |
| `S` | Toggle setup mode |
| `A` | Toggle animate mode (opens the dopesheet) |
| `K` / `Shift + K` | Animate mode: key the selected bone / all bones at the current frame |
| `Delete` / `Backspace` | Delete selected keys |
| `Delete` | With no keys selected, delete the selected object (bone with children and slots, slot, attachment, constraint, skin, event, animation); undoable |
| `Ctrl + C` / `Ctrl + V` | Animate mode: copy selected keys / paste at the current frame |
| `W` / `E` / `R` | Translate / rotate / scale gizmo in setup or animate mode |
| `Shift` (while dragging the gizmo) | Temporarily toggle snapping |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` / `Ctrl + Y` | Redo |
| `Ctrl + S` | Save as Spine 4.2 JSON |
| `Esc` | Cancel a gizmo drag; close Advanced Tools or the export dialog; cancel input in an edit field |

### Architecture

Layers:

- UI (`src/components`, React): reads the Zustand stores only; every action goes through `InspectorController`.
- Controller (`src/controller`): `InspectorController` coordinates asset lifecycle, playback, mixing, tracks, skins, slots, events, view and export; features handle the atlas, audio, audit, animate mode, setup mode gizmo, mesh deform, export preview and the editing session. `ControllerEnvironment` injects every browser dependency (rAF, clock, asset source, export backend, pixel readback and image decoding, Web Audio, resource disposal).
- State (`src/store`): `inspectorStore` holds serializable UI state; `liveStore` holds per-frame live data (time, frame, track and mix progress, current attachments, zoom, pointer, FPS).
- Core (`src/core`, no React): assets, spine, render, export, demo, playback, atlas, image, audit, audio, legacy (3.6 reader and 4.2 upgrade), animation (keyframe channels, curves, dopesheet model, draw order, mesh deform), gizmo, and editor (editable document, reversible patches, history, commands including deletion, serialization and project packaging).

Data flow:

1. Dropped or picked files become `VirtualFile[]`; ZIPs are expanded, skeleton, atlas and pages are paired and decoded into an `AssetSource`.
2. `InspectorController.applySource` builds `SkeletonData` with the stage's WebGL context, creates a `SpineInstance` and writes an `AssetSummary` to the store.
3. Every `requestAnimationFrame` advances the AnimationState, applies slot overrides, updates world transforms, collects events, publishes a live snapshot and draws the skeleton and overlays.
4. Atlas unpacking reads raw texture pixels back from WebGL with premultiplication and color conversion disabled, copies each region according to its rotation and trim, and encodes PNGs with the built-in encoder, so semi-transparent pixels stay exact.
5. Audio is decoded with Web Audio, mixed to mono, and analyzed for 2000 peak segments and energy onsets; synced playback schedules sources by offset and speed.
6. Editing keeps the original 4.2 JSON as an immutable document. Each command produces patch operations; the new document is re-parsed with the existing atlas, and only a successful parse is recorded and swaps in a new `SpineInstance` while restoring animation, time, skins, tracks, mix pairs, slot overrides and region replacements. Undo and redo replay recorded inverse or forward operations.
7. Setup mode drags write directly to the runtime BoneData for live feedback; on release the BoneData is restored and a single `setBoneTransform` command goes through the editing flow.
8. Animate mode converts the runtime local pose into 4.x timeline values and writes keys at the current frame; unmodified keys keep their original JSON objects.
9. Curves are edited in normalized segment coordinates and written as 4.x absolute `curve` arrays per value channel.
10. Mesh deform converts the world drag delta through each bone weight's inverse world matrix, so the vertex moves exactly by the drag; keys are written as trimmed `offset` + `vertices`.
11. Draw order keys use the longest increasing subsequence to find slots that do not move, and write the rest as `{ slot, offset }`.
12. Export uses an independent `OffscreenSpineRenderer` with its own WebGL context, rebuilding the skeleton from the same `AssetSource`; screenshots copy the current pose exactly with `transferPose`, sequences and WebM sample frames with `seek`. The preview and the real export share one framing calculation (`core/export/placement.ts`).

Key design points:

- `SpineInstance` depends only on `@esotericsoftware/spine-core`, so playback, mixing, events and overrides are fully tested in Node with fake textures.
- Scrubbing resets `trackTime`, `animationLast` and `trackLast` so events never fire twice; single-frame steps do fire crossed events.
- Slot overrides are applied after `AnimationState.apply`, so they win over attachment timelines.
- The edit document is copy-on-write; removed object keys return to their original position, so undoing every edit reproduces the loaded document exactly (key order and values).

### Directory Layout

```
spine-asset-inspector/
  csp.config.ts                 Single source of CSP directives (meta and preview headers)
  vite.config.ts                Build config and CSP injection plugin
  vitest.config.ts              Unit tests (core: node, dom: jsdom)
  playwright.config.ts          E2E config (build, then run against the preview server)
  scripts/                      Rule checker (no comments, zero emoji)
  src/
    core/                       Framework-free logic (assets, spine, render, export, atlas, image, audit, audio, legacy, gizmo, animation, editor, demo, playback)
    controller/                 InspectorController, environment injection, features
    store/                      inspectorStore, liveStore, defaults
    hooks/                      Keyboard shortcuts, unsaved-changes guard
    components/                 layout, tree, properties, dopesheet, edit, export, stage, panels, ui
  tests/
    unit/                       Vitest unit and component tests
    e2e/                        Playwright E2E tests
    support/                    Fake textures, fake controller environment, PNG decoder, WAV synthesis, demo files, Spine 3.6 binary writer
  docs/
    HANDOFF.md
```

The detailed per-file layout is listed in the Chinese section below.

### File and Code Conventions

| Rule | Content | Check |
| --- | --- | --- |
| No comments | No line, block, JSDoc, JSX, CSS or HTML comments or shebangs in `src`, `scripts`, `tests`, root config files and `index.html` | `npm run lint:comments`, `tests/unit/rules.test.ts` |
| Zero emoji | No emoji, flags, keycaps, skin tone modifiers or variation selectors in code, tests, scripts, docs, README, `package.json` or `LICENSE` | `npm run lint:emoji`, `tests/unit/rules.test.ts` |
| Types | TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` | `npm run typecheck` |
| Module boundaries | `core` never imports React, stores or the controller; components never touch `SpineInstance` directly | Code review |
| UI text | Plain text and technical label badges, Lucide line icons only | `lint:emoji` |
| Test hooks | Interactive elements carry `data-testid`; E2E relies only on `data-testid` and accessibility attributes | E2E |
| Identity and license | `package.json` author `zzoraemon043`, MIT license, committer `zzoraemon043 <195147269+zzoraemon043@users.noreply.github.com>` | Code review |

The no-comment rule walks the TypeScript syntax tree and inspects comment trivia around every token, so `//` and `/*` inside strings, templates, regular expressions and JSX text are not false positives; CSS strings are masked first. The zero-emoji rule matches `\p{Extended_Pictographic}`, `\p{Regional_Indicator}`, `U+FE0F`, `U+20E3`, skin tone modifiers and tag characters; CJK text, box drawing characters and ordinary symbols are unaffected.

### Performance Audit Budgets

A value at or below the "good" limit is good, at or below the "warning" limit is a warning, and above it is heavy; the overall rating is the worst metric. The budgets target a mid-range phone at 60 FPS with one character on screen, and live in `src/core/audit/budgets.ts`.

| Metric | Good | Warning | Calculation |
| --- | --- | --- | --- |
| Bones | 60 | 100 | `SkeletonData.bones` |
| Slots | 60 | 100 | `SkeletonData.slots` |
| Current vertices | 800 | 1500 | Visible region (4) and mesh vertices in the current pose |
| Current triangles | 600 | 1200 | Region (2) and mesh triangles |
| Total asset vertices | 3000 | 6000 | All unique region / mesh vertices across skins |
| Mesh attachments | 20 | 40 | MeshAttachment count |
| Weight influences | 2000 | 4000 | Total bone influences of weighted meshes |
| Clipping attachments | 0 | 2 | ClippingAttachment count |
| IK constraints | 8 | 16 | |
| Transform constraints | 8 | 16 | |
| Path constraints | 2 | 5 | |
| Physics constraints | 4 | 10 | |
| Atlas pages | 1 | 3 | |
| Estimated draw calls | 3 | 6 | Texture or blend mode switches and clipping starts in draw order |
| Animations | 40 | 80 | |

Current vertices, triangles and draw calls are recomputed on load, skin changes, slot overrides and region replacement; after changing animation or frame, click "Measure current pose".

### Security and Privacy

- 100% local: no backend, telemetry, CDN fonts or external scripts; assets, replacement textures and audio exist only in browser memory.
- The production build injects a CSP meta tag at the top of `<head>`, and `npm run preview` also sends full security headers: `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' blob: data:`, `media-src 'self' blob:`, `font-src 'self'`, `connect-src 'none'` (blocks fetch, XHR and WebSocket), `'none'` for workers, frames, objects, manifests, `base-uri` and `form-action`, and `frame-ancestors 'none'` in the header.
- Other headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` disabling camera, microphone, geolocation, payment and USB. When deploying elsewhere, send `CSP_HEADER` from `csp.config.ts` as an HTTP response header.
- E2E tests verify the CSP header and meta, that outbound `fetch` is blocked with a `securitypolicyviolation`, and that normal use produces no CSP violations or console errors.

### Testing

| Category | Tool | Coverage |
| --- | --- | --- |
| Type check | `tsc --noEmit` | All source, tests and config files |
| Rule checks | `scripts/run-rule.mjs` | No comments, zero emoji; failures list file and line |
| Unit tests (core project, Node) | Vitest | Asset loading, playback, mixing, export planning and framing, atlas slicing and PNG encoding, audit, audio, the 3.6 upgrade, the editing core (patches, history, every command and its reference updates, deletion with reference cleanup, lossless serialization), gizmo math, keyframe channels, curves, slot and event channels, draw order, mesh deform, constraints, skins, and controller flows |
| Component tests (dom project, jsdom) | Vitest + Testing Library | Tree, properties panel, export dialog (settings, preview guides, overflow warnings, frame slider, crop frame dragging, crop fields and reset), panels, edit fields, undo / redo / save shortcuts, setup and animate mode toolbars and shortcuts, dopesheet, curve panel, event and slot keys, stage 5 editors, Delete for keys and objects |
| E2E (production build + preview server) | Playwright + Chromium | Rendering, CSP, playback, mixing, skins, slots, debug overlays, events, loading, every export type with decoded output, export preview and crop dragging with the exported PNG size, atlas pixel comparisons, region replacement, audit, audio, 3.6 loading, editing with pixel-exact undo / redo, setup mode and animate mode with real mouse drags, curves, slot and event keys, IK, draw order, mesh deform, skins, and deleting a bone with Delete and restoring it with Ctrl+Z |

```bash
npm run verify
```

Or run the steps separately: `npm run typecheck`, `npm run lint:rules`, `npm run test`, `npm run test:coverage`, `npm run test:e2e`.

E2E uses the Chromium in `/opt/pw-browsers` by default; set `PW_CHROMIUM_PATH` for another binary or run `npx playwright install chromium`. `E2E_SKIP_BUILD=1` skips the build and `E2E_PORT` sets the preview port. Environments without a GPU render WebGL with SwiftShader.

### Known Limitations

- The runtime is Spine 4.2. 3.6 binaries are upgraded automatically; 3.x JSON and 3.7 / 3.8 binaries are not supported yet; 4.0 / 4.1 / 4.3 show a version warning and may fail.
- After a 3.6 upgrade, poses are computed by the 4.2 runtime; small runtime differences between 3.x and 4.x (for example transform inheritance details) may differ from old game builds.
- Single-frame screenshots copy the current pose exactly; PNG sequences and WebM sample only the chosen animation on track 0 (with current skins and slot overrides), without layered tracks or mix transitions.
- WebM is recorded in real time with `MediaRecorder`; alpha depends on the browser's VP9 / VP8 encoder. Chromium has the best support; Firefox and Safari may drop alpha or not support it.
- Each exported frame is at most 4096 pixels on its longest side, with up to 600 frames; a Sprite Sheet is at most 4096x4096.
- Not yet supported in the editor: creating shear keys, a two-color (dark color) editing UI, editing and keying Path and Physics constraints, Sequence keys, changing setup draw order (only draw order keys), box selecting mesh vertices, and creating new bones, slots or attachments.
- Constraint `order` comes from the source file; hand-written JSON where several constraints lack `order` activates only one of them in the 4.2 runtime.
- A Spine Bezier segment has only two control points, so the "bounce" preset overshoots once; build multiple bounces from several keys.
- Keys rewritten by curve edits omit fields equal to their defaults (for example `time: 0`); the content is equivalent, and untouched keys keep their original form.
- Animate mode temporarily disables layered tracks (restored on exit); the dopesheet shows only the track 0 animation, at a fixed 16 pixels per frame without zoom, and keys move in whole frames.
- The gizmo has no shear or length handles; one bone at a time, no multi-select.
- Spine 4.x binary `.skel` files are view and export only; export JSON from the Spine editor to edit.
- Edits are always saved as Spine 4.2 JSON; upgraded 3.6 files cannot be saved back as 3.6. The project ZIP contains the originally loaded atlas and textures; region replacements are not written.
- Edit history lives only in the current tab; reloading or loading another asset clears it, so save JSON before leaving.
- The event log keeps the latest 1000 entries and shows the latest 300.
- Region replacement fills the region's original size (trim offsets are not kept), lasts for the session only, and does not cover Sequence attachments.
- Atlas unpacking supports 0 / 90 / 180 / 270 degree rotation and `offsets` whitespace; `split` / `pad` nine-patch data is not exported.
- Onset detection compares energy and suits short percussive sounds; alignment for long tones or music is a rough guide.
- Synced audio and event sounds are scheduled in real time and stop on pause, single-frame steps and scrubbing.
- Physics constraints are reset when seeking or stepping, and accumulate state only during continuous playback.

### License

MIT License, Copyright (c) 2026 zzoraemon043. See [LICENSE](LICENSE).

Spine Runtimes are distributed under the Esoteric Software Spine Runtimes License; using them in a product requires a valid Spine editor license. This project only references the official runtimes through npm and contains no Esoteric Software sample art; the 3.6 binary upgrader is implemented from the publicly documented 3.6 file format. The repository contains no third-party character assets; keep real assets local when testing and do not commit them.

---

## 繁體中文

純前端、可離線運作的 2D 遊戲 Spine 骨骼動畫資產檢驗工作台。提供動畫預覽、逐影格控制、動作過渡與多軌道混合調校、換皮換裝組裝、插槽部件檢視、除錯線框、自訂事件監聽、圖集拆解與紋理熱替換、骨架效能體檢、音訊事件對齊、動畫編輯，以及透明背景的 PNG / PNG 序列 / Sprite Sheet / WebM 匯出。所有解析與渲染都在瀏覽器本機完成，不上傳任何資產。

### 目錄

1. [功能總覽](#功能總覽)
2. [快速開始](#快速開始)
3. [支援的資產格式與載入規則](#支援的資產格式與載入規則)
4. [介面導覽與快捷鍵](#介面導覽與快捷鍵)
5. [架構](#架構)
6. [目錄結構](#目錄結構)
7. [檔案與程式碼規範](#檔案與程式碼規範)
8. [效能體檢基準](#效能體檢基準)
9. [安全性與隱私](#安全性與隱私)
10. [測試](#測試)
11. [已知限制](#已知限制)
12. [授權](#授權)

---

### 功能總覽

| 模組 | 對應元件 | 能力 |
| --- | --- | --- |
| AssetLoader | `core/assets/*`、`TopBar`、`StageView` | 拖曳或選取 `.json` / `.skel` + `.atlas` + `.png`，或整包 `.zip`、整個資料夾；自動配對骨架、圖集與貼圖頁面；偵測 Spine 版本並提示不相容 |
| StageRenderer | `core/render/*`、`StageView` | WebGL 渲染（`@esotericsoftware/spine-webgl`）、自適應高 DPI 畫布、滾輪以游標為錨點縮放、拖曳平移、雙擊適配、1:1 縮放、四種背景（透明棋盤格、深色、淺色、綠幕）、原點座標軸 |
| Demo Asset | `core/demo/*` | 程序化產生的最小測試骨架（18 骨骼、18 插槽、7 皮膚、7 動作、3 種事件、網格、碰撞框、插槽顏色與部件時間軸），未載入外部檔案即可完整運作 |
| MotionPlayer / PlaybackController | `HierarchyPanel`、`PlaybackBar`、`TimelineScrubber` | 階層樹或下拉選單切換動畫、播放 / 暫停、循環、0.1x 至 2.0x 速率、單影格前進與後退、時間軸拖曳定位（不觸發事件）、秒數與影格顯示、事件標記 |
| Animation Mix Lab | `MixLabPanel` | defaultMix 調整、A 至 B 過渡測試（可設定混合時間與 A 動作停留時間）、即時混合進度、個別 from / to 混合配對表、Track 1 至 3 多軌疊加（動作、alpha、replace / add、循環、靜音） |
| Skins & Attachments | `HierarchyPanel`、`PropertiesPanel`、`SlotInspectorPanel` | 單選或多皮膚疊加組裝（`Skin.addSkin`）、依繪製順序列出插槽、即時顯示目前部件、獨立隱藏插槽或強制指定部件、舞台高亮所選插槽 |
| Debug Overlays | `DebugPanel`、`core/render/debugOverlay.ts` | 骨骼軸線、插槽點位、區域外框、網格外殼、網格頂點線框、邊界碰撞框、路徑、裁切區 |
| Event Monitor | `EventMonitorPanel` | 記錄自訂事件（時間戳記、軌道、動作、動畫時間、int / float / string / audio 參數），可選擇記錄 start / interrupt / end / complete 生命週期，支援篩選、暫停、清除與各事件計數 |
| Atlas Toolkit | `core/atlas/*`、`core/image/*`、`AtlasPanel` | 圖集頁面預覽與 Region 清單；依 `bounds`、`rotate`、`offsets` 無損還原每張碎圖（可選擇還原裁切留白），單張下載或整包 ZIP（含 `atlas-manifest.json`）；拖入單張 PNG 即時熱替換指定 Region，影響所有引用的 Region / Mesh 部件，並同步套用到匯出 |
| Auditor | `core/audit/*`、`AuditPanel` | 依手遊效能基準統計骨骼、插槽、目前頂點與三角面、資產總頂點、網格、權重影響數、裁切、IK / Transform / Path / Physics 限制器、圖集頁數、預估 Draw Calls、動作數，逐項與整體給出優良 / 警告 / 過重評級 |
| Audio Sync | `core/audio/*`、`controller/audioBackend.ts`、`AudioPanel` | 拖入 WAV / MP3 / OGG / M4A / FLAC；在面板與主時間軸顯示波形、起音點與播放游標；可設定音訊偏移、從 0 秒同步試聽、依事件自動建議偏移；逐事件顯示與最近起音點的毫秒差與對齊狀態；事件可綁定音效，播放時即時觸發並計數 |
| AssetExporter | `core/export/*`、`ExportDialog` | 匯出對話框四種類型：PNG 序列圖 ZIP（含 `manifest.json`）、Sprite Sheet（單張大圖 + TexturePacker 格式 JSON）、目前畫面單張 PNG、WebM 短片；可設定指定寬高（像素）或倍率、影格速率、起訖影格、四周留白、透明或純色背景、Sprite Sheet 每列格數、WebM 重複次數，可取消；右側即時預覽依設定渲染輸出畫布，含影格滑桿、畫布邊界 / 留白 / 內容範圍輔助線、超出畫布警告，以及置中 / 底部對齊與水平垂直偏移（同步套用到實際匯出）；另有「自訂裁剪範圍」（比照 Spine 匯出檢視區）：以骨架座標指定 X、Y、寬、高與縮放倍率，預覽框外變暗，可直接拖曳裁剪框的單邊或角、平移整個框，角色大小不變 |
| Editor（動畫編輯第 1 階段） | `core/editor/*`、`controller/features/editorFeature.ts`、`PropertiesPanel`、`HistoryPanel` | 載入時保留原始 Spine 4.2 JSON 結構為可編輯文件（3.6 二進位升級後同樣可編輯）；以可逆的修補運算（設定、插入、移除、改鍵名且保留鍵順序）記錄每一步，支援復原、重做、跳到任一歷史步驟、同欄位連續修改自動合併、最多 200 步；可編輯骨骼名稱與設置姿勢、插槽名稱與顏色與預設部件與混合模式、事件名稱與預設值、動畫重新命名 / 複製 / 刪除、骨架影格速率，改名時同步更新所有引用（父骨骼、插槽、IK / Transform / Path / Physics 限制器、皮膚、動畫時間軸、繪製順序、裁切結束插槽、事件關鍵影格）；儲存為標準 Spine 4.2 JSON，或匯出含 JSON、圖集與貼圖的專案 ZIP；編輯後的匯出（PNG / Sprite Sheet / WebM）一律使用編輯後的骨架 |
| Setup Mode（動畫編輯第 2 階段） | `core/gizmo/*`、`core/render/gizmoOverlay.ts`、`controller/features/gizmoFeature.ts`、`ViewportToolbar`、`StageView` | 設置模式停止動畫並顯示設置姿勢；在畫面點選骨骼（自動展開階層樹），以控制軸拖曳：位移（父空間 X / Y 軸箭頭與中心自由移動）、旋轉（環狀把手，可連續轉超過 180 度）、縮放（中心等比與骨骼 X / Y 單軸）；拖曳中即時重繪，子骨骼與插槽貼圖跟隨，屬性面板與畫面提示即時顯示數值；放開滑鼠才寫入一筆編輯歷史，Esc 取消；吸附（位移取整數、旋轉每 15 度、縮放每 0.1）可由工具列開關或按住 Shift 暫時切換 |
| Animate Mode / Dopesheet（動畫編輯第 3 階段） | `core/animation/*`、`controller/features/animateFeature.ts`、`components/dopesheet/Dopesheet.tsx` | 動畫模式暫停目前動畫並開啟律動表；控制軸拖曳或屬性面板「目前影格姿勢」的修改寫入目前影格的位移 / 旋轉 / 縮放關鍵影格（自動 K 幀，預設開啟），關閉自動 K 幀時變更先暫存、按 K 才寫入、換影格即捨棄；K 幀選取骨骼（K）與全部骨骼（Shift+K）；律動表左側列出有時間軸的骨骼與通道，右側影格刻度與關鍵影格菱形，可點選、Ctrl / Shift 多選、框選、拖曳移動（自動處理撞格與貝茲曲線比例）、Delete 刪除、Ctrl+C / Ctrl+V 複製貼上到目前影格，點刻度或空白處跳到該影格；所有關鍵影格變更都進入復原 / 重做 |
| Curve Editor / Extended Channels（動畫編輯第 4 階段） | `core/animation/curveShape.ts`、`components/dopesheet/CurveEditor.tsx`、`EventKeyEditor.tsx`、`PropertiesPanel` 的 `SlotKeyEditor` | 律動表右側「過渡曲線」面板：線性 / 步進 / 貝茲切換、以控制桿拖曳進出切線（放開才寫入一筆歷史）、緩入 / 緩出 / 緩入緩出 / 回彈 / 預備 / 急停預設一鍵套用到所有選取區段，寫回 4.2 `curve` 陣列；律動表以線條樣式標示每段曲線類型。插槽部件與顏色關鍵影格（部件切換或隱藏、RGBA 顏色、透明度；已使用 `rgb` / `alpha` 分離或雙色時間軸的插槽會寫入對應通道），事件關鍵影格（工具列新增、拖曳移動、刪除、複製貼上，右側面板編輯事件名稱與整數 / 小數 / 字串 / 音量 / 平衡），全部接入復原 / 重做 |
| Constraints / Draw Order / Mesh Deform / Skins（動畫編輯第 5 階段） | `core/animation/drawOrder.ts`、`meshDeform.ts`、`core/editor/structureCommands.ts`、`controller/features/meshFeature.ts`、`components/properties/AdvancedEditors.tsx` | 階層樹新增「限制器」群組：IK 與變換限制器的受控骨骼、目標、設置值（權重、柔軟度、彎曲方向、壓縮 / 伸展；各項變換權重）可編輯，動畫模式以滑桿或數值寫入限制器關鍵影格；拖曳 IK 目標骨骼時骨骼鏈即時反向運算。插槽「繪製順序」可往前 / 往後一層或還原設置順序，寫入繪製順序關鍵影格（以最少位移輸出 4.x `offsets`）。選取網格部件後在畫面點選 / Shift 加選頂點並拖曳，依頂點權重換算每根骨骼的位移寫入變形關鍵影格（支援加權網格），可全選、重設此影格變形。新增空白動畫、新增 / 重新命名皮膚（同步更新變形時間軸與連結網格引用），以及將其他皮膚的部件綁定到指定皮膚或移除 |
| 刪除物件 | `core/editor/deleteCommands.ts`、`InspectorController.deleteSelection`、`PropertiesPanel` | 選取骨骼、插槽、部件、限制器、皮膚、事件或動畫後按 Delete（或屬性面板標題列的「刪除」）：骨骼連同子骨骼與其插槽、插槽連同各皮膚的部件、部件從所有皮膚移除；同步清除時間軸、皮膚引用、路徑 / 物理限制器、裁切結束插槽與變形時間軸，繪製順序關鍵影格依新的插槽順序重算，加權網格的骨骼索引重新對應；根骨骼與仍被其他網格權重綁定的骨骼會拒絕刪除；整筆為一個可復原步驟 |
| Hierarchy / Properties | `components/tree/*`、`components/properties/*` | 參考 Spine 編輯器習慣的階層樹（骨骼含子骨骼與插槽、插槽含部件、皮膚、動畫、事件）與屬性面板（依選取項目顯示設置姿勢、即時數值、插槽顯示與部件、皮膚套用、動畫資訊與一鍵匯出、事件出現位置），並在畫面高亮選取的骨骼或插槽 |

---

### 快速開始

需求：Node.js 20 以上。

```bash
npm ci
npm run dev
```

開發伺服器啟動後開啟終端顯示的網址即可，首頁會自動載入示範資產。

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | Vite 開發伺服器（不套用 CSP，以支援 HMR） |
| `npm run build` | 型別檢查後輸出正式建置到 `dist/`，自動注入 CSP meta |
| `npm run preview` | 以正式建置與完整安全標頭（含 `frame-ancestors`）啟動預覽伺服器 |
| `npm run typecheck` | TypeScript 嚴格模式型別檢查 |
| `npm run lint:rules` | 無註解與零 Emoji 規則檢驗 |
| `npm run test` | Vitest 單元測試與元件測試 |
| `npm run test:coverage` | 單元測試覆蓋率（v8） |
| `npm run test:e2e` | Playwright E2E 測試（自動建置並以 preview 伺服器執行） |
| `npm run verify` | 依序執行以上全部檢查 |

`dist/` 為純靜態檔案，可直接放在任何內網靜態主機或以 `file` 以外的本機伺服器開啟。

---

### 支援的資產格式與載入規則

| 類型 | 副檔名 |
| --- | --- |
| 骨架（JSON） | `.json`、`.json.txt`（內容需含 `skeleton` 或 `bones` 結構，其他 JSON 會被略過） |
| 骨架（二進位） | `.skel`、`.skel.bytes` |
| 圖集描述 | `.atlas`、`.atlas.txt` |
| 貼圖 | `.png`、`.webp`、`.jpg`、`.jpeg`、`.avif` |
| 壓縮檔 | `.zip`（支援巢狀一層、自動忽略 `__MACOSX` 與 `._*`） |
| 音效 | `.wav`、`.mp3`、`.ogg`、`.oga`、`.m4a`、`.aac`、`.flac`（拖到舞台時自動加入音訊面板，不影響目前資產） |

載入規則：

- 骨架與圖集配對優先順序：同資料夾且同主檔名、任意資料夾同主檔名、同資料夾、第一個圖集。
- 圖集頁面貼圖配對：相對於圖集的路徑、同檔名、同主檔名，皆不分大小寫。
- 多個骨架檔時載入第一個，並在 Asset 面板提供下拉選單切換其他骨架。
- 缺少骨架、圖集、貼圖或頁面時，以錯誤通知列出缺件，並保留目前已載入的資產。
- 執行環境為 Spine 4.2。版本由 JSON `skeleton.spine` 或二進位標頭讀取（支援 4.x 與 3.x 標頭格式）。

| 檔案版本 | 支援方式 |
| --- | --- |
| 4.2.x（JSON / 二進位） | 直接解析 |
| 3.6.x 二進位 `.skel` | 載入時自動升級為 4.2 結構再解析，頂列顯示 `UPGRADED 4.2` 徽章與提示 |
| 4.0 / 4.1 / 4.3 | 嘗試解析並顯示版本警告，可能失敗 |
| 3.x JSON、3.7 / 3.8 二進位 | 尚未支援，顯示明確錯誤，請以 Spine 編輯器重新匯出為 4.2 |

- 3.6 升級比照 Spine 編輯器匯入舊檔的行為：旋轉關鍵影格依 3.x 最短路徑規則展開、3.x 正規化貝茲曲線轉為 4.x 絕對座標曲線、限制器混合欄位與雙色、變形、繪製順序、事件等全部對應；3.6 的 `.atlas` 舊欄位格式由執行環境直接支援。
- 圖集 `pma: true` 時以預乘 Alpha 模式渲染與匯出。
- 在 Atlas 頁籤選取 Region 後，拖入舞台的單張 PNG 會視為該 Region 的熱替換貼圖，而不是新資產。
- 安全上限：輸入總容量 512 MB、壓縮檔解壓後 512 MB、項目數 4096、巢狀深度 2。

---

### 介面導覽與快捷鍵

介面全部為繁體中文，版面參考 Spine 編輯器的使用習慣：中間是畫面、右側是階層樹與屬性、下方是播放列與時間軸。不常用的工具收在「進階工具」，按下後才會在畫面右側展開。

```
+-------------------------------------------------------------------------------+
| 開啟檔案 開啟資料夾 示範角色 | 角色名稱 / 本機 / 版本 / 已升級      匯出  進階工具 |
+------------------------------------------------------+------------------------+
| 縮放 適配 1:1 座標軸 | 骨骼 網格 碰撞框 | 背景  [進階工具 | 階層                  |
|                                                      |   骨骼（樹狀，含插槽） |
|                    畫面（WebGL）           混合 插槽 |   皮膚（勾選套用）     |
|                                           事件 音訊 |   動畫（點選即播放）   |
|                                           圖集 效能 |   事件                 |
|                                           顯示      +------------------------+
|                                                    ] | 屬性                  |
+------------------------------------------------------+   依選取項目顯示       |
| 動畫選單  上一格 播放 下一格  循環  速度  時間 影格  |                        |
| 時間軸（事件標記、音效波形，可拖曳）                  |                        |
+------------------------------------------------------+------------------------+
| 就緒  骨骼 / 插槽 / 動畫 / 皮膚                     縮放  座標  fps            |
+-------------------------------------------------------------------------------+
```

常見操作：

- 換動畫：點右側「動畫」底下的名稱，或用播放列最左邊的下拉選單。
- 看骨骼或插槽：在階層樹點選，畫面會高亮該骨骼或插槽，屬性面板顯示設置姿勢與即時數值。
- 換裝：勾選「皮膚」底下的項目，可同時勾選多個組合。
- 隱藏或換部件：點選插槽，在屬性面板按「隱藏此插槽」或從「指定部件」選單選擇。
- 匯出：按右上角「匯出」，或在動畫的屬性面板按「匯出這個動作」。對話框右側為即時預覽：拖曳影格滑桿檢查每一格，琥珀色虛線為留白、紫色框為內容範圍、綠色虛線為目前姿勢；內容超出畫布時會顯示警告，可用對齊方式與偏移微調位置；也可直接在預覽拖曳裁剪框（與 Spine 匯出的檢視區相同）：拖曳邊或角只移動那一邊，拖曳框內平移，雙擊重設為角色範圍，輸出尺寸 = 裁剪範圍 x 縮放倍率。
- 設置模式：按畫面左上角「設置模式」（或 `S`），動畫會停止並顯示設置姿勢。點選畫面上的骨骼或階層樹中的骨骼後出現控制軸，`W` / `E` / `R` 切換位移 / 旋轉 / 縮放。拖曳時屬性面板數值即時變化，放開即記錄一步，可用 Ctrl+Z 復原；拖曳中按 Esc 取消。按播放或切換動畫會自動離開設置模式。
- 動畫模式：先選好動畫，按畫面左上角「動畫模式」（或 `A`），下方出現律動表。點刻度選影格，拖曳控制軸或在屬性面板「目前影格姿勢」改數值，就會在該影格寫入關鍵影格。律動表中可點選、框選、拖曳關鍵影格，`Delete` 刪除，`Ctrl+C` / `Ctrl+V` 複製貼上到目前影格。
- 曲線與擴充通道：在律動表點選關鍵影格後，右側「過渡曲線」面板可切換線性 / 步進 / 貝茲、拖曳紫色控制桿或按預設。選取插槽時，屬性面板「目前影格」可直接設定該影格的部件、顏色與透明度。律動表工具列選擇事件後按「新增事件」，點選事件菱形即可在右側編輯參數。
- 限制器、繪製順序、網格變形與皮膚：在階層樹「限制器」點選 IK 或變換限制器編輯權重；動畫模式中選取插槽可調整該影格的繪製順序；選取網格部件後直接在畫面拖曳黃色頂點；骨架屬性的「新增」區可建立空白動畫與皮膚，皮膚屬性可改名並綁定或移除部件。
- 刪除：選取骨骼、插槽、部件、限制器、皮膚、事件或動畫後按 `Delete`，或按屬性面板右上角「刪除」；骨骼會連同子骨骼與其插槽一起刪除，可用 `Ctrl+Z` 復原。
- 編輯：在屬性面板直接修改名稱或數值，按 Enter 或移開游標套用、Esc 取消；右上角有復原、重做與「儲存 JSON」，有未儲存變更時顯示「未儲存變更」標記，關閉分頁前會提醒。「進階工具」的「歷史」頁籤列出每一步，點選即可回到該狀態。骨架屬性中的「匯出專案 ZIP」會一併輸出 JSON、圖集與貼圖。

| 按鍵 | 動作 |
| --- | --- |
| `Space` | 播放 / 暫停 |
| `Left` / `Right` | 後退 / 前進 1 影格 |
| `Shift + Left` / `Shift + Right` | 後退 / 前進 10 影格 |
| `Home` | 回到第 0 影格 |
| `L` | 循環切換 |
| `F` | 視角適配 |
| `0` | 縮放 100% |
| `B` | 骨骼線框 |
| `S` | 設置模式切換 |
| `A` | 動畫模式切換（開啟律動表） |
| `K` / `Shift + K` | 動畫模式：在目前影格 K 幀選取的骨骼 / 全部骨骼 |
| `Delete` / `Backspace` | 刪除選取的關鍵影格 |
| `Delete` | 沒有選取關鍵影格時，刪除選取的物件（骨骼含子骨骼與插槽、插槽、部件、限制器、皮膚、事件、動畫），可復原 |
| `Ctrl + C` / `Ctrl + V` | 動畫模式：複製選取的關鍵影格 / 貼上到目前影格 |
| `W` / `E` / `R` | 設置或動畫模式中切換位移 / 旋轉 / 縮放控制軸 |
| `Shift`（拖曳控制軸時） | 暫時切換吸附 |
| `Ctrl + Z` | 復原編輯 |
| `Ctrl + Shift + Z` / `Ctrl + Y` | 重做編輯 |
| `Ctrl + S` | 儲存為 Spine 4.2 JSON |
| `Esc` | 取消控制軸拖曳；關閉進階工具或匯出對話框；編輯欄位中為取消輸入 |
| 拖曳 / 滾輪 / 雙擊 | 平移 / 縮放 / 適配 |

---

### 架構

#### 分層

```
UI 層 (React 元件, src/components)
   |  只讀取 Zustand store，所有操作呼叫 InspectorController
   v
控制層 (src/controller)
   InspectorController   協調資產生命週期、播放、混合、軌道、皮膚、插槽、事件、視角、匯出
   features/AtlasFeature 圖集資訊、碎圖拆解匯出、Region 熱替換與還原
   features/AudioFeature 音效解碼、波形與起音點、同步試聽、事件綁定觸發
   features/AuditFeature 效能體檢報告
   features/AnimateFeature 動畫模式：姿勢換算為關鍵影格、自動 K 幀與暫存姿勢、關鍵影格選取 / 移動 / 刪除 / 複製貼上
   features/GizmoFeature 設置模式控制軸：命中判定、拖曳預覽、放開時提交單筆編輯、畫面點選骨骼
   features/EditorFeature 編輯工作階段、復原 / 重做、重建執行環境資料、儲存 JSON 與專案 ZIP
   ControllerEnvironment 注入點：rAF、時鐘、資產來源、匯出後端、像素讀取與影像解碼、Web Audio、資源釋放
   |
   +--> 狀態層 (src/store)
   |      inspectorStore  可序列化的 UI 狀態（目前動作、播放設定、混合、軌道、覆寫、除錯旗標、事件紀錄、匯出狀態、通知）
   |      liveStore       每影格更新的即時資料（時間、影格、軌道與混合進度、目前部件、縮放、指標座標、FPS）
   |
   +--> 核心層 (src/core, 不依賴 React)
          assets   檔案分類、ZIP 展開、資產配對、瀏覽器檔案讀取與貼圖解碼
          spine    SpineInstance（Skeleton + AnimationState 封裝）、骨架建構、版本偵測、摘要、姿勢轉移
          render   相機數學、WebGL 舞台渲染、除錯覆蓋層
          export   匯出規劃、離屏 WebGL 渲染、PNG / ZIP / WebM 匯出、下載
          demo     程序化示範骨架、圖集排版與像素繪製
          playback 時間、影格與速率換算
          atlas    圖集模型、無損切割、碎圖 ZIP、Region 熱替換
          image    純 TypeScript PNG 編碼器、WebGL 無損像素讀回
          audit    手遊效能基準與體檢計算
          audio    波形峰值、起音點偵測、事件對齊與偏移建議
          legacy   Spine 3.6 二進位讀取器與 4.2 結構升級（曲線、旋轉展開、欄位對應）
          animation 關鍵影格通道（骨骼、插槽、事件、限制器、繪製順序、網格變形）解析與序列化、曲線形狀與預設、插入 / 移動 / 刪除與貝茲曲線比例換算、文件層級指令、律動表模型、姿勢轉關鍵影格數值
          gizmo    控制軸版面與命中判定、父空間 / 骨骼空間拖曳換算、吸附與數值取位、骨骼點選
          editor   可編輯文件（原始 4.2 JSON）、可逆修補運算、編輯歷史與工作階段、編輯指令、序列化與專案封裝
```

#### 資料流

1. 使用者拖曳檔案或選取檔案，`browserFiles` 轉為 `VirtualFile[]`，`archive` 展開 ZIP，`bundleResolver` 配對出骨架、圖集與頁面貼圖，再解碼為 `ImageBitmap`，組成 `AssetSource`。
2. `InspectorController.applySource` 呼叫 `buildSkeleton`，以舞台的 WebGL 環境建立貼圖並解析 `SkeletonData`，建立 `SpineInstance`，產生 `AssetSummary` 寫入 store。
3. 每個 `requestAnimationFrame`：`SpineInstance.advance` 更新 AnimationState、套用插槽覆寫、更新世界變換；控制器處理待執行的 A 至 B 過渡、彙整事件、推送即時快照，最後由 `StageRenderer` 繪製骨架與除錯層。
4. 圖集拆解：以 WebGL 關閉預乘與色彩空間轉換後讀回貼圖原始像素，依 Region 的旋轉與裁切資訊逐點複製，再以內建 PNG 編碼器輸出，全程不經過 2D Canvas，因此半透明像素不會因預乘而失真。熱替換則為該 Region 建立獨立的 TextureAtlasRegion 與貼圖，改指所有引用它的 Region / Mesh 部件並呼叫 `updateRegion`，還原時改回原物件。
5. 音訊：Web Audio 解碼後混成單聲道，計算 2000 段峰值與能量起音點；同步試聽依偏移與播放速率排程音源，循環播放時於 complete 事件重新排程；事件觸發則在自訂事件發生時播放綁定音效。
6. 編輯：`buildSkeleton` 同時保留原始 4.2 JSON 為不可變文件。每個編輯指令先產生修補運算，套用後的新文件以 `SkeletonJson` 搭配既有圖集重新解析，成功才寫入歷史並換上新的 `SpineInstance`，同時還原目前動作與時間、皮膚、多軌、混合配對、插槽覆寫與 Region 熱替換；解析失敗則整筆取消。復原與重做只套用記錄好的反向或正向運算。
7. 設置模式拖曳：按下時記錄骨骼父座標框與設置值；拖曳中把指標位置換回父空間（位移）或計算繞原點的累積角度（旋轉）、沿骨骼軸的投影比例（縮放），直接寫入執行環境的 BoneData 並重算世界變換，因此子骨骼與貼圖即時跟隨，數值同步推送到屬性面板；放開時先還原 BoneData，再以一筆 `setBoneTransform` 指令走第 6 點的編輯流程。
8. 動畫模式 K 幀：從執行環境讀取骨骼目前的區域姿勢（含未 K 幀的暫存覆寫），換算成 4.x 時間軸數值（位移與旋轉為相對設置值的差、縮放為倍率），以 `setKeys` 指令寫入目前影格；同一通道同一時間已有關鍵影格則更新數值並保留曲線，插入點前一段的貝茲控制點依新的時間與數值範圍等比例換算。未修改的關鍵影格保留原始 JSON 物件，輸出不變。
9. 曲線編輯：面板以正規化座標（區段起訖為 0 到 1）顯示與拖曳控制桿，寫入時依每個數值通道的起訖時間與數值換算為 4.x 絕對座標的 `curve` 陣列（旋轉 4 個數、位移 8 個、RGBA 16 個）。數值不變的平坦區段無法保存形狀，面板會優先以有變化的選取區段顯示。
10. 網格變形：拖曳時以起點與目前指標的世界座標差，對每個選取頂點的每個骨骼權重項乘上該骨骼世界矩陣的反矩陣，累加到變形陣列；因權重總和為 1，頂點的世界位移恰為拖曳量。預覽寫入執行環境插槽的 `deform`，放開時以裁去前後 0 值的 `offset` + `vertices` 寫成關鍵影格。變形曲線以 0 到 1 的進度換算。
11. 繪製順序：以設置順序在目標順序中的最長遞增子序列判定不需移動的插槽，其餘輸出 `{ slot, offset }`，與 Spine 讀取演算法互為反運算。
12. 匯出時建立獨立的 `OffscreenSpineRenderer`（自有 WebGL 環境與貼圖），以同一份 `AssetSource` 重建骨架並套用相同皮膚與覆寫；截圖以 `transferPose` 精確複製目前姿勢（含混合與多軌），序列與 WebM 以 `seek` 逐格取樣。

#### 關鍵設計

- `SpineInstance` 只依賴 `@esotericsoftware/spine-core`，可在 Node 測試環境以假貼圖完整驗證播放、混合、事件與覆寫邏輯。
- 時間軸定位透過重設 `trackTime`、`animationLast` 與 `trackLast`，確保拖曳時不重複觸發事件；單影格前進則會觸發跨越的事件，方便對齊音效與判定。
- 暫停時仍以 `update(0)` 推進 `animationLast`，避免重複套用同一段事件區間。
- 插槽覆寫於 `AnimationState.apply` 之後套用，因此可覆蓋部件時間軸（例如 death 動作中途卸下頭盔）。
- 多皮膚組裝以臨時 `Skin` 依序 `addSkin`，未涵蓋的插槽由執行環境回退至 default 皮膚。
- 編輯文件採寫入時複製，未修改的分支與原文件共用；物件鍵的刪除與還原會回到原本位置，因此任意編輯後全部復原，文件與載入時完全相同（鍵順序與數值一致；原檔的空白縮排與數字寫法如 `1.0` 會依 JSON 標準格式輸出）。
- 控制器以 `ControllerEnvironment` 注入所有瀏覽器相依（rAF、貼圖、下載、MediaRecorder），因此控制器、store 與核心皆可在 Node 中測試。

---

### 目錄結構

```
spine-asset-inspector/
  csp.config.ts                 CSP 指令單一來源（meta 與預覽標頭共用）
  vite.config.ts                建置設定與 CSP 注入外掛
  vitest.config.ts              單元測試（core: node，dom: jsdom 兩個專案）
  playwright.config.ts          E2E 設定（建置後以 preview 伺服器執行）
  index.html
  scripts/
    run-rule.mjs                規則檢驗入口
    rules/comments.mjs          無註解規則（TypeScript 掃描器）
    rules/emoji.mjs             零 Emoji 規則（Unicode 屬性）
    rules/files.mjs             檔案走訪
  src/
    main.tsx  App.tsx  index.css
    core/
      types.ts
      assets/    virtualFile  fileClassifier  archive  atlasPages  bundleResolver  browserFiles
      spine/     SpineInstance  skeletonFactory  summarize  versionDetect  poseTransfer
      render/    camera  StageRenderer  debugOverlay  focusBounds  gizmoOverlay
      export/    exportPlan  placement  previewDrag  OffscreenSpineRenderer  exporters  webm  download
      atlas/     atlasModel  atlasSlicer  atlasArchive  regionOverride
      image/     pngEncode  pixelReader
      audit/     budgets  performanceAudit
      audio/     waveform  alignment
      legacy/    binaryInput  curves  spine36Binary
      gizmo/     types  affine  layout  drag  pick  runtimePose
      animation/ channels  keyOps  keyCommands  dopesheet  poseKeys  curveShape  drawOrder  meshDeform
      editor/    json  patch  history  session  document  commands  structureCommands  deleteCommands  serialize  projectArchive
      demo/      demoSkeleton  demoRegions  demoTexture  demoAsset
      playback/  timeMath
    controller/  InspectorController  types  browserEnvironment  audioBackend  ControllerContext
      features/  host  atlasFeature  audioFeature  auditFeature  editorFeature  gizmoFeature  animateFeature  meshFeature  exportPreviewFeature
    store/       inspectorStore  liveStore  defaults
    hooks/       useKeyboardShortcuts  useUnsavedGuard
    components/
      layout/    Workbench  TopBar  AdvancedDrawer  StatusBar  NoticeStack
      tree/      HierarchyPanel  treeModel
      properties/ PropertiesPanel  AdvancedEditors  sections
      dopesheet/ Dopesheet  CurveEditor  EventKeyEditor
      edit/      EditFields
      export/    ExportDialog  ExportSizeSection  ExportPreviewPanel  PreviewDragLayer  exportFields
      stage/     StageView  ViewportToolbar  StageHud  PlaybackBar  TimelineScrubber  WaveformCanvas  eventColor
      panels/    MixLabPanel  SlotInspectorPanel  DebugPanel  EventMonitorPanel  AudioPanel  AtlasPanel  AuditPanel  HistoryPanel
      ui/        Badge  Button  Panel  Slider  Toggle  Select  TextInput  Tabs  cx
  tests/
    unit/        Vitest 單元與元件測試
    e2e/         Playwright E2E 測試
    support/     假貼圖、假控制器環境（含假音訊與影像後端）、PNG 解碼、WAV 合成、示範檔案組、Spine 3.6 二進位寫入器
  docs/
    HANDOFF.md
```

---

### 檔案與程式碼規範

| 規範 | 內容 | 自動檢驗 |
| --- | --- | --- |
| 無註解 | `src`、`scripts`、`tests`、根目錄設定檔與 `index.html` 不得出現任何行註解、區塊註解、JSDoc、JSX 註解、CSS 註解、HTML 註解或 shebang | `npm run lint:comments`、`tests/unit/rules.test.ts` |
| 零 Emoji | 程式碼、測試、腳本、文件、README、`package.json`、`LICENSE` 不得出現任何 Emoji、旗幟、鍵帽、膚色修飾或變體選擇符 | `npm run lint:emoji`、`tests/unit/rules.test.ts` |
| 型別 | TypeScript `strict`、`noUnusedLocals`、`noUnusedParameters`、`noImplicitOverride` | `npm run typecheck` |
| 模組邊界 | `core` 不得引用 React、store 或 controller；元件不得直接操作 `SpineInstance`，一律經由控制器 | 程式審查 |
| 介面文字 | 純文字與技術標籤徽章，不使用 Emoji 或表情圖示，圖示僅使用 Lucide 線條圖示 | `lint:emoji` |
| 測試掛鉤 | 互動元素以 `data-testid` 標示，E2E 僅依賴 `data-testid` 與可存取性屬性 | E2E |
| 身分與授權 | `package.json` author 為 `zzoraemon043`，MIT 授權，提交者為 `zzoraemon043 <195147269+zzoraemon043@users.noreply.github.com>` | 程式審查 |

無註解規則以 TypeScript 編譯器 API 建立語法樹，逐一取得每個語彙單元前後的 comment trivia，因此字串、樣板字串、正規表示式與 JSX 文字中出現的 `//`、`/*` 不會誤判；CSS 會先遮蔽字串再搜尋。零 Emoji 規則以 `\p{Extended_Pictographic}`、`\p{Regional_Indicator}`、`U+FE0F`、`U+20E3`、膚色修飾與標籤序列字元比對，中文、框線字元與一般符號不受影響。

---

### 效能體檢基準

評級規則：數值小於等於「優良上限」為優良，小於等於「警告上限」為警告，超過為過重；整體評級取所有指標中最差者。基準定位為中階手機、60 FPS、單一角色同屏，定義於 `src/core/audit/budgets.ts`，可依專案調整。

| 指標 | 優良上限 | 警告上限 | 計算方式 |
| --- | --- | --- | --- |
| 骨骼數 | 60 | 100 | `SkeletonData.bones` |
| 插槽數 | 60 | 100 | `SkeletonData.slots` |
| 目前頂點數 | 800 | 1500 | 目前姿勢可見的 Region（4）與 Mesh 頂點 |
| 目前三角面 | 600 | 1200 | Region（2）與 Mesh 三角面 |
| 資產總頂點 | 3000 | 6000 | 所有皮膚所有不重複 Region / Mesh 頂點 |
| 網格部件 | 20 | 40 | MeshAttachment 數 |
| 權重影響數 | 2000 | 4000 | 加權網格的骨骼影響總數 |
| 裁切部件 | 0 | 2 | ClippingAttachment 數 |
| IK 限制器 | 8 | 16 | |
| Transform 限制器 | 8 | 16 | |
| Path 限制器 | 2 | 5 | |
| Physics 限制器 | 4 | 10 | |
| 圖集頁數 | 1 | 3 | |
| 預估 Draw Calls | 3 | 6 | 依繪製順序中貼圖或混合模式切換、裁切開始次數估算 |
| 動作數 | 40 | 80 | |

目前頂點、三角面與 Draw Calls 會在載入、切換皮膚、插槽覆寫與 Region 熱替換時自動重算；切換動作或停在特定影格後可按「量測目前姿勢」。

---

### 安全性與隱私

- 100% 本地運作：沒有任何後端、遙測、CDN 字型或外部腳本，資產、替換貼圖與音效只存在瀏覽器記憶體。
- 正式建置於 `<head>` 最前方注入 CSP meta，`npm run preview` 另外送出完整安全標頭。

| 指令 | 值 | 目的 |
| --- | --- | --- |
| `default-src` | `'none'` | 預設全部拒絕 |
| `script-src` | `'self'` | 僅允許同源打包腳本，禁止 inline 與 eval |
| `style-src` | `'self'` | 僅允許同源樣式表 |
| `img-src` | `'self' blob: data:` | 貼圖解碼與 favicon |
| `media-src` | `'self' blob:` | 本機 blob 影音來源 |
| `font-src` | `'self'` | 僅本機字型 |
| `connect-src` | `'none'` | 阻斷 fetch、XHR、WebSocket 等所有網路連線 |
| `worker-src` / `frame-src` / `child-src` / `object-src` / `manifest-src` | `'none'` | 不載入額外執行環境 |
| `base-uri` / `form-action` | `'none'` | 防止注入改寫 |
| `frame-ancestors`（僅標頭） | `'none'` | 禁止被嵌入 |

其他標頭：`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Cross-Origin-Opener-Policy: same-origin`、`Permissions-Policy` 關閉相機、麥克風、定位、付款與 USB。部署到其他主機時，請將 `csp.config.ts` 的 `CSP_HEADER` 設定為 HTTP 回應標頭。

E2E 測試會驗證：CSP 標頭與 meta 內容、對外 `fetch` 被阻擋且觸發 `securitypolicyviolation`、正常操作過程中沒有任何 CSP 違規與主控台錯誤。

---

### 測試

#### 自動化檢查一覽

| 類別 | 工具 | 內容 |
| --- | --- | --- |
| 型別檢查 | `tsc --noEmit` | 全部原始碼、測試與設定檔 |
| 規則檢驗 | `scripts/run-rule.mjs` | 無註解、零 Emoji，失敗時列出檔案與行號 |
| 單元測試（core 專案，Node） | Vitest | 檔案分類、ZIP 展開與上限、資產配對、版本偵測、示範資產、SpineInstance（皮膚、播放、定位、單影格、混合、多軌、插槽覆寫、邊界）、姿勢轉移、匯出規劃、相機與時間數學、摘要、骨架建構錯誤、store、控制器全流程；圖集切割（四種旋轉的座標映射、與 Spine 執行環境 UV 慣例比對、無損還原、留白還原、越界、檔名）、PNG 編碼（CRC、往返）、碎圖 ZIP、Region 熱替換與還原；效能指標（基準分級、靜態與姿勢指標、Draw Call 估算、報告）、音訊（混音、峰值、起音點、對齊、偏移建議）；atlas / audio / audit 控制器功能；Spine 3.6 升級（libgdx 相容的變長整數與字串、曲線轉換、旋轉展開、以合成 3.6 二進位驗證全部設定資料、部件與時間軸類型、升級後 4.2 執行環境的旋轉跨 180 度與事件行為、不支援版本的錯誤訊息、本機參考資產存在時另做逐位元組完整解析與全部動作播放）；編輯核心（修補運算與反向運算、鍵順序保留、寫入時複製、歷史合併 / 上限 / 已儲存標記、工作階段復原 / 重做 / 跳轉、每個編輯指令與其引用更新、輸入驗證、任意指令鏈完整還原為原始位元組）、無損序列化（示範 JSON 載入後輸出逐位元組相同、重新解析後執行環境資料等價、3.6 升級文件往返、編輯後解析結果與復原後還原）、編輯控制器（重建後保留播放 / 皮膚 / 多軌 / 插槽覆寫 / Region 替換、改名後選取跟隨、儲存 JSON 與專案 ZIP、匯出改用編輯後骨架）；控制軸（仿射換算、版面隨縮放維持螢幕尺寸、每個把手的命中、父空間位移、旋轉跨 180 度累積與鏡像父骨骼反向、單軸與等比縮放、吸附、最小縮放、骨骼點選優先序）、設置模式（停止動畫、維持設置姿勢、播放或切換動畫自動離開、唯讀資產拒絕）、以真實骨架拖曳後子骨骼跟隨與單筆歷史、取消不留紀錄、點選展開階層樹；關鍵影格（通道解析與預設值省略、未修改關鍵影格原樣輸出、插入 / 取代 / 移動撞格 / 刪除與貝茲曲線換算、平坦區段、文件指令建立新通道與新骨骼項、刪光後移除空通道、移動夾在 0 秒、跨動畫貼上、律動表列與影格範圍、K 幀後以 4.2 執行環境重播得到相同姿勢）、曲線（正規化與絕對座標互換、平坦區段、取樣、預設、緩入曲線讓中段旋轉落後線性、步進與線性回寫）、插槽與事件通道（顏色解析與輸出、雙色、部件 / 隱藏、執行環境重播部件切換與透明度、同時間多個事件保留、事件參數修改與移動刪除、跨動畫貼上、事件實際觸發）、律動表事件與插槽列與區段類型、繪製順序位移（50 組隨機排列往返、最少位移、執行環境重播）、網格變形（加權網格僅選取頂點移動指定世界距離、裁切與展開、執行環境重播、進度曲線與移動）、IK / 變換限制器關鍵影格與執行環境權重、新增動畫與皮膚、皮膚改名的引用更新、部件綁定與移除、限制器設置值驗證；控制器的 IK 目標拖曳時骨骼鏈即時解算、限制器 K 幀、繪製順序往後與還原、網格頂點選取拖曳與重設、新增動畫後 K 幀、皮膚改名時套用中的皮膚跟隨、動畫模式控制器（進出與設置模式互斥、多軌恢復、自動 K 幀單筆歷史與復原、關閉自動 K 幀的暫存與 K 寫入、換影格與播放捨棄暫存、全部骨骼 K 幀、選取多選切換、移動 / 複製 / 貼上 / 刪除與復原後選取修剪）；規則檢驗器本身與全專案掃描 |
| 元件測試（dom 專案，jsdom） | Vitest + Testing Library | 階層樹（選取、展開、搜尋、皮膚勾選、動畫切換）、屬性面板、匯出對話框（設定與執行、預覽輔助線與超出畫布警告、影格滑桿、裁剪框單邊拖曳與平移、框外遮罩、裁剪欄位與重設）、插槽、事件、除錯、混合實驗室、圖集、體檢、音訊面板；屬性面板編輯欄位（Enter 套用、Esc 取消、無效值還原、重複名稱提示）、歷史頁籤跳轉、頂列復原 / 重做 / 儲存、Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+S、未儲存時的離開提醒；設置模式工具列（模式、吸附、唯讀停用）、S / W / E / R / Esc 快捷鍵、拖曳中畫面提示與屬性面板即時數值；律動表（列與通道、收合、點選 / Ctrl 切換 / Shift 加選 / 骨骼總覽選取、拖曳移動、框選、點空白跳格、刻度拖曳、工具列 K 幀 / 複製 / 貼上 / 刪除 / 自動 K 幀、暫存提示）、動畫模式工具列與畫面提示、目前影格姿勢欄位、K / Shift+K / Delete / Ctrl+C / Ctrl+V / A 快捷鍵；曲線面板（無可編輯區段提示、類型切換、預設套用到多段、控制桿拖曳與夾限、放開才寫入歷史）、事件新增與參數編輯、插槽部件 / 顏色 / 透明度 / 整組 K 幀與插槽列收合；新增空白動畫與皮膚、皮膚綁定 / 改名 / 移除部件、限制器樹節點與設置值 / 滑桿 K 幀、繪製順序前後移動與還原、網格頂點全選 / 取消 / 重設變形 |
| E2E（正式建置 + 預覽伺服器） | Playwright + Chromium | 啟動與渲染、CSP 阻擋網路、無 CSP 違規、動作切換與事件標記、暫停與逐格、時間軸拖曳、速率與循環與快捷鍵、縮放平移、A 至 B 過渡與混合進度、混合配對、多軌疊加、皮膚組裝、插槽隱藏與指定、除錯線框、事件紀錄與篩選與生命週期、檔案選取載入、ZIP 拖放載入、缺件錯誤、匯出對話框：透明 PNG（解碼驗證 Alpha）、指定寬高與起訖影格與純色背景的 PNG 序列（逐格尺寸與背景色）、Sprite Sheet（大圖尺寸與 JSON 座標）、WebM（EBML 標頭）、從動畫屬性開啟匯出、匯出預覽畫布有實際像素並可切換影格與底部對齊與純色背景、偏移套用到實際匯出 PNG、以滑鼠拖曳裁剪框單邊時只有該邊移動、角色大小不變、匯出 PNG 尺寸等於裁剪範圍 x 縮放倍率；階層樹選取骨骼與插槽並於屬性面板隱藏部件、圖集 ZIP 與示範貼圖逐像素比對、本機載入 Alpha 1 至 255 漸層頁面的逐像素無損比對、單張 Region 下載、Region 熱替換改變舞台與 Draw Calls 並可還原、拖入 PNG 熱替換選取 Region、效能體檢數值與隨皮膚變化、音效載入與波形與起音點、事件對齊狀態與偏移、事件觸發計數、同步試聽與暫停停止、拖入音效不取代資產、合成 3.6 二進位載入與升級徽章、本機 3.6 參考角色存在時載入渲染並觸發事件；編輯骨骼旋轉後畫面改變、復原後畫面與原始逐像素相同、重做後與編輯後相同、動畫改名與 Ctrl+Z / Ctrl+Shift+Z、重複名稱拒絕、儲存 JSON 下載內容、Ctrl+S 與專案 ZIP 內容、歷史頁籤跳轉、3.6 升級資產編輯後存成 4.2 JSON、本機 3.6 參考角色存成 4.2 JSON 後再載入；設置模式以滑鼠實際拖曳位移控制軸（拖曳中面板數值即時改變且尚未產生歷史、放開後一筆「移動骨骼」、復原後畫面與拖曳前逐像素相同）、旋轉父骨骼後子骨骼繞原點跟隨、單軸縮放加吸附、畫面點選骨骼、Esc 取消拖曳、面板改數值後畫面與控制軸即時更新、按播放離開設置模式；動畫模式以滑鼠旋轉控制軸自動 K 幀（菱形出現、復原後畫面逐像素回到原狀）、滑鼠拖曳關鍵影格到新影格並 Ctrl+Z 還原、框選後 Ctrl+C / Ctrl+V 到其他影格再 Delete、關閉自動 K 幀的暫存提示與 K 寫入三個通道後儲存 JSON 驗證數值；套用緩入預設後畫面改變、滑鼠拖曳控制桿、兩次復原後畫面逐像素回到線性、切換步進；插槽部件隱藏的關鍵影格與復原、透明度與顏色關鍵影格；新增事件並編輯參數後儲存 JSON 驗證、拖曳事件 4 格再刪除；拖曳 IK 目標後手肘位置改變、IK 權重滑桿 K 幀、繪製順序往後 8 層後復原畫面逐像素相同、滑鼠拖曳網格頂點寫入變形且未選頂點不動、新增空白動畫與皮膚並綁定部件；選取骨骼按 Delete 後子骨骼一併消失、Ctrl+Z 後畫面逐像素回到原狀、根骨骼拒絕刪除 |

#### 執行

```bash
npm run verify
```

或分開執行：

```bash
npm run typecheck
npm run lint:rules
npm run test
npm run test:coverage
npm run test:e2e
```

E2E 預設使用 `/opt/pw-browsers` 內的 Chromium，可用 `PW_CHROMIUM_PATH` 指定其他執行檔，或執行 `npx playwright install chromium` 安裝；`E2E_SKIP_BUILD=1` 可跳過自動建置，`E2E_PORT` 可指定預覽連接埠。無 GPU 的環境以 SwiftShader 軟體渲染執行 WebGL。

---

### 已知限制

- 執行環境為 Spine 4.2。3.6 二進位會自動升級；3.x JSON 與 3.7 / 3.8 二進位尚未支援；4.0 / 4.1 / 4.3 會顯示版本警告，解析可能失敗。
- 3.6 自動升級後的畫面以 4.2 執行環境計算，少數 3.x 與 4.x 執行環境本身的差異（例如縮放繼承模式的細部算法）可能與舊版遊戲端略有不同，請與原編輯器畫面比對。
- 單影格截圖精確複製目前姿勢；PNG 序列與 WebM 只取樣 Track 0 指定動作（含目前皮膚與插槽覆寫），不包含多軌疊加與混合過渡。
- WebM 以 `MediaRecorder` 依實際時間錄製，透明通道取決於瀏覽器的 VP9 / VP8 編碼器，Chromium 系列支援最完整；Firefox 與 Safari 可能輸出不含 Alpha 的影片或不支援。
- 單一匯出每格最長邊 4096 像素、最多 600 影格；Sprite Sheet 整張大圖不超過 4096x4096。
- 動畫編輯第 1 至 5 階段已全部完成。仍未支援：斜切關鍵影格的建立、雙色（暗色）的編輯介面、Path 與 Physics 限制器的編輯與關鍵影格、Sequence 關鍵影格、設置姿勢的繪製順序調整（只能以動畫關鍵影格改變順序）、網格頂點框選、新增骨骼、插槽與部件（刪除已支援，見上方 Delete 說明）。
- 限制器的 `order` 由原檔決定；從零手寫且多個限制器都沒有 `order` 的 JSON，4.2 執行環境只會啟用其中一個（這是執行環境的排序規則）。
- 一段 Spine 貝茲曲線只有兩個控制點，無法做出多次彈跳；「回彈」預設為超出終點後回到終點的單次回彈，需要多次彈跳請以多個關鍵影格組成。
- 曲線改回線性或重新寫入的關鍵影格會省略與預設值相同的欄位（例如 `time: 0`、`value: 0`），內容等價但與原檔寫法不同；未修改的關鍵影格保持原樣。
- 動畫模式會暫時停用多軌疊加（離開時恢復），律動表只顯示 Track 0 目前的動畫。
- 律動表固定每格 16 像素，尚無縮放；拖曳關鍵影格以整數影格為單位。
- 控制軸不提供斜切（Shear）與長度拖曳，請在屬性面板輸入；旋轉以「拖曳角度差」換算，父骨骼含斜切或非等比縮放時，畫面角度與數值可能有些微差距，放開後以實際數值為準。
- 一次只能操作一根骨骼，尚無多選與框選。
- Spine 4.x 二進位 `.skel` 目前僅供檢視與匯出，不能編輯（需要保留原始貝茲控制點的 4.2 二進位讀取器，排在後續）；請由 Spine 編輯器匯出 JSON 後再開啟編輯。
- 編輯結果一律存成 Spine 4.2 JSON；3.6 舊檔升級後無法回存 3.6 格式。專案 ZIP 內的圖集與貼圖為原始載入內容，Region 熱替換不會寫入。
- 編輯歷史只保存在目前分頁，重新整理或載入其他資產會清除；請在離開前儲存 JSON。
- 事件紀錄保留最新 1000 筆，畫面列出最新 300 筆。
- Region 熱替換以整張替換圖填滿原 Region 的原始尺寸（不保留原本的裁切偏移），只在本次工作階段有效；使用 Sequence 的部件不在替換範圍內。
- 圖集拆解目前支援 0 / 90 / 180 / 270 度旋轉與 `offsets` 留白；`split` / `pad` 九宮格資訊不另外輸出。
- 起音點偵測為能量比較法，適合打擊、腳步等短促音效；長音或背景音樂的對齊結果僅供參考。
- 同步試聽與事件觸發音效依實際時間排程，暫停、單影格與拖曳時間軸時會停止同步音軌。
- 物理約束（Physics Constraint）在定位與單影格時以 reset 模式重新計算，連續播放時才會累積物理狀態。

---

### 授權

MIT License，Copyright (c) 2026 zzoraemon043。詳見 [LICENSE](LICENSE)。

Spine Runtimes 依 Esoteric Software 的 Spine Runtimes License 散布；在產品中使用 Spine Runtimes 需持有有效的 Spine 編輯器授權。本專案僅透過 npm 相依引用官方執行環境，不包含任何 Esoteric Software 的範例美術資產；3.6 二進位升級器依官方公開的 3.6 檔案格式實作。儲存庫不包含任何第三方角色資產；以真實資產驗收時請放在本機，不要提交。
