import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFrame,decodeCode,encodeCode,validFrame,validMember } from '../src/multiplayer/protocol.ts';
import { makeWorld,STEP } from '../src/physics/world.ts';
import { Bicycle,idleInput } from '../src/physics/bicycle.ts';

test('manual connection codes round-trip and reject damaged, oversized and incompatible data',async()=>{
  const code={v:1 as const,room:'room-1',link:'peer-1',name:'骑友',difficulty:'training' as const,type:'offer' as const,sdp:'v=0\r\na=candidate:example\r\n'};
  assert.deepEqual(await decodeCode(await encodeCode(code)),code);
  await assert.rejects(decodeCode('not a connection code'));
  await assert.rejects(decodeCode('BIKE1.'+'a'.repeat(25000)));
  await assert.rejects(decodeCode(await encodeCode({...code,sdp:'bad'})));
  await assert.rejects(decodeCode(await encodeCode({...code,sdp:'v=0'+'x'.repeat(40000)})));
});
test('network snapshots validate actual riding and ragdoll poses and reject invalid transforms',async()=>{
  const {world}=await makeWorld(false),bike=new Bicycle(world,'training');
  try{
    bike.reset(true,{x:2,z:-35});bike.afterStep();assert.equal(bike.rideDistance,0);
    const frame=captureFrame(bike,true);assert.equal(validFrame(frame),true);
    assert.equal(validFrame({...frame,p:[Infinity,0,0]}),false);
    assert.equal(validFrame({...frame,q:[0,0,0,0]}),false);
    assert.equal(validFrame({...frame,feet:[true]}),false);
    assert.equal(validFrame({...frame,fallen:true,ragdoll:[]}),false);
    assert.equal(validMember({id:'host',name:'骑友',best:0,mic:false,frame}),true);
    assert.equal(validMember({id:'host',name:'骑友',best:NaN,mic:false,frame}),false);
    bike.setDifficulty('extreme');bike.feet=[false,false];
    for(let i=0;i<720;i++){bike.step(idleInput(),STEP);world.step();bike.afterStep();}
    assert.equal(bike.fallen,true);assert.equal(validFrame(captureFrame(bike,false)),true);
  }finally{world.free();}
});
