/**
 * Arena Templates - Predefined arena layouts
 *
 * Each template defines:
 *   - entities: Array of { type, position, size, properties }
 *   - respawnPoint: [x, y, z]
 *   - floorType: 'solid' | 'none' | 'lava'
 *   - gameType: default game type for this template
 *   - environment: optional sky/fog/lighting overrides
 *
 * Add your own templates here and register them in constants.js ALL_TEMPLATES.
 */

export const TEMPLATES = {
  simple_arena: {
    name: 'Simple Arena',
    gameType: 'reach',
    floorType: 'solid',
    respawnPoint: [0, 2, 0],
    environment: {
      skyColor: '#87CEEB',
      fogColor: '#87CEEB',
      ambientIntensity: 0.6,
      sunIntensity: 1.2,
    },
    entities: [
      // Boundary walls
      { type: 'platform', position: [-25, 2, 0], size: [1, 4, 50], properties: { color: '#555555' } },
      { type: 'platform', position: [25, 2, 0], size: [1, 4, 50], properties: { color: '#555555' } },
      { type: 'platform', position: [0, 2, -25], size: [50, 4, 1], properties: { color: '#555555' } },
      { type: 'platform', position: [0, 2, 25], size: [50, 4, 1], properties: { color: '#555555' } },
      // Goal trigger
      { type: 'trigger', position: [0, 3, -20], size: [3, 3, 3], properties: { color: '#f1c40f', rotating: true, speed: 2, isGoal: true } },
      // A few platforms for variety
      { type: 'platform', position: [-10, 1, -10], size: [6, 0.5, 6], properties: { color: '#3498db' } },
      { type: 'platform', position: [10, 2, -15], size: [6, 0.5, 6], properties: { color: '#2ecc71' } },
    ],
  },

  obstacle_course: {
    name: 'Obstacle Course',
    gameType: 'reach',
    floorType: 'solid',
    respawnPoint: [0, 2, 20],
    environment: {
      skyColor: '#2c3e50',
      fogColor: '#2c3e50',
      ambientIntensity: 0.4,
      sunIntensity: 0.8,
    },
    entities: [
      // Starting platform
      { type: 'platform', position: [0, 0.5, 20], size: [8, 1, 8], properties: { color: '#2ecc71' } },
      // Stepping stones
      { type: 'platform', position: [0, 1, 12], size: [4, 0.5, 4], properties: { color: '#3498db' } },
      { type: 'platform', position: [5, 2, 5], size: [4, 0.5, 4], properties: { color: '#3498db' } },
      { type: 'platform', position: [0, 3, -2], size: [4, 0.5, 4], properties: { color: '#3498db' } },
      { type: 'platform', position: [-5, 4, -9], size: [4, 0.5, 4], properties: { color: '#3498db' } },
      // Moving wall obstacle
      { type: 'obstacle', position: [-10, 2, 0], size: [2, 3, 2], properties: {
        color: '#e74c3c', kinematic: true,
        path: [[-10, 2, 0], [10, 2, 0]], speed: 2
      }},
      // Final platform with goal
      { type: 'platform', position: [0, 5, -16], size: [8, 0.5, 8], properties: { color: '#9b59b6' } },
      { type: 'trigger', position: [0, 7, -16], size: [3, 3, 3], properties: { color: '#f1c40f', rotating: true, speed: 2, isGoal: true } },
    ],
  },
};

/**
 * Randomize template - slightly varies positions and speeds for variety.
 * Override or extend for more sophisticated randomization.
 */
export function randomizeTemplate(tmpl) {
  const jitter = (v, range = 1) => v + (Math.random() - 0.5) * range;

  return {
    ...tmpl,
    entities: tmpl.entities.map(e => ({
      ...e,
      position: e.position.map(v => jitter(v, 0.5)),
      properties: e.properties?.speed
        ? { ...e.properties, speed: e.properties.speed * (0.8 + Math.random() * 0.4) }
        : e.properties
    })),
  };
}
