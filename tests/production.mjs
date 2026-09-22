import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Serve exactly as a project Pages deployment, with no assets at the domain root.
const root=resolve('dist'),prefix='/bicycle-simulator/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
  const path=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true,...(process.env.RELEASE_PROXY?{proxy:{server:process.env.RELEASE_PROXY}}:{})});
  const page=await browser.newPage();const errors=[],badResponses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)badResponses.push(r.url());});
  await page.goto(process.env.RELEASE_URL||`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.waitForFunction(()=>window.bicycleDiagnostics?.ready);
  assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.rider())).bones,18);
  await page.locator('.title-logo').evaluate(img=>img.decode());
  assert.ok(await page.locator('.title-logo').evaluate(img=>img.naturalWidth>1000&&img.naturalHeight>300));
  assert.equal(await page.evaluate(()=>typeof window.bicycleTest),'undefined','production must not expose mutable test hooks');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.title-logo').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.locator('.logo-shine').isVisible(),false);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('#start').click();await page.locator('#dismiss-help').click();
  await page.waitForFunction(()=>window.bicycleDiagnostics.music().time>.1);
  assert.ok((await page.evaluate(()=>window.bicycleDiagnostics.music())).duration>30);
  await page.keyboard.down('e');await page.waitForTimeout(650);await page.keyboard.up('e');
  assert.ok((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).rideDistance>.1);
  await page.keyboard.press('t');
  assert.ok((await page.evaluate(()=>window.bicycleDiagnostics.snapshot())).rideDistance<.01);
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
  console.log('Production title, reduced motion, BGM, skinned model, riding distance and home shortcut passed:',page.url());
}finally{await browser?.close();await new Promise(done=>server.close(done));}
