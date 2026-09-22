import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, STEP, routeCurve, groundHeight, SURFACE_PATCHES, SURFACES } from '../src/physics/world.ts';
import { Bicycle, idleInput, BIKE } from '../src/physics/bicycle.ts';
import { Quaternion, Vector3 } from 'three';

async function fixture() { const {world}=await makeWorld(false); const bike=new Bicycle(world); return {world,bike}; }
function run(world:any,bike:Bicycle,seconds:number,input=(t:number)=>idleInput()) {
  for(let n=0;n<seconds/STEP;n++){bike.step(input(n*STEP));world.step();bike.afterStep();}
  return bike.snapshot();
}

test('a planted foot supports a stopped bicycle without freezing it',async()=>{
  const {world,bike}=await fixture();
  const state=run(world,bike,5);
  assert.equal(state.fallen,false); assert.ok(Math.abs(state.lean)<0.3); assert.ok(state.finite);
  world.free();
});
test('stationary bicycle with both feet on pedals naturally falls and creates a ragdoll',async()=>{
  const {world,bike}=await fixture();bike.feet=[false,false];
  const state=run(world,bike,5);
  assert.equal(state.fallen,true);assert.equal(state.ragdoll,7);assert.ok(state.finite);
  bike.reset();assert.equal(bike.ragdoll.length,0);assert.equal(bike.fallen,false);
  world.free();
});
test('a single held pedal stalls; alternating pedal phases drives the rear wheel',async()=>{
  const a=await fixture();a.bike.feet=[false,false];
  // Isolate drivetrain from rider balance only in this test fixture.
  a.bike.body.setEnabledRotations(true,true,false,true);
  const single=run(a.world,a.bike,5,()=>({...idleInput(),rightPedal:true}));
  const b=await fixture();b.bike.feet=[false,false];b.bike.body.setEnabledRotations(true,true,false,true);
  const alternating=run(b.world,b.bike,5,()=>({...idleInput(),leftPedal:Math.cos(b.bike.crankAngle)>0,rightPedal:Math.cos(b.bike.crankAngle)<=0}));
  assert.ok(alternating.speed>1.7);assert.ok(single.speed<alternating.speed*0.45);
  assert.ok(alternating.position.z>single.position.z+3);
  a.world.free();b.world.free();
});
test('W shifts the COM without providing propulsion, and a planted foot can push off',async()=>{
  const a=await fixture();const still=run(a.world,a.bike,2,()=>({...idleInput(),fore:1}));
  assert.ok(Math.abs(still.speed)<0.15);assert.ok(still.bodyZ>0.1);
  run(a.world,a.bike,0.2);
  const pushed=run(a.world,a.bike,0.45,()=>({...idleInput(),leftPedal:true}));
  assert.ok(pushed.speed>0.25);a.world.free();
});

function seedVelocity(b:Bicycle,speed:number){
  // Fixture setup only. Gameplay never assigns the rigid body's speed or orientation.
  b.body.setLinvel({x:0,y:0,z:speed},true);b.wheels.forEach(w=>w.omega=speed/BIKE.radius);
  (b as any).previousVelocity.set(0,0,speed);(b as any).lastSpeed=speed;
}
async function rolling(speed=6){
  const f=await fixture();f.bike.feet=[false,false];f.bike.body.setRotation({x:0,y:0,z:0,w:1},true);
  f.world.step();seedVelocity(f.bike,speed);return f;
}
test('front/rear brakes differ; weight forward and hard front braking can lift the rear wheel',async()=>{
  const results:Record<string,{distance:number,speed:number,rearLoad:number,slip:number}>={};
  for(const action of ['coast','front','rear','both','forward-front']){
    const {bike,world}=await rolling();let rearLoad=10000,slip=0;const z=bike.body.translation().z;
    const state=run(world,bike,2,()=>{
      rearLoad=Math.min(rearLoad,bike.wheels[0].load||10000);slip=Math.max(slip,bike.wheels[0].slip);
      return {...idleInput(),frontBrake:action.includes('front')||action==='both',rearBrake:action==='rear'||action==='both',
        fore:action==='forward-front'?1:action==='both'?-1:0};
    });
    results[action]={distance:state.position.z-z,speed:state.speed,rearLoad,slip};world.free();
  }
  assert.ok(results.front.distance<results.rear.distance*.7);
  assert.ok(results.both.distance<results.front.distance);
  assert.ok(results.both.speed<.06);
  assert.ok(results.rear.slip>1);assert.ok(results.coast.speed>5);
  // A second short pass records actual rear separation (zero load + positive speed).
  const {bike,world}=await rolling(9);let lifted=false;
  run(world,bike,1,()=>{if(bike.time>.2&&!bike.wheels[0].contact&&bike.speed>2)lifted=true;return {...idleInput(),frontBrake:true,fore:1};});
  assert.ok(lifted,'front brake should unload and lift rear tire at forward COM');world.free();
});
test('abrupt steering at speed topples the bicycle through tire impulses',async()=>{
  const {bike,world}=await rolling();const state=run(world,bike,1.5,()=>({...idleInput(),steer:.6}));
  assert.equal(state.fallen,true);assert.ok(Math.abs(state.position.x)>0.5);world.free();
});
test('turning handlebars in mid-air cannot directly rotate the bicycle',async()=>{
  const {bike,world}=await rolling(2);bike.body.setTranslation({x:0,y:10,z:0},true);
  run(world,bike,.4,()=>({...idleInput(),steer:.6}));
  assert.ok(Math.abs(bike.body.rotation().y)<.0001);assert.ok(bike.steer>.5);world.free();
});
test('corrective rider inputs can sustain riding; the same tilted start with no inputs falls',async()=>{
  for(const corrected of [true,false]){
    const {bike,world}=await rolling(4);
    bike.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.04),true);
    const state=run(world,bike,10,()=>{
      if(!corrected)return idleInput();
      // Test-only rider feedback, supplied through exactly the public player inputs.
      const q=bike.body.rotation(),fwd=new Vector3(0,0,1).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w));
      const av=bike.body.angvel(),rate=-new Vector3(av.x,av.y,av.z).dot(fwd);
      return {...idleInput(),steer:Math.max(-.6,Math.min(.6,(bike.lean*3+rate*.6)/(Math.max(bike.speed,1)*.35))),
        leftPedal:Math.cos(bike.crankAngle)>0,rightPedal:Math.cos(bike.crankAngle)<=0};
    });
    assert.equal(state.fallen,!corrected);if(corrected){assert.ok(state.speed>4);assert.ok(state.position.z>8);}
    world.free();
  }
});
test('ramp collider loads wheels and gravity reduces uphill speed',async()=>{
  const {world}=await makeWorld(true),bike=new Bicycle(world);bike.feet=[false,false];
  bike.body.setRotation({x:0,y:0,z:0,w:1},true);bike.body.setTranslation({x:-23,y:0,z:10},true);world.step();seedVelocity(bike,6);
  const state=run(world,bike,1.8);assert.ok(state.position.y>.6);assert.ok(state.speed<5.6);assert.equal(state.fallen,false);world.free();
});
test('a low curb is a physical bump and resets do not accumulate rigid bodies',async()=>{
  const {world}=await makeWorld(true),bike=new Bicycle(world);const count=world.bodies.len();
  bike.feet=[false,false];bike.body.setRotation({x:0,y:0,z:0,w:1},true);bike.body.setTranslation({x:17,y:0,z:4},true);world.step();seedVelocity(bike,3);
  let height=0;run(world,bike,1,()=>{height=Math.max(height,bike.body.translation().y);return idleInput();});
  assert.ok(height>.015);
  for(let i=0;i<8;i++){bike.reset();bike.feet=[false,false];run(world,bike,4);assert.ok(bike.fallen);bike.reset();assert.equal(world.bodies.len(),count);}
  world.free();
});

test('ground push, pedal start, sustained riding, braking and both feet down form one continuous simulation',async()=>{
  const {world,bike}=await fixture();run(world,bike,1.7);
  let peak=0;
  const final=run(world,bike,16,t=>{
    const c=idleInput();
    if(t<.5){c.leftPedal=true;c.rightPedal=true;}
    else {
      if(bike.feet[0]&&t<1)bike.toggleFoot(0);
      const q=bike.body.rotation(),fwd=new Vector3(0,0,1).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w));
      const av=bike.body.angvel(),rate=-new Vector3(av.x,av.y,av.z).dot(fwd);
      c.steer=Math.max(-.6,Math.min(.6,(bike.lean*3+rate*.6)/(Math.max(bike.speed,1)*.35)));
      c.lean=Math.max(-1,Math.min(1,-(bike.lean*6+rate*1.2)))*Math.max(0,1-bike.speed/3);
      c.leftPedal=Math.cos(bike.crankAngle)>0;c.rightPedal=!c.leftPedal;
    }
    if(t>12){c.frontBrake=true;c.rearBrake=true;c.fore=-1;c.leftPedal=false;c.rightPedal=false;if(bike.speed<.7)bike.feet=[true,true];}
    peak=Math.max(peak,bike.speed);return c;
  });
  assert.equal(final.fallen,false);assert.ok(peak>4.5);assert.ok(Math.abs(final.speed)<.08);
  assert.deepEqual(final.footContacts,[true,true]);assert.ok(final.finite);world.free();
});

test('training wheels support a stopped rider and allow pedal-only start, coasting and braking',async()=>{
  const {world}=await makeWorld(false),bike=new Bicycle(world,'training');
  run(world,bike,5);
  assert.equal(bike.fallen,false);assert.deepEqual(bike.feet,[false,false]);assert.ok(Math.abs(bike.lean)<.12);
  assert.ok(bike.trainingWheels.some(w=>w.contact),'support wheels must carry a real ground load');
  run(world,bike,6,()=>({...idleInput(),leftPedal:Math.cos(bike.crankAngle)>0,rightPedal:Math.cos(bike.crankAngle)<=0}));
  const speed=bike.speed,start=bike.body.translation().z;
  assert.ok(speed>2);assert.equal(bike.fallen,false);
  run(world,bike,2);
  assert.ok(bike.speed>speed*.65,'releasing pedals must preserve momentum');assert.ok(bike.body.translation().z>start+speed);
  run(world,bike,3,()=>({...idleInput(),frontBrake:true,rearBrake:true,fore:-1}));
  assert.ok(Math.abs(bike.speed)<.12);assert.equal(bike.fallen,false);world.free();
});

test('standard difficulty accepts an early ground-push press, auto lifts feet and damps wobble',async()=>{
  const {world}=await makeWorld(false),bike=new Bicycle(world,'standard');
  run(world,bike,.03,()=>({...idleInput(),leftPedal:true,rightPedal:true}));
  run(world,bike,1.2,()=>({...idleInput(),rightPedal:true}));
  assert.ok(bike.speed>.8,'buffered push before contact must launch the rider');
  assert.deepEqual(bike.feet,[false,false],'support foot returns to pedal after launch');
  run(world,bike,8,()=>({...idleInput(),leftPedal:Math.cos(bike.crankAngle)>0,rightPedal:Math.cos(bike.crankAngle)<=0}));
  assert.equal(bike.fallen,false);assert.ok(Math.abs(bike.lean)<.2);assert.ok(bike.speed>3);world.free();
});

test('changing difficulty adds/removes support colliders without leaks and keeps extreme unassisted',async()=>{
  const {world,bike}=await fixture();const count=world.colliders.len();
  for(let i=0;i<4;i++){
    bike.setDifficulty('training');assert.equal(world.colliders.len(),count+2);
    bike.setDifficulty('standard');assert.equal(world.colliders.len(),count);
    bike.setDifficulty('extreme');assert.equal(world.colliders.len(),count);
  }
  bike.feet=[false,false];run(world,bike,5);assert.equal(bike.fallen,true);world.free();
});

test('ride distance follows the travelled path, survives upright reset and clears on fall or return home',async()=>{
  const {world}=await makeWorld(false),bike=new Bicycle(world,'training');run(world,bike,1);
  seedVelocity(bike,4);run(world,bike,2);
  assert.ok(bike.rideDistance>7&&bike.rideDistance<9);
  const saved=bike.rideDistance;bike.reset(false);assert.equal(bike.rideDistance,saved);
  run(world,bike,.5);assert.ok(bike.rideDistance<saved+.1,'reset teleport and settling must not count');
  bike.body.setRotation(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),1.25),true);
  run(world,bike,.1);assert.equal(bike.fallen,true);assert.equal(bike.rideDistance,0);
  run(world,bike,1);assert.equal(bike.rideDistance,0,'ragdoll movement must not count');
  bike.reset();assert.equal(bike.rideDistance,0);assert.equal(bike.body.translation().z,-32);world.free();
});

test('pedal coaching follows crank leverage and grounded foot state without changing the input',async()=>{
  const {world,bike}=await fixture();run(world,bike,2);
  assert.equal(bike.pedalFeedback(0).state,'push');
  bike.feet=[false,false];bike.crankAngle=0;assert.equal(bike.pedalFeedback(0).state,'ready');assert.equal(bike.pedalFeedback(1).state,'rising');
  bike.crankAngle=Math.PI/2;assert.equal(bike.pedalFeedback(0).state,'bottom');
  bike.feet[0]=true;bike.footContacts[0]=false;assert.equal(bike.pedalFeedback(0).state,'waiting');world.free();
});

test('visible surface zones alter rolling resistance and wet-road braking grip',async()=>{
  const speeds:Record<string,number>={};
  for(const kind of ['asphalt','wet','gravel','grass'] as const){
    const {world}=await makeWorld(true),bike=new Bicycle(world,'training');
    const patch=SURFACE_PATCHES.find(p=>p.kind===kind);
    bike.body.setTranslation({x:patch?.x??40,y:.03,z:(patch?.z??0)-1},true);
    bike.body.setRotation({x:0,y:0,z:0,w:1},true);run(world,bike,.6);seedVelocity(bike,5);
    run(world,bike,.6);speeds[kind]=bike.speed;
    assert.equal(bike.wheels[0].surface,kind);assert.equal(bike.fallen,false);world.free();
  }
  assert.ok(speeds.grass<speeds.asphalt-.08);assert.ok(speeds.gravel<speeds.asphalt-.04);
  const braking:Record<string,number>={};
  for(const kind of ['asphalt','wet']){
    const {world}=await makeWorld(true),bike=new Bicycle(world,'training');
    bike.body.setTranslation({x:kind==='wet'?0:40,y:.03,z:-1},true);run(world,bike,.5);seedVelocity(bike,5);
    run(world,bike,.5,()=>({...idleInput(),frontBrake:true,rearBrake:true,fore:-1}));braking[kind]=bike.speed;world.free();
  }
  assert.ok(braking.wet>braking.asphalt+.35,'wet surface should have a longer stopping distance');
  assert.ok(SURFACES.gravel.sound>SURFACES.asphalt.sound);
});

test('practice loop closes and crosses the same ramp profile as the physics mesh',()=>{
  const curve=routeCurve();assert.ok(curve.getPoint(0).distanceTo(curve.getPoint(1))<.001);
  let onRamp=0,onNarrow=0;
  for(let i=0;i<720;i++){
    const p=curve.getPoint(i/720);if(groundHeight(p.x,p.z)>.5)onRamp++;
    if(Math.abs(p.x+12)<1&&p.z> -32&&p.z< -18)onNarrow++;
    assert.ok(Math.abs(p.x)<50&&p.z> -70&&p.z<80);
  }
  assert.ok(onRamp>20);assert.ok(onNarrow>20);
});
