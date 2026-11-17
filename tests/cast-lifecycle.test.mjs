import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const base=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const url=(p)=>pathToFileURL(base+'/'+p).href;
register('data:text/javascript,'+encodeURIComponent(`
const base=${JSON.stringify(base)};
export function resolve(specifier, context, nextResolve) {
 if(specifier==='three')return {url:'file://'+base+'/vendor/three-0.186.1/build/three.module.js',shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return {url:'file://'+base+'/vendor/three-0.186.1/examples/jsm/'+specifier.slice(13),shortCircuit:true};
 return nextResolve(specifier,context);
}`),import.meta.url);
// CPU scene-graph verification: canvas calls and image bitmap pixels are stubbed; GLB geometry, rigs, animations and game methods are real.
const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>ctx})};
globalThis.Image=class {set src(v){this._src=v;}};
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:1024,height:1024,close(){}});
const THREE=await import('three');
const {Stage}=await import(url('src/view/stage.mjs'));
const {People,KING,JACK,CAST_H,crewClip,tick}=await import(url('src/view/people.mjs')+'?v=7d4a3824');
const {BoatVisual}=await import(url('src/view/boats.mjs')+'?v=7d4a3824');
const {BayView}=await import(url('src/view/bay-view.mjs')+'?v=7d4a3824');
const {makeJukung}=await import(url('src/view/jukung.mjs')+'?v=7d4a3824');
const {FLEET,FLEET_KEYS}=await import(url('src/view/fleet.mjs')+'?v=7d4a3824');
assert.ok(FLEET['jukung-racer'].practiceOnly);
assert.ok(!FLEET_KEYS.includes('jukung-racer'));
const s=Object.create(Stage.prototype);s.scene=new THREE.Scene();s.people=new People();s.base='./assets/';s.focus=0;
s.people.loader.loadAsync=async(p)=>{const bytes=await fs.readFile(base+'/'+p.replace(/^\.\//,'').split('?')[0]);return s.people.loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');};
const originalMake=s.people.make.bind(s.people);
s.people.make=(id,height)=>{const p=originalMake(id,height);p.hold.userData.castId=id;return p;};
s.skipperIds=[];s.crewIds=[];s.jack=null;s.jackId=null;s.jackAt=null;s.bossId=null;
const tour=makeJukung();tour.key='jukung';tour.paint=false;
s.fleet={yacht:tour,jukung:tour};s.yacht=tour;s.fleetLoads=new Map();
const vis=new BoatVisual(tour);s.scene.add(vis.group);
s.boats=[{vis,key:'yacht',want:'yacht',wake:{stern:0}}];
s.bayView={group:new THREE.Group(),others:[makeJukung({lookout:false}).template],setVoyage(){},setJack:BayView.prototype.setJack};
s.bayView.group.add(s.bayView.others[0]);s.scene.add(s.bayView.group);
const count=(id)=>{let n=0;s.scene.traverse(o=>{if(o.userData.castId===id)n++;});return n;};
const check=(id,n)=>assert.equal(count(id),n,`${id} count`);
const startTrial=async()=>{s.setVoyage(null);await Promise.all([s.setBoats(['jukung-racer']),s.setSkippers([JACK])]);const b=s.boats[0],j=b.skipper;check(JACK,1);check(KING,0);assert.equal(s.jack,null);assert.equal(j.hold.parent,b.vis.group);assert.equal(b.key,'jukung-racer');assert.equal(b.vis.group.getObjectByName('jk-lookout'),undefined);assert.ok(Math.abs(j.hold.position.y+j.hip-FLEET['jukung-racer'].seat.y)<1e-9);crewClip(j,'sit');tick(j,.5,1);j.hold.updateMatrixWorld(true);assert.ok(j.root.getObjectByName('Hip'));};
const startVoyage=async(v)=>{const cast=s.setVoyage(v);await Promise.all([s.setBoats(['jukung']),s.setSkippers([KING]),cast]);check(JACK,1);check(KING,1);assert.equal(s.boats[0].skipper.id,KING);assert.equal(s.jack.id,JACK);assert.notEqual(s.jack,s.boats[0].skipper);};
await startVoyage({key:'mk1'});assert.equal(s.jackAt,'bow');assert.equal(s.jack.hold.parent,s.boats[0].vis.group);
for(let i=0;i<3;i++){
 await startTrial();
 await startVoyage({key:'mk2'});assert.equal(s.jackAt,'boat');assert.equal(s.jack.hold.parent,s.bayView.others[0].children[0]);
 await startTrial();
 await startVoyage({key:'mk3',jack:null});assert.equal(s.jackAt,'beach');assert.equal(s.jack.hold.parent,s.bayView.group);
 await startTrial();
 await startVoyage({key:'mk3',jack:{}});assert.equal(s.jackAt,'boat');
}
await startTrial();
s.setVoyage(null);await s.setSkippers([]);check(JACK,0);check(KING,0);
assert.equal(s.people.src.size,0);
console.log(JSON.stringify({pass:true,cycles:3,actualGLBs:['king','jack'],checks:['single Jack','voyage King retained','bow/boat/beach roles','racer no lookout','racer hip target','native boat swaps','skeleton cleanup'],rendered:false},null,2));
