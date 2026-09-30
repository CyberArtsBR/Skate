import { HalfpipeSimulation } from '../halfpipe/HalfpipeSimulation.js';

const INSTALLED = Symbol.for('chimpions.halfpipe.v9.event-patches');

export function installHalfpipeV9EventPatches() {
  const proto = HalfpipeSimulation.prototype;
  if (proto[INSTALLED]) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });

  const originalEmit = proto._emit;
  proto._emit = function emitV9(type, payload = {}) {
    const sample = this._sampleIncreasingX(this.state.pipeX);
    const airborne = this.state.mode === 'airborne';
    const tangentVelocity = Number(this.state.tangentVelocity) || 0;
    const verticalVelocity = Number(this.state.airVerticalVelocity) || 0;
    const worldVelocity = airborne
      ? { x: 0, y: verticalVelocity, z: 0 }
      : {
        x: sample.tangent.x * tangentVelocity,
        y: sample.tangent.y * tangentVelocity,
        z: 0,
      };
    const surfaceNormal = {
      x: Number(sample.normal.x) || 0,
      y: Number(sample.normal.y) || 1,
      z: 0,
    };

    return originalEmit.call(this, type, {
      worldVelocity,
      velocity: worldVelocity,
      surfaceNormal,
      normal: surfaceNormal,
      wallSide: Number(this.state.airSide) || Math.sign(this.state.pipeX) || 0,
      impact: Math.max(0, Number(this.state.landingImpact) || 0),
      airVelocity: airborne ? verticalVelocity : 0,
      pipeX: Number(this.state.pipeX) || 0,
      ...payload,
    });
  };
  return true;
}
