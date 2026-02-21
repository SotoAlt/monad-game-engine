import { randomUUID } from 'crypto';

export class ChatManager {
  constructor() {
    this.messages = [];
    this._messageIdCounter = 0;
    this.announcements = [];
    this.events = [];
    this._eventIdCounter = 0;
  }

  addMessage(sender, senderType, text) {
    const id = ++this._messageIdCounter;
    const message = { id, sender, senderType, text, timestamp: Date.now() };
    this.messages.push(message);
    // Keep only last 50
    if (this.messages.length > 50) {
      this.messages = this.messages.slice(-50);
    }
    return message;
  }

  getMessages(since = 0, limit = 20) {
    let msgs = since > 0
      ? this.messages.filter(m => m.id > since)
      : this.messages;
    return msgs.slice(-limit);
  }

  announce(text, type = 'agent', duration = 5000) {
    const id = `ann-${randomUUID().slice(0, 8)}`;
    const announcement = {
      id,
      text,
      type, // 'agent', 'system', 'challenge', 'player'
      duration,
      timestamp: Date.now()
    };

    this.announcements.push(announcement);
    console.log(`[ChatManager] Announcement (${type}): ${text}`);
    return announcement;
  }

  getAnnouncements() {
    // Clean old announcements
    const now = Date.now();
    this.announcements = this.announcements.filter(
      a => now - a.timestamp < a.duration + 1000
    );
    return [...this.announcements];
  }

  clearAnnouncements() {
    this.announcements = [];
  }

  addEvent(type, data) {
    const id = ++this._eventIdCounter;
    this.events.push({ id, type, data, timestamp: Date.now() });
    if (this.events.length > 100) this.events = this.events.slice(-100);
    return id;
  }

  getEvents(since = 0) {
    return since > 0 ? this.events.filter(e => e.id > since) : this.events.slice(-20);
  }
}
