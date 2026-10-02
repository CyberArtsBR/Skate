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

function crossfadeLoop(context, source, seconds) {
  const seam = Math.min(Math.ceil(source.sampleRate * seconds), Math.floor(source.length / 4));
  const count = source.length - seam;
  const output = context.createBuffer(source.numberOfChannels, count, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const samples = output.getChannelData(channel);
    samples.set(input.subarray(0, count));
    // The blended section starts with the recording tail and ends with its
    // head, then continues into head+seam; the loop boundary is continuous.
    for (let i = 0; i < seam; i++) {
      const blend = Math.sin(i / seam * Math.PI * 0.5) ** 2;
      samples[i] = input[count + i] * (1 - blend) + input[i] * blend;
    }
  }
  return output;
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
  }
  return crossfadeLoop(context, buffer, 0.06);
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

// Resample overlapping windows of the selected raw-street recording once at
// unlock, retaining its texture without repeating a 1.87-second motif twice a
// second at speed. The source assets and their CC0 attribution stay unchanged.
export function createVariedRollBuffer(context, source) {
  if (!source?.length) return source;
  const rate = source.sampleRate;
  const count = Math.ceil(rate * 9.17);
  const grainLength = Math.ceil(rate * 0.61);
  const overlap = Math.ceil(rate * 0.12);
  const grains = Math.ceil(count / (grainLength - overlap));
  const hop = count / grains;
  const buffer = context.createBuffer(source.numberOfChannels, count, rate);
  const weights = new Float32Array(count);
  const starts = Array.from({ length: grains }, (_, index) => ({
    offset: Math.floor(((index * 0.61803398875 + 0.137) % 1) * source.length),
    pitch: 0.975 + ((index * 0.41421356237) % 1) * 0.05,
  }));
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const input = source.getChannelData(channel);
    const output = buffer.getChannelData(channel);
    for (let grain = 0; grain < grains; grain++) {
      const start = Math.floor(grain * hop);
      const { offset, pitch } = starts[grain];
      for (let i = 0; i < grainLength; i++) {
        // Accumulate circularly so the last and first samples belong to the
        // same overlapping grains; no shortened/baked-fade seam is required.
        const target = (start + i) % count;
        const edge = Math.min(1, i / overlap, (grainLength - 1 - i) / overlap);
        const weight = Math.sin(Math.max(0, edge) * Math.PI * 0.5) ** 2;
        const read = (offset + i * pitch) % input.length;
        const index = Math.floor(read);
        const fraction = read - index;
        output[target] += (input[index] * (1 - fraction)
          + input[(index + 1) % input.length] * fraction) * weight;
        if (channel === 0) weights[target] += weight;
      }
    }
    for (let i = 0; i < count; i++) output[i] /= Math.max(0.0001, weights[i]);
  }
  return buffer;
}

export function createRecordedImpactBank(context, source) {
  return [0.34, 0.46, 0.58, 0.7].map((duration, variant) => {
    const count = Math.min(source.length, Math.ceil(duration * source.sampleRate));
    const buffer = context.createBuffer(source.numberOfChannels, count, source.sampleRate);
    const filter = 1 - Math.exp(-2 * Math.PI * (3800 + variant * 650) / source.sampleRate);
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const input = source.getChannelData(channel);
      const output = buffer.getChannelData(channel);
      let low = 0;
      for (let i = 0; i < count; i++) {
        low += filter * (input[i] - low);
        const tail = Math.min(1, (count - 1 - i) / (source.sampleRate * 0.035));
        output[i] = low * Math.max(0, tail) * (0.94 + variant * 0.02);
      }
    }
    return buffer;
  });
}

// Small dry physical-contact bank; fixed resonances, no arcade pitch sweeps.
export function createPhysicalContactBank(context, kind) {
  return Array.from({ length: 3 }, (_, variant) => {
    const duration = kind === 'skid' ? 0.17 : kind === 'metal' ? 0.19 : 0.085;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    const noise = randomStream(5117 + variant * 857 + kind.length * 31);
    let low = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / context.sampleRate;
      const white = noise();
      low += (kind === 'hand' ? 0.035 : 0.11) * (white - low);
      const attack = Math.min(1, t / 0.001);
      const release = Math.min(1, (samples.length - 1 - i) / (context.sampleRate * 0.012));
      let sample;
      if (kind === 'metal') {
        const detune = 0.98 + variant * 0.019;
        sample = white * Math.exp(-t * 155) * 0.24
          + Math.sin(t * Math.PI * 2 * 1730 * detune) * Math.exp(-t * 32) * 0.13
          + Math.sin(t * Math.PI * 2 * 2810 * detune) * Math.exp(-t * 53) * 0.06;
      } else if (kind === 'hand') {
        sample = low * Math.exp(-t * 53) * 1.1
          + (white - low) * Math.exp(-t * 190) * 0.045;
      } else if (kind === 'panel') {
        sample = low * Math.exp(-t * 72) * 0.5
          + Math.sin(t * Math.PI * 2 * (310 + variant * 13)) * Math.exp(-t * 67) * 0.1;
      } else {
        sample = (white - low) * Math.sin(Math.PI * t / duration) * Math.exp(-t * 12) * 0.24;
      }
      samples[i] = sample * attack * Math.max(0, release);
    }
    return buffer;
  });
}

export function createEnvironmentBed(context, kind = 'outdoor') {
  // Low-rate stereo beds keep memory bounded; they are atmosphere under Foley,
  // never a new musical or futuristic sound layer.
  const rate = 22050;
  const count = Math.ceil(rate * 12.73);
  const buffer = context.createBuffer(2, count, rate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    const noise = randomStream(9329 + channel * 711 + kind.length * 19);
    let low = 0, mid = 0;
    for (let i = 0; i < count; i++) {
      const t = i / rate;
      const white = noise();
      low += 0.012 * (white - low);
      mid += 0.14 * (white - mid);
      const breeze = 0.65 + 0.22 * Math.sin(t * 0.71 + channel * 0.3)
        + 0.12 * Math.sin(t * 1.47);
      let sample = (low * 1.1 + mid * 0.12) * breeze;
      if (kind === 'city') {
        const passing = Math.max(0, Math.sin(t * 0.48 - 1)) ** 4;
        sample = low * (1.3 + passing * 1.2) + mid * passing * 0.11;
      } else if (kind === 'night') {
        sample = low * 1.25 + mid * 0.025;
      } else {
        const birdPhase = (t + channel * 0.13) % 4.73;
        if (birdPhase > 2.2 && birdPhase < 2.43) {
          const chirp = (birdPhase - 2.2) / 0.23;
          sample += Math.sin(2 * Math.PI * (1850 * t + 18 * Math.sin(t * 17)))
            * Math.sin(chirp * Math.PI) ** 2 * 0.055;
        }
      }
      samples[i] = sample;
    }
  }
  return crossfadeLoop(context, buffer, 0.25);
}
