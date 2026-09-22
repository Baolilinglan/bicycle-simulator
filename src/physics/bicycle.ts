import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { clamp, quat, STEP, vec, SURFACES, surfaceAtCollider, type SurfaceKind } from './world';
import type { Difficulty } from '../difficulty';

export interface RideInput {
  leftPedal: boolean; rightPedal: boolean;
  lean: number; fore: number; steer: number;
  frontBrake: boolean; rearBrake: boolean;
}
export const idleInput = (): RideInput => ({leftPedal:false,rightPedal:false,lean:0,fore:0,steer:0,frontBrake:false,rearBrake:false});
export const BIKE = { radius: 0.345, wheelbase: 1.16, mass: 86, gear: 1.85, crank: 0.17 };
export const TRAINING = { radius:.115, spread:.46, height:.119, z:-.49 };
const IDENTITY = {x:0,y:0,z:0,w:1};
const UP = new Vector3(0,1,0);

export interface WheelState {
  omega: number; angle: number; load: number; slip: number; contact: boolean;
  surface:SurfaceKind;
  point: Vector3; center: Vector3;
}
const wheel = (): WheelState => ({omega:0,angle:0,load:0,slip:0,contact:false,surface:'asphalt',point:new Vector3(),center:new Vector3()});

/** Six unconstrained degrees of freedom. Extreme difficulty has no balance assistance.
 * Tire impulses act at two contact patches; gravity acts at the rider's moving COM.
 * Wheels use scalar rotational inertia and a unilateral chain/freewheel constraint.
 */
export class Bicycle {
  body: RAPIER.RigidBody;
  wheels = [wheel(),wheel()]; // rear, front (a bicycle has front/rear wheels)
  feet = [true,false];
  footContacts = [false,false];
  footWorld = [new Vector3(),new Vector3()];
  pushes = [0,0];
  crankAngle = Math.PI;
  crankOmega = 0;
  pedalForces = [0,0];
  pedalPressed=[false,false];
  rideDistance=0;
  feedback={bump:0,push:0};
  steer = 0;
  steerRate = 0;
  bodyX = 0; bodyZ = 0;
  lean = 0; speed = 0; acceleration = 0;
  brakes = [0,0];
  fallen = false;
  impact = 0;
  time = 0;
  ragdoll: RAPIER.RigidBody[] = [];
  ragdollJoints: RAPIER.ImpulseJoint[] = [];
  trainingWheels = [wheel(),wheel()];
  private trainingColliders:RAPIER.Collider[]=[];
  private pushBuffer=[0,0];
  private pushSpent=[false,false];
  private previousPedals = [false,false];
  private lastSpeed = 0;
  private previousVelocity = new Vector3();
  private distancePosition=new Vector3();
  private fallColliders: RAPIER.Collider[] = [];
  private frontHull!: RAPIER.Collider;
  constructor(public world: RAPIER.World,public difficulty:Difficulty='extreme') {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setCanSleep(false).setCcdEnabled(true).setLinearDamping(0.012).setAngularDamping(0.12)
      .setAdditionalMassProperties(BIKE.mass,{x:0,y:0.82,z:-0.06},{x:17,y:12,z:9},IDENTITY));
    // Narrow proxies only; the virtual tire contacts handle upright riding.
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.037,0.19,0.40).setTranslation(0,0.58,0).setDensity(0).setFriction(0.6),this.body);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.32,0.027,0.045).setTranslation(0,1.01,0.43).setDensity(0).setFriction(0.7),this.body);
    world.createCollider(RAPIER.ColliderDesc.ball(0.09).setTranslation(0,0.95,-0.25).setDensity(0),this.body);
    // Thin axle proxies catch obstacles without turning the tires into stabilizing spheres.
    for (const z of [-0.58,0.58]) world.createCollider(RAPIER.ColliderDesc.ball(0.055).setTranslation(0,0.345,z).setDensity(0),this.body);
    const axleRotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);
    // Undersized tire hulls catch vertical obstacles; the contact patch still carries normal load.
    for(const z of [-0.58,0.58]) {
      const hull=world.createCollider(RAPIER.ColliderDesc.cylinder(.022,.295).setRotation(axleRotation)
        .setTranslation(0,BIKE.radius,z).setDensity(0).setFriction(.35),this.body);
      if(z>0)this.frontHull=hull;
    }
    this.configureTrainingWheels();this.reset();
  }
  setDifficulty(difficulty:Difficulty){
    if(this.difficulty===difficulty)return;
    this.difficulty=difficulty;this.rideDistance=0;this.configureTrainingWheels();this.reset(false);
  }
  private configureTrainingWheels(){
    for(const c of this.trainingColliders)this.world.removeCollider(c,true);
    this.trainingColliders=[];
    if(this.difficulty!=='training')return;
    for(const side of [-1,1])this.trainingColliders.push(this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(.022,TRAINING.radius-.025)
        .setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2))
        .setTranslation(side*TRAINING.spread,TRAINING.height,TRAINING.z).setDensity(0).setFriction(.5),this.body));
  }
  reset(atStart = true) {
    const p = vec(this.body.translation());
    const q = quat(this.body.rotation());
    const forward = new Vector3(0,0,1).applyQuaternion(q);
    this.clearRagdoll();
    this.body.setAdditionalMassProperties(BIKE.mass,{x:0,y:0.82,z:-0.06},{x:17,y:12,z:9},IDENTITY,true);
    const yaw = atStart ? 0 : Math.atan2(forward.x,forward.z);
    const rot = new Quaternion().setFromAxisAngle(UP,yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-0.025));
    // Find the surface for an in-place reset, including the training ramp.
    let y = 0.03;
    if (!atStart) {
      const hit = this.world.castRay(new RAPIER.Ray({x:p.x,y:p.y+4,z:p.z},{x:0,y:-1,z:0}),20,true,undefined,undefined,undefined,this.body);
      if(hit) y = p.y + 4 - hit.timeOfImpact + 0.03;
    }
    this.body.setTranslation(atStart ? {x:0,y:0.03,z:-32} : {x:p.x,y,z:p.z},true);
    this.body.setRotation(rot,true);
    this.body.setLinvel({x:0,y:0,z:0},true); this.body.setAngvel({x:0,y:0,z:0},true);
    this.body.resetForces(true); this.body.resetTorques(true);
    this.wheels = [wheel(),wheel()];this.trainingWheels=[wheel(),wheel()];this.feet=this.difficulty==='training'?[false,false]:[true,false];
    this.footContacts=[false,false]; this.pushes=[0,0]; this.previousPedals=[false,false];
    this.crankAngle=Math.PI; this.crankOmega=0; this.steer=0; this.steerRate=0;
    this.bodyX=0; this.bodyZ=0; this.fallen=false; this.speed=0; this.lastSpeed=0;
    this.pedalForces=[0,0]; this.brakes=[0,0]; this.impact=0; this.previousVelocity.set(0,0,0);
    this.pushBuffer=[0,0];this.pushSpent=[false,false];this.acceleration=0;
    this.pedalPressed=[false,false];this.feedback={bump:0,push:0};
    if(atStart)this.rideDistance=0;
    this.distancePosition.copy(vec(this.body.translation()));
  }
  toggleFoot(side:number) { if(!this.fallen) this.feet[side] = !this.feet[side]; }
  localToWorld(v:Vector3) { return v.applyQuaternion(quat(this.body.rotation())).add(vec(this.body.translation())); }
  step(input:RideInput,dt=STEP) {
    this.time+=dt;
    this.impact*=Math.exp(-dt*12);
    this.feedback.bump*=Math.exp(-dt*16);
    this.feedback.push+=(Math.max(...this.pushes)>0?.045-this.feedback.push:-this.feedback.push)*(1-Math.exp(-dt*12));
    const q=quat(this.body.rotation()), up=new Vector3(0,1,0).applyQuaternion(q);
    const forward=new Vector3(0,0,1).applyQuaternion(q);
    const right=new Vector3(1,0,0).applyQuaternion(q);
    const vel=vec(this.body.linvel());
    this.speed=vel.dot(forward);
    this.lean=Math.atan2(up.dot(new Vector3(right.x,0,right.z).normalize()),up.y);
    // Robust signed roll relative to horizontal forward.
    const horizontalRight = new Vector3(forward.z,0,-forward.x).normalize();
    this.lean=Math.atan2(up.dot(horizontalRight),up.y);
    this.acceleration+=(clamp((this.speed-this.lastSpeed)/dt,-18,18)-this.acceleration)*dt*9;
    this.lastSpeed=this.speed;
    if(this.fallen) return;
    this.body.resetForces(true); this.body.resetTorques(true);

    this.bodyX+=(input.lean*0.125-this.bodyX)*(1-Math.exp(-dt*7));
    // Inertia of the upper body shifts weight forward under deceleration.
    this.bodyZ+=(clamp(input.fore*0.17-this.acceleration*0.007,-0.22,0.24)-this.bodyZ)*(1-Math.exp(-dt*6));
    this.body.setAdditionalMassProperties(BIKE.mass,{x:this.bodyX*0.78,y:0.82,z:-0.06+this.bodyZ*0.8},{x:17,y:12,z:9},IDENTITY,true);

    const target=clamp(input.steer,-0.66,0.66);
    // Small mechanical trail response, plus damping of rates, never a roll angle servo.
    const trail = clamp(this.lean*0.045*Math.abs(this.speed),-0.07,0.07);
    this.steerRate += ((target+trail-this.steer)*100-this.steerRate*19)*dt;
    this.steer=clamp(this.steer+this.steerRate*dt,-0.68,0.68);
    this.frontHull.setRotationWrtParent(new Quaternion().setFromAxisAngle(UP,this.steer)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2)));
    const rollRate=vec(this.body.angvel()).dot(forward);
    this.body.addTorque(forward.clone().multiplyScalar(-rollRate*(1.5+Math.min(Math.abs(this.speed),10)*1.0)),true);

    // Optional, explicitly selected assistance. The original difficulty stays unchanged.
    if(this.difficulty==='standard'&&this.wheels.some(w=>w.contact)){
      const turnLean=clamp(Math.atan(this.speed*this.speed*Math.tan(this.steer)/(9.81*BIKE.wheelbase)),-.42,.42);
      const targetLean=turnLean+input.lean*.055;
      this.body.addTorque(forward.clone().multiplyScalar(clamp((this.lean-targetLean)*1100-rollRate*125,-380,380)),true);
    }
    if(this.difficulty!=='extreme'&&this.speed>.85&&(input.leftPedal||input.rightPedal)){
      this.feet=[false,false];
    }

    const keys=[input.leftPedal,input.rightPedal];
    this.pedalPressed=[...keys];
    for(let side=0;side<2;side++) {
      this.pedalForces[side]+=(Number(keys[side]&&!this.feet[side])*370-this.pedalForces[side])*(1-Math.exp(-dt*15));
      if(this.difficulty==='extreme'){
        if(keys[side]&&!this.previousPedals[side]&&this.feet[side]&&this.footContacts[side]&&Math.abs(this.speed)<2.2)this.pushes[side]=.27;
      }else{
        if(!keys[side])this.pushSpent[side]=false;
        if(keys[side]&&!this.previousPedals[side])this.pushBuffer[side]=.7;
        this.pushBuffer[side]=Math.max(0,this.pushBuffer[side]-dt);
        if((keys[side]||this.pushBuffer[side]>0)&&!this.pushSpent[side]&&this.feet[side]&&this.footContacts[side]&&Math.abs(this.speed)<2.2){
          this.pushes[side]=.42;this.pushSpent[side]=true;this.pushBuffer[side]=0;
        }
      }
      this.previousPedals[side]=keys[side];
    }
    // Downward force on a rising pedal opposes crank rotation. Holding one key stalls at bottom.
    const phase=Math.cos(this.crankAngle);
    const pedalTorque=(this.difficulty==='extreme'?(this.pedalForces[0]-this.pedalForces[1])*phase:
      this.pedalForces[0]*Math.max(0,phase)+this.pedalForces[1]*Math.max(0,-phase))*BIKE.crank;
    const crankInertia=0.65, wheelInertia=0.19;
    this.crankOmega=Math.max(0,this.crankOmega+(pedalTorque-this.crankOmega*0.9)*dt/crankInertia);
    const difference=this.crankOmega*BIKE.gear-this.wheels[0].omega;
    if(difference>0) {
      const transfer=difference/(1/wheelInertia+BIKE.gear**2/crankInertia);
      this.wheels[0].omega+=transfer/wheelInertia;
      this.crankOmega-=transfer*BIKE.gear/crankInertia;
    }
    this.crankAngle=(this.crankAngle+this.crankOmega*dt)%(Math.PI*2);
    this.brakes[0]+=(Number(input.rearBrake)-this.brakes[0])*(1-Math.exp(-dt*13));
    this.brakes[1]+=(Number(input.frontBrake)-this.brakes[1])*(1-Math.exp(-dt*16));
    for(let i=0;i<2;i++) {
      const w=this.wheels[i];
      const braking=this.brakes[i]*(i===1?185:80)*dt/wheelInertia;
      w.omega-=Math.sign(w.omega)*Math.min(Math.abs(w.omega),braking);
      this.tire(i,q,dt,wheelInertia);
      w.angle=(w.angle+w.omega*dt)%(Math.PI*2);
      w.omega*=Math.exp(-dt*0.018);
    }
    for(let side=0;side<2;side++) this.supportFoot(side,q,dt);
    if(this.difficulty==='training')for(let side=0;side<2;side++)this.supportTrainingWheel(side,q,dt);
    // Air drag applies at COM. Rolling loss is handled at each tire patch.
    this.body.addForce(vel.clone().multiplyScalar(-0.25*vel.length()),true);
    if(Math.abs(this.lean)>1.02 || up.y<0.45) this.fall();
  }
  afterStep() {
    const v=vec(this.body.linvel());
    const delta=v.distanceTo(this.previousVelocity);
    if(delta>0.55) this.impact=Math.max(this.impact,clamp(delta/5,0,1));
    if(!this.fallen && delta>3.5 && Math.abs(this.speed)>2.5) this.fall();
    const position=vec(this.body.translation()),distance=position.distanceTo(this.distancePosition);
    if(!this.fallen&&this.wheels.some(w=>w.contact)&&Math.hypot(v.x,v.z)>.12&&distance<1)this.rideDistance+=distance;
    this.distancePosition.copy(position);
    if(!this.fallen&&this.wheels.some(w=>w.contact))this.feedback.bump=Math.max(this.feedback.bump,clamp(Math.abs(v.y-this.previousVelocity.y)*.014,0,.024));
    this.previousVelocity.copy(v);
    // HUD reads the solved rigid-body velocity, including coasting and reverse motion.
    this.speed=v.dot(new Vector3(0,0,1).applyQuaternion(quat(this.body.rotation())));
  }
  private supportTrainingWheel(side:number,q:Quaternion,dt:number){
    const w=this.trainingWheels[side],sign=side===0?1:-1;
    const center=this.localToWorld(new Vector3(sign*TRAINING.spread,TRAINING.height,TRAINING.z));
    w.center.copy(center);w.contact=false;w.load=0;
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(center,{x:0,y:-1,z:0}),TRAINING.radius+.045,true,undefined,undefined,undefined,this.body);
    if(!hit||hit.normal.y<.3)return;
    const point=center.clone().addScaledVector(UP,-hit.timeOfImpact),normal=vec(hit.normal);
    const velocity=vec(this.body.velocityAtPoint(point));
    const load=clamp((TRAINING.radius-hit.timeOfImpact)*32000-velocity.dot(normal)*1500,0,2000);
    if(load<=0)return;
    w.contact=true;w.load=load;w.point.copy(point);
    this.body.addForceAtPoint(normal.multiplyScalar(load),point,true);
    const forward=new Vector3(0,0,1).applyQuaternion(q),lateral=new Vector3().crossVectors(UP,forward).normalize();
    w.surface=surfaceAtCollider(this.world,hit.collider);const surface=SURFACES[w.surface];
    const friction=clamp(-velocity.dot(lateral)*65,-load*.65*surface.grip,load*.65*surface.grip);
    this.body.addForceAtPoint(lateral.multiplyScalar(friction).addScaledVector(forward,-clamp(velocity.dot(forward)*3,-load*surface.rolling*1.5,load*surface.rolling*1.5)),point,true);
    w.omega=velocity.dot(forward)/TRAINING.radius;w.angle=(w.angle+w.omega*dt)%(Math.PI*2);
  }
  private tire(i:number,q:Quaternion,dt:number,inertia:number) {
    const w=this.wheels[i];
    const center=this.localToWorld(new Vector3(0,BIKE.radius,i===0?-0.58:0.58));
    w.center.copy(center);
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(center,{x:0,y:-1,z:0}),BIKE.radius+0.055,true,undefined,undefined,undefined,this.body,
      c=>!this.ragdoll.some(b=>c.parent()?.handle===b.handle));
    w.contact=false; w.load=0; w.slip=0;
    if(!hit || hit.normal.y<0.2) return;
    const point=center.clone().addScaledVector(new Vector3(0,-1,0),hit.timeOfImpact);
    const normal=vec(hit.normal).normalize();
    const velocity=vec(this.body.velocityAtPoint(point));
    w.surface=surfaceAtCollider(this.world,hit.collider);const surface=SURFACES[w.surface];
    // A bounded, spatially fixed micro-profile: repeatable road texture, never random incidents.
    const texture=surface.roughness*.0012*(Math.sin(point.x*27+point.z*19)+.45*Math.sin(point.z*47));
    const penetration=BIKE.radius-hit.timeOfImpact+texture;
    const normalForce=clamp(penetration*42000-velocity.dot(normal)*2200,0,3500);
    if(normalForce<=0) return;
    w.contact=true; w.load=normalForce; w.point.copy(point);
    this.body.addForceAtPoint(normal.clone().multiplyScalar(normalForce),point,true);
    const forward=new Vector3(Math.sin(i===1?this.steer:0),0,Math.cos(i===1?this.steer:0)).applyQuaternion(q);
    forward.addScaledVector(normal,-forward.dot(normal)).normalize();
    const lateral=new Vector3().crossVectors(normal,forward).normalize();
    const vLong=velocity.dot(forward), vSide=velocity.dot(lateral);
    // Slip is solved as a bounded impulse, stable even with a light spinning wheel.
    const mu=hit.collider.friction();
    const maxImpulse=normalForce*mu*dt;
    const slip=w.omega*BIKE.radius-vLong;
    const jLong=clamp(slip/(1/43+BIKE.radius**2/inertia),-maxImpulse,maxImpulse);
    const sideCapacity=Math.sqrt(Math.max(0,maxImpulse**2-jLong**2));
    const lever=point.clone().sub(vec(this.body.worldCom())).cross(lateral).applyQuaternion(q.clone().invert());
    const effectiveInvMass=1/BIKE.mass+lever.x**2/17+lever.y**2/12+lever.z**2/9;
    const jSide=clamp(-vSide/effectiveInvMass,-sideCapacity,sideCapacity);
    this.body.applyImpulseAtPoint(forward.clone().multiplyScalar(jLong).addScaledVector(lateral,jSide),point,true);
    w.omega-=jLong*BIKE.radius/inertia;
    w.slip=Math.max(Math.abs(slip),Math.abs(vSide));
    // Coulomb rolling resistance; no sign-flipping force near rest.
    const rolling=clamp(vLong*10,-normalForce*surface.rolling,normalForce*surface.rolling);
    this.body.addForceAtPoint(forward.multiplyScalar(-rolling),point,true);
  }
  private supportFoot(side:number,q:Quaternion,dt:number) {
    this.footContacts[side]=false;
    if(!this.feet[side]) { this.pushes[side]=0; return; }
    const sign=side===0?1:-1;
    const reach=this.localToWorld(new Vector3(sign*0.36+this.bodyX*0.3,this.difficulty==='extreme'?(this.feet[0]&&this.feet[1]?0.074:0.11):.045,-0.15));
    const origin={x:reach.x,y:reach.y+0.45,z:reach.z};
    const hit=this.world.castRay(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),0.62,true,undefined,undefined,undefined,this.body);
    this.footWorld[side].copy(reach);
    if(!hit) return;
    const groundY=origin.y-hit.timeOfImpact;
    this.footWorld[side].y=groundY+0.055;
    const penetration=0.07-(reach.y-groundY);
    if(penetration<=0) return;
    const point=this.footWorld[side];
    const v=vec(this.body.velocityAtPoint(point));
    // Unilateral compliant leg: only pushes from ground; never pins the bicycle.
    const speedFactor=clamp(1-Math.max(0,Math.abs(this.speed)-1.5)/4,0.12,1);
    const force=clamp(penetration*24000-v.y*1800,0,1000)*speedFactor;
    if(force<1) return;
    this.footContacts[side]=true;
    this.body.addForceAtPoint({x:0,y:force,z:0},point,true);
    const horizontal=new Vector3(v.x,0,v.z);
    const pushGrip=this.difficulty!=='extreme'&&this.pushes[side]>0?.25:1;
    const friction=horizontal.multiplyScalar(-Math.min(150,force*0.7/(horizontal.length()+0.1))*pushGrip);
    this.body.addForceAtPoint(friction,point,true);
    if(this.pushes[side]>0) {
      this.body.addForceAtPoint(new Vector3(0,0,this.difficulty==='extreme'?190:290).applyQuaternion(q),point,true);
      this.pushes[side]=Math.max(0,this.pushes[side]-dt);
    }
  }
  private fall() {
    if(this.fallen) return;
    this.fallen=true;this.rideDistance=0;this.feedback.push=0;this.impact=0.7;
    this.body.resetForces(true); this.body.resetTorques(true);
    this.body.setAdditionalMassProperties(14,{x:0,y:0.48,z:0},{x:3,y:2,z:1.1},IDENTITY,true);
    // Solid wheel hulls take over for tumbling, with a narrow real tire silhouette.
    for(const z of [-0.58,0.58]) {
      const c=RAPIER.ColliderDesc.cylinder(0.025,BIKE.radius).setTranslation(0,BIKE.radius,z)
        .setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2)).setDensity(0).setFriction(0.7);
      this.fallColliders.push(this.world.createCollider(c,this.body));
    }
    const q=quat(this.body.rotation());
    const specs=[
      {p:[this.bodyX,1.25,0.0],r:0.17,h:0.18,m:31},
      {p:[this.bodyX,1.62,0.04],r:0.12,h:0,m:5},
      {p:[this.bodyX,0.96,-0.23],r:0.14,h:0.06,m:12},
      {p:[-0.20,0.58,-0.05],r:0.07,h:0.22,m:8},
      {p:[0.20,0.58,-0.05],r:0.07,h:0.22,m:8},
      {p:[-0.24,1.12,0.32],r:0.055,h:0.20,m:4},
      {p:[0.24,1.12,0.32],r:0.055,h:0.20,m:4},
    ];
    for(const s of specs) {
      const p=this.localToWorld(new Vector3(...s.p as [number,number,number]));
      const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation(q)
        .setLinvel(this.body.linvel().x,this.body.linvel().y,this.body.linvel().z).setAngvel(this.body.angvel()).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.capsule(s.h,s.r).setMass(s.m).setFriction(0.75).setRestitution(0.05),b);
      this.ragdoll.push(b);
    }
    const links:[number,number,number[],number[]][]=[
      [0,1,[0,0.25,0],[0,-0.12,0]], [0,2,[0,-0.24,-0.10],[0,0.08,0.12]],
      [2,3,[-0.12,-0.04,0],[0,0.25,0]], [2,4,[0.12,-0.04,0],[0,0.25,0]],
      [0,5,[-0.17,0.08,0],[0,0.22,-0.1]], [0,6,[0.17,0.08,0],[0,0.22,-0.1]],
    ];
    for(const [a,b,p1,p2] of links) {
      const joint=this.world.createImpulseJoint(RAPIER.JointData.spherical(new Vector3(...p1 as [number,number,number]),new Vector3(...p2 as [number,number,number])),this.ragdoll[a],this.ragdoll[b],true);
      joint.setContactsEnabled(false); this.ragdollJoints.push(joint);
    }
  }
  private clearRagdoll() {
    for(const b of this.ragdoll) this.world.removeRigidBody(b);
    for(const c of this.fallColliders) this.world.removeCollider(c,true);
    this.ragdoll=[]; this.ragdollJoints=[]; this.fallColliders=[];
  }
  snapshot() {
    return {position:{...this.body.translation()},speed:this.speed,lean:this.lean,steer:this.steer,difficulty:this.difficulty,rideDistance:this.rideDistance,
      crank:this.crankAngle,crankOmega:this.crankOmega,bodyX:this.bodyX,bodyZ:this.bodyZ,
      feet:[...this.feet],footContacts:[...this.footContacts],fallen:this.fallen,ragdoll:this.ragdoll.length,
      wheels:this.wheels.map(w=>({omega:w.omega,load:w.load,slip:w.slip,contact:w.contact,surface:w.surface})),
      pedals:[this.pedalFeedback(0),this.pedalFeedback(1)],feedback:{...this.feedback},
      trainingWheels:this.trainingWheels.map(w=>({contact:w.contact,load:w.load})),
      finite:[this.speed,this.lean,this.crankAngle,...Object.values(this.body.translation())].every(Number.isFinite)};
  }
  pedalFeedback(side:number){
    const angle=this.crankAngle+side*Math.PI,leverage=Math.cos(angle);
    const power=clamp(leverage,0,1),pressed=this.pedalPressed[side];
    const state=this.fallen?'fallen':this.feet[side]?(this.pushes[side]>0?'pushing':!this.footContacts[side]?'waiting':Math.abs(this.speed)<2.2?'push':'lift'):
      !this.wheels[0].contact?'air':leverage>.18?'ready':Math.sin(angle)>.85?'bottom':'rising';
    return {state,power,pressed};
  }
}
