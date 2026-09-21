import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, STEP } from '../src/physics/world.ts';
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
