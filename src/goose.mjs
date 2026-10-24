import * as THREE from 'three';

// A low-poly white goose with an orange bill and feet, built from primitives so
// it needs no asset file. Every part is a rigid pivot (no skinning): the pose is
// a pure function of the values passed to pose(), never of previous frames.
// Faces +Z and stands on y = 0, like the actors. About 0.9 m tall.
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...extra });

export function createGoose() {
  const white = flat(0xf3f0e8), shade = flat(0xd9d4c8), orange = flat(0xff8a1f), dark = flat(0x141414, { roughness: .4 });
  const root = new THREE.Group(); root.name = 'extra-goose';
  const part = (geometry, material, parent, position = [0, 0, 0], scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const pivot = (parent, position, name) => {
    const group = new THREE.Group(); group.name = name; group.position.set(...position);
    parent.add(group); return group;
  };
  const ball = new THREE.IcosahedronGeometry(1, 1);
  // The body pivots at the hips so waddles, falls and spins read correctly.
  const body = pivot(root, [0, .31, 0], 'goose-body');
  part(ball, white, body, [0, 0, 0], [.20, .18, .32]);
  part(ball, shade, body, [0, -.06, -.04], [.17, .11, .26]);
  part(new THREE.ConeGeometry(.09, .2, 5), white, body, [0, .07, -.33], [1, 1, .55]).rotation.x = -1.25;
  const wings = [-1, 1].map(sign => {
    const wing = pivot(body, [sign * .17, .06, .06], `goose-wing-${sign < 0 ? 'R' : 'L'}`);
    part(ball, shade, wing, [sign * .02, 0, -.13], [.05, .11, .25]);
    return { wing, sign };
  });
  // Three neck segments make the S-curve; each pivot bends the ones above it.
  const neck = [];
  let parent = pivot(body, [0, .10, .22], 'goose-neck-0');
  for (let i = 0; i < 3; i++) {
    part(new THREE.CylinderGeometry(.05 - i * .004, .062 - i * .004, .17, 6), white, parent, [0, .08, 0]);
    part(ball, white, parent, [0, 0, 0], [.06 - i * .004, .06 - i * .004, .06 - i * .004]); // joint, no gaps
    neck.push(parent);
    if (i < 2) parent = pivot(parent, [0, .15, 0], `goose-neck-${i + 1}`);
  }
  const head = pivot(parent, [0, .17, 0], 'goose-head');
  part(ball, white, head, [0, 0, .01], [.075, .07, .095]);
  for (const sign of [-1, 1]) part(new THREE.IcosahedronGeometry(.016, 0), dark, head, [sign * .06, .025, .035]);
  // A big orange bill (the whole point of the goose), with a hinged lower jaw.
  const bill = pivot(head, [0, -.012, .075], 'goose-bill');
  part(new THREE.ConeGeometry(.045, .15, 6), orange, bill, [0, .01, .065], [1, 1, .5]).rotation.x = Math.PI / 2;
  part(new THREE.IcosahedronGeometry(.012, 0), dark, bill, [0, .02, .135]); // nail
  const jaw = pivot(bill, [0, -.01, 0], 'goose-jaw');
  part(new THREE.ConeGeometry(.036, .125, 6), orange, jaw, [0, -.006, .055], [1, .6, .45]).rotation.x = Math.PI / 2;
  const legs = [-1, 1].map(sign => {
    const leg = pivot(root, [sign * .085, .22, .02], `goose-leg-${sign < 0 ? 'R' : 'L'}`);
    part(new THREE.CylinderGeometry(.02, .016, .2, 5), orange, leg, [0, -.1, 0]);
    const foot = pivot(leg, [0, -.205, 0], 'goose-foot');
    // A flat webbed paddle pointing forward.
    part(new THREE.CylinderGeometry(.1, .025, .014, 3), orange, foot, [0, 0, .055]).rotation.y = Math.PI;
    return { leg, foot, sign };
  });
  const rest = new Map();
  // The root belongs to the caller (placement); pose() only resets the parts.
  root.traverse(o => { if (o !== root) rest.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }); });

  // state: { walk (cycle phase), stride 0..1, honk 0..1, flap 0..1, flapPhase,
  //          neck (-1 low/peck .. 1 tall), lean, wingsOut 0..1, stiff 0..1, look }
  function pose(state = {}) {
    for (const [o, r] of rest) { o.position.copy(r.p); o.rotation.copy(r.r); o.scale.copy(r.s); }
    const { walk = 0, stride = 0, honk = 0, flap = 0, flapPhase = 0, neck: reach = 0, lean = 0, wingsOut = 0, stiff = 0, look = 0 } = state;
    const step = Math.sin(walk) * stride * (1 - stiff);
    body.rotation.z = step * .22; body.rotation.x = lean;
    body.position.y += Math.abs(Math.sin(walk)) * .03 * stride * (1 - stiff);
    for (const { leg, foot, sign } of legs) {
      leg.rotation.x = sign * step * .7;
      foot.rotation.x = -leg.rotation.x * .6;
    }
    // Honking juts the neck forward and low; reach lifts it tall or dips it to peck.
    const jut = honk * .9;
    neck[0].rotation.x = .38 + jut * .5 - reach * .3 + (reach < 0 ? -reach * 1.2 : 0);
    neck[1].rotation.x = -.7 + jut * .45 + reach * .35 + (reach < 0 ? -reach * .5 : 0);
    neck[2].rotation.x = .3 + jut * .3 - reach * .2 + (reach < 0 ? -reach * .4 : 0);
    neck[0].rotation.y = look * .5; head.rotation.y = look * .4;
    head.rotation.x = .15 - jut * .9 + reach * .1;
    jaw.rotation.x = honk * (.45 + .3 * Math.sin(flapPhase * 3));
    for (const { wing, sign } of wings) {
      const beat = flap * Math.sin(flapPhase) * 1.1;
      // Negative roll swings the left (+x) wing's upper edge outward.
      wing.rotation.z = -sign * (wingsOut * 1.35 + Math.max(0, beat) + honk * .35);
      wing.rotation.y = sign * (wingsOut * .2);
    }
  }
  function diagnostics() {
    root.updateMatrixWorld(true);
    return { position: root.position.toArray(), billOpen: jaw.rotation.x, bill: bill.getWorldPosition(new THREE.Vector3()).toArray() };
  }
  pose();
  return { root, pose, diagnostics, parts: { body, neck, head, bill, jaw, wings, legs } };
}
