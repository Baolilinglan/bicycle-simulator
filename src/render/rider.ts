import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import restPose from '../../assets/rider/rest-pose.json';
import type { Bicycle } from '../physics/bicycle';
import { quat, vec } from '../physics/world';

type BoneName = keyof typeof restPose;
const V = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z);
const Y = V(0,1,0);

/** Blender-authored, continuous skinned garments. Only the existing simulation drives this rig. */
export class Rider {
  root = new THREE.Group();
  ready: Promise<void>;
  loaded = false;
  private bones = new Map<BoneName,THREE.Bone>();
  private restRotations = new Map<BoneName,THREE.Quaternion>();
  private headMeshes: THREE.Object3D[]=[];
  private inverse = new THREE.Matrix4();
  private baseQ = new THREE.Quaternion();
  constructor(parent:THREE.Object3D){
    this.root.name='DetailedRider';parent.add(this.root);
    this.ready=this.load();
  }
  private async load(){
    const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(`${import.meta.env.BASE_URL}models/rider.glb`);
    // Cache bind orientations before attaching to the bicycle's changing transform.
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o=>{
      if(o instanceof THREE.Bone && o.name in restPose){
        this.bones.set(o.name as BoneName,o);
        this.restRotations.set(o.name as BoneName,o.getWorldQuaternion(new THREE.Quaternion()));
      }
      if(o instanceof THREE.Mesh){
        o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
      }
      if(/^Rider_(Head|Helmet|Neck)/.test(o.name))this.headMeshes.push(o);
    });
    for(const name of Object.keys(restPose))if(!this.bones.has(name as BoneName))throw new Error(`Missing rider bone: ${name}`);
    this.root.add(gltf.scene);this.loaded=true;
  }
  private bone(name:BoneName,start:THREE.Vector3,end:THREE.Vector3,orientation?:THREE.Quaternion){
    const b=this.bones.get(name)!;
    const rest=restPose[name];
    const oldDirection=new THREE.Vector3(...rest.tail as [number,number,number])
      .sub(new THREE.Vector3(...rest.head as [number,number,number])).normalize();
    const q=orientation
      ? orientation.clone().multiply(this.restRotations.get(name)!)
      : new THREE.Quaternion().setFromUnitVectors(oldDirection,end.clone().sub(start).normalize()).multiply(this.restRotations.get(name)!);
    const targetWorld=start.clone().applyMatrix4(this.root.matrixWorld);
    b.position.copy(b.parent!.worldToLocal(targetWorld));
    const parentQ=b.parent!.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.copy(parentQ.invert().multiply(this.baseQ.clone().multiply(q)));
    b.updateMatrixWorld(true);
  }
  private chain(side:'L'|'R',kind:'leg'|'arm',a:THREE.Vector3,end:THREE.Vector3,pole:THREE.Vector3,endQ=new THREE.Quaternion()){
    const lengths=kind==='leg'?[.45,.44]:[.285,.27];
    const direction=end.clone().sub(a),distance=Math.min(direction.length(),lengths[0]+lengths[1]-.001);direction.normalize();
    const along=(distance**2+lengths[0]**2-lengths[1]**2)/(2*Math.max(.001,distance));
    const bend=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();
    const joint=a.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,lengths[0]**2-along**2)));
    const upper=`${kind==='leg'?'Thigh':'UpperArm'}_${side}` as BoneName;
    const lower=`${kind==='leg'?'Shin':'Forearm'}_${side}` as BoneName;
    const extremity=`${kind==='leg'?'Foot':'Hand'}_${side}` as BoneName;
    this.bone(upper,a,joint);this.bone(lower,joint,end);
    this.bone(extremity,end,end.clone().add(V(0,0,.1)),endQ);
  }
  update(b:Bicycle,firstPerson:boolean,feet:THREE.Vector3[],hands:THREE.Vector3[]){
    if(!this.loaded)return;
    this.root.updateWorldMatrix(true,true);
    this.inverse.copy(this.root.matrixWorld).invert();this.root.getWorldQuaternion(this.baseQ);
    this.headMeshes.forEach(m=>m.visible=!firstPerson||b.fallen);
    if(b.fallen){this.ragdoll(b);return;}
    const hip=V(b.bodyX*.55,.97,-.24+b.bodyZ*.25);
    const shoulder=V(b.bodyX,1.38-b.feedback.bump*.65,.03+b.bodyZ+b.feedback.push);
    this.bone('Hips',hip,hip.clone().add(Y));
    this.bone('Spine',hip,shoulder);
    const neck=shoulder.clone().add(V(0,.04,.01));
    const head=shoulder.clone().add(V(0,.22,.045));
    this.bone('Neck',neck,head);
    this.bone('Head',head,head.clone().add(Y),new THREE.Quaternion());
    for(let i=0;i<2;i++){
      const side=i===0?'L':'R',sign=i===0?1:-1;
      this.chain(side,'leg',hip.clone().add(V(sign*.105,0,0)),feet[i],V(sign*.10,0,1));
      const handQ=new THREE.Quaternion().setFromAxisAngle(Y,b.steer);
      this.chain(side,'arm',shoulder.clone().add(V(sign*.185,-.012,0)),hands[i],V(sign*.7,-.2,-.5),handQ);
      const pivot=hands[i].clone().add(V(0,.002,.035).applyQuaternion(handQ));
      this.bone(`Fingers_${side}`,pivot,pivot.clone().add(Y),handQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1,0,0),b.brakes[i===0?1:0]*.5)));
    }
  }
  private ragdoll(b:Bicycle){
    const point=(index:number,p:THREE.Vector3)=>p.applyQuaternion(quat(b.ragdoll[index].rotation())).add(vec(b.ragdoll[index].translation())).applyMatrix4(this.inverse);
    const orientation=(index:number)=>this.baseQ.clone().invert().multiply(quat(b.ragdoll[index].rotation()));
    const hip=point(2,V(0,0,0)),shoulder=point(0,V(0,.18,0)),head=point(1,V(0,0,0));
    this.bone('Hips',hip,hip.clone().add(Y),orientation(2));
    this.bone('Spine',hip,shoulder);
    this.bone('Neck',point(0,V(0,.21,0)),head);
    this.bone('Head',head,head.clone().add(Y),orientation(1));
    for(let i=0;i<2;i++){
      const side=i===0?'L':'R',sign=i===0?1:-1,leg=i===0?4:3,arm=i===0?6:5;
      const ankle=point(leg,V(0,-.32,.025)),hand=point(arm,V(0,-.26,.04));
      this.chain(side,'leg',point(2,V(sign*.10,-.01,0)),ankle,point(leg,V(0,0,.15)).sub(ankle),orientation(leg));
      this.chain(side,'arm',point(0,V(sign*.17,.1,0)),hand,point(arm,V(sign*.2,0,0)).sub(hand),orientation(arm));
    }
  }
  diagnostics(){return {loaded:this.loaded,bones:this.bones.size,headHidden:this.headMeshes.every(m=>!m.visible),fingers:['L','R'].map(side=>this.bones.get(`Fingers_${side}` as BoneName)?.quaternion.toArray())};}
}
