export class HalfpipeGameplayEvents {
  constructor() {
    this.events = [];
  }

  clear() {
    this.events.length = 0;
  }

  emit(type, time, payload = {}) {
    this.events.push({
      type,
      time: Number.isFinite(time) ? time : 0,
      ...payload,
    });
  }

  drain() {
    const drained = this.events;
    this.events = [];
    return drained;
  }
}
