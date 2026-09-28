import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.js';

export class HalfpipeProfile {
  constructor(options = {}) {
    const defaults = GAME_CONFIG.halfpipeProfile;
    this.flatHalfWidth = options.flatHalfWidth ?? defaults.flatHalfWidth;
    this.transitionWidth = options.transitionWidth ?? defaults.transitionWidth;
    this.transitionHeight = options.transitionHeight ?? defaults.transitionHeight;
    this.leftLip = -(this.flatHalfWidth + this.transitionWidth);
    this.rightLip = this.flatHalfWidth + this.transitionWidth;
  }

  sample(x) {
    const clampedX = THREE.MathUtils.clamp(x, this.leftLip, this.rightLip);
    const absoluteX = Math.abs(clampedX);
    if (absoluteX <= this.flatHalfWidth) {
      return {
        x: clampedX,
        y: 0,
        region: 'flat-bottom',
        tangent: new THREE.Vector2(Math.sign(clampedX) || 1, 0).normalize(),
        normal: new THREE.Vector2(0, 1),
      };
    }

    const side = Math.sign(clampedX) || 1;
    const t = THREE.MathUtils.clamp(
      (absoluteX - this.flatHalfWidth) / this.transitionWidth,
      0,
      1,
    );
    const safeRoot = Math.sqrt(Math.max(1e-6, 1 - t * t));
    const y = this.transitionHeight * (1 - safeRoot);
    const slopeMagnitude = (this.transitionHeight * t) / (this.transitionWidth * safeRoot);
    const tangent = new THREE.Vector2(side, slopeMagnitude).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    if (normal.y < 0) normal.multiplyScalar(-1);

    return {
      x: clampedX,
      y,
      region: side < 0 ? 'left-transition' : 'right-transition',
      tangent,
      normal,
    };
  }

  createPoints(segments = 96) {
    const points = [];
    for (let index = 0; index <= segments; index += 1) {
      const alpha = index / segments;
      const x = THREE.MathUtils.lerp(this.leftLip, this.rightLip, alpha);
      points.push(this.sample(x));
    }
    return points;
  }
}
