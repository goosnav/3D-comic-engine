import * as THREE from 'three';
import { clamp, ease } from './actor.mjs';
import { ACTOR_ACTIONS } from './contracts.mjs';

// shortcut: deterministic cartoon trajectories; use physics only for persistent collisions.
export function createStunts(actors) {
  const homes = actors.map(actor => ({position:actor.root.position.clone(),quaternion:actor.root.quaternion.clone()}));
  const bursts = actors.map(actor => {
    const group = new THREE.Group(); group.name='cartoon-explosion'; group.visible=false;
    const colors=[0xf6e4c5,0xffd35d,0xef8050];
    actor.root.traverse(o=>{if(o.material?.name.includes('shirt'))colors[2]=o.material.color.getHex();});
    const geometry=new THREE.IcosahedronGeometry(.075,0);
    const materials=colors.map(color=>new THREE.MeshStandardMaterial({color,roughness:.85}));
    for(let i=0;i<42;i++)group.add(new THREE.Mesh(geometry,materials[i%materials.length]));
    actor.root.add(group);return group;
  });
  let state=null;
  function reset() {
    actors.forEach((actor,i)=>{
      actor.root.position.copy(homes[i].position);actor.root.quaternion.copy(homes[i].quaternion);actor.root.scale.setScalar(1);
      for(const child of actor.root.children)child.visible=child!==bursts[i];
    });state=null;
  }
  const offset=(actor,name,x=0,y=0,z=0)=>actor.bones[name]?.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));
  function apply(event,time) {
    if(!event||!ACTOR_ACTIONS.includes(event.rail))return;
    const i=actors.findIndex(a=>a.root.name===`actor-${event.actor}`);if(i<0)return;
    const actor=actors[i], age=time-event.start, p=clamp(age/(event.end-event.start)), tick=Math.floor(age*15);
    state={action:event.rail,actor:event.actor,target:event.target??null,progress:p};
    if(event.rail==='flatten') {
      const squash=ease((p-.18)/.055);
      actor.root.scale.set(1+squash*.8,1-squash*.94,1+squash*.55);
      offset(actor,'upper_armL',0,0,1.5*squash);offset(actor,'upper_armR',0,0,-1.5*squash);return;
    }
    if(event.rail==='head_spin') {offset(actor,'head',0,tick*Math.PI*.62,0);return;}
    if(event.rail==='head_jerk') {
      offset(actor,'head',Math.sin(tick*19.31)*1.2,Math.sin(tick*7.13)*2.5,Math.sin(tick*11.77)*1.4);return;
    }
    if(event.rail==='walk_away') {
      const walk=Math.max(0,p-.08), direction=i===0?-1:1;
      actor.root.rotation.y=direction*Math.PI/2;
      actor.root.position.x+=direction*walk*18;actor.root.position.y+=Math.abs(Math.sin(tick*1.8))*.07;
      for(const [side,sign] of [['L',1],['R',-1]]) {
        offset(actor,`thigh${side}`,sign*Math.sin(tick*1.8)*.9);offset(actor,`shin${side}`,Math.max(0,sign*Math.sin(tick*1.8))*.9);
        offset(actor,`upper_arm${side}`,-sign*Math.sin(tick*1.8)*1.1);
      }return;
    }
    if(event.rail==='nose_off') {
      if(!actor.nose)return;
      actor.root.updateMatrixWorld(true);
      const detached=ease((p-.18)/.04)*(1-ease((p-.78)/.04));
      actor.nose.position.add(new THREE.Vector3(.30,-.12,.30).multiplyScalar(detached));
      actor.nose.rotation.z=detached*(.4+Math.sin(tick*2)*.35);
      actor.root.updateMatrixWorld(true);
      const reach=ease(p/.15)*(1-ease((p-.84)/.12));
      const target=actor.nose.getWorldPosition(new THREE.Vector3());
      actor.grip([actor.bones.handL.getWorldPosition(new THREE.Vector3()),target],reach);
      for(const digit of ['f11R','f12R','f21R','f22R','f31R','f32R'])offset(actor,digit,.9*reach);
      return;
    }
    if(event.rail==='explode') {
      const burst=bursts[i];
      if(p<.16) {
        const swell=p<.10?.08: .65;
        actor.root.scale.set(1+swell,1-swell*.35,1+swell);
        offset(actor,'head',Math.sin(tick*13)*.6,Math.cos(tick*7)*.6,0);
      } else {
        for(const child of actor.root.children)child.visible=child===burst;
        const u=(p-.16)/.84;
        burst.children.forEach((piece,j)=>{
          const angle=j*2.399963229728653,y=1-2*(j+.5)/burst.children.length,radius=Math.sqrt(1-y*y);
          piece.position.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius).multiplyScalar(.15+u*(14+j%5*2));
          piece.position.y+=1.2+u*3-u*u*3;
          piece.rotation.set(tick*(j+1)*.3,tick*1.7,tick*.9);
          piece.scale.set(1+(j%3)*1.5,.5+(j%4),.7);
        });
      }return;
    }
    const j=actors.findIndex(a=>a.root.name===`actor-${event.target}`);if(j<0||i===j)return;
    const target=actors[j],direction=homes[j].position.clone().sub(homes[i].position).normalize();
    const strike=ease((p-.12)/.035)*(1-ease((p-.24)/.06));
    const facing=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(direction.x,direction.z));
    actor.root.quaternion.slerp(facing,ease(p/.06));actor.root.position.addScaledVector(direction,.23*strike);
    offset(actor,'upper_armR',1.65*strike,0,-.12*strike);offset(actor,'forearmR',.8*(1-strike),0,0);
    for(const digit of ['f11R','f12R','f21R','f22R','f31R','f32R'])offset(actor,digit,.95);
    const u=clamp((p-.155)/.845),airborne=u>0?1:0;
    target.root.position.addScaledVector(direction,36*u);target.root.position.y+=16*u;
    target.root.rotateZ(-Math.sign(direction.x||1)*Math.PI*18*u);
    const pivot=new THREE.Vector3(0,.95,0);
    target.root.position.add(pivot.clone().applyQuaternion(homes[j].quaternion)).sub(pivot.applyQuaternion(target.root.quaternion));
    for(const [side,sign]of [['L',1],['R',-1]]) {
      offset(target,`upper_arm${side}`,Math.sin(tick*2+sign)*2*airborne,0,sign*1.4*airborne);
      offset(target,`forearm${side}`,(1+Math.sin(tick*3+sign))*airborne);
      offset(target,`thigh${side}`,sign*.9*airborne,0,sign*.6*airborne);offset(target,`shin${side}`,1.4*airborne);
    }
  }
  return {reset,apply,diagnostics:()=>state};
}
