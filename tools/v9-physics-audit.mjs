import fs from 'node:fs';
import { HalfpipeProfile } from '../src/halfpipe/HalfpipeProfile.js';
import { HalfpipeSimulation } from '../src/halfpipe/HalfpipeSimulation.js';
import { installHalfpipeV9GameplayPatches } from '../src/v9/installHalfpipeV9GameplayPatches.js';

installHalfpipeV9GameplayPatches();

function runPassive(seconds = 20) {
  const profile = new HalfpipeProfile();
  const sim = new HalfpipeSimulation(profile);
  const initial = sim.snapshot();
  for (let i = 0; i < Math.round(seconds / sim.fixedDt); i += 1) sim.stepFixed();
  return { profile, sim, initial, final: sim.snapshot() };
}

function runPumped(seconds = 8) {
  const profile = new HalfpipeProfile();
  const sim = new HalfpipeSimulation(profile);
  sim.reset({ pipeX: -(profile.flatHalfWidth + profile.transitionWidth * 0.72), tangentVelocity: 0 });
  const initialAmplitude = Math.abs(sim.state.pipeX);
  const target = profile.rightLip * 0.9;
  let time = null;
  let max = initialAmplitude;
  for (let i = 0; i < Math.round(seconds / sim.fixedDt); i += 1) {
    const s = sim.snapshot();
    sim.setPumpIntent(s.pipeX * s.tangentVelocity >= 0 ? 1 : -1);
    const next = sim.stepFixed();
    max = Math.max(max, Math.abs(next.pipeX));
    if (time === null && Math.abs(next.pipeX) >= target) time = next.time;
  }
  return { time, max, work: sim.state.pumpWorkTotal, mode: sim.state.mode };
}

function runAir(seconds = 14) {
  const profile = new HalfpipeProfile();
  const sim = new HalfpipeSimulation(profile);
  let firstAir = null;
  for (let i = 0; i < Math.round(seconds / sim.fixedDt); i += 1) {
    const s = sim.snapshot();
    sim.setPumpIntent(s.mode === 'contact' ? (s.pipeX * s.tangentVelocity >= 0 ? 1 : -1) : 0);
    const next = sim.stepFixed();
    if (next.mode === 'airborne' && firstAir === null) firstAir = next.time;
  }
  return { firstAir, highest: sim.state.highestAir, launches: sim.state.airLaunches };
}

function wallX(profile, side, fraction) {
  return side * (profile.flatHalfWidth + profile.transitionWidth * fraction);
}

function runTricks() {
  const profile = new HalfpipeProfile();
  const kick = new HalfpipeSimulation(profile);
  kick.reset({ pipeX: wallX(profile, -1, 0.82), tangentVelocity: -8 });
  kick.setTurnIntent(1);
  const kickStart = kick.stepFixed();
  kick.setTurnIntent(0);
  for (let i = 0; i < 120 && kick.state.surfaceTrickActive; i += 1) kick.stepFixed();

  const aerial = new HalfpipeSimulation(profile);
  aerial.reset({ pipeX: profile.leftLip + 0.03, tangentVelocity: -20 });
  for (let i = 0; i < 60 && aerial.state.mode !== 'airborne'; i += 1) aerial.stepFixed();
  aerial.setTurnIntent(-1);
  for (let i = 0; i < 24; i += 1) aerial.stepFixed();
  aerial.setTurnIntent(0);
  aerial.stepFixed();
  for (let i = 0; i < 900 && aerial.state.mode === 'airborne'; i += 1) aerial.stepFixed();
  return {
    kickStartV: kickStart.tangentVelocity,
    kickEndV: kick.state.tangentVelocity,
    kickCount: kick.state.trickCount,
    aerial: aerial.state.lastTrick,
    aerialCount: aerial.state.trickCount,
  };
}

const passive = runPassive();
const pumped = runPumped();
const air = runAir();
const tricks = runTricks();
const f = passive.final;
const energyRatio = f.specificEnergy / passive.initial.specificEnergy;
const summary = [
  `passive=t${f.time.toFixed(2)}_bc${f.bottomCrossings}_tp${f.turningPoints}_lip${f.lipContacts}_cad${Number(f.bottomCrossingInterval).toFixed(2)}_er${energyRatio.toFixed(3)}`,
  `pump=t${pumped.time === null ? 'null' : pumped.time.toFixed(2)}_max${pumped.max.toFixed(2)}_w${pumped.work.toFixed(2)}_${pumped.mode}`,
  `air=t${air.firstAir === null ? 'null' : air.firstAir.toFixed(2)}_h${air.highest.toFixed(2)}_n${air.launches}`,
  `trick=ks${tricks.kickStartV.toFixed(2)}_ke${tricks.kickEndV.toFixed(2)}_kc${tricks.kickCount}_a${tricks.aerial}_ac${tricks.aerialCount}`,
].join(';').replace(/[^A-Za-z0-9_.;=-]/g, '_').slice(0, 240);
console.log(summary);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
