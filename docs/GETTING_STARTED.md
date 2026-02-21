# Getting Started

## Prerequisites

- **Node.js 20+** (with npm)
- **Docker** and **Docker Compose** (for production deployment)

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

This starts:
- **Vite dev server** at `http://localhost:5173` (hot-reload)
- **Game server** at `http://localhost:3000`

No database, auth, or blockchain credentials are needed for local dev. The server falls back to in-memory storage and guest-only mode.

### 3. Open the game

Navigate to `http://localhost:5173` in your browser. Click "Play as Guest" to enter the game.

---

## Environment Variables

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

### Required for production

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random string for JWT signing |
| `DB_PASSWORD` | PostgreSQL password |

### Optional — Auth (Privy)

| Variable | Description |
|----------|-------------|
| `PRIVY_APP_ID` | Privy application ID (server-side) |
| `PRIVY_APP_SECRET` | Privy application secret (server-side) |
| `VITE_PRIVY_APP_ID` | Privy application ID (client-side) |
| `VITE_PRIVY_CLIENT_ID` | Privy client ID (client-side) |

Without these, the game runs in guest-only mode. See [PRIVY_AUTH_GUIDE.md](PRIVY_AUTH_GUIDE.md) for setup instructions.

### Optional — Blockchain (Monad)

| Variable | Description |
|----------|-------------|
| `MONAD_RPC_URL` | Monad RPC endpoint (default: `https://rpc.monad.xyz`) |
| `TREASURY_ADDRESS` | Treasury wallet address |
| `VITE_TREASURY_ADDRESS` | Treasury address (client-side) |

### Optional — AI Agent

| Variable | Description |
|----------|-------------|
| `AI_PLAYERS` | Set to `true` to enable AI bot players |
| `VITE_DEFAULT_ARENA` | Default arena ID (default: `default`) |

---

## Running Without Auth

The game works fully in guest-only mode. Players get a randomly generated name and can play immediately. No Privy credentials required.

To add Twitter login and embedded wallets, see [PRIVY_AUTH_GUIDE.md](PRIVY_AUTH_GUIDE.md).

---

## Database Setup (Optional)

For local development, no database is needed — the server uses in-memory storage.

For persistent data (leaderboards, arenas, game history):

### Option 1: Docker PostgreSQL

```bash
docker run -d --name game-db \
  -e POSTGRES_DB=game_db \
  -e POSTGRES_USER=game \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  postgres:16-alpine
```

Then set in `.env`:
```
DATABASE_URL=postgresql://game:changeme@localhost:5432/game_db
```

### Option 2: Existing PostgreSQL

Set `DATABASE_URL` in `.env` to your connection string. The server auto-creates tables on first run.

---

## Production Deployment

### 1. Prepare your server

You need a VPS with Docker and Docker Compose installed. Any provider works (Hetzner, DigitalOcean, AWS, etc.).

### 2. Configure environment

Create a `.env` file on your server with production values:

```bash
PORT=3000
NODE_ENV=production
DB_PASSWORD=<strong-random-password>
JWT_SECRET=<strong-random-string>

# Add Privy credentials if using auth
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
VITE_PRIVY_APP_ID=...
VITE_PRIVY_CLIENT_ID=...

# Add Monad credentials if using blockchain
MONAD_RPC_URL=https://rpc.monad.xyz
TREASURY_ADDRESS=0x...
VITE_TREASURY_ADDRESS=0x...
```

### 3. Update nginx.conf

Replace `your-domain.com` with your actual domain in `nginx.conf`.

### 4. Set up SSL

```bash
# Initial certificate (run once)
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.com \
  --email your-email@example.com \
  --agree-tos --no-eff-email
```

### 5. Build and deploy

```bash
docker compose up -d --build
```

### 6. Verify

```bash
# Check logs
docker compose logs -f game

# Test health
curl https://your-domain.com/api/world
```

---

## Adding Game Types

The engine ships with one example game type (`reach` — race to a goal). To add more:

1. Create a new file in `src/server/games/` extending `MiniGame`:

```javascript
import { MiniGame } from '../MiniGame.js';

export class MyGame extends MiniGame {
  constructor(worldState, broadcastFn, config) {
    super(worldState, broadcastFn, { ...config, type: 'my_game' });
  }

  checkWinCondition() {
    // Return winnerId or null
  }
}
```

2. Add the type to `src/shared/constants.js`:
```javascript
export const GAME_TYPES = {
  REACH: 'reach',
  MY_GAME: 'my_game',
};
```

3. Register in `src/server/games/index.js`:
```javascript
import { MyGame } from './MyGame.js';

export function createGameSync(type, worldState, broadcastFn, config) {
  switch (type) {
    case 'reach': return new ReachGoal(worldState, broadcastFn, config);
    case 'my_game': return new MyGame(worldState, broadcastFn, config);
    default: throw new Error(`Unknown game type: ${type}`);
  }
}
```

4. Create an arena template in `src/server/ArenaTemplates.js` that uses your game type.

---

## Multi-Arena API

Any AI agent can create and host its own arena:

```bash
# Create arena
curl -X POST http://localhost:3000/api/arenas \
  -H "Content-Type: application/json" \
  -d '{"name": "My Arena", "description": "Custom arena"}'
# Returns: { arenaId, apiKey }

# Use the arena
curl http://localhost:3000/api/arenas/<arenaId>/world \
  -H "X-Arena-API-Key: <apiKey>"
```

All game endpoints are available at both `/api/...` (default arena) and `/api/arenas/:arenaId/...` (specific arena).
