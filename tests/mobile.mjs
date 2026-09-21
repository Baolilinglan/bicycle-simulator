import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?test');await page.waitForFunction(()=>window.bicycleDiagnostics?.ready);
await page.waitForTimeout(400);await page.screenshot({path:'test-results/mobile-menu.png'});
assert.equal(await page.evaluate(()=>window.bicycleDiagnostics.input().touch),true);
await page.locator('#start').tap();await page.waitForTimeout(350);
assert.equal(await page.getByRole('dialog').isVisible(),true);
const helpBox=await page.getByRole('dialog').boundingBox();assert.ok(helpBox.y>=0&&helpBox.y+helpBox.height<=391);
await page.screenshot({path:'test-results/mobile-help.png'});
await page.locator('#dismiss-help').tap();await page.waitForTimeout(200);
assert.equal(await page.locator('#touch-controls').isVisible(),true);
assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
const cdp=await context.newCDPSession(page);
const point=async(selector,id)=>{const b=await page.locator(selector).boundingBox();return {id,x:b.x+b.width/2,y:b.y+b.height/2,radiusX:5,radiusY:5,force:1};};
const left=await point('[data-hold=leftPedal]',1),right=await point('[data-hold=rightPedal]',2);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[left,right]});
await page.waitForTimeout(420);
const driven=await page.evaluate(()=>({state:window.bicycleDiagnostics.snapshot(),input:window.bicycleDiagnostics.input()}));
assert.ok(driven.state.speed>.25);assert.equal(driven.input.leftPedal,true);assert.equal(driven.input.rightPedal,true);
await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
await page.waitForTimeout(100);
assert.equal(await page.locator('#touch-controls .held').count(),0);
assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.input())).leftPedal,false);
const brake=await point('[data-hold=frontBrake]',3),steer=await point('.steer-stick',4);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[brake,steer]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[brake,{...steer,x:steer.x+28}]});
await page.waitForTimeout(120);
const simultaneous=await page.evaluate(()=>window.bicycleDiagnostics.input());
assert.equal(simultaneous.frontBrake,true);assert.ok(simultaneous.steer<-.1);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.locator('#ride-reset').tap();await page.waitForTimeout(500);
await page.screenshot({path:'test-results/mobile-play.png'});
await page.locator('[data-foot="1"]').tap();assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).feet[1],true);
await page.locator('#ride-help').tap();assert.equal(await page.getByRole('dialog').isVisible(),true);
await page.locator('#dismiss-help').tap();
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
assert.equal(await page.locator('#orientation').isVisible(),true);
assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.input())).leftPedal,false);
await page.screenshot({path:'test-results/mobile-portrait.png'});
for(const [width,height] of [[568,320],[667,375],[844,390],[1024,768]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(160);
  assert.equal(await page.locator('#orientation').isVisible(),false);
  await page.locator('#start').tap();await page.waitForTimeout(150);
  for(const selector of ['.body-stick','.steer-stick','.touch-middle','#ride-tools']){
    const b=await page.locator(selector).boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1,`${selector} must fit ${width}x${height}`);
  }
  await page.screenshot({path:`test-results/mobile-${width}x${height}.png`});
  await page.locator('#ride-pause').tap();
}
await context.close();
const desktop=await browser.newPage({viewport:{width:2560,height:1080}});
desktop.on('pageerror',e=>errors.push(e.message));await desktop.goto('http://127.0.0.1:5173/');await desktop.waitForFunction(()=>window.bicycleDiagnostics?.ready);
for(const [width,height] of [[2560,1080],[1920,1080],[1280,720],[800,600]]){
  await desktop.setViewportSize({width,height});await desktop.waitForTimeout(180);
  const b=await desktop.locator('#start').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.y+b.height<height);
  assert.equal(await desktop.locator('#touch-controls').isVisible(),false);
}
await desktop.screenshot({path:'test-results/desktop-compact.png'});
assert.deepEqual(errors,[]);await browser.close();console.log('Mobile multi-touch, cancellation, rotation, dialogs and 8 viewport sizes passed.');
