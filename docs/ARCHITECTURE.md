# Monad Game Engine — System Architecture

A multiplayer 3D game engine with AI agent integration, WebGPU rendering, and Monad blockchain support.
Tech stack: Three.js + Colyseus + Express + PostgreSQL.

---

## How a Game Session Works

A player opens the browser client and authenticates via Privy (or plays as guest). The client connects to the Express/Colyseus server over WebSocket and enters the **arena lobby**, where they pick an arena (or auto-join the default arena).

Once inside an arena, the player lands in the **lobby phase**. If an AI agent is configured, it detects the join and greets the player. The agent builds an arena by calling the API to spawn platforms, obstacles, and decorations.

After building (or after a 45-second auto-start timeout), a game starts with a template. The server atomically loads the arena layout and transitions to the **countdown phase**: "GET READY!" appears, players teleport to spawn positions, and a 3-2-1 countdown begins. Players can move freely during countdown but are invulnerable.

The **playing phase** starts. Players race, collect, survive, or compete depending on the game type. The AI agent (if configured) watches via its context endpoint, casting spells, spawning obstacles, and reacting to player behavior.

When the game ends (timer expires, someone wins, or agent calls `end_game`), the server broadcasts results, records scores to the leaderboard, and transitions back to lobby after a 15-second cooldown. The cycle repeats.

Players who join mid-game become spectators until the next round. AFK players get a warning after 120s and are kicked after 15s more.

---

## System Diagram

```
Browser Client (Three.js + Colyseus)
    |
    | nginx reverse proxy (SSL + WebSocket + SSE)
    |
Game Server (Express + Colyseus, port 3000)
    |           |            |            |
    | HTTP API  | PostgreSQL | SSE Stream | ArenaManager (multi-tenant)
    |           |            |            |
    +-- Default Arena (AI agent optional)
    +-- External Arena 1 (any AI agent -> HTTP API)
    +-- External Arena N ...
```

---

## Server Architecture

### Entry Point: `src/server/index.js`

Bootstraps Express with CORS, mounts Colyseus with `GameRoom`, initializes the database, loads arena configs, and starts the HTTP server. Route handlers are imported from `src/server/routes/` and mounted via `mountXxxRoutes(router, ctx)` functions. The shared `ctx` object carries references to `arenaManager`, `gameService`, `arenaService`, and the Colyseus server.

Arena middleware (`arenaMiddleware.js`) resolves `arenaId` from the URL path and attaches the correct `ArenaInstance` to `req.arena`. Write endpoints require API key auth via `X-Arena-API-Key` header (the default arena is exempt for backward compatibility).

### Multi-Arena Platform

| File | Purpose |
|------|---------|
| `ArenaManager.js` | Central registry — create, get, list, destroy arenas (max 20) |
| `ArenaInstance.js` | Per-arena state bundle: WorldState, MiniGame, SSE clients, webhooks, timers, AI players |
| `arenaMiddleware.js` | URL-based arena resolution + API key auth |

Each arena is fully isolated. Creating an arena via `POST /api/arenas` returns an `arenaId` and `apiKey`. Any AI agent can act as game master for its own arena using the HTTP API. Arena configs persist in the PostgreSQL `arenas` table.

### World State

`WorldState.js` is a facade that delegates to 8 focused sub-managers in `src/server/managers/`:

| Manager | Responsibility |
|---------|----------------|
| `EntityManager` | Entities Map, secondary indices (`_kinematicIds`, `_chasingIds`, `_groupIndex`), add/remove/modify/clear |
| `PlayerManager` | Players Map, join/leave, AFK detection, spectator activation, `activeHumanCount` |
| `GameStateMachine` | Phase lifecycle (lobby/countdown/playing/ended), timers, auto-start, game history |
| `EnvironmentManager` | Physics config, floor type, environment (sky/fog/lighting), hazard plane, respawn point |
| `SpellManager` | Cast/clear spells, cooldown enforcement, active effects |
| `ChatManager` | Messages array, announcements, events |
| `LeaderboardManager` | Score recording, top-N queries, DB sync |
| `ChallengeManager` | Challenge CRUD, progress tracking |

The facade re-exports all manager methods so consumers (routes, GameRoom, MiniGame) access a single `worldState` object.

### Game Engine

**`MiniGame.js`** — Base class for all game types. Handles the trick system (time/score/death triggers that fire mid-game), random obstacle spawning (sweepers, moving walls, pendulums, falling blocks), time randomization, and the end-game flow (result broadcast, leaderboard recording, delayed cleanup). Entities spawned during a game are tagged with `gameId` for automatic removal.

**`src/server/games/`** — Game type implementations. Ships with `ReachGoal.js` (race to a goal trigger) as an example. Add your own by extending `MiniGame`.

**`ArenaTemplates.js`** — Pre-built arena layouts. Each template defines entity positions, environment settings, floor type, and game type. Ships with 2 simple examples (`simple_arena`, `obstacle_course`).

### HTTP API Routes

Routes are split across files in `src/server/routes/`:

| File | Endpoints |
|------|-----------|
| `worldRoutes.js` | Entity CRUD, environment, floor, physics, compose, destroy-group |
| `gameRoutes.js` | Game start/end, chat, announce, leaderboard, spell, challenge |
| `agentRoutes.js` | Agent context, pause/resume, status |
| `publicRoutes.js` | Public state/leaderboard/events/stats, SSE stream, webhooks |
| `arenaRoutes.js` | Arena create/list/destroy |
| `authRoutes.js` | Auth verification, user profile |

Services (`src/server/services/`):
- `gameService.js` — game start/end logic, template application, auto-start scheduling
- `arenaService.js` — arena CRUD, arena callback coordination

### Agent System (Optional)

**`AgentLoop.js`** — Timer-based agent scheduler. Tracks player joins for welcome greetings, monitors @agent mentions for fast-track invocation, and auto-pauses when no humans are connected.

**`AgentBridge.js`** — Invokes the AI agent (OpenClaw CLI or custom). Constructs a prompt with game context: player positions, chat history, game state, and available templates.

The agent system is fully optional. The game runs without any AI agent — games auto-start on a timer.

### Real-Time Communication

**`GameRoom.js`** — Colyseus room handling WebSocket message types. Player movement sync, chat, game state broadcasts, entity updates. Detects mid-game joins and activates spectator mode. AFK heartbeat monitoring with configurable idle/kick timers. Messages are filtered by `arenaId` so arenas don't leak into each other.

**SSE Stream** — Server-Sent Events endpoint (`GET /api/stream/events`) for OBS overlays and external consumers. Broadcasts game events, chat messages, announcements, and agent actions.

---

## Client Architecture

### Entry Point: `src/client/main.js`

Orchestrator that initializes the Three.js scene, connects to Colyseus, and runs the game loop. The game loop runs at 60fps via `requestAnimationFrame`:

```
updatePhysics -> updateCamera -> updateParticles -> animateEntities ->
updateShaderTime -> interpolateRemotePlayers -> renderFrame
```

### Rendering Pipeline

| File | Purpose |
|------|---------|
| `ToonMaterials.js` | TSL NodeMaterial cel-shaded material factory with gradient maps and emissive tuning |
| `PostProcessing.js` | 3-tier adaptive quality (high/medium/low) with FPS-driven tier switching |
| `ProceduralTextures.js` | Runtime texture generation for various surface types |
| `SurfaceShaders.js` | TSL surface shaders for ice, conveyor, and wind surfaces |
| `EnvironmentEffects.js` | Skybox dome, fog, dynamic lighting, SpriteNodeMaterial ambient particles |
| `PlayerVisuals.js` | Player character model construction, squash-stretch animation |
| `CameraController.js` | Orbit camera for gameplay + spectator free-fly mode |
| `SceneSetup.js` | Scene initialization, WebGPURenderer setup, lighting |

### Entity System

| File | Purpose |
|------|---------|
| `entities/EntityFactory.js` | Geometry/glow cache — identical entities share geometry |
| `entities/EntityManager.js` | Entity lifecycle (add/update/remove), composed group assembly, clone-on-write materials |
| `entities/EntityBehaviors.js` | Kinematic, chasing, pendulum, orbiting entity behaviors |
| `entities/InstancedBatchManager.js` | InstancedMesh batching — groups identical geometries into single draw calls |
| `GeometryTemplates.js` | Named geometry templates (horn, tentacle, wing, dome, column, etc.) |

### Physics and Collision

| File | Purpose |
|------|---------|
| `physics/PhysicsEngine.js` | AABB collision detection, gravity, velocity integration, death/respawn logic, trigger activation, surface effects |
| `physics/SpatialHash.js` | 2D grid (XZ plane), cell size 8, 3x3 neighborhood queries — ~90% collision check reduction vs brute force |

### Input

| File | Purpose |
|------|---------|
| `input/InputManager.js` | Unified action map: keyboard events -> movement/jump/sprint actions |
| `input/MobileControls.js` | Virtual joystick (touch drag), touch camera (right-side drag), action buttons |

### Network

| File | Purpose |
|------|---------|
| `network/NetworkManager.js` | Colyseus connection management, exponential backoff reconnection |
| `network/handlers/` | Split message handlers: GameState, Entity, Player, Effect |
| `network/HttpApi.js` | REST polling: `fetchInitialState()`, `fetchLeaderboard()` |
| `ConnectionManager.js` | Colyseus connect/disconnect, intentional disconnect flag |

### UI Modules

| File | Purpose |
|------|---------|
| `ui/GameStatusHUD.js` | Game timer, score overlays |
| `ui/ChatSystem.js` | Chat input/display, @agent mentions |
| `ui/Announcements.js` | Global announcements |
| `ui/ArenaLobby.js` | Arena selection screen |
| `ui/ProfilePanel.js` | Player profile, wallet display |
| `ui/AfkOverlay.js` | AFK warning with kick countdown |
| `ui/SpectatorOverlay.js` | Spectator mode indicator |
| `ui/DebugPanel.js` | Runtime debug controls |
| `ui/AuthFlow.js` | Privy authentication integration |
| `ui/Leaderboard.js` | Top players display |
| `ui/GameMenu.js` | In-game menu (change arena, logout) |

### Audio and VFX

| File | Purpose |
|------|---------|
| `audio/SoundManager.js` | Procedural tone generation, countdown beeps, win fanfare |
| `vfx/ScreenEffects.js` | Camera shake, screen flash, vignette overlays, particle pool |
| `vfx/ParticleUtils.js` | TSL soft-circle node + SpriteNodeMaterial factory for WebGPU particles |

---

## Shared Code

`src/shared/constants.js` — Canonical definitions for `ENTITY_TYPES`, `GAME_TYPES`, `SPELL_TYPES`, `FLOOR_TYPES`, physics defaults, and timing constants. Imported by both server and client for consistency.

---

## Data Flow Diagrams

### Player Movement
```
Keyboard -> InputManager -> PhysicsEngine (local prediction) -> sendToServer()
-> GameRoom broadcast -> MessageHandlers -> RemotePlayers (interpolation)
```

### Agent Action
```
Agent tick -> AgentLoop (should invoke?) -> AgentBridge -> AI Agent
-> HTTP API (spawn/start_game/cast_spell/chat)
-> WorldState mutation -> GameRoom broadcast -> Client update
```

### Game Lifecycle
```
POST /api/game/start { template: "simple_arena" }
-> gameService.startGame() -> ArenaTemplates.load()
-> GameStateMachine: lobby -> countdown (3s, invulnerable)
-> MiniGame.start() -> playing phase (obstacles spawn, tricks fire)
-> Timer expires OR win condition -> MiniGame.end()
-> Results broadcast, leaderboard record -> ended phase (3s)
-> GameStateMachine: ended -> lobby (15s cooldown)
```

---

## Configuration and Deployment

### Docker Stack
```
docker-compose.yml:
  game:     Node.js server (Express + Colyseus, port 3000)
  db:       PostgreSQL 16 (leaderboard, arenas, game history)
  nginx:    SSL termination, WebSocket/SSE proxy
  certbot:  Let's Encrypt auto-renewal
```

### Environment
- **Local dev**: `npm run dev` — Vite dev server (5173) + game server (3000), no PostgreSQL needed (in-memory fallback)
- **Production**: Docker Compose with nginx SSL proxy

---

## Performance Optimizations

- **Geometry cache**: Identical entities share geometry instances
- **Material cache**: Non-animated materials cached; clone-on-write for per-entity mutations
- **Spatial hash**: O(1) collision lookups replacing O(n) brute force
- **Particle budget**: Quality-tier enforcement (ultra: 20, low: 5 max concurrent particle systems)
- **UI debouncing**: rAF dirty flag on HUD updates, leaderboard JSON caching
- **Adaptive quality**: PostProcessing monitors FPS and auto-switches between high/medium/low tiers
- **InstancedMesh batching**: Merges identical geometries into single draw calls
- **SpriteNodeMaterial particles**: WebGPU-native billboarded sprites via TSL
- **Console stripping**: Production builds strip all `console.*` calls via esbuild
