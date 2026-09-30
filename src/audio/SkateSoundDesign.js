// Dry mechanical source layers, generated once per audio context. No arcade
// pitch sweep is baked into contact sounds: speed and impact drive the mix.
export const SKATE_SOUND = Object.freeze({
  referenceSpeed: 22, textureSeconds: 5.37, panelSpacing: 2.2,
  panelCooldown: 0.14, maxImpactVoices: 6, impactVariants: 6,
  contactAttack: 0.035, contactRelease: 0.018,
});

function randomStream(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1; };
}

export function createSkateTexture(context, kind) {
  const count = Math.ceil(context.sampleRate * SKATE_SOUND.textureSeconds);
  const buffer = context.createBuffer(2, count, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const noise = randomStream(9317 + channel * 7907 + (kind === 'truck' ? 171 : 0));
    const samples = buffer.getChannelData(channel);
    let low = 0, mid = 0;
    for (let i = 0; i < count; i++) {
      const white = noise();
      low += 0.025 * (white - low);
      mid += 0.32 * (white - mid);
      const t = i / context.sampleRate;
      const grain = 0.72 + 0.15 * Math.sin(t * 5.13 + channel)
        + 0.08 * Math.sin(t * 17.7);
      if (kind === 'wheel') {
        // Urethane rumble and small gritty microcontacts, not a wind-like hiss.
        samples[i] = (low * 2.9 + mid * 0.35 + (white - mid) * 0.035) * grain;
      } else if (kind === 'truck') {
        const chatter = Math.pow(Math.max(0, Math.sin(t * 211 + channel * 0.7)), 14);
        samples[i] = (white - mid) * (0.022 + chatter * 0.15) * grain;
      } else samples[i] = mid * 0.48;
    }
    // Crossfade the seam without a recurring audible attack or baked fade.
    const seam = Math.min(2048, Math.floor(count / 10));
    for (let i = 0; i < seam; i++) {
      const blend = i / seam;
      samples[count - seam + i] = samples[count - seam + i] * (1 - blend) + samples[i] * blend;
    }
  }
  return buffer;
}

export function createDeckImpactBank(context) {
  return Array.from({ length: SKATE_SOUND.impactVariants }, (_, variant) => {
    const duration = 0.24 + variant * 0.005;
    const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * duration), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = buffer.getChannelData(channel);
      const noise = randomStream(711 + variant * 919 + channel * 313);
      const detune = 0.96 + variant * 0.014;
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        const attack = Math.min(1, t / 0.0007);
        const wood = Math.sin(2 * Math.PI * 173 * detune * t) * Math.exp(-t * 38) * 0.45
          + Math.sin(2 * Math.PI * 427 * detune * t + 0.6) * Math.exp(-t * 62) * 0.22;
        const truckTime = Math.max(0, t - 0.016 - channel * 0.0015);
        const trucks = t > 0.016 + channel * 0.0015
          ? Math.sin(2 * Math.PI * 1380 * truckTime) * Math.exp(-truckTime * 125) * 0.16 : 0;
        const contact = noise() * Math.exp(-t * 140) * 0.35;
        samples[i] = (wood + trucks + contact) * attack;
      }
    }
    return buffer;
  });
}
