# Contributing to Monad Game Engine

Thanks for your interest in contributing! This project is open to PRs and we'd love your help building on it.

## Getting Started

1. Fork the repo
2. Clone your fork
3. `npm install`
4. `npm run dev`
5. Open `http://localhost:5173` — you should see the game running in guest mode

Full setup details are in the [README](README.md) and [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Wanted Features

Here's what we'd love help with. Each of these has a corresponding GitHub issue — pick one and go for it.

### On-Chain Integration (Monad-focused, EVM-compatible)

These features are designed for Monad's high-throughput, low-latency architecture but are EVM-compatible and work on any EVM chain.

- **On-chain leaderboard** — Store game scores on Monad. Fast finality makes per-game writes practical.
- **NFT items and cosmetics** — Mint, equip, and trade in-game items as NFTs on Monad.
- **Token-gated arenas** — Require MON or any ERC-20 token to enter specific arenas.
- **On-chain achievements** — Mint achievement badges as soulbound tokens.
- **Player tipping** — MON transfers between players during gameplay.

### Gameplay

- **More game types** — The engine supports 6 types (reach, collect, survival, king, hot_potato, race). Add new ones by extending `MiniGame.js`.
- **Inventory system** — Persistent item storage linked to player wallet address.
- **More arena templates** — Create new arena layouts in `ArenaTemplates.js`.
- **Power-ups and item drops** — Temporary buffs that spawn during games.
- **Team-based modes** — 2v2, 3v3, or team survival.
- **Persistent player progression** — XP, levels, unlocks tied to wallet.

### Platform

- **Spectator mode improvements** — Camera presets, follow-player, replay.
- **OBS overlay widgets** — The SSE stream at `/api/stream/events` can power custom overlays.
- **Twitch/Discord integration** — Chat bridge for live streaming (see `chat-bridge.js`).
- **Mobile UX** — Better touch controls, responsive UI.
- **Sound design** — The `SoundManager.js` uses procedural tones — add real audio assets.

## How to Contribute

1. Check [open issues](https://github.com/SotoAlt/monad-game-engine/issues) for something that interests you
2. Comment on the issue to let others know you're working on it
3. Create a branch from `main`
4. Make your changes
5. Test locally with `npm run dev`
6. Open a PR against `main`

## PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a brief description of what changed and why
- If you're adding a new game type or arena template, include a screenshot or short description of the gameplay
- Make sure `npm run build` succeeds before opening the PR

## Architecture Overview

The codebase is organized as:

```
src/server/   — Express + Colyseus game server
src/client/   — Three.js WebGPU client
src/shared/   — Constants shared between client and server
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system architecture with data flow diagrams and file descriptions.

## Questions?

Open an issue or reach out. We're happy to help you get started.
