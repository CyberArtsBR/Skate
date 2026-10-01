// Presentation-only deduplication. LANDING and BAIL share a simulation tick;
// their score and momentum consequences still reach the gameplay unchanged.
export class ContactFeedbackGate {
  constructor() { this.contacts = new Map(); }

  claim(event = {}, family = 'landing') {
    const time = Number(event.time);
    const id = event.contactId ?? (Number.isFinite(time) ? time.toFixed(4) : null);
    if (id === null) return true;
    const key = `${family}:${id}`;
    if (this.contacts.has(key)) return false;
    this.contacts.set(key, true);
    if (this.contacts.size > 32) this.contacts.delete(this.contacts.keys().next().value);
    return true;
  }

  clear() { this.contacts.clear(); }
}
