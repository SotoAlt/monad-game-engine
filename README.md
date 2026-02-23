<img width="2752" height="1536" alt="image" src="https://github.com/user-attachments/assets/87be77c6-1554-42e5-b16d-9eab5526a7b9" />
## Monad Game Engine

A multiplayer 3D game engine for building browser games with real-time multiplayer, WebGPU rendering, optional AI agent integration via OpenClaw, and Monad blockchain integration. Clone it, run `npm run dev`, and you have a working game in 30 seconds.

## What Is This?

Monad Game Engine is a full-stack multiplayer game platform. Players connect through the browser and compete in mini-games inside arenas. An optional AI agent (powered by OpenClaw) can act as a game master — managing rounds, chatting with players, casting spells, and responding to in-game events.

The engine ships with everything wired together: Three.js cel-shaded rendering, Colyseus WebSocket multiplayer, Privy wallet authentication, PostgreSQL persistence, and Docker deployment. No config is required for local dev — guest mode and in-memory storage work out of the box.

**Key idea**: any AI agent can connect to an arena via HTTP API and act as a game master, companion, or NPC. The engine is a multi-tenant platform, not a single game.

## Features

**Rendering**
- WebGPU with WebGL fallback via Three.js
- TSL NodeMaterial cel-shaded toon materials
- 3-tier adaptive quality (auto-switches based on FPS)
- Procedural textures, surface shaders (ice, conveyor, wind)
- SpriteNodeMaterial particles, environment effects (sky dome, fog, dynamic lighting)

**Multiplayer**
- Colyseus WebSocket rooms with server-authoritative state
- Player interpolation, spectator mode, AFK detection + kick
- Mid-game join as spectator, arena lobby for arena selection
- Mobile support: virtual joystick + touch camera

**Game System**
- 6 entity types: platform, ramp, collectible, obstacle, trigger, decoration
- Compose system for spawning entities (prefabs + custom recipes with disk cache)
- 5 spells with physics effects (gravity, speed, bounce)
- Trick system (mid-game events triggered by time/score/death)
- Random obstacle spawning (sweepers, moving walls, pendulums, falling blocks)

**AI Agent via OpenClaw** (optional)
- Connect any AI agent as a game master, companion, or NPC
- Agent loop with drama scoring and adaptive invoke frequency
- Greets players by name, reacts to @mentions, tracks audience chat
- Pause/resume kill switch, auto-pauses when no humans connected
- Context endpoint (`GET /api/agent/context`) gives full game state for agent decisions
- Works with OpenClaw CLI or any agent framework that can call HTTP

**Multi-Arena Platform**
- Create arenas via `POST /api/arenas` — each gets its own API key
- Each arena is fully isolated: separate state, game loop, agent
- Up to 20 concurrent arenas, stale cleanup after 24h
- Self-documenting API at `GET /skill.md` for agent integration

**Auth & Blockchain**
- Privy authentication: Twitter login + embedded wallets
- Guest mode with zero config (no Privy credentials needed)
- Monad blockchain integration via Viem

## Quick Start

```bash
git clone <your-repo-url>
cd monad-game-engine
npm install
npm run dev
```

Opens at `localhost:5173` (client) and `localhost:3000` (server). Click "Play as Guest" — no database, auth, or blockchain credentials needed.

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
    +-- External Arena 1 (any AI agent -> HTTP API)
    +-- External Arena N ...
```

**Server** — Express handles HTTP API (50+ endpoints across 7 route files). Colyseus manages WebSocket rooms filtered by `arenaId`. `WorldState` is a facade over 8 focused state managers (entities, players, game state, environment, spells, chat, leaderboard, challenges).

**Client** — Three.js with WebGPU renderer. Modular architecture: separate modules for entities, physics (AABB + spatial hash), input, networking, UI, audio, and VFX. Game loop runs at 60fps via `requestAnimationFrame`.

**Multi-Arena** — `ArenaManager` creates isolated `ArenaInstance` objects. Each arena has its own WorldState, game loop, SSE clients, and AI agent. Arena middleware resolves the correct arena from the URL path.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the complete system architecture with data flow diagrams.

## Project Structure

```
src/
  server/                       46 files, ~9,200 lines
    index.js                    Express + Colyseus bootstrap, game tick loop
    WorldState.js               Facade over 8 sub-managers
    GameRoom.js                 WebSocket message handlers, spectator, AFK
    MiniGame.js                 Game base class, tricks, obstacles, scoring
    AgentLoop.js                Agent scheduling, drama score (optional)
    AgentBridge.js              AI agent invocation bridge (optional)
    ArenaManager.js             Arena registry (max 20)
    ArenaInstance.js            Per-arena state bundle
    ArenaTemplates.js           Pre-built arena layouts
    Prefabs.js                  Entity presets (compose system)
    Composer.js                 Recipe validation + disk cache
    AIPlayer.js                 AI bot personalities (optional)
    managers/                   8 focused state managers
    routes/                     7 route files (world, game, agent, public, arena, auth)
    services/                   gameService, arenaService
    games/                      Game type implementations
  client/                       48 files, ~7,200 lines
    main.js                     Orchestrator — wires all modules
    ToonMaterials.js            TSL cel-shaded material factory
    PostProcessing.js           Adaptive quality, outline pass
    entities/                   EntityFactory, EntityManager, behaviors, instancing
    physics/                    PhysicsEngine (AABB), SpatialHash
    network/                    Colyseus connection, message handlers, REST polling
    rendering/                  Remote player interpolation
    ui/                         12 UI modules (HUD, chat, lobby, profile, menu, auth)
    audio/                      Procedural tone generation
    vfx/                        Screen effects, WebGPU particles
  shared/
    constants.js                Entity types, game types, spells, physics defaults
```

## Extending the Engine

### Add a Game Type

1. Create `src/server/games/MyGame.js`:

```javascript
import { MiniGame } from '../MiniGame.js';

export class CollectGame extends MiniGame {
  constructor(worldState, broadcastFn, config = {}) {
    super(worldState, broadcastFn, { ...config, type: 'collect' });
    this.collected = new Map();
  }

  start() {
    super.start();
    // Spawn 10 collectibles at random positions
    for (let i = 0; i < 10; i++) {
      this.spawnEntity('collectible',
        [(Math.random() - 0.5) * 40, 2, (Math.random() - 0.5) * 40],
        [1, 1, 1],
        { color: '#f1c40f' }
      );
    }
  }

  onTriggerActivated(playerId, entityId) {
    const count = (this.collected.get(playerId) || 0) + 1;
    this.collected.set(playerId, count);
    this.scores.set(playerId, count);
    this.worldState.destroyEntity(entityId);
    this.broadcast('entity_destroyed', { id: entityId });
  }

  checkWinCondition() {
    // Highest score at timeout wins (handled by base class timer)
    return null;
  }
}
```

2. Add to `src/shared/constants.js`:
```javascript
export const GAME_TYPES = {
  REACH: 'reach',
  COLLECT: 'collect',  // new
};
```

3. Register in `src/server/games/index.js`:
```javascript
import { CollectGame } from './CollectGame.js';
// In createGameSync():
case 'collect': return new CollectGame(worldState, broadcastFn, config);
```

4. Add an arena template in `src/server/ArenaTemplates.js` that uses `gameType: 'collect'`.

### Add Arena Templates

Templates define the layout, game type, and environment for an arena:

```javascript
// In src/server/ArenaTemplates.js
export const TEMPLATES = {
  my_arena: {
    name: 'My Custom Arena',
    gameType: 'reach',
    floorType: 'solid',           // 'solid' | 'none' | 'lava'
    respawnPoint: [0, 2, 0],
    environment: {
      skyColor: '#87CEEB',
      fogColor: '#87CEEB',
      ambientIntensity: 0.6,
      sunIntensity: 1.2,
    },
    entities: [
      { type: 'platform', position: [0, 1, 0], size: [20, 0.5, 20], properties: { color: '#3498db' } },
      { type: 'trigger', position: [0, 3, -15], size: [3, 3, 3], properties: { color: '#f1c40f', isGoal: true } },
    ],
  },
};
```

Register the template name in `src/server/constants.js` → `ALL_TEMPLATES`.

### Spawn Entities via API

```bash
# Spawn a platform
curl -X POST http://localhost:3000/api/world/spawn \
  -H "Content-Type: application/json" \
  -d '{"type": "platform", "position": [0, 5, 0], "scale": [10, 0.5, 10]}'

# Use the compose endpoint (supports prefabs + custom recipes)
curl -X POST http://localhost:3000/api/world/compose \
  -H "Content-Type: application/json" \
  -d '{"description": "bounce_pad", "position": [5, 0, 5]}'
```

| Entity Type | Purpose | Collision |
|-------------|---------|-----------|
| `platform` | Solid surface players stand on | Yes |
| `ramp` | Angled surface | Yes |
| `collectible` | Pickup items for scoring | Trigger |
| `obstacle` | Kills on contact | Yes (deadly) |
| `trigger` | Activates game events (goals, checkpoints) | Trigger |
| `decoration` | Visual only, no collision | No |

### Cast Spells

```bash
curl -X POST http://localhost:3000/api/spell/cast \
  -H "Content-Type: application/json" \
  -d '{"type": "low_gravity", "duration": 15000}'
```

Available: `low_gravity`, `high_gravity`, `speed_boost`, `slow_motion`, `bouncy`. 10-second cooldown between casts. Only works during the `playing` game phase.

## API Reference

All endpoints available at `/api/...` (default arena) and `/api/arenas/:arenaId/...` (specific arena).

### World

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/world/state` | — | Full world state |
| POST | `/world/spawn` | `type`, `position`, `scale?`, `properties?` | Spawn entity |
| POST | `/world/compose` | `description`, `position`, `type?`, `properties?` | Compose entity (prefab or recipe) |
| POST | `/world/modify` | `id`, `changes` | Modify entity |
| POST | `/world/destroy` | `id` | Destroy entity |
| POST | `/world/destroy-group` | `groupId` | Destroy entity group |
| POST | `/world/clear` | — | Clear all entities |
| POST | `/world/floor` | `type` | Set floor (solid/none/lava) |
| POST | `/world/environment` | environment config | Set sky, fog, lighting |
| POST | `/world/respawn` | `position` | Set respawn point |
| POST | `/world/template` | `name` | Load arena template |
| POST | `/world/hazard-plane` | config | Configure rising hazard |
| POST | `/physics/set` | `gravity`, `friction`, `bounce` | Set physics |

### Game

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/game/start` | `type?` or `template?` | Start mini-game |
| POST | `/game/end` | `winnerId?`, `result?` | End active game |
| GET | `/game/state` | — | Current game state |
| GET | `/game/types` | — | Available game types |
| POST | `/game/trick` | `trigger`, `action`, `params?` | Add mid-game trick |
| POST | `/spell/cast` | `type`, `duration?` | Cast spell (10s cooldown) |
| POST | `/chat/send` | `text` | Agent chat (3s rate limit) |
| POST | `/announce` | `text`, `duration?` | Announcement (5s rate limit) |
| GET | `/chat/messages` | `since?`, `limit?` | Chat history |
| GET | `/leaderboard` | — | Player rankings |

### Agent

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/agent/context` | — | Full state for agent decisions |
| GET | `/agent/status` | — | Agent loop status |
| POST | `/agent/pause` | — | Pause agent |
| POST | `/agent/resume` | — | Resume agent |
| POST | `/agent/heartbeat` | — | Notify agent of activity |

### Arena

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/api/arenas` | — | List all arenas |
| POST | `/api/arenas` | `name`, `description?` | Create arena (returns apiKey) |
| PATCH | `/api/arenas/:id` | `name?`, `config?` | Update arena (requires API key) |
| DELETE | `/api/arenas/:id` | — | Delete arena (requires API key) |

### Public & Agent-Player

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| GET | `/public/state` | — | Safe public state |
| GET | `/public/leaderboard` | — | Public leaderboard |
| GET | `/public/events` | `since?`, `limit?` | Event log |
| GET | `/stream/events` | — | SSE stream for OBS overlays |
| POST | `/agent-player/join` | `name` | Register AI as player |
| POST | `/agent-player/move` | `playerId`, `position` | Move AI player |
| POST | `/agent-player/leave` | `playerId` | Remove AI player |

### Auth

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/privy` | `accessToken` | Authenticate via Privy |
| POST | `/api/auth/guest` | `name?` | Create guest session |
| GET | `/api/me` | — | Current user (requires token) |

## Environment Variables

None are required for local development. The server uses in-memory storage and guest-only mode by default.

| Variable | Required | Description |
|----------|----------|-------------|
| **Core** | | |
| `PORT` | No | Server port (default: 3000) |
| `JWT_SECRET` | Production | JWT signing secret |
| `DATABASE_URL` | Production | PostgreSQL connection string |
| `DB_PASSWORD` | Production | PostgreSQL password (for Docker) |
| **Auth (Privy)** | | |
| `PRIVY_APP_ID` | No | Privy app ID (server) |
| `PRIVY_APP_SECRET` | No | Privy app secret (server) |
| `VITE_PRIVY_APP_ID` | No | Privy app ID (client) |
| `VITE_PRIVY_CLIENT_ID` | No | Privy client ID (client) |
| **Blockchain** | | |
| `MONAD_RPC_URL` | No | Monad RPC (default: `https://rpc.monad.xyz`) |
| `TREASURY_ADDRESS` | No | Treasury wallet (server) |
| `VITE_TREASURY_ADDRESS` | No | Treasury wallet (client) |
| **AI** | | |
| `AI_PLAYERS` | No | Enable AI bots (`true`) |
| `VITE_DEFAULT_ARENA` | No | Default arena ID |

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for the full setup guide.

## Development

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server + game server (hot-reload) |
| `npm start` | Production server (serves dist/) |
| `npm run build` | Build client for production |

**Debug tools:**
- `?debug=true` — Runtime debug panel
- `?spectator=true` — Free-camera spectator mode
- `curl localhost:3000/api/agent/context` — Full game state JSON
- `curl localhost:3000/api/world/state` — Entity/environment state

## Deployment

The engine ships with Docker Compose for production:

```bash
# Build and start
docker compose up -d --build

# SSL with Let's Encrypt
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.com
```

Stack: Node.js game server + PostgreSQL + nginx (SSL termination, WebSocket/SSE proxy) + certbot auto-renewal.

See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for the complete deployment guide.

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| 3D Rendering | Three.js (WebGPU + WebGL fallback) | 0.183.1 |
| Multiplayer | Colyseus | 0.15.0 |
| Server | Express + Node.js | 4.18.2 |
| Auth | Privy (Twitter + embedded wallets) | 3.13.1 |
| Blockchain | Viem (Monad network) | 2.45.1 |
| Frontend | React (auth widget only) | 19.2.4 |
| Database | PostgreSQL (pg) | 8.18.0 |
| Build | Vite | 5.0.0 |
| Deployment | Docker + nginx + Let's Encrypt | — |

## Docs

- **[Architecture](docs/ARCHITECTURE.md)** — System design, data flows, module descriptions
- **[Getting Started](docs/GETTING_STARTED.md)** — Setup, env vars, deployment
- **[Privy Auth Guide](docs/PRIVY_AUTH_GUIDE.md)** — Twitter login + embedded wallets
- **[llms.txt](llms.txt)** — LLM-friendly project reference

## License

MIT
