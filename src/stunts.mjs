import * as THREE from 'three';
import { clamp, ease } from './actor.mjs';

// shortcut: authored cartoon trajectories, add physics only if persistent collisions are needed.
export function createStunts(actors) {
  const homes = actors.map(actor => ({ position: actor.root.position.clone(), quaternion: actor.root.quaternion.clone() }));
  const bursts = actors.map(actor => {
    const group = new THREE.Group(); group.name = 'cartoon-explosion'; group.visible = false;
    const colors = [0xf6e4c5, 0xffd35d, 0xef8050];
    actor.root.traverse(o => { if (o.material?.name.includes('shirt')) colors[2] = o.material.color.getHex(); });
    const geometry = new THREE.IcosahedronGeometry(.075, 0);
    const materials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
    for (let i = 0; i < 18; i++) group.add(new THREE.Mesh(geometry, materials[i % materials.length]));
    actor.root.add(group); return group;
  });
  let state = null;
  function reset() {
    actors.forEach((actor, i) => {
      actor.root.position.copy(homes[i].position); actor.root.quaternion.copy(homes[i].quaternion);
      actor.root.scale.setScalar(1);
      for (const child of actor.root.children) child.visible = child !== bursts[i];
    });
    state = null;
  }
  const offset = (actor, name, x, y, z) => {
    actor.bones[name]?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  };
  function apply(event, time) {
    if (!event || !['punch', 'explode'].includes(event.rail)) return;
    const i = actors.findIndex(a => a.root.name === `actor-${event.actor}`);
    if (i < 0) return;
    const actor = actors[i], p = clamp((time - event.start) / (event.end - event.start));
    state = { action: event.rail, actor: event.actor, target: event.target ?? null, progress: p };
    if (event.rail === 'explode') {
      const burst = bursts[i];
      if (p < .22) {
        const swell = Math.sin(p / .22 * Math.PI / 2) * .22;
        actor.root.scale.set(1 + swell, 1 - swell * .25, 1 + swell);
      } else if (p < .85) {
        for (const child of actor.root.children) child.visible = child === burst;
        const u = (p - .22) / .63;
        burst.children.forEach((piece, j) => {
          const angle = j * 2.399963229728653;
          const y = 1 - 2 * (j + .5) / burst.children.length;
          const radius = Math.sqrt(1 - y * y);
          piece.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius).multiplyScalar(.12 + u * 1.25);
          piece.position.y += 1.15 - u * u * .4;
          piece.rotation.set(u * (j + 1), u * 8, u * 5);
          piece.scale.setScalar(1 - ease((u - .65) / .35));
        });
      } else actor.root.scale.setScalar(ease((p - .85) / .15));
      return;
    }
    const j = actors.findIndex(a => a.root.name === `actor-${event.target}`);
    if (j < 0 || i === j) return;
    const target = actors[j], direction = homes[j].position.clone().sub(homes[i].position).normalize();
    const strike = ease(p / .30) * (1 - ease((p - .34) / .24));
    const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z));
    actor.root.quaternion.slerp(facing, ease(p / .18) * (1 - ease((p - .65) / .35)));
    actor.root.position.addScaledVector(direction, .14 * strike);
    offset(actor, 'upper_armR', 1.45 * strike, 0, -.12 * strike);
    offset(actor, 'forearmR', .6 * Math.sin(Math.PI * strike), 0, 0);
    for (const digit of ['f11R', 'f12R', 'f21R', 'f22R', 'f31R', 'f32R']) offset(actor, digit, .95 * strike, 0, 0);
    offset(target, 'head', 0, Math.sign(direction.x || 1) * .55 * strike, .2 * strike);
    const u = clamp((p - .30) / .70), airborne = Math.sin(Math.PI * u) ** 2;
    target.root.position.addScaledVector(direction, 1.25 * airborne);
    target.root.position.y += .8 * airborne;
    target.root.rotateZ(-Math.sign(direction.x || 1) * Math.PI * 2 * ease(u));
    // Rotate around the hips, keeping the tumbling body above the floor.
    const pivot = new THREE.Vector3(0, .95, 0);
    target.root.position.add(pivot.clone().applyQuaternion(homes[j].quaternion)).sub(pivot.applyQuaternion(target.root.quaternion));
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
      offset(target, `upper_arm${side}`, .9 * airborne, .2 * airborne, sign * airborne);
      offset(target, `forearm${side}`, (1 + Math.sin(u * 16 + sign) * .5) * airborne, 0, 0);
      offset(target, `thigh${side}`, sign * .6 * airborne, 0, sign * .35 * airborne);
      offset(target, `shin${side}`, .8 * airborne, 0, 0);
    }
  }
  return { reset, apply, diagnostics: () => state };
}
