import {
  VALID_FLOOR_TYPES, DEFAULT_SERVER_PHYSICS, DEFAULT_ENVIRONMENT
} from '../../shared/constants.js';

const VALID_HAZARD_TYPES = ['lava', 'water'];

const ENV_COLOR_KEYS = ['skyColor', 'fogColor', 'ambientColor', 'sunColor'];
const ENV_NUMBER_KEYS = ['fogNear', 'fogFar', 'fogDensity', 'ambientIntensity', 'sunIntensity'];
const ENV_STRING_KEYS = ['skyPreset', 'materialTheme'];

export class EnvironmentManager {
  static DEFAULT_PHYSICS = DEFAULT_SERVER_PHYSICS;
  static DEFAULT_ENVIRONMENT = DEFAULT_ENVIRONMENT;

  /**
   * @param {function} getGamePhase - () => string (current game phase)
   */
  constructor(getGamePhase) {
    this._getGamePhase = getGamePhase;
    this.physics = { ...EnvironmentManager.DEFAULT_PHYSICS };
    this.environment = { ...EnvironmentManager.DEFAULT_ENVIRONMENT };
    this.floorType = 'solid';
    this.hazardPlane = { active: false, type: 'lava', height: -10, startHeight: -10, riseSpeed: 0.5, maxHeight: 50 };
    this.respawnPoint = [0, 2, 0];
  }

  setPhysics({ gravity, friction, bounce }) {
    if (gravity !== undefined) {
      if (gravity < -20 || gravity > 0) {
        throw new Error('Gravity must be between -20 and 0');
      }
      this.physics.gravity = gravity;
    }

    if (friction !== undefined) {
      if (friction < 0 || friction > 1) {
        throw new Error('Friction must be between 0 and 1');
      }
      this.physics.friction = friction;
    }

    if (bounce !== undefined) {
      if (bounce < 0 || bounce > 2) {
        throw new Error('Bounce must be between 0 and 2');
      }
      this.physics.bounce = bounce;
    }

    console.log(`[EnvironmentManager] Physics updated: gravity=${this.physics.gravity}, friction=${this.physics.friction}, bounce=${this.physics.bounce}`);
    return { ...this.physics };
  }

  setEnvironment(changes) {
    for (const key of ENV_COLOR_KEYS) {
      if (changes[key] !== undefined) {
        if (typeof changes[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(changes[key])) {
          throw new Error(`Invalid color for ${key}: must be hex like #rrggbb`);
        }
        this.environment[key] = changes[key];
      }
    }

    for (const key of ENV_NUMBER_KEYS) {
      if (changes[key] !== undefined) {
        if (typeof changes[key] !== 'number') {
          throw new Error(`Invalid value for ${key}: must be a number`);
        }
        this.environment[key] = changes[key];
      }
    }

    for (const key of ENV_STRING_KEYS) {
      if (changes[key] !== undefined) {
        this.environment[key] = changes[key] || null;
      }
    }

    if (changes.sunPosition !== undefined) {
      if (!Array.isArray(changes.sunPosition) || changes.sunPosition.length !== 3) {
        throw new Error('sunPosition must be [x, y, z]');
      }
      this.environment.sunPosition = [...changes.sunPosition];
    }

    console.log(`[EnvironmentManager] Environment updated`);
    return { ...this.environment };
  }

  setFloorType(type) {
    if (!VALID_FLOOR_TYPES.includes(type)) {
      throw new Error(`Invalid floor type: ${type}. Must be one of: ${VALID_FLOOR_TYPES.join(', ')}`);
    }
    this.floorType = type;
    console.log(`[EnvironmentManager] Floor type set to: ${type}`);
    return this.floorType;
  }

  setHazardPlane({ active, type, startHeight, riseSpeed, maxHeight }) {
    if (active !== undefined) {
      this.hazardPlane.active = !!active;
    }
    if (VALID_HAZARD_TYPES.includes(type)) {
      this.hazardPlane.type = type;
    }
    if (typeof startHeight === 'number') {
      this.hazardPlane.startHeight = startHeight;
      this.hazardPlane.height = startHeight;
    }
    if (typeof riseSpeed === 'number') {
      this.hazardPlane.riseSpeed = Math.max(0.1, Math.min(5, riseSpeed));
    }
    if (typeof maxHeight === 'number') {
      this.hazardPlane.maxHeight = Math.max(this.hazardPlane.startHeight, Math.min(100, maxHeight));
    }

    console.log(`[EnvironmentManager] Hazard plane: active=${this.hazardPlane.active}, type=${this.hazardPlane.type}, height=${this.hazardPlane.height}`);
    return { ...this.hazardPlane };
  }

  updateHazardPlane(delta) {
    if (!this.hazardPlane.active || this._getGamePhase() !== 'playing') return null;

    this.hazardPlane.height += this.hazardPlane.riseSpeed * delta;
    this.hazardPlane.height = Math.min(this.hazardPlane.height, this.hazardPlane.maxHeight);

    return { ...this.hazardPlane };
  }

  deactivateHazardPlane() {
    this.hazardPlane.active = false;
    this.hazardPlane.height = this.hazardPlane.startHeight;
  }

  setRespawnPoint(position) {
    this.respawnPoint = [...position];
    console.log(`[EnvironmentManager] Respawn point set to [${position.join(', ')}]`);
    return this.respawnPoint;
  }

  /** Reset to defaults — called by facade's clearEntities() orchestration */
  reset() {
    this.physics = { ...EnvironmentManager.DEFAULT_PHYSICS };
    this.floorType = 'solid';
    this.environment = { ...EnvironmentManager.DEFAULT_ENVIRONMENT };
    this.deactivateHazardPlane();
  }
}
