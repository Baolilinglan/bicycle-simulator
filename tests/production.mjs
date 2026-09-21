import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Serve exactly as a project Pages deployment, with no assets at the domain root.
const root=resolve('dist'),prefix='/bicycle-simulator/';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
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
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();const errors=[],badResponses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)badResponses.push(r.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.waitForFunction(()=>window.bicycleDiagnostics?.ready);
  assert.equal((await page.evaluate(()=>window.bicycleDiagnostics.rider())).bones,16);
  await page.locator('#start').click();await page.locator('#dismiss-help').click();
  await page.waitForFunction(()=>window.bicycleDiagnostics.music().time>.1);
  assert.ok((await page.evaluate(()=>window.bicycleDiagnostics.music())).duration>30);
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);
  console.log('Production page, BGM and skinned model load correctly from /bicycle-simulator/.');
}finally{await browser?.close();await new Promise(done=>server.close(done));}
