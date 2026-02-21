/**
 * AIPlayer - Virtual players with personality-driven behavior
 *
 * Simple goal-seeking AI (no pathfinding). Personalities affect
 * speed, risk-taking, and chat frequency.
 */

const PERSONALITIES = {
  explorer: {
    name: 'Explorer Bot',
    speed: 0.8,
    risk: 0.3,
    chatFreq: 0.1,
    color: '#3498db',
    jumpFreq: 0.02,
    chatLines: {
      death: ['Oops, miscalculated that jump...', 'Well that was educational', 'Note to self: don\'t go there'],
      win: ['I found it!', 'Exploration pays off!', 'Mapped the whole thing'],
      gameStart: ['Let me scout ahead...', 'Interesting layout...', 'I see multiple paths'],
      idle: ['Hmm, what\'s over here?', 'This looks unexplored', 'Let me try this way']
    }
  },
  chaotic: {
    name: 'Chaos Bot',
    speed: 1.2,
    risk: 0.9,
    chatFreq: 0.3,
    color: '#e74c3c',
    jumpFreq: 0.08,
    chatLines: {
      death: ['YOLO!!!', 'Worth it!', 'I regret nothing!', 'AGAIN!'],
      win: ['EZ!', 'Get rekt!', 'Too fast too furious!'],
      gameStart: ['LEEEROY!', 'Send it!', 'No brakes!'],
      idle: ['*bouncing off walls*', 'I\'m bored, where\'s the danger?', 'This is too safe']
    }
  },
  tryhard: {
    name: 'Tryhard Bot',
    speed: 1.0,
    risk: 0.5,
    chatFreq: 0.05,
    color: '#2ecc71',
    jumpFreq: 0.04,
    chatLines: {
      death: ['Lag.', 'That hitbox is broken', 'Doesn\'t count'],
      win: ['GG', 'As expected', 'Optimal route found'],
      gameStart: ['Analyzing...', 'Ready.', 'Let\'s go.'],
      idle: ['Warming up', '...', 'Waiting for game']
    }
  }
};

export class AIPlayer {
  constructor(worldState, broadcastFn, personalityKey = 'explorer') {
    this.worldState = worldState;
    this.broadcast = broadcastFn;

    const personality = PERSONALITIES[personalityKey] || PERSONALITIES.explorer;
    this.personality = personality;
    this.personalityKey = personalityKey;

    // Player identity
    this.id = `ai-${personalityKey}-${Date.now().toString(36)}`;
    this.name = personality.name;

    // Movement state
    this.position = [0, 2, 0];
    this.velocity = [0, 0, 0];
    this.isGrounded = true;
    this.state = 'alive';

    // AI state
    this.targetPosition = null;
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.lastChatTime = 0;
    this.deathCount = 0;
    this.score = 0;

    // Register with world state
    this.worldState.addPlayer(this.id, this.name, 'ai');
  }

  update(delta) {
    if (this.state === 'dead') return;

    const gamePhase = this.worldState.gameState.phase;
    const speed = this.personality.speed * 8 * delta;

    // Choose target based on game state
    this.chooseTarget(gamePhase);

    // Move toward target
    if (this.targetPosition) {
      const dx = this.targetPosition[0] - this.position[0];
      const dz = this.targetPosition[2] - this.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 1) {
        // Add personality noise
        const noise = (this.personalityKey === 'chaotic')
          ? (Math.random() - 0.5) * 4
          : (Math.random() - 0.5) * 1;

        this.velocity[0] = (dx / dist) * speed + noise * delta;
        this.velocity[2] = (dz / dist) * speed + noise * delta;
      } else {
        // Reached target, pick new one
        this.targetPosition = null;
      }
    } else {
      // Wander
      this.wanderAngle += (Math.random() - 0.5) * 0.3;
      this.velocity[0] = Math.cos(this.wanderAngle) * speed * 0.5;
      this.velocity[2] = Math.sin(this.wanderAngle) * speed * 0.5;
    }

    // Gravity
    this.velocity[1] += -9.8 * delta;

    // Random jumps
    if (this.isGrounded && Math.random() < this.personality.jumpFreq) {
      this.velocity[1] = 10;
      this.isGrounded = false;
    }

    // Jump when approaching obstacles (simple heuristic: jump if target is higher)
    if (this.isGrounded && this.targetPosition && this.targetPosition[1] > this.position[1] + 1) {
      this.velocity[1] = 12;
      this.isGrounded = false;
    }

    // Apply velocity
    this.position[0] += this.velocity[0] * delta;
    this.position[1] += this.velocity[1] * delta;
    this.position[2] += this.velocity[2] * delta;

    // Ground collision (check ground FIRST to prevent tunneling through floor)
    const groundActive = gamePhase === 'lobby' || gamePhase === 'building';
    if (groundActive && this.position[1] < 1) {
      this.position[1] = 1;
      this.velocity[1] = 0;
      this.isGrounded = true;
    } else if (this.position[1] < -20) {
      this.die();
      return;
    }

    // Simple platform collision (check entities above/below)
    this.checkPlatformCollision();

    // Update world state
    this.worldState.updatePlayer(this.id, {
      position: [...this.position],
      velocity: [...this.velocity],
      state: this.state
    });

    // Broadcast position
    this.broadcast('player_moved', {
      id: this.id,
      position: [...this.position],
      velocity: [...this.velocity]
    });

    // Random chat (longer cooldown in lobby/building to avoid spam)
    const chatCooldown = (gamePhase === 'lobby' || gamePhase === 'building') ? 60000 : 20000;
    if (Math.random() < this.personality.chatFreq * delta * 0.1 && Date.now() - this.lastChatTime > chatCooldown) {
      this.chat('idle');
    }
  }

  chooseTarget(gamePhase) {
    if (this.targetPosition) return; // Already have a target

    const gameType = this.worldState.gameState.gameType;

    if (gamePhase === 'playing') {
      if (gameType === 'reach') {
        // Move toward goal trigger
        for (const entity of this.worldState.entities.values()) {
          if (entity.type === 'trigger' && entity.properties?.isGoal) {
            this.targetPosition = [...entity.position];
            return;
          }
        }
      } else if (gameType === 'collect') {
        // Move toward nearest collectible
        let nearest = null;
        let nearestDist = Infinity;
        for (const entity of this.worldState.entities.values()) {
          if (entity.type === 'collectible') {
            const dx = entity.position[0] - this.position[0];
            const dz = entity.position[2] - this.position[2];
            const dist = dx * dx + dz * dz;
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = entity;
            }
          }
        }
        if (nearest) {
          this.targetPosition = [...nearest.position];
          return;
        }
      } else if (gameType === 'survival') {
        // Stay near center, dodge obstacles
        this.targetPosition = [
          (Math.random() - 0.5) * 10,
          this.position[1],
          (Math.random() - 0.5) * 10
        ];
        return;
      }
    }

    // Default: wander randomly
    this.targetPosition = [
      (Math.random() - 0.5) * 30,
      this.position[1],
      (Math.random() - 0.5) * 30
    ];
  }

  checkPlatformCollision() {
    for (const entity of this.worldState.entities.values()) {
      if (entity.type !== 'platform' && entity.type !== 'ramp') continue;

      const halfSize = entity.size.map(s => s / 2);
      const dx = Math.abs(this.position[0] - entity.position[0]);
      const dy = Math.abs(this.position[1] - entity.position[1]);
      const dz = Math.abs(this.position[2] - entity.position[2]);

      const overlapX = (0.5 + halfSize[0]) - dx;
      const overlapY = (1 + halfSize[1]) - dy;
      const overlapZ = (0.5 + halfSize[2]) - dz;

      if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

      // Standing on top check
      const platformTop = entity.position[1] + halfSize[1];
      if (this.position[1] - 1 >= platformTop - 0.5 && this.velocity[1] <= 0) {
        this.position[1] = platformTop + 1;
        this.velocity[1] = 0;
        this.isGrounded = true;
      }
    }

    // Obstacle collision → death
    for (const entity of this.worldState.entities.values()) {
      if (entity.type !== 'obstacle') continue;
      const halfSize = entity.size.map(s => s / 2);
      const dx = Math.abs(this.position[0] - entity.position[0]);
      const dy = Math.abs(this.position[1] - entity.position[1]);
      const dz = Math.abs(this.position[2] - entity.position[2]);

      if (dx < 0.5 + halfSize[0] && dy < 1 + halfSize[1] && dz < 0.5 + halfSize[2]) {
        if (Math.random() < this.personality.risk) {
          // Risky personality might ignore collision sometimes
          continue;
        }
        this.die();
        return;
      }
    }
  }

  die() {
    if (this.state === 'dead') return;

    this.state = 'dead';
    this.deathCount++;

    this.broadcast('player_died', {
      id: this.id,
      position: [...this.position]
    });

    const msg = this.worldState.addMessage('System', 'system', `${this.name} died`);
    this.broadcast('chat_message', msg);
    this.worldState.addEvent('player_death', { playerId: this.id, name: this.name });

    this.chat('death');

    // Respawn after delay
    setTimeout(() => this.respawn(), 2000);
  }

  respawn() {
    const rp = this.worldState.respawnPoint || [0, 2, 0];
    this.position = [...rp];
    this.velocity = [0, 0, 0];
    this.state = 'alive';
    this.targetPosition = null;
    this.isGrounded = true;

    this.worldState.updatePlayer(this.id, {
      state: 'alive',
      position: [...this.position]
    });

    this.broadcast('player_respawned', { id: this.id });
  }

  chat(event) {
    const lines = this.personality.chatLines[event];
    if (!lines || lines.length === 0) return;

    const text = lines[Math.floor(Math.random() * lines.length)];
    const msg = this.worldState.addMessage(this.name, 'player', text);
    this.broadcast('chat_message', msg);
    this.lastChatTime = Date.now();
  }

  onGameStart() {
    this.chat('gameStart');
  }

  onGameEnd(won) {
    if (won) {
      this.chat('win');
      this.score++;
    }
  }

  remove() {
    this.worldState.removePlayer(this.id);
    this.broadcast('player_left', { id: this.id, name: this.name });
  }
}

export { PERSONALITIES };
