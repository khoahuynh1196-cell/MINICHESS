# Godot ↔ game-core execution bridge (nodejs-mobile) design

**Status:** User-delegated design ("chọn nodejs-mobile, làm spec chi tiết trước") — 2026-08-07, not yet implemented.
**Scope:** How a shipped offline Android build actually executes `game-core`'s TypeScript domain logic from Godot/GDScript, with no server visible to the player and no network dependency.

## Problem this closes

`client-godot/scripts/adventure/adventure_runtime_port.gd`'s `submit(request)` only emits a `request_submitted(request)` signal; something external must eventually call `accept_response(response)` with the domain's answer. Every test built in Missions 1, 6, and 7 supplies that answer directly from GDScript, which is correct for testing the *protocol* but is not itself a bridge — nothing in this repository currently executes `game-core` on a device. This spec defines that missing piece.

Non-goals: this spec does not touch gameplay rules, combat, or any Godot screen. It only defines how one JSON-shaped `AdventureRuntimeRequest` gets from Godot to `game-core`'s `handleAdventureRuntimeRequest()` and one `AdventureRuntimeResponse` gets back, entirely on-device.

## Why nodejs-mobile over the alternatives

| Option | Reuses `game-core` unchanged | New engineering surface | Ongoing drift risk |
|---|---|---|---|
| Port `game-core` to GDScript | No — full rewrite | Very large (~5,000 lines) | High — two implementations to keep in sync forever |
| Embed QuickJS/V8 via GDExtension | Yes (as compiled JS) | Large — native C++/Rust glue, per-ABI native build | Low, but build/maintenance cost is high |
| **nodejs-mobile (embedded Node process)** | **Yes, verbatim** | **Medium — one Android plugin + one entry script** | **Low** |
| WASM (JS-in-WASM) | Yes, indirectly | Similar to GDExtension plus a JS-in-WASM interpreter | Low, more moving parts |

`nodejs-mobile` is the only option that runs `game-core`'s existing, already-tested `dist/` output (`pnpm run build`'s output — the same code Vitest already exercises) with no source transformation and no new language toolchain. The Node process runs **inside the app's own process/sandbox on the same device** — it is never reachable over the network and starts automatically with the app, so it satisfies CONTEXT.md's actual constraint ("without requiring a user-visible server setup" — Mission 11), even though it is technically still a separate process communicating over a local channel.

## Architecture overview

```
┌─────────────────────────── Android app process ───────────────────────────┐
│                                                                             │
│  ┌───────────────── Godot (GDScript) ─────────────────┐                   │
│  │ AdventureRuntimePort.submit(request)                │                   │
│  │        │ request_submitted(request)                 │                   │
│  │        ▼                                             │                   │
│  │ AdventureBridge (new, thin GDScript singleton)       │                   │
│  └────────────────────┬─────────────────────────────────┘                   │
│                        │ GodotBridgePlugin.send(json_string)  (JNI call)     │
│                        ▼                                                    │
│  ┌───────────── AdventureBridgePlugin.java (GodotPlugin) ─────┐             │
│  │  - starts the embedded Node runtime once, at app startup    │            │
│  │  - forwards outgoing JSON strings to the Node channel        │            │
│  │  - receives incoming JSON strings from the Node channel      │            │
│  │  - emits a Godot signal with the response                    │            │
│  └────────────────────┬───────────────────────────────────────┘             │
│                        │ nodejs-mobile channel (native message passing,      │
│                        │ NOT a socket/HTTP listener)                         │
│                        ▼                                                    │
│  ┌───────── Embedded Node.js process (nodejs-mobile runtime) ─────┐         │
│  │  tools/mobile-bridge/entry.mjs                                  │        │
│  │   - one long-lived AdventureSession                             │        │
│  │   - AdventureStateStore backed by app-private storage (fs)      │        │
│  │   - on each incoming message: JSON.parse -> handleAdventure-    │        │
│  │     RuntimeRequest(session, request) -> JSON.stringify -> send  │        │
│  │   - imports game-core's compiled dist/ output directly           │        │
│  └──────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

No component here is reachable from outside the app's own process. There is no HTTP listener, no open port, no server the player could see or configure.

## Components

### 1. `tools/mobile-bridge/entry.mjs` (new, game-core repo)

A small Node entry script, analogous to `tools/run-adventure-domain-smoke.mjs` but message-driven instead of scripted:

- Compiles/loads `rules/production-0.1.0/ruleset.json`, the active `content/*/bundle.json`, and `releases/*/release.json` the same way the domain smoke tool already does.
- Owns exactly one `AdventureStateStore` implementation backed by `node:fs`, writing to the path nodejs-mobile exposes for app-private storage (typically passed in as an environment variable or argv at process start — the exact mechanism must be confirmed against the current nodejs-mobile Android API, see "Risks" below).
- Owns exactly one `AdventureSession` for the process lifetime (created on first request, or restored via `session.restore()` if a save exists).
- Registers a message handler on the nodejs-mobile channel; on each message:
  1. `JSON.parse` the incoming string into a request envelope `{ requestId, payload }` (a request id is needed because the channel is a single message stream, not a Request/Response HTTP call — responses must be correlated to requests).
  2. Call `handleAdventureRuntimeRequest(session, payload)` (already built — Mission 1/4).
  3. On success, send back `{ requestId, ok: true, response }`; on a thrown domain error, send back `{ requestId, ok: false, error: { message } }` rather than crashing the process. A crashed embedded Node process must not crash the whole app — wrap the handler in try/catch unconditionally.
- Never imports anything from `client-godot/`; never knows GDScript exists. Its only contract is the message envelope above.

### 2. `AdventureBridgePlugin.java` (new, Android-only, Godot plugin)

Built as a Godot 4 [`GodotPlugin`](https://docs.godotengine.org/en/stable/tutorials/platform/android/android_plugin.html) inside Godot's "Custom Build" Android export (Godot's default export does not allow adding native plugins — the project must switch to the custom Gradle build template, which is a one-time, low-risk export-settings change already documented by Godot itself).

Responsibilities, and *only* these:
- On plugin load (app start), start the embedded Node runtime with `tools/mobile-bridge/entry.mjs` (bundled as an Android asset) as the entry point, passing the app's private-files directory path so the entry script can open its save file.
- Expose one method callable from GDScript, e.g. `send_request(json_string: String)`, which forwards the string to the Node channel with a generated `requestId`.
- Listen for messages from the Node channel; on each, call `emitSignal("response_received", json_string)`.
- No JSON parsing, no game logic, no retry logic beyond what "deliver this string, receive that string" requires. This class must stay small and dumb by design — it is transport only.

### 3. `client-godot/scripts/adventure/adventure_bridge.gd` (new)

A thin GDScript adapter that is the *only* new piece of GDScript this spec requires:

- On `_ready()`, gets the native plugin singleton (`Engine.get_singleton("AdventureBridgePlugin")`) and connects to its `response_received` signal.
- Exposes `submit(request: Dictionary) -> void`, which JSON-encodes the request, tags it with a generated `requestId`, and calls the plugin's `send_request`.
- On `response_received(json_string)`, decodes it, matches `requestId` against the pending request, and calls the attached `AdventureRuntimePort.accept_response(response)` (or emits a protocol error if `ok == false`).
- This is the piece that finally answers "who connects to `AdventureRuntimePort.request_submitted`" — it subscribes to that signal and calls `submit()`.

Everything above `adventure_bridge.gd` (the runtime port, controller, presenter, screens built in Missions 1, 6, 7) needs **zero changes** — this is exactly why those layers were built against a responder-agnostic `submit()`/`accept_response()` contract instead of an HTTP client.

### Storage ownership

The Node-side entry script owns the single `AdventureStateStore` (writing to app-private storage via `fs`), **not** Godot. This means:
- `client-godot/scripts/adventure/local_run_store.gd` (already built, currently exercised only by its own unit test) becomes unused for the *shipped* Android build once this bridge lands — it was a reasonable placeholder for a Godot-side store while no bridge existed, but the moment `game-core` can reach real on-device storage directly, the Node side should be the single writer to avoid two independent "is this save valid" implementations.
- This does not delete `local_run_store.gd` now — flagged as follow-up cleanup once the bridge is real and tested, per "do not delete before parity evidence exists."

## Message protocol

A minimal newline- or length-prefixed JSON envelope over the nodejs-mobile channel (the channel API itself is message-oriented, not stream-oriented, per nodejs-mobile's own design, so framing is likely unnecessary — confirm against current docs):

```json
// Godot -> Node
{ "requestId": "req-017", "payload": { "commandId": "...", "expectedRevision": 4, "type": "RESOLVE_COMBAT" } }

// Node -> Godot (success)
{ "requestId": "req-017", "ok": true, "response": { "revision": 5, "replayed": false, "view": { ... }, "playback": { ... } } }

// Node -> Godot (domain rejection, e.g. stale revision, invalid command)
{ "requestId": "req-017", "ok": false, "error": { "message": "ADVENTURE_REVISION_CONFLICT" } }
```

`payload` is exactly one `AdventureRuntimeRequest` as already defined in `game-core/src/adventure/protocol.ts` — no new request shape is introduced by this bridge.

## Build and packaging impact (must be validated, not assumed)

- Godot Android export must switch to the "Custom Build" template (`Project > Export > Android > Use Gradle Build`), which is a supported, documented Godot workflow but is a real change to the export pipeline that needs its own verification pass.
- nodejs-mobile ships prebuilt native libraries per Android ABI (`arm64-v8a`, `armeabi-v7a`, and historically `x86`/`x86_64` for emulators). The exported APK/AAB must include the same ABIs Godot's own export targets, or the app will crash on unsupported devices.
- Expect a meaningful APK size increase (nodejs-mobile's native runtime is tens of MB before compression) — this should be measured early, not discovered at the end.
- Expect Node startup latency (typically sub-second, but must be measured on real hardware, not assumed) on cold app launch; the app's boot screen should account for this rather than showing a blank/frozen UI.

## Lifecycle and error handling

- **App backgrounded mid-request:** Android may pause the app process; the embedded Node process's fate under Android's process lifecycle (frozen vs. killed) must be verified empirically, not assumed. If Android kills the process, `AdventureBridgePlugin` must detect a dead channel and restart Node, and `AdventureSession.restore()` on the Node side must recover the exact prior state (this is exactly what Mission 4's PLAYBACK-phase resume work already guarantees at the domain level — the bridge must not break that guarantee).
- **Node process crash:** `AdventureBridgePlugin` should detect channel failure and restart Node once, surfacing a clear, user-visible "could not continue your run" state rather than a silent hang if restart also fails.
- **Request timeout:** `adventure_bridge.gd` should time out a pending request after a bounded interval and surface `protocol_error`, rather than leaving a UI control permanently in a "waiting" state.
- **First-run migration:** if a save exists in a location Godot previously owned (e.g. an earlier build using `local_run_store.gd`), define whether it is migrated to Node-owned storage or discarded — do not silently lose a player's run.

## Testing strategy

- The message protocol (`entry.mjs`'s request/response envelope) is fully testable **without Android at all**: a Vitest test can pipe requests through the same handler function `entry.mjs` uses and assert responses match `AdventureRuntimeRequest`/`AdventureRuntimeResponse` shapes. This should be built and green before any Android integration work starts.
- `AdventureBridgePlugin` and the actual nodejs-mobile embedding can only be verified on a real Android emulator/device — this is explicitly an "Android emulator/physical-device evidence" item per CONTEXT.md §10, not something headless `pnpm run check`/Godot headless tests can cover. Do not claim this piece works from desktop testing alone.
- `adventure_bridge.gd`'s request/response correlation logic (requestId matching, timeout, decode-error handling) *can* be unit-tested headlessly by feeding it a fake plugin object, the same pattern every other Godot test in this codebase already uses.

## Risks / unknowns to verify before implementation starts

These are stated as open questions, not assumptions, because none of them have been verified against nodejs-mobile's current (2026) documentation or source as part of writing this spec:

1. Exact current API surface for starting the runtime and passing messages from a **Godot custom Android plugin** specifically (nodejs-mobile's most common documented integrations are React Native/Cordova/plain Android Studio apps, not Godot) — a Godot `GodotPlugin` should be able to use the same underlying Android AAR, but this needs a small proof-of-concept before committing to the full bridge.
2. Current maintenance status of nodejs-mobile (confirm it still builds against a supported NDK/Android API level compatible with Godot 4.7's own minimum SDK).
3. How app-private storage paths are actually passed into the embedded Node process (argv, env var, or a native call) — affects `entry.mjs`'s storage code.
4. Behavior under Android's process-death/restore lifecycle (see "Lifecycle" above) — needs empirical testing, not documentation-reading alone.
5. iOS is explicitly out of scope for this spec (nodejs-mobile also supports iOS, but this project's current target is Android only per CONTEXT.md/Mission 11; revisit if iOS is ever added).

## Phased implementation plan

1. **Proof of concept, no game logic:** a minimal Godot Android custom-build project with a `GodotPlugin` that starts nodejs-mobile running a "hello world" JS file and round-trips one string message. Resolves risk #1 and #2 before any further investment.
2. **`entry.mjs` + protocol tests:** build the Node-side message handler and its Vitest coverage (fully desktop-testable, no Android needed).
3. **Storage wiring:** `entry.mjs` owns `AdventureStateStore` against real app-private storage; verify save/restore across a real app kill (not just an in-process test).
4. **Full plugin + `adventure_bridge.gd`:** wire the real request/response path end to end; replace the test-double responders in a *new* on-device smoke pass (the existing headless Godot tests keep using test-double responders — they do not change).
5. **Lifecycle hardening:** crash/restart, timeout, backgrounding — each with explicit emulator/device evidence per CONTEXT.md §10.

This phased plan is intentionally not numbered as "Mission N" of the existing offline-foundation plan — it is orthogonal infrastructure work that can proceed independently of Missions 8-11, but Mission 11's Android vertical slice gate cannot be met until it lands.
