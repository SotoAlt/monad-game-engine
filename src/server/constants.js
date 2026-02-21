/**
 * Server constants — timing, physics, templates.
 */

export const PORT = process.env.PORT || 3000;
export const MIN_LOBBY_MS = 5000;
export const AUTO_START_DELAY = 20000;
export const MIN_GAME_DURATION_MS = 30000;
export const ANNOUNCEMENT_COOLDOWN = 5000;
export const AGENT_CHAT_COOLDOWN = 3000;
export const AFK_IDLE_MS = 120000;
export const AFK_KICK_MS = 15000;
export const AFK_CHECK_INTERVAL = 5000;

// Register your arena templates here
export const ALL_TEMPLATES = [
  'simple_arena',
  'obstacle_course',
];

export const NEW_TYPE_TEMPLATES = [];

/** Map of template name substrings to game types (checked in order). */
const TEMPLATE_TYPE_RULES = [
  // ['king', 'king'],  // example: templates containing 'king' use king game type
];

export function getTemplateGameType(templateName) {
  for (const [pattern, type] of TEMPLATE_TYPE_RULES) {
    if (templateName.includes(pattern)) return type;
  }
  return 'reach';
}
