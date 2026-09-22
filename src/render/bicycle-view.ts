import * as THREE from 'three';
import { Bicycle, BIKE, TRAINING } from '../physics/bicycle';
import { quat, vec } from '../physics/world';
import { Rider } from './rider';
import type { RidePose } from './ride-pose';

const mat = (color:string, roughness=0.7, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
const palette = {frame:mat('#476e64',0.38,0.35),rubber:mat('#292d2a'),metal:mat('#bdc1b6',0.3,0.7),
  dark:mat('#444a44'),leather:mat('#735c45'),jacket:mat('#788173'),pants:mat('#383f3b'),skin:mat('#bd9477'),shoe:mat('#e0dccc')};
export function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D) {
  const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
export function rod(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,r:number,material:THREE.Material) {
  const m=mesh(new THREE.CylinderGeometry(r,r,1,10),material,parent);placeRod(m,a,b);return m;
}
function placeRod(m:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=a.distanceTo(b);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());}
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

export class BicycleView {
  root=new THREE.Group();
  front=new THREE.Group();
  rearWheel=new THREE.Group();
  frontWheel=new THREE.Group();
  cranks=new THREE.Group();
  pedals:THREE.Mesh[]=[];
  training=new THREE.Group();
  supportWheels:THREE.Group[]=[];
  brakeLevers:THREE.Group[]=[];
  rider:Rider;
  private accents:THREE.Material[]=[];
  constructor(public scene:THREE.Scene) {
    scene.add(this.root);
    const f=palette.frame,m=palette.metal,d=palette.dark;
    // Real diamond frame, chain stays and seat stays.
    const crank=v(0,.405,-.08),seat=v(0,.96,-.25),head=v(0,.96,.43),lowHead=v(0,.74,.48),rear=v(0,.345,-.58);
    for(const [a,b,r] of [[crank,seat,.029],[seat,head,.025],[crank,lowHead,.033],[head,lowHead,.031]] as const)rod(this.root,a,b,r,f);
    for(const sign of [-1,1]){
      rod(this.root,v(sign*.055,seat.y-.08,seat.z),v(sign*.062,rear.y,rear.z),.013,f);
      rod(this.root,v(sign*.038,crank.y,crank.z),v(sign*.062,rear.y,rear.z),.016,f);
    }
    rod(this.root,seat,v(0,1.025,-.27),.018,m);
    const saddle=mesh(new THREE.BoxGeometry(.16,.045,.26),palette.leather,this.root);saddle.position.set(0,1.035,-.25);
    const saddleNose=mesh(new THREE.BoxGeometry(.08,.045,.16),palette.leather,this.root);saddleNose.position.set(0,1.035,-.10);
    this.root.add(this.rearWheel,this.front,this.cranks);
    this.rearWheel.position.copy(rear);this.makeWheel(this.rearWheel);
    this.front.position.set(0,.345,.58);this.front.add(this.frontWheel);this.makeWheel(this.frontWheel);
    for(const side of [-1,1])rod(this.front,v(side*.054,0,0),v(side*.038,.40,-.10),.017,f);
    rod(this.front,v(0,.39,-.10),v(0,.70,-.16),.021,m);
    rod(this.front,v(0,.70,-.16),v(0,.72,-.06),.022,d);
    rod(this.front,v(-.32,.72,-.06),v(.32,.72,-.06),.018,m);
    for(const side of [-1,1]){
      rod(this.front,v(side*.22,.72,-.06),v(side*.34,.72,-.02),.027,palette.rubber);
      const lever=new THREE.Group();lever.position.set(side*.21,.715,-.01);this.front.add(lever);
      rod(lever,v(0,0,0),v(side*.10,-.005,-.055),.009,d);this.brakeLevers[side===1?0:1]=lever;
      const cable=new THREE.CatmullRomCurve3([v(side*.20,.70,-.05),v(side*.16,.56,.15),v(side*.04,.45,.02)]);
      mesh(new THREE.TubeGeometry(cable,12,.003,4,false),palette.rubber,this.front);
    }
    this.cranks.position.copy(crank);
    rod(this.root,v(-.20,crank.y,crank.z),v(.20,crank.y,crank.z),.016,m);
    const ring=mesh(new THREE.TorusGeometry(.096,.012,6,36),d,this.root);ring.rotation.y=Math.PI/2;ring.position.set(-.068,crank.y,crank.z);
    const cassette=mesh(new THREE.CylinderGeometry(.052,.052,.03,18),m,this.root);cassette.rotation.z=Math.PI/2;cassette.position.set(-.062,rear.y,rear.z);
    rod(this.root,v(-.075,.49,-.08),v(-.075,.39,-.58),.006,d);
    rod(this.root,v(-.075,.31,-.08),v(-.075,.30,-.58),.006,d);
    for(let i=0;i<2;i++){
      const side=i===0?1:-1, angle=i*Math.PI;
      rod(this.cranks,v(side*.08,0,0),v(side*.17,-Math.sin(angle)*BIKE.crank,Math.cos(angle)*BIKE.crank),.012,m);
      const p=mesh(new THREE.BoxGeometry(.105,.025,.075),palette.rubber,this.root);this.pedals.push(p);
    }
    this.root.add(this.training);
    for(const sign of [1,-1]){
      const axle=v(sign*TRAINING.spread,TRAINING.height,TRAINING.z);
      rod(this.training,v(sign*.07,.345,-.58),v(sign*.36,.28,TRAINING.z),.016,m);
      rod(this.training,v(sign*.36,.28,TRAINING.z),axle,.016,m);
      const support=new THREE.Group();support.position.copy(axle);this.training.add(support);this.supportWheels.push(support);
      const tire=mesh(new THREE.TorusGeometry(TRAINING.radius-.018,.018,8,32),palette.rubber,support);tire.rotation.y=Math.PI/2;
      const hub=mesh(new THREE.CylinderGeometry(.08,.08,.026,24),f,support);hub.rotation.z=Math.PI/2;
      rod(support,v(-.033,0,0),v(.033,0,0),.02,m);
      for(let n=0;n<5;n++){const a=n*Math.PI*.4;rod(support,v(sign*.02,0,0),v(sign*.02,Math.sin(a)*.073,Math.cos(a)*.073),.004,m);}
    }
    this.rider=new Rider(this.root);
  }
  private makeWheel(group:THREE.Group) {
    const tire=mesh(new THREE.TorusGeometry(.32,.025,10,48),palette.rubber,group);tire.rotation.y=Math.PI/2;
    const rim=mesh(new THREE.TorusGeometry(.297,.009,6,48),palette.metal,group);rim.rotation.y=Math.PI/2;
    rod(group,v(-.066,0,0),v(.066,0,0),.021,palette.metal);
    for(let n=0;n<24;n++){
      const a=n/24*Math.PI*2;
      rod(group,v(n%2===0?-.032:.032,0,0),v(0,Math.sin(a)*.297,Math.cos(a)*.297),.0015,palette.metal);
    }
    const valve=mesh(new THREE.BoxGeometry(.018,.02,.036),palette.leather,group);valve.position.z=.30;
  }
  update(bike:RidePose,firstPerson:boolean) {
    this.root.position.copy(vec(bike.body.translation()));this.root.quaternion.copy(quat(bike.body.rotation()));
    this.front.rotation.y=bike.steer;
    this.brakeLevers.forEach((lever,i)=>lever.rotation.y=(i===0?1:-1)*bike.brakes[i===0?1:0]*.5);
    this.rearWheel.rotation.x=bike.wheels[0].angle;this.frontWheel.rotation.x=bike.wheels[1].angle;
    this.cranks.rotation.x=bike.crankAngle;
    this.training.visible=bike.difficulty==='training';
    this.supportWheels.forEach((w,i)=>w.rotation.x=bike.trainingWheels[i].angle);
    const feet:THREE.Vector3[]=[],hands:THREE.Vector3[]=[];
    for(let i=0;i<2;i++) {
      const side=i===0?1:-1, a=bike.crankAngle+i*Math.PI;
      const pedal=v(side*.18,.405-Math.sin(a)*BIKE.crank,-.08+Math.cos(a)*BIKE.crank);
      this.pedals[i].position.copy(pedal);
      let foot=pedal.clone().add(v(0,.10,-.035));
      if(bike.feet[i]) {
        foot=v(side*.36+bike.bodyX*.3,.10,-.15);
        if(bike.footContacts[i]) {foot.copy(bike.footWorld[i]).sub(this.root.position).applyQuaternion(this.root.quaternion.clone().invert());foot.y+=.045;}
        const duration=bike.difficulty==='extreme'?.27:.42;
        foot.z-=Math.sin((duration-bike.pushes[i])/duration*Math.PI)*.11*(bike.pushes[i]>0?1:0);
      }
      feet.push(foot);
      hands.push(v(side*.29,.75,-.13).applyAxisAngle(v(0,1,0),bike.steer).add(this.front.position));
    }
    this.rider.update(bike,firstPerson,feet,hands);
  }
  headPosition(bike:Bicycle) {return bike.localToWorld(v(bike.bodyX,1.61-bike.feedback.bump*.35,.18+bike.bodyZ+bike.feedback.push));}
  setAccent(color:string){
    const accent=palette.frame.clone();accent.color.set(color);this.accents.push(accent);
    this.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.material===palette.frame)o.material=accent;});
  }
  dispose(){
    this.root.removeFromParent();
    const release=()=>{const geometries=new Set<THREE.BufferGeometry>();this.root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());this.accents.forEach(m=>m.dispose());this.rider.dispose();};
    void this.rider.ready.then(release,release);
  }
}
