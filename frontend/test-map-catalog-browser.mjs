import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const names = ['de_dust2','de_mirage','de_inferno','de_nuke','de_anubis','de_cache'];
const output = resolve('../tmp/map-catalog-qa'); mkdirSync(output, { recursive: true });
const fixtures = {};
for (const mapName of names) {
  const map = JSON.parse(readFileSync(`public/map/3d/${mapName}.json`, 'utf8'));
  const ground = map.surfaces.find(s => s.kind === 'ground');
  const players = {};
  for (let i = 1; i <= 10; i++) {
    const tri = Math.floor((ground.indices.length / 3 - 1) * i / 11) * 3;
    const pos = [0,0,0];
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) pos[k] += ground.positions[ground.indices[tri + j] * 3 + k] / 3;
    players[i] = { x: pos[0], y: pos[1], z: pos[2], yaw: i * 30, pitch: 0, alive: true, health: 100, armor: 100, inventory: [], buttons: [] };
  }
  const frames = [0,100].map(timeMs => ({ timeMs, tick: timeMs, round: 1, roundTime: { phase: 'normal', timeRemaining: 90 }, players, projectiles: {} }));
  const meta = { uuid: `catalog-${mapName}`, mapName, totalRounds: 1, totalFrames: 2, totalDurationMs: 100, teamCT: 'CT', teamT: 'T', scoreCT: 0, scoreT: 0,
    serverPlayer: Object.keys(players).map(id => ({ id: +id, name: `Player ${id}`, team: +id <= 5 ? 3 : 2 })) };
  fixtures[mapName] = { entry: { id: meta.uuid, name: `${mapName}.dem`, status: 'ready', rounds: [1], meta }, round: { round: 1, frames }, real: false };
}
// Optional read-only real replay coverage; never writes to the user's library.
const library = process.env.CS_MAP_TEST_LIBRARY;
if (library) for (const name of readdirSync(library)) {
  const dir = join(library, name), entryPath = join(dir, 'entry.json'), roundPath = join(dir, '1.json');
  if (!existsSync(entryPath) || !existsSync(roundPath)) continue;
  const entry = JSON.parse(readFileSync(entryPath, 'utf8')), mapName = entry.meta?.mapName;
  if (!fixtures[mapName] || fixtures[mapName].real) continue;
  fixtures[mapName] = { entry: { ...entry, status: 'ready', rounds: [1] }, round: JSON.parse(readFileSync(roundPath, 'utf8')), real: true };
}
let currentMap = names[0];
const module = `import {createApp,h,reactive,ref} from 'vue';
import * as THREE from 'three';
import MapCanvas3D from '/src/components/ReplayPlayer/MapCanvas3D.vue';
import {has3DMapAsset} from '/src/composables/scene3d/mapCatalog.ts';
const props=reactive({mapName:'',frames:[],currentFrameIndex:0,currentTimeMs:0}); const component=ref();
window.errors=[]; window.THREE=THREE; window.props3d=props; window.has3DMapAsset=has3DMapAsset;
window.app3d=createApp({setup:()=>()=>props.mapName?h(MapCanvas3D,{...props,ref:component,onError:e=>window.errors.push(e)}):null});
window.app3d.mount('#app'); window.get3D=()=>component.value;
window.switchMap=async name=>{const f=await (await fetch('/fixture/'+name)).json();let best=0;
f.round.frames.forEach((v,i)=>{if(Object.keys(v.projectiles||{}).length>Object.keys(f.round.frames[best].projectiles||{}).length)best=i;});
Object.assign(props,{mapName:name,replayMeta:f.entry.meta,frames:f.round.frames,currentFrameIndex:best,currentTimeMs:f.round.frames[best].timeMs,floorView:'upper'});};`;
const server = await createServer({ configFile: 'vite.local.config.ts', appType: 'custom', publicDir: 'public',
  plugins: [{ name: 'catalog-fixture', resolveId: id => id === '/catalog.js' ? '\0catalog' : undefined, load: id => id === '\0catalog' ? module : undefined }],
  server: { host: '127.0.0.1', port: 0 } });
server.middlewares.use(async (req,res,next) => {
  const path = (req.url || '').split('?')[0];
  if (path.startsWith('/fixture/') || path.startsWith('/api/')) {
    assert.equal(req.method, 'GET'); res.setHeader('Content-Type','application/json');
    if (path.startsWith('/fixture/')) res.end(JSON.stringify(fixtures[path.slice(9)]));
    else if (path === '/api/library') res.end(JSON.stringify([fixtures[currentMap].entry]));
    else if (path === '/api/round') res.end(JSON.stringify(fixtures[currentMap].round));
    else { res.statusCode=404; res.end('{}'); } return;
  }
  if (path === '/catalog' || path === '/replayer') {
    res.setHeader('Content-Type','text/html'); res.end(await server.transformIndexHtml(req.url,
      `<!doctype html><html><head><meta charset="UTF-8"><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="app"></div><script type="module" src="${path === '/catalog' ? '/catalog.js' : '/src/main.ts'}"></script></body></html>`)); return;
  } next();
});
await server.listen(); const url=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CS_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error' && /WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});
  await page.goto(url+'/catalog');
  for (const mapName of names) {
    assert.equal(await page.evaluate(name=>window.has3DMapAsset(name),mapName),true);
    await page.evaluate(name=>window.switchMap(name),mapName);
    await page.waitForFunction(name=>window.get3D()?.getSandbox()?.scene.getObjectByName('map-whitebox') && window.get3D().getSandbox().mapName===name,mapName);
    assert.deepEqual(await page.evaluate(()=>window.errors),[]);
    await page.waitForTimeout(150);
    const state=await page.evaluate(()=>window.get3D().inspect());
    assert.ok(state.mapTriangles>1000 && state.mapTriangles<150000);
    assert.ok(state.players.length>0); assert.equal(state.camera.zoom,1.5);
    await page.evaluate(()=>{const s=window.get3D().getSandbox();s.camera.zoom=1;s.camera.updateProjectionMatrix();s.dirty=true;});
    await page.waitForTimeout(100);
    await page.screenshot({path:resolve(output,`${mapName}.png`)});
    console.log(JSON.stringify({mapName,realReplay:fixtures[mapName].real,...state}));
    if(mapName==='de_nuke') {
      const sections=await page.evaluate(async()=>{
        const s=window.get3D().getSandbox(), b=s.scene.getObjectByName('bombsite-B');
        const pos=s.camera.position.clone(), target=s.controls.target.clone(), zoom=s.camera.zoom;
        window.props3d.floorView='lower'; await new Promise(r=>setTimeout(r,100));
        const p=s.renderer.clippingPlanes[0];
        return { lower:p.distanceToPoint(b.position), upper:p.distanceToPoint(s.scene.getObjectByName('bombsite-A').position),
          unchanged:pos.equals(s.camera.position)&&target.equals(s.controls.target)&&zoom===s.camera.zoom };
      });
      assert.ok(sections.lower>0 && sections.upper<0 && sections.unchanged,'lower section reveals B while preserving camera/coordinates');
      await page.screenshot({path:resolve(output,'de_nuke-lower.png')});
      const middle = await page.evaluate(async()=>{
        const s=window.get3D().getSandbox(), position=s.camera.position.clone(), target=s.controls.target.clone(), zoom=s.camera.zoom;
        window.props3d.floorView='middle'; await new Promise(r=>setTimeout(r,100));
        const material=s.scene.getObjectByName('map-wall').material, p=material.clippingPlanes[0];
        return {ground:p.distanceToPoint(new window.THREE.Vector3(0,-416,0)), roof:p.distanceToPoint(new window.THREE.Vector3(0,0,0)),
          limit:p.constant, normal:p.normal.y, shadow:material.clipShadows,
          entitiesUncut:s.renderer.clippingPlanes.length===0 && [...s.entities.players.values()].every(v=>!v.torso.material.clippingPlanes?.length),
          unchanged:position.equals(s.camera.position)&&target.equals(s.controls.target)&&zoom===s.camera.zoom};
      });
      assert.equal(middle.limit,-344); assert.equal(middle.normal,-1);
      assert.equal(middle.ground,72); assert.ok(middle.roof<0);
      assert.ok(middle.shadow && middle.entitiesUncut && middle.unchanged,'middle section removes tall buildings and their shadows, not game entities or camera state');
      await page.screenshot({path:resolve(output,'de_nuke-middle.png')});
      await page.evaluate(()=>{window.props3d.floorView='upper';}); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>{
        const s=window.get3D().getSandbox(); return s.renderer.clippingPlanes.length+s.scene.getObjectByName('map-wall').material.clippingPlanes.length;
      }),0,'upper level restores the previous complete model');
      await page.screenshot({path:resolve(output,'de_nuke-upper.png')});
    }
  }
  await page.evaluate(()=>window.app3d.unmount()); assert.equal(await page.locator('canvas').count(),0);
  for(const mapName of names) {
    currentMap=mapName;
    await page.goto(`${url}/replayer?demo_uuid=${encodeURIComponent(fixtures[mapName].entry.meta.uuid)}&round=1`);
    await page.getByRole('button',{name:'3D 沙盘',exact:true}).waitFor();
    await page.locator('.map-canvas-3d canvas').first().waitFor();
    assert.equal(await page.getByRole('button',{name:'3D 沙盘',exact:true}).isEnabled(),true);
    if(mapName==='de_nuke') {
      const levels=page.getByRole('group',{name:'Nuke 楼层'});
      assert.deepEqual(await levels.getByRole('button').allTextContents(),['上层','中层','下层']);
      assert.equal(await levels.getByRole('button',{name:'上层',exact:true}).getAttribute('aria-pressed'),'true');
      for(const name of ['中层','下层','上层']) { await levels.getByRole('button',{name,exact:true}).click(); assert.equal(await levels.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true'); }
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: six maps, map switching/teardown, actual and synthetic replay data, Nuke sections, full ReplayPlayer integration');
} finally {await browser?.close(); await server.close();}
