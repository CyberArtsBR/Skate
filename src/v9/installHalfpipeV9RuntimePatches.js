import * as THREE from 'three';
import { HalfpipeAudio } from '../audio/HalfpipeAudio.js';
import { HalfpipePumpInput } from '../input/HalfpipePumpInput.js';
import { HalfpipeVisual } from '../halfpipe/HalfpipeVisual.js';
import { HalfpipePresentationBinder } from '../halfpipe/HalfpipePresentationBinder.js';

const AUDIO_INSTALLED = Symbol.for('chimpions.halfpipe.v9.audio-patches');
const UI_INSTALLED = Symbol.for('chimpions.halfpipe.v9.ui-patches');
const COPING_INSTALLED = Symbol.for('chimpions.halfpipe.v9.coping-contact-patches');
const menuSelections = new WeakMap();

function neutralActions(actions) {
  return Object.fromEntries(Object.keys(actions || {}).map((key) => [key, false]));
}

function visibleMenu(selector) {
  const root = globalThis.document?.querySelector?.(selector);
  return root && !root.hidden ? root : null;
}

function buttonsFor(root) {
  return Array.from(root?.querySelectorAll?.('.menu-button:not([disabled])') || []);
}

function selectionIndex(root, buttons) {
  if (!buttons.length) return 0;
  const stored = menuSelections.get(root);
  if (Number.isInteger(stored) && stored >= 0 && stored < buttons.length) return stored;
  const selected = buttons.findIndex((button) => button.classList.contains('is-selected'));
  return selected >= 0 ? selected : 0;
}

function syncSelection(root, buttons, index) {
  const normalized = buttons.length
    ? (index + buttons.length) % buttons.length
    : 0;
  menuSelections.set(root, normalized);
  buttons.forEach((button, buttonIndex) => {
    const selected = buttonIndex === normalized;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  return normalized;
}

function handleGenericControllerMenu(root, actions, kind) {
  const buttons = buttonsFor(root);
  if (!buttons.length) return false;
  let index = selectionIndex(root, buttons);
  let handled = false;

  if (actions.up || actions.down) {
    index += actions.down ? 1 : -1;
    syncSelection(root, buttons, index);
    handled = true;
  } else {
    index = syncSelection(root, buttons, index);
  }

  if (kind === 'graphics' && (actions.left || actions.right)) {
    index += actions.right ? 1 : -1;
    syncSelection(root, buttons, index);
    handled = true;
  }

  if (kind === 'audio' && (actions.left || actions.right)) {
    const target = root.querySelector(
      actions.right ? '[data-action="up"]' : '[data-action="down"]',
    );
    target?.click?.();
    handled = true;
  }

  if (actions.confirm) {
    buttons[selectionIndex(root, buttons)]?.click?.();
    handled = true;
  }

  if (actions.cancel && kind !== 'title') {
    root.querySelector('[data-action="back"]')?.click?.();
    handled = true;
  }

  return handled;
}

function installControllerMenuPatch() {
  const proto = HalfpipePumpInput.prototype;
  if (proto[UI_INSTALLED]) return false;
  Object.defineProperty(proto, UI_INSTALLED, { value: true });

  const originalConsume = proto.consumeUIActions;
  proto.consumeUIActions = function consumeUIActionsV9() {
    const actions = originalConsume.call(this);

    const graphics = visibleMenu('.graphics-screen');
    if (graphics && handleGenericControllerMenu(graphics, actions, 'graphics')) {
      return neutralActions(actions);
    }

    const audio = visibleMenu('.audio-screen');
    if (audio && handleGenericControllerMenu(audio, actions, 'audio')) {
      return neutralActions(actions);
    }

    const title = visibleMenu('.title-screen');
    if (title && handleGenericControllerMenu(title, actions, 'title')) {
      return neutralActions(actions);
    }

    return actions;
  };
  return true;
}

function buildProceduralOutdoorVoice(audio, descriptor, gainScale = 1) {
  const context = audio.context;
  const destination = audio.buses?.AMBIENCE?.gain;
  if (!context || !destination || !audio.noiseBuffer) return null;

  const groupGain = context.createGain();
  const targetGain = Math.max(0, Number(descriptor?.gain ?? 0.18) * Number(gainScale || 1));
  groupGain.gain.setValueAtTime(0.0001, context.currentTime);
  groupGain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, targetGain),
    context.currentTime + 0.45,
  );
  groupGain.connect(destination);

  // Three restrained filtered-noise layers stand in for California air,
  // distant city wash and a very subtle crowd bed. No copyrighted source audio.
  const layers = [
    { type: 'lowpass', frequency: 780, q: 0.35, gain: 0.72, rate: 0.91, offset: 0.08 },
    { type: 'bandpass', frequency: 1450, q: 0.28, gain: 0.22, rate: 1.07, offset: 0.31 },
    { type: 'lowpass', frequency: 310, q: 0.4, gain: 0.14, rate: 0.73, offset: 0.57 },
  ];
  const nodes = [];

  for (const layer of layers) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const layerGain = context.createGain();
    source.buffer = audio.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = layer.rate;
    filter.type = layer.type;
    filter.frequency.value = layer.frequency;
    filter.Q.value = layer.q;
    layerGain.gain.value = layer.gain;
    source.connect(filter).connect(layerGain).connect(groupGain);
    source.start(context.currentTime, Math.min(audio.noiseBuffer.duration - 0.01, layer.offset));
    nodes.push({ source, filter, gain: layerGain });
  }

  const sourceFacade = {
    stop(when = 0) {
      for (const node of nodes) {
        try { node.source.stop(when); } catch {}
      }
    },
    disconnect() {
      for (const node of nodes) {
        try { node.source.disconnect(); } catch {}
        try { node.filter.disconnect(); } catch {}
        try { node.gain.disconnect(); } catch {}
      }
      try { groupGain.disconnect(); } catch {}
    },
  };

  return { source: sourceFacade, gain: groupGain };
}

function installAudioPatch() {
  const proto = HalfpipeAudio.prototype;
  if (proto[AUDIO_INSTALLED]) return false;
  Object.defineProperty(proto, AUDIO_INSTALLED, { value: true });

  const originalPlayAmbience = proto.playAmbience;
  proto.playAmbience = async function playAmbienceV9(name, options = {}) {
    const result = await originalPlayAmbience.call(this, name, options);
    if (result || !this.isReady || this.ambienceVoices.has(name)) return result;

    const descriptor = this.manifest.ambience?.[name];
    if (!descriptor || descriptor.url) return false;
    if (!['procedural-california-outdoor', 'filtered-noise'].includes(descriptor.placeholder)) {
      return false;
    }

    const voice = buildProceduralOutdoorVoice(this, descriptor, options.gain ?? 1);
    if (!voice) return false;
    this.ambienceVoices.set(name, voice);
    return true;
  };
  return true;
}

function pointVector(point) {
  if (point?.isVector3) return point.clone();
  if (point && [point.x, point.y, point.z].every(Number.isFinite)) {
    return new THREE.Vector3(point.x, point.y, point.z);
  }
  return null;
}

function installVisualCopingPatch() {
  const visualProto = HalfpipeVisual.prototype;
  if (!visualProto[COPING_INSTALLED]) {
    Object.defineProperty(visualProto, COPING_INSTALLED, { value: true });
    visualProto.projectCopingPoint = function projectCopingPoint(worldPoint, wallSide = 0) {
      const target = pointVector(worldPoint);
      if (!target || !this.model) return null;

      if (!this._v9CopingMeshes) {
        this._v9CopingMeshes = [];
        this.model.traverse((object) => {
          if (object.isMesh && object.userData?.copingContactZone) {
            this._v9CopingMeshes.push(object);
          }
        });
      }
      if (!this._v9CopingMeshes.length) return null;

      this.root.updateWorldMatrix(true, true);
      const side = Math.sign(Number(wallSide) || target.x) || 1;
      const rays = [
        { origin: target.clone().add(new THREE.Vector3(0, 1.5, 0)), direction: new THREE.Vector3(0, -1, 0) },
        { origin: target.clone().add(new THREE.Vector3(side * 1.5, 0, 0)), direction: new THREE.Vector3(-side, 0, 0) },
        { origin: target.clone().add(new THREE.Vector3(0, 0, 1.5)), direction: new THREE.Vector3(0, 0, -1) },
        { origin: target.clone().add(new THREE.Vector3(0, 0, -1.5)), direction: new THREE.Vector3(0, 0, 1) },
      ];
      const raycaster = this._v9CopingRaycaster ||= new THREE.Raycaster();
      let best = null;
      let bestError = Infinity;

      for (const ray of rays) {
        raycaster.set(ray.origin, ray.direction);
        raycaster.near = 0;
        raycaster.far = 3;
        const hit = raycaster.intersectObjects(this._v9CopingMeshes, true)[0];
        if (!hit?.point) continue;
        const error = hit.point.distanceToSquared(target);
        if (error < bestError) {
          bestError = error;
          best = hit.point.clone();
        }
      }
      return best;
    };
  }

  const binderProto = HalfpipePresentationBinder.prototype;
  if (binderProto[COPING_INSTALLED]) return true;
  Object.defineProperty(binderProto, COPING_INSTALLED, { value: true });
  const originalApply = binderProto.apply;
  binderProto.apply = function applyV9VisualCoping(nextState = {}) {
    if (
      nextState.trickVisualActive
      && nextState.trickType === 'hand-plant'
      && nextState.copingWorldPoint
      && this.visualSurface?.projectCopingPoint
    ) {
      const projected = this.visualSurface.projectCopingPoint(
        nextState.copingWorldPoint,
        nextState.wallSide,
      );
      if (projected) {
        // Presentation/VFX only. Physics remains the mathematical profile.
        nextState.copingWorldPoint = {
          x: projected.x,
          y: projected.y,
          z: projected.z,
        };
        nextState.plantTargetWorldPosition = nextState.copingWorldPoint;
      }
    }
    return originalApply.call(this, nextState);
  };
  return true;
}

export function installHalfpipeV9RuntimePatches() {
  return {
    controllerMenus: installControllerMenuPatch(),
    audio: installAudioPatch(),
    visualCoping: installVisualCopingPatch(),
  };
}
