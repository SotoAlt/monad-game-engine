# Extraction Plan: monad-game-engine from self-building-game

## Status: In Progress

## Phase Progress
- [x] Phase 0: Repository Setup
- [ ] Phase 1: Nuclear Cleanup
- [ ] Phase 2: Code Surgery
- [ ] Phase 3: Documentation
- [ ] Phase 4: Verify & Test

## Goal
Extract a clean open-source starter template from the self-building-game repo, targeting Monad developers.

## Key Decisions
- **Agent system**: Keep simplified — minimal AgentLoop + AgentBridge as optional plugin
- **Composer**: Strip entirely — template only has basic entity CRUD via WorldState
- **Branding**: "Monad Game Engine"
- **Game types**: Only ReachGoal kept as example
- **Arena templates**: 2 simple examples replace 16 proprietary ones

## Safety Rules
- Fresh git history (no old commits)
- Zero secrets, IPs, domains, API keys
- Zero CLAUDE.md files in final output
- Zero personal paths
- Zero unrelated projects

## Files Deleted (~30)
All CLAUDE.md, SOUL.md, game-world-skill.*, game-player-skill.*, agent-runner.js, chat-bridge.js, deploy.sh, CHANGELOG.md, blockchain/, 5 game types, ArenaTemplates (replaced), Prefabs, Composer, BribePanel, bribeRoutes, 15 docs

## Files Rewritten (~8)
README.md, index.html, .env.example, package.json, nginx.conf, docker-compose.yml, ArenaTemplates.js (minimal), ARCHITECTURE.md

## Files Edited (~15)
index.js, GameRoom.js, WorldState.js, AgentLoop.js, AgentBridge.js, MiniGame.js, games/index.js, shared/constants.js, gameRoutes.js, agentRoutes.js, config.js, GameStatusHUD.js, ProfilePanel.js, PhysicsEngine.js, state.js
