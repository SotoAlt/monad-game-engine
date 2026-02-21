import { randomUUID } from 'crypto';

const VALID_CHALLENGE_TYPES = ['reach', 'collect', 'survive', 'time_trial'];

export class ChallengeManager {
  constructor() {
    this.challenges = new Map();
    this.statistics = {
      totalChallengesCreated: 0,
      totalChallengesCompleted: 0
    };
  }

  createChallenge(type, target, description, reward = 100) {
    if (!VALID_CHALLENGE_TYPES.includes(type)) {
      throw new Error(`Invalid challenge type: ${type}`);
    }

    const id = `challenge-${randomUUID().slice(0, 8)}`;
    const challenge = {
      id,
      type,
      target,
      description: description || this.getDefaultDescription(type, target),
      reward,
      attempts: 0,
      successes: 0,
      active: true,
      createdAt: Date.now()
    };

    this.challenges.set(id, challenge);
    this.statistics.totalChallengesCreated++;

    console.log(`[ChallengeManager] Challenge created: ${description || type}`);
    return challenge;
  }

  completeChallenge(id, playerId) {
    const challenge = this.challenges.get(id);
    if (!challenge) return null;

    challenge.successes++;
    this.statistics.totalChallengesCompleted++;

    console.log(`[ChallengeManager] Challenge completed: ${id} by ${playerId}`);
    return challenge;
  }

  recordChallengeAttempt(id) {
    const challenge = this.challenges.get(id);
    if (challenge) {
      challenge.attempts++;
    }
  }

  getChallenges() {
    return Array.from(this.challenges.values()).filter(c => c.active);
  }

  getDefaultDescription(type, target) {
    const descriptions = {
      reach: `Reach ${target || 'the target'}`,
      collect: `Collect ${target || 'all items'}`,
      survive: `Survive for ${target || '30'} seconds`,
      time_trial: `Complete in under ${target || '60'} seconds`
    };
    return descriptions[type];
  }
}
