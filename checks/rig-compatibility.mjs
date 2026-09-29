import path from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';

const FILES = [
  ['archon', 'The Archon.glb'],
  ['heretic', 'The Heretic.glb'],
  ['commodore', 'The Commodore.glb'],
  ['pioneer', 'The Pioneer.glb'],
  ['punk', 'The Punk.glb'],
  ['street-fighter', 'The Street Fighter.glb'],
  ['bosun', 'The Bosun.glb'],
  ['adolescent', 'The Adolescent.glb'],
  ['angsty', 'The Angsty.glb'],
  ['apologetic', 'The Apologetic.glb'],
];

const ALIASES = {
  hips: ['ccbasehip','hips','hip','pelvis'],
  spine: ['spine','spine0','spine1','spine01','ccbasespine01'],
  chest: ['chest','upperchest','spine2','spine02','spine3','ccbasespine02'],
  neck: ['neck','neck1','necktwist01','ccbasenecktwist01'],
  head: ['head','ccbasehead'],
  leftShoulder: ['leftshoulder','leftclavicle','leftcollar','ccbaselclavicle'],
  rightShoulder: ['rightshoulder','rightclavicle','rightcollar','ccbaserclavicle'],
  leftThigh: ['leftthigh','leftupleg','leftupperleg','ccbaselthigh'],
  leftShin: ['leftcalf','leftshin','leftleg','leftlowerleg','ccbaselcalf'],
  leftFoot: ['leftfoot','leftankle','ccbaselfoot'],
  rightThigh: ['rightthigh','rightupleg','rightupperleg','ccbaserthigh'],
  rightShin: ['rightcalf','rightshin','rightleg','rightlowerleg','ccbasercalf'],
  rightFoot: ['rightfoot','rightankle','ccbaserfoot'],
  leftUpperArm: ['leftupperarm','leftarm','leftuparm','ccbaselupperarm'],
  leftForearm: ['leftforearm','leftlowerarm','leftelbow','ccbaselforearm'],
  rightUpperArm: ['rightupperarm','rightarm','rightuparm','ccbaserupperarm'],
  rightForearm: ['rightforearm','rightlowerarm','rightelbow','ccbaserforearm'],
};

function norm(name='') {
  return String(name)
    .toLowerCase()
    .replace(/mixamorig\d*/g,'')
    .replace(/cc[_ ]*base[_ ]*/g,'ccbase')
    .replace(/[^a-z0-9]/g,'');
}

function semanticName(name='') {
  let s = norm(name)
    .replace(/^def/,'')
    .replace(/^bip\d*/,'');
  s=s.replace(/^l(?=[a-z])/,'left').replace(/^r(?=[a-z])/,'right');
  return s;
}

function findNode(nodes, slot) {
  const aliases = ALIASES[slot] || [];
  for (const alias of aliases) {
    const exact = nodes.find((n) => norm(n.getName()) === alias);
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const sem = nodes.find((n) => {
      const value = semanticName(n.getName());
      return value === alias || value.endsWith(alias);
    });
    if (sem) return sem;
  }
  return null;
}

function localMatrix(node) {
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3(...node.getTranslation());
  const qv = node.getRotation();
  const q = new THREE.Quaternion(qv[0], qv[1], qv[2], qv[3]);
  const s = new THREE.Vector3(...node.getScale());
  return m.compose(p,q,s);
}

function worldMatrix(node) {
  const chain=[];
  for(let n=node;n;n=n.getParentNode?.() || null) chain.push(n);
  const result=new THREE.Matrix4().identity();
  for(let i=chain.length-1;i>=0;i--) result.multiply(localMatrix(chain[i]));
  return result;
}

function worldPosition(node) {
  return new THREE.Vector3().setFromMatrixPosition(worldMatrix(node));
}

function worldQuaternion(node) {
  const q=new THREE.Quaternion();
  worldMatrix(node).decompose(new THREE.Vector3(),q,new THREE.Vector3());
  return q;
}

function deg(rad){ return rad*180/Math.PI; }
function angleBetweenQ(a,b){ return deg(a.angleTo(b)); }
function direction(a,b) {
  if(!a||!b) return null;
  return worldPosition(b).sub(worldPosition(a)).normalize();
}
function fmtVec(v){ return v ? v.toArray().map(x=>Number(x.toFixed(3))) : null; }

const io = new NodeIO();
const diagnostics={};
for(const [id,file] of FILES){
  const doc=await io.read(path.resolve('public/models/characters',file));
  const nodes=doc.getRoot().listNodes();
  const rig={};
  for(const slot of Object.keys(ALIASES)) rig[slot]=findNode(nodes,slot);

  diagnostics[id]={
    bones:Object.fromEntries(Object.entries(rig).map(([slot,node])=>[
      slot,node?{
        name:node.getName(),
        parent: node.getParentNode?.()?.getName?.() || null,
        ancestors: (() => {
          const names = [];
          for (let p = node.getParentNode?.(); p; p = p.getParentNode?.()) names.push(p.getName());
          return names;
        })(),
        localRotation:node.getRotation().map(x=>Number(x.toFixed(4))),
        worldQ:worldQuaternion(node).toArray().map(x=>Number(x.toFixed(4))),
      }:null
    ])),
    chains:{
      leftThighToShin:fmtVec(direction(rig.leftThigh,rig.leftShin)),
      leftShinToFoot:fmtVec(direction(rig.leftShin,rig.leftFoot)),
      rightThighToShin:fmtVec(direction(rig.rightThigh,rig.rightShin)),
      rightShinToFoot:fmtVec(direction(rig.rightShin,rig.rightFoot)),
      leftArmToForearm:fmtVec(direction(rig.leftUpperArm,rig.leftForearm)),
      rightArmToForearm:fmtVec(direction(rig.rightUpperArm,rig.rightForearm)),
      spineToChest:fmtVec(direction(rig.spine,rig.chest)),
    }
  };
}

const ref=diagnostics.heretic;
for(const [id,d] of Object.entries(diagnostics)){
  d.deltaFromHeretic={};
  for(const slot of ['hips','spine','chest','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot','leftUpperArm','leftForearm','rightUpperArm','rightForearm']){
    const a=d.bones[slot];
    const b=ref.bones[slot];
    if(!a||!b){ d.deltaFromHeretic[slot]=null; continue; }
    const qa=new THREE.Quaternion(...a.worldQ);
    const qb=new THREE.Quaternion(...b.worldQ);
    d.deltaFromHeretic[slot]=Number(angleBetweenQ(qa,qb).toFixed(1));
  }
}

console.log(JSON.stringify(diagnostics,null,2));


console.log('HERETIC_REFERENCE_EXACT=' + JSON.stringify(
  Object.fromEntries(
    Object.entries((await (async () => {
      const doc = await io.read(path.resolve('public/models/characters/The Heretic.glb'));
      const nodes = doc.getRoot().listNodes();
      const rig = {};
      for (const slot of Object.keys(ALIASES)) rig[slot] = findNode(nodes, slot);
      return { bones: Object.fromEntries(
        Object.entries(rig).map(([slot,node]) => [
          slot,
          node ? worldQuaternion(node).toArray() : null,
        ]),
      ) };
    })()).bones),
  ),
));
