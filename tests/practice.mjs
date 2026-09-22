import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?test');await page.waitForFunction(()=>window.bicycleDiagnostics?.ready);
  await page.locator('#start').click();await page.locator('#dismiss-help').click();
  assert.equal(await page.locator('#pedal-coach').isVisible(),true);
  assert.equal(await page.locator('[data-pedal="1"] span').textContent(),'可发力');
  await page.keyboard.down('e');await page.waitForTimeout(800);await page.keyboard.up('e');
  assert.ok((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).rideDistance>.1);
  assert.notEqual(await page.locator('#ride-distance').textContent(),'0.0 m');
  await page.screenshot({path:'test-results/practice-hud.png'});
  await page.keyboard.press('t');await page.waitForTimeout(70);
  assert.ok(Math.abs((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).position.z+32)<.02);
  assert.equal(await page.locator('#ride-distance').textContent(),'0.0 m');
  const before=await page.evaluate(()=>window.bicycleDiagnostics.rider().fingers);
  await page.mouse.down();await page.waitForTimeout(250);
  const after=await page.evaluate(()=>window.bicycleDiagnostics.rider().fingers);
  assert.ok(after[0].some((v,i)=>Math.abs(v-before[0][i])>.02),'front brake must curl left fingers');
  assert.ok(after[1].every((v,i)=>Math.abs(v-before[1][i])<.03),'rear brake hand stays independent');
  await page.screenshot({path:'test-results/practice-front-brake.png'});await page.mouse.up();
  await page.keyboard.press('Escape');await page.locator('#open-settings').click();
  await page.locator('#pedal-assist').uncheck();await page.locator('summary').click();
  await page.getByRole('button',{name:'修改回到起点键位',exact:true}).click();await page.keyboard.press('y');
  await page.getByRole('button',{name:'关闭设置'}).click();await page.locator('#start').click();
  assert.equal(await page.locator('#pedal-coach').isVisible(),false);
  await page.keyboard.down('e');await page.waitForTimeout(500);await page.keyboard.up('e');await page.keyboard.press('y');
  assert.ok(Math.abs((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).position.z+32)<.03);
  await page.keyboard.press('Escape');await page.locator('#open-settings').click();await page.locator('#pedal-assist').check();
  await page.getByRole('button',{name:'关闭设置'}).click();await page.locator('#start').click();
  for(const [name,x,z] of [['wet',0,-2],['gravel',-23,6],['grass',30,26]]){
    await page.evaluate(([x,z])=>window.bicycleTest.place(x,z),[x,z]);await page.waitForTimeout(450);
    assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).wheels[0].surface,name);
    await page.screenshot({path:`test-results/practice-${name}.png`});
  }
  await page.keyboard.press('Escape');await page.locator('#ride-home').click();await page.waitForTimeout(100);
  assert.ok(Math.abs((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).position.z+32)<.02);
  assert.deepEqual(errors,[]);
  // Render the same course module from above for geometry/route review.
  await page.evaluate(async()=>{
    window.bicycleTest.pause();
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {CourseView}=await import('/src/render/course.ts'),{makeWorld}=await import('/src/physics/world.ts');
    const {world,props}=await makeWorld();const scene=new THREE.Scene();scene.background=new THREE.Color('#d4ddd5');
    scene.add(new THREE.HemisphereLight('#fff9e8','#69725c',2.8));const sun=new THREE.DirectionalLight('#fff1d4',2.7);sun.position.set(-20,50,-20);scene.add(sun);
    new CourseView(scene,props);
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,1,500);camera.position.set(50,130,-82);camera.lookAt(0,0,7);
    Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'100'});document.body.append(renderer.domElement);renderer.render(scene,camera);world.free();
  });
  await page.screenshot({path:'test-results/practice-course-overview.png'});
  console.log('Home shortcut/rebinding, continuous distance, optional coaching, independent brake fingers and all surface zones passed.');
}finally{await browser.close();}
