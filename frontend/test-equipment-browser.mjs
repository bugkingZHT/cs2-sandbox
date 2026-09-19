import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const output = resolve('../tmp/equipment-3d-qa');
mkdirSync(output, { recursive: true });
const entry = `
import * as THREE from 'three';
import { ReplayEntities } from '/src/composables/scene3d/replayEntities.ts';
import { EquipmentModels } from '/src/composables/scene3d/equipmentModels.ts';
import { EQUIPMENT_KINDS } from '/src/composables/scene3d/equipmentKinds.ts';
import { createToonGradient } from '/src/composables/scene3d/mapGeometry.ts';
import { sampleReplayFrame, demoDirectionToScene } from '/src/composables/scene3d/sampleReplayFrame.ts';
const gradient = createToonGradient(), entities = new ReplayEntities(gradient);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe6e9e9);
scene.add(entities.group, new THREE.HemisphereLight(0xffffff, 0x859097, 2.1));
const sun = new THREE.DirectionalLight(0xfff8ee, 2.5); sun.position.set(-200,500,350); scene.add(sun);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(1600,950); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const camera = new THREE.OrthographicCamera(-590,590,350,-350,1,3000);
camera.position.set(180,680,900); camera.lookAt(0,20,0);
const ids = [309,303,102,202,206,4,405,505,504,506,502,503,501,404];
const players = Object.fromEntries(ids.map((id,i) => [i+1,{id:i+1,name:EQUIPMENT_KINDS[i],team:i%2 ? 2:3,
  alive:true,x:(i%7-3)*158,y:Math.floor(i/7)*-225+120,z:0,yaw:-30,pitch:0,activeWeapon:String(id),inventory:[]} ]));
const frame = {round:1,timeMs:0,tick:0,players};
function update(f=frame,options={}) { entities.update(f,{currentTimeMs:0,...options}); scene.updateMatrixWorld(true); }
function render() { entities.updateLabels(1180/1600); renderer.render(scene,camera); }
update();
for (const visual of entities.players.values()) visual.fieldOfView.visible=false;
const floorMaterial = new THREE.MeshToonMaterial({color:0xc8d0cd,gradientMap:gradient});
for (const player of Object.values(players)) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(49,51,5,32),floorMaterial);
  base.position.set(player.x,-4,-player.y); scene.add(base);
}
render();
window.qa={THREE,entities,scene,renderer,camera,frame,update,render,ids,EQUIPMENT_KINDS,sampleReplayFrame,demoDirectionToScene,EquipmentModels,gradient};
`;
const server = await createServer({ configFile: 'vite.local.config.ts', appType:'custom',
  plugins:[{name:'equipment-qa',resolveId:id=>id==='/equipment-entry.js'?'\0equipment-qa':undefined,
    load:id=>id==='\0equipment-qa'?entry:undefined}], server:{host:'127.0.0.1',port:0} });
server.middlewares.use(async (req,res,next)=>{
  if (req.url === '/favicon.ico') { res.statusCode=204;res.end();return; }
  if (req.url !== '/equipment') return next();
  res.setHeader('Content-Type','text/html');
  res.end(await server.transformIndexHtml('/equipment','<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body><script type="module" src="/equipment-entry.js"></script></body></html>'));
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ headless:true, executablePath:process.env.CS_TEST_BROWSER ||
    ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),
    args:['--enable-webgl','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({viewport:{width:1600,height:950}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/equipment`);
  await page.waitForFunction(()=>window.qa);
  await page.screenshot({path:resolve(output,'held-equipment.png')});
  const results = await page.evaluate(()=>{
    const {entities,scene,renderer,frame,update,render,ids,EQUIPMENT_KINDS,THREE,sampleReplayFrame,demoDirectionToScene,EquipmentModels,gradient}=window.qa;
    const visible=node=>{for(;node;node=node.parent)if(!node.visible)return false;return true;};
    const state=()=>[...entities.players.values()].map(v=>({kind:v.weapon.userData.equipmentKind,geometry:v.weapon.geometry.uuid,
      triangles:v.weapon.geometry.attributes.position.count/3+v.weapon.children[0].geometry.attributes.position.count/3,
      visible:visible(v.weapon),mesh:v.weapon.uuid,arms:v.arms.uuid,material:v.weapon.material.uuid}));
    const muzzleEnds=[...entities.players.values()].slice(0,6).map(v=>{
      v.weapon.geometry.computeBoundingBox();return v.weapon.geometry.boundingBox.max.x+v.weapon.position.x;
    });
    const initial=state(), v=entities.players.get(1), first=structuredClone(frame), next=structuredClone(frame);
    next.timeMs=100;next.players[1].activeWeapon='405';next.players[1].yaw=90;next.players[1].pitch=-30;
    update(sampleReplayFrame([first,next],99));const before=v.weapon.userData.equipmentKind;
    update(sampleReplayFrame([first,next],100));const at=v.weapon.userData.equipmentKind;
    const direction=new THREE.Vector3(1,0,0).transformDirection(v.weapon.matrixWorld).toArray();
    const expected=[0,1,0];
    update(first,{hiddenPlayerIds:[1]});const hidden=!visible(v.weapon);
    first.players[1].alive=false;update(first);const dead=!visible(v.weapon)&&!visible(v.arms);
    first.players[1].alive=true;first.players[1].activeWeapon='999';update(first);const unknown=!visible(v.weaponRig);
    first.players[1].activeWeapon='404';first.players[1].inventory=['404'];update(first);
    const c4=visible(v.weapon)&&!visible(v.c4);update(first,{showMapBomb:false});const c4Hidden=!visible(v.weapon);
    const c4Frames = [0,100,200].map(timeMs => ({...structuredClone(frame),timeMs,
      players:{1:{...frame.players[1],activeWeapon:'404',yaw:75,pitch:-65,buttons:timeMs===100?[1]:[]}}}));
    const pose = timeMs => {
      update(sampleReplayFrame(c4Frames,timeMs));
      return {normal:new THREE.Vector3(0,0,1).transformDirection(v.weapon.matrixWorld).toArray(),
        arms:v.arms.geometry.uuid,triangles:v.arms.geometry.attributes.position.count/3,
        rotation:v.weapon.rotation.toArray(),mesh:v.weapon.uuid,handMesh:v.arms.uuid};
    };
    const idleC4=pose(99), plantingC4=pose(100), heldC4=pose(150), releasedC4=pose(200), reverseC4=pose(99);
    update(c4Frames[1],{firstPersonPlayerId:1});
    const firstPersonC4=new THREE.Vector3(0,0,1).transformDirection(v.weapon.matrixWorld).toArray();
    const singles=[];
    for(const id of [405,505,504,506,502,503,501]) {
      first.players[1].activeWeapon=String(id); first.players[1].buttons=[]; update(first);
      singles.push({arms:v.arms.geometry.uuid,triangles:v.arms.geometry.attributes.position.count/3});
    }
    first.players[1].activeWeapon='303'; update(first);
    const resetAfterC4=v.weapon.rotation.toArray().slice(0,3);
    first.players[1].activeWeapon='404'; first.players[1].buttons=[2048]; update(first);
    const secondaryAttack=v.arms.geometry.uuid;
    first.players[1].buttons=[];
    update(frame);render();const baseline=renderer.info.memory.geometries;
    // Stress switches and backwards seeks; allocated Mesh objects and GPU resources must stay bounded.
    for(let i=0;i<140;i++){
      for(const [key,p] of Object.entries(first.players))p.activeWeapon=String(ids[(i+Number(key))%ids.length]);
      update(first,{currentTimeMs:i%2?100:0});render();
    }
    const after=state(), memory=renderer.info.memory.geometries;
    // Unmounted cached variants must be freed too (scene traversal cannot reach them).
    const cache=new EquipmentModels(gradient), accent=new THREE.MeshBasicMaterial(), resources=new Set();
    for(const kind of EQUIPMENT_KINDS){const mesh=cache.create(kind,accent);resources.add(mesh.geometry);resources.add(mesh.children[0].geometry);}
    resources.add(cache.longArms);resources.add(cache.shortArms);resources.add(cache.utilityArms);resources.add(cache.c4Arms);resources.add(cache.material);
    let disposed=0;for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
    cache.dispose();accent.dispose();
    update(frame);for(const p of entities.players.values())p.fieldOfView.visible=false;render();
    return {initial,after,muzzleEnds,before,at,direction,expected,hidden,dead,unknown,c4,c4Hidden,baseline,memory,disposed,resources:resources.size,
      idleC4,plantingC4,heldC4,releasedC4,reverseC4,firstPersonC4,singles,resetAfterC4,secondaryAttack};
  });
  assert.deepEqual(results.initial.map(v=>v.kind),['sniper','rifle','smg','shotgun','machinegun','pistol','knife','smoke','flash','hegrenade','molotov','incendiary','decoy','c4']);
  assert.equal(new Set(results.initial.map(v=>v.geometry)).size,14);
  assert.equal(new Set(results.initial.map(v=>v.material)).size,1,'colored models share one toon material');
  assert.ok(results.muzzleEnds.every((x,i)=>Math.abs(x-(i===0?76:48))<1e-6),'the longer sniper barrel and other guns match their muzzle offsets');
  assert.ok(results.initial.every(v=>v.visible&&v.triangles<650),'each recognizable model stays below 650 triangles');
  assert.equal(results.before,'sniper'); assert.equal(results.at,'knife','switch on exact discrete replay timestamp');
  results.direction.forEach((value,i)=>assert.ok(Math.abs(value-results.expected[i])<1e-6,'the held knife stays upright when looking up'));
  for(const key of ['hidden','dead','unknown','c4','c4Hidden'])assert.ok(results[key],key);
  assert.deepEqual(results.after.map(v=>[v.mesh,v.arms]),results.initial.map(v=>[v.mesh,v.arms]));
  assert.equal(results.memory,results.baseline,'repeated switching does not allocate GPU geometry');
  assert.equal(results.disposed,results.resources,'dispose includes all cached models');
  assert.equal(results.idleC4.triangles,results.singles[0].triangles*2,'C4 always has two arms while other utility holds have one');
  assert.deepEqual(results.singles,Array(7).fill(results.singles[0]),'knife and all grenades use the single right arm');
  assert.notEqual(results.idleC4.arms,results.singles[0].arms);
  for(const normal of [results.idleC4.normal,results.plantingC4.normal,results.firstPersonC4]) [0,1,0].forEach((value,i)=>assert.ok(Math.abs(normal[i]-value)<1e-6,'C4 always lies parallel to the ground, in both perspectives'));
  assert.deepEqual(results.idleC4,results.plantingC4,'pressing attack does not change the C4 hold');
  assert.deepEqual(results.plantingC4,results.heldC4,'holding primary attack keeps the same cached pose');
  assert.deepEqual(results.idleC4,results.releasedC4,'releasing attack keeps two-handed horizontal C4');
  assert.deepEqual(results.idleC4,results.reverseC4,'reverse seek restores the exact pre-attack pose');
  assert.equal(results.secondaryAttack,results.idleC4.arms,'secondary attack also leaves C4 two-handed');
  assert.deepEqual(results.resetAfterC4,[0,0,0],'C4 rotation cannot leak onto the next weapon');
  for(const [name,buttons] of [['c4-idle-horizontal',[]],['c4-horizontal',[1]]]) {
    await page.evaluate(buttons=>{
      const {frame,entities,update,render,camera,THREE}=window.qa;
      const f=structuredClone(frame); f.players={1:{...f.players[1],activeWeapon:'404',yaw:-30,pitch:-55,buttons}};
      update(f); entities.players.get(1).fieldOfView.visible=false;
      const target=entities.players.get(1).group.position.clone().add(new THREE.Vector3(10,38,0));
      camera.position.copy(target).add(new THREE.Vector3(150,100,180));camera.lookAt(target);camera.zoom=4;camera.updateProjectionMatrix();render();
    },buttons);
    await page.screenshot({path:resolve(output,name+'.png')});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({models:results.initial.map(v=>({kind:v.kind,triangles:v.triangles})),geometryCount:results.memory,screenshot:resolve(output,'held-equipment.png')}));
} finally { await browser?.close();await server.close(); }
