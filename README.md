# Monad Game Engine

Multiplayer 3D game engine with AI agent, WebGPU rendering, and Monad blockchain integration.

Built with Three.js + Colyseus + Express. Ships with Privy auth, PostgreSQL persistence, and Docker deployment.

---

## Features

- **WebGPU Rendering** — Three.js with TSL cel-shaded toon materials, 3-tier adaptive quality
- **Real-Time Multiplayer** — Colyseus WebSocket rooms with server-authoritative state
- **AI Agent System** — Optional AI game master that builds arenas and runs games (OpenClaw + Claude)
- **Multi-Arena** — Built-in multi-tenancy: any AI agent can create and host its own arena via HTTP API
- **Privy Auth** — Twitter login + embedded wallets, with guest mode fallback
- **Monad Blockchain** — Wallet integration for Monad network
- **Mobile Support** — Virtual joystick + touch camera, auto-detected
- **Docker Deployment** — nginx + SSL + WebSocket/SSE proxy + PostgreSQL

## Tech Stack

| Component | Technology |
|-----------|------------|
| 3D Rendering | Three.js + WebGPU (TSL cel-shaded toon style) |
| Multiplayer | Colyseus (WebSocket) |
| Server | Express + Node.js |
| AI Agent | OpenClaw + Claude (optional) |
| Auth | Privy (Twitter + embedded wallets) |
| Blockchain | Monad |
| Database | PostgreSQL (with in-memory fallback) |
| Build | Vite |
| Deployment | Docker + nginx + Let's Encrypt |

## Quick Start

```bash
git clone <your-repo-url>
cd monad-game-engine
npm install
npm run dev
```

Opens game client at `localhost:5173`, game server at `localhost:3000`.

No PostgreSQL or auth credentials required for local dev — the server falls back to in-memory storage and guest-only mode.

## Architecture

```
Browser Client (Three.js + Colyseus)
    |
    | nginx (SSL + WebSocket + SSE)
    |
Game Server (Express + Colyseus, port 3000)
    |           |            |            |
    | HTTP API  | PostgreSQL | SSE Stream | ArenaManager (multi-tenant)
    |           |            |            |
    +-- Default Arena (AI agent optional)
    +-- External Arena N (any AI agent -> HTTP API)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full system architecture.

## Project Structure

```
src/
  server/           Game server (~40 JS files)
    index.js        Bootstrap + Colyseus setup
    WorldState.js   Facade over 8 sub-managers
    GameRoom.js     WebSocket handlers
    MiniGame.js     Game base class + trick system
    AgentLoop.js    Agent scheduling (optional)
    managers/       8 focused state managers
    routes/         6 route files (world, game, agent, public, arena, auth)
    services/       gameService, arenaService
    games/          Game type implementations (reach goal example included)
  client/           Three.js client (~48 JS/JSX files)
    main.js         Orchestrator — wires all modules
    entities/       EntityFactory, EntityManager, EntityBehaviors, InstancedBatchManager
    physics/        PhysicsEngine (AABB), SpatialHash (O(1) lookups)
    network/        NetworkManager, MessageHandlers, HttpApi
    rendering/      RemotePlayers (interpolation)
    ui/             UI modules (HUD, chat, lobby, profile, menu)
    audio/          SoundManager (procedural tones)
    vfx/            ScreenEffects (shake, flash), ParticleUtils (WebGPU)
  shared/           constants.js (entity types, game types, spells)
```

## How to Customize

### Add a new game type

1. Create `src/server/games/MyGame.js` extending `MiniGame`
2. Add the type to `src/shared/constants.js` → `GAME_TYPES`
3. Register it in `src/server/games/index.js` → `createGameSync()`
4. Add an arena template in `src/server/ArenaTemplates.js`

### Add new entities

Use the World API to spawn entities:

```bash
curl -X POST http://localhost:3000/api/world/spawn \
  -H "Content-Type: application/json" \
  -d '{"type": "platform", "position": [0, 5, 0], "scale": [10, 0.5, 10]}'
```

### Set up authentication

See **[docs/PRIVY_AUTH_GUIDE.md](docs/PRIVY_AUTH_GUIDE.md)** for Privy setup.

### Production deployment

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for the full deployment guide.

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agent/context` | Full game state for agent decisions |
| `POST /api/game/start` | Start mini-game (with optional `template` param) |
| `POST /api/game/end` | End current game |
| `POST /api/world/spawn` | Spawn an entity |
| `POST /api/world/compose` | Compose entities (prefabs or custom recipes) |
| `POST /api/spell/cast` | Cast spell (playing phase only) |
| `POST /api/chat/send` | Send chat message |
| `POST /api/announce` | Global announcement |
| `POST /api/arenas` | Create a new arena (returns arenaId + apiKey) |
| `GET /api/arenas` | List all arenas |
| `GET /api/stream/events` | SSE feed for external integrations |

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server + game server (hot-reload)
npm start            # Production server (serves dist/)
npm run build        # Build client for production
```

## Debug & Testing

- **Debug panel**: `http://localhost:5173/?debug=true`
- **Spectator mode**: `http://localhost:5173/?spectator=true`
- **Agent status**: `curl localhost:3000/api/agent/status`
- **World state**: `curl localhost:3000/api/world`

## License

MIT
