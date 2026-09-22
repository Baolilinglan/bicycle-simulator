import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
await fs.mkdir('test-results',{recursive:true});
const samples=48000*8,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++){const t=i/48000;wav.writeInt16LE(Math.round(5500*(Math.sin(t*2*Math.PI*180)+.35*Math.sin(t*2*Math.PI*360))*(.65+.35*Math.sin(t*2*Math.PI*3))),44+i*2);}
await fs.writeFile('test-results/fake-voice.wav',wav);
const browser=await chromium.launch({channel:'msedge',headless:true,...(process.env.RELEASE_PROXY?{proxy:{server:process.env.RELEASE_PROXY}}:{}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${resolve('test-results/fake-voice.wav')}`,'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[];const pages=[];
const diag=page=>page.evaluate(()=>window.bicycleDiagnostics.room());
async function page(name){
  const context=await browser.newContext({viewport:{width:1280,height:800},permissions:['microphone']});
  const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.MULTIPLAYER_URL||'http://127.0.0.1:5173/?test');await p.waitForFunction(()=>window.bicycleDiagnostics?.ready);
  await p.locator('#open-multiplayer').click();await p.locator('#mp-name').fill(name);return p;
}
async function join(host,guest,count){
  await host.locator('#mp-invite').click();await host.waitForFunction(()=>document.querySelector('#mp-outgoing').value.startsWith('BIKE1.')&&!document.querySelector('#mp-invite').disabled);
  const offer=await host.locator('#mp-outgoing').inputValue();
  await guest.locator('#mp-incoming').fill(offer);await guest.locator('#mp-join').click();
  await guest.waitForFunction(()=>document.querySelector('#mp-outgoing').value.startsWith('BIKE1.')&&!document.querySelector('#mp-copy').disabled);
  const answer=await guest.locator('#mp-outgoing').inputValue();
  await host.locator('#mp-incoming').fill(answer);await host.locator('#mp-accept').click();
  await guest.waitForFunction(n=>window.bicycleDiagnostics.room().members.length===n,count,{timeout:20000});
  await host.waitForFunction(n=>window.bicycleDiagnostics.room().members.length===n,count);
}
try{
  const host=await page('房主'),one=await page('骑友一');
  await host.locator('#mp-create').click();await host.waitForFunction(()=>window.bicycleDiagnostics.room().role==='host');
  assert.equal((await diag(host)).voice.micTracks,0);
  await one.locator('#mp-incoming').fill('not a code');await one.locator('#mp-join').click();
  await one.waitForFunction(()=>document.querySelector('#mp-status').textContent.includes('不正确'));
  await join(host,one,2);
  await one.waitForFunction(()=>window.bicycleDiagnostics.remotes().loaded&&window.bicycleDiagnostics.remotes().count===1);
  await host.waitForFunction(()=>window.bicycleDiagnostics.remotes().count===1);
  assert.equal(await one.locator('#welcome-difficulty').isDisabled(),true);
  assert.equal((await diag(one)).voice.micTracks,0);
  // Typing controls into the chat must never trigger riding actions or help overlays.
  await one.locator('#mp-chat').fill('q e h t <img src=x onerror=alert(1)>');
  await one.locator('#mp-chat').press('Enter');
  await host.waitForFunction(()=>window.bicycleDiagnostics.room().chats.length===1);
  assert.equal(await host.locator('#mp-messages img').count(),0);
  assert.equal(await one.locator('#help-layer').isVisible(),false);
  await one.locator('#mp-close').click();await one.locator('#start').click();await one.locator('#dismiss-help').click();
  await one.keyboard.down('e');await one.waitForTimeout(800);await one.keyboard.up('e');
  await host.waitForFunction(()=>window.bicycleDiagnostics.room().members.some(m=>m.name==='骑友一'&&m.best>.1));
  const best=(await diag(host)).members.find(m=>m.name==='骑友一').best;
  await one.keyboard.press('t');await one.waitForTimeout(200);
  assert.ok((await diag(host)).members.find(m=>m.name==='骑友一').best>=best);
  await one.keyboard.press('Escape');await one.locator('#open-multiplayer').click();
  const two=await page('骑友二');await join(host,two,3);
  await one.waitForFunction(()=>window.bicycleDiagnostics.room().members.length===3);
  await one.locator('#mp-mic').click();await one.waitForFunction(()=>window.bicycleDiagnostics.room().voice.enabled);
  await host.waitForFunction(()=>window.bicycleDiagnostics.room().members.find(m=>m.name==='骑友一')?.mic);
  assert.equal((await diag(host)).voice.enabled,false,'host need not open a microphone to relay guests');
  assert.equal((await diag(host)).voice.inputs,2);assert.equal((await diag(host)).voice.outputs,2);
  let receiver,outputLevel=0;
  for(let i=0;i<40;i++){receiver=(await two.evaluate(()=>window.bicycleDiagnostics.network()))[0];outputLevel=(await diag(two)).voice.outputLevel;if(receiver.received>1000&&outputLevel>.0001)break;await two.waitForTimeout(250);}
  if(!(receiver.received>1000&&outputLevel>.0001))for(const p of [host,one,two])console.log('Voice diagnostics',JSON.stringify({room:await diag(p),stats:await p.evaluate(()=>window.bicycleDiagnostics.network())}));
  assert.ok(receiver.received>1000&&outputLevel>.0001,'guest audio must reach another guest through the muted host and reach its speaker graph');
  console.log('Guest voice received through muted host:',{received:receiver.received,outputLevel});
  await two.locator('#mp-chat').fill('三人房间聊天');await two.locator('#mp-chat').press('Enter');
  await one.waitForFunction(()=>window.bicycleDiagnostics.room().chats.some(m=>m.text==='三人房间聊天'));
  await host.screenshot({path:'test-results/multiplayer-room.png'});
  const three=await page('骑友三');await join(host,three,4);
  await host.locator('#mp-invite').click();await host.waitForFunction(()=>document.querySelector('#mp-status').textContent.includes('房间已满'));
  await three.locator('#mp-leave').click();await host.waitForFunction(()=>window.bicycleDiagnostics.room().members.length===3);
  await one.locator('#mp-mic').click();assert.equal((await diag(one)).voice.micTracks,0);
  await one.locator('#mp-close').click();await one.locator('#start').click();
  await one.waitForFunction(()=>window.bicycleDiagnostics.remotes().count===2);
  await host.evaluate(()=>window.bicycleTest?.place(-.8,-27));
  await one.waitForTimeout(300);
  await one.screenshot({path:'test-results/multiplayer-riding.png'});
  await one.keyboard.press('Escape');await one.locator('#open-multiplayer').click();
  await one.waitForTimeout(300);
  for(const [width,height] of [[568,320],[844,390],[1024,768]]){
    await one.setViewportSize({width,height});await one.waitForTimeout(150);
    const bounds=await one.locator('.room-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,JSON.stringify({width,height,bounds}));
    assert.equal(await one.locator('.room-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'room content must not overflow horizontally');
    await one.screenshot({path:`test-results/multiplayer-${width}x${height}.png`});
  }
  await one.screenshot({path:'test-results/multiplayer-compact.png'});
  // A host that stops drawing (e.g. a background tab) must still forward its guests.
  await host.evaluate(()=>{window.requestAnimationFrame=()=>0;});await host.waitForTimeout(120);
  await two.locator('#mp-close').click();await two.locator('#start').click();await two.locator('#dismiss-help').click();
  await two.keyboard.down('e');await two.waitForTimeout(750);await two.keyboard.up('e');
  await one.waitForFunction(()=>window.bicycleDiagnostics.room().members.some(m=>m.name==='骑友二'&&m.best>.1));
  await host.locator('#mp-leave').click();
  await one.waitForFunction(()=>window.bicycleDiagnostics.room().role==='none');
  await two.waitForFunction(()=>window.bicycleDiagnostics.room().role==='none');
  await one.waitForFunction(()=>window.bicycleDiagnostics.remotes().count===0);
  assert.equal((await diag(one)).voice.outputs,0);assert.equal(await one.locator('#welcome-difficulty').isDisabled(),false);
  assert.deepEqual(errors,[]);
  console.log('Real 4-peer WebRTC code exchange, remote riders, shared distance, chat, mic consent/muting, host voice routing and disconnect cleanup passed.');
}finally{await browser.close();}
