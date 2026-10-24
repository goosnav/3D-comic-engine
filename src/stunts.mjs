import * as THREE from 'three';
import { clamp, ease } from './actor.mjs';
import { sampleGesture } from './gesture-performance.mjs';
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
    const actor=actors[i], age=time-event.start, p=clamp(age/(event.end-event.start)), tick=Math.floor(age*24);
    state={action:event.rail,actor:event.actor,target:event.target??null,progress:p};
    if(event.rail==='dance') {
      const pose=sampleGesture({gesture:'arm_flail',time:age,start:0,duration:event.end-event.start,seed:i+91});
      for(const [bone,angles] of Object.entries(pose))offset(actor,bone,...angles);
      actor.root.position.add(new THREE.Vector3(Math.sin(tick*17)*.7,Math.abs(Math.sin(tick*11))*.45,Math.sin(tick*23)*.4));
      actor.root.rotation.y+=tick*.8+Math.sin(tick*13)*1.2;
      for(const [side,sign] of [['L',1],['R',-1]]) {
        offset(actor,`thigh${side}`,Math.sin(tick*7+sign)*2,0,sign*Math.cos(tick*19)*1.2);
        offset(actor,`shin${side}`,Math.sin(tick*31+sign)*2.4);
        actor.bones[`forearm${side}`].scale.y=1+Math.abs(Math.sin(tick*29+sign))*.7;
      }return;
    }
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
          piece.position.set(Math.cos(angle)*radius,y,Math.sin(angle)*radius).multiplyScalar(.15+Math.pow(u,.55)*(38+j%5*6));
          piece.position.y+=1.2+u*3-u*u*3;
          piece.rotation.set(tick*(j+1)*.3,tick*1.7,tick*.9);
          piece.scale.set(1+(j%3)*3,.5+(j%4)*2,.7);
        });
      }return;
    }
    const j=actors.findIndex(a=>a.root.name===`actor-${event.target}`);if(j<0||i===j)return;
    const target=actors[j],direction=homes[j].position.clone().sub(homes[i].position).normalize();
    if(event.rail==='ascend') {
      const lift=Math.max(0,p-.12);
      actor.root.position.y+=95*Math.pow(lift,1.35);
      offset(actor,'upper_armL',0,0,1.65);offset(actor,'upper_armR',0,0,-1.65);
      actor.root.rotation.y+=Math.floor(lift*35)*.13;
      actor.root.updateMatrixWorld(true);target.root.updateMatrixWorld(true);
      const sight=actor.bones.head.getWorldPosition(new THREE.Vector3()).sub(target.bones.head.getWorldPosition(new THREE.Vector3()));
      const pitch=-Math.atan2(sight.y,Math.hypot(sight.x,sight.z));
      offset(target,'head',pitch,Math.atan2(sight.x,sight.z)-target.root.rotation.y,0);
      state.trackingPitch=pitch;return;
    }
    if(['nose_touch','high_five','handshake'].includes(event.rail)) {
      for(const [who,dir] of [[actor,direction],[target,direction.clone().negate()]]) {
        who.root.rotation.y=Math.atan2(dir.x,dir.z);
        // Contact is solved after facing, so costume dimensions cannot cause a miss.
        who.root.updateMatrixWorld(true);
      }
      const contact=clamp((p-.08)/.035);
      if(event.rail==='nose_touch') {
        const tips=[actor,target].map(who=>{
          if(!who.nose)return who.bones.head.getWorldPosition(new THREE.Vector3());
          who.nose.geometry.computeBoundingBox();
          const box=who.nose.geometry.boundingBox,tip=box.getCenter(new THREE.Vector3());
          tip.z=box.max.z;return who.nose.localToWorld(tip);
        });
        const correction=tips[1].clone().sub(tips[0]).multiplyScalar(.5*contact);
        actor.root.position.add(correction);target.root.position.sub(correction);
        const bob=Math.sin(tick*17)*.035*contact;
        actor.root.position.y+=bob;target.root.position.y+=bob;
      } else {
        const meeting=homes[i].position.clone().add(homes[j].position).multiplyScalar(.5);
        meeting.y=event.rail==='high_five'?1.6:1.06+Math.sin(tick*13)*.12;
        meeting.z+=.07;
        actor.root.position.addScaledVector(direction,.1*contact);target.root.position.addScaledVector(direction,-.1*contact);
        for(const who of [actor,target]) {
          who.root.updateMatrixWorld(true);
          who.grip([who.bones.handL.getWorldPosition(new THREE.Vector3()),meeting],contact);
          if(event.rail==='handshake')for(const digit of ['f11R','f12R','f21R','f22R','f31R','f32R'])offset(who,digit,.65*contact);
          else offset(who,'handR',0,0,Math.PI/2);
        }
      }
      return;
    }
    const strike=ease((p-.08)/.012);

    const facing=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(direction.x,direction.z));
    actor.root.quaternion.slerp(facing,ease(p/.06));actor.root.position.addScaledVector(direction,.42*strike);
    offset(actor,'upper_armR',2.35*strike,0,-.12*strike);offset(actor,'forearmR',.8*(1-strike),0,0);
    actor.bones.forearmR.scale.y=1+.8*strike;
    for(const digit of ['f11R','f12R','f21R','f22R','f31R','f32R'])offset(actor,digit,.95);
    const u=clamp((p-.092)/.908),airborne=u>0?1:0;
    target.root.position.addScaledVector(direction,110*Math.pow(u,.55));target.root.position.y+=38*Math.pow(u,.65);
    target.root.rotateZ(-Math.sign(direction.x||1)*Math.PI*34*u);
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
