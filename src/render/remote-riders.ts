import * as THREE from 'three';
import { BicycleView } from './bicycle-view';
import type { RidePose } from './ride-pose';
import type { Member, Pose, RideFrame } from '../multiplayer/protocol';
import type { Difficulty } from '../difficulty';

const body=(pose:Pose)=>({translation:()=>({x:pose.p[0],y:pose.p[1],z:pose.p[2]}),rotation:()=>({x:pose.q[0],y:pose.q[1],z:pose.q[2],w:pose.q[3]})});
interface Remote {view:BicycleView;position:THREE.Vector3;rotation:THREE.Quaternion;fallen:boolean;label:THREE.Sprite;texture:THREE.CanvasTexture;canvas:HTMLCanvasElement;caption:string;color:string}
export class RemoteRiders {
  private riders=new Map<string,Remote>();
  constructor(private scene:THREE.Scene){}
  private create(member:Member){
    const view=new BicycleView(this.scene);let hash=0;for(const c of member.id)hash=(hash*31+c.charCodeAt(0))|0;
    const color=`hsl(${Math.abs(hash)%360}, 40%, 40%)`;view.setAccent(color);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=100;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));
    label.scale.set(1.5,.293,1);this.scene.add(label);
    const remote:Remote={view,position:new THREE.Vector3(...member.frame!.p),rotation:new THREE.Quaternion(...member.frame!.q),fallen:member.frame!.fallen,label,texture,canvas,caption:'',color};
    void view.rider.ready.catch(()=>{view.root.visible=false;});this.riders.set(member.id,remote);return remote;
  }
  update(members:Map<string,Member>,self:string,difficulty:Difficulty,dt:number){
    for(const [id,r] of this.riders)if(id===self||!members.has(id)){r.view.dispose();r.label.removeFromParent();r.label.material.dispose();r.texture.dispose();this.riders.delete(id);}
    for(const member of members.values()){
      const f=member.frame;if(member.id===self||!f)continue;
      const r=this.riders.get(member.id)||this.create(member),target=new THREE.Vector3(...f.p),q=new THREE.Quaternion(...f.q);
      const snap=r.position.distanceToSquared(target)>9||r.fallen!==f.fallen;
      r.position.lerp(target,snap?1:1-Math.exp(-dt*18));r.rotation.slerp(q,snap?1:1-Math.exp(-dt*18));r.fallen=f.fallen;
      const pose:Pose={p:r.position.toArray() as Pose['p'],q:r.rotation.toArray() as Pose['q']};
      const render:RidePose={body:body(pose),steer:f.steer,crankAngle:f.crank,difficulty,bodyX:f.body[0],bodyZ:f.body[1],
        feet:f.feet,footContacts:f.contacts,footWorld:f.foot.map(p=>new THREE.Vector3(...p)),pushes:f.pushes,brakes:f.brakes,
        feedback:{bump:f.feedback[0],push:f.feedback[1]},fallen:f.fallen,ragdoll:f.ragdoll.map(body),
        wheels:f.wheels.map(angle=>({angle})),trainingWheels:f.wheels.map(angle=>({angle}))};
      r.view.update(render,false);r.label.position.copy(r.position).add(new THREE.Vector3(0,f.fallen?1:2,0));
      const caption=member.name+(f.paused?' · 暂停':f.fallen?' · 摔倒':` · ${f.distance.toFixed(0)} m`);
      if(caption!==r.caption){r.caption=caption;const ctx=r.canvas.getContext('2d')!;ctx.clearRect(0,0,512,100);ctx.fillStyle='#f2f1e7e8';ctx.beginPath();ctx.roundRect(0,0,512,100,24);ctx.fill();ctx.fillStyle=r.color;ctx.fillRect(0,25,8,50);ctx.fillStyle='#303d34';ctx.font='500 38px Microsoft YaHei, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(caption,256,51,480);r.texture.needsUpdate=true;}
    }
  }
  diagnostics(){return {count:this.riders.size,loaded:[...this.riders.values()].every(r=>r.view.rider.loaded)};}
}
