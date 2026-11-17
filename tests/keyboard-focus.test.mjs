import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import { Controls } from '../src/ui/controls.mjs';
const base=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const source=fs.readFileSync(base+'/src/main.mjs','utf8');
const start=source.indexOf("  window.addEventListener('keydown', (e) => {");
const end=source.indexOf("  window.addEventListener('keyup'",start);
assert.ok(start>=0&&end>start);
class Element {constructor(kind='page'){this.kind=kind;}closest(){return this.kind==='page'?null:this;}matches(s){return s==='input[type="range"]'&&this.kind==='range';}}
const controls=new Controls();controls.sailing=true;controls.mode='keys';
const G={screen:'race',run:{mode:'sailing'},paused:false,sailInput:{sheet:.5,autoTrim:true}};
const calls={paint:0,view:0,pause:0,resume:0,boost:0};let onKey;
vm.runInNewContext(source.slice(start,end),{window:{addEventListener:(type,fn)=>{assert.equal(type,'keydown');onKey=fn;}},Element,G,controls,
 clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),paintSailControls:()=>calls.paint++,toggleView:()=>calls.view++,pause:()=>calls.pause++,resume:()=>calls.resume++,boostPressed:()=>calls.boost++});
const press=(code,kind='range',repeat=false)=>{const e={code,target:new Element(kind),repeat,prevented:false,preventDefault(){this.prevented=true;}};onKey(e);return e;};
for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']){controls.releaseAll();const e=press(key);assert.equal(e.prevented,false,key+' native behavior');assert.equal(controls.k.left||controls.k.right||controls.k.boost||controls.k.brake,false,key+' no game input');}
assert.equal(press('KeyA').prevented,true);assert.equal(controls.k.left,true);controls.releaseAll();
assert.equal(press('KeyD').prevented,true);assert.equal(controls.k.right,true);controls.releaseAll();
assert.equal(press('KeyQ').prevented,true);assert.ok(Math.abs(G.sailInput.sheet-.465)<1e-9);assert.equal(G.sailInput.autoTrim,false);
assert.equal(press('KeyE').prevented,true);assert.ok(Math.abs(G.sailInput.sheet-.5)<1e-9);
press('KeyT');assert.equal(G.sailInput.autoTrim,true);press('KeyT','range',true);assert.equal(G.sailInput.autoTrim,true);
press('KeyC');press('Escape');press('KeyP');assert.equal(calls.view,1);assert.equal(calls.pause,2);
for(const kind of ['text','textarea','select','contenteditable'])for(const key of ['KeyA','KeyQ','KeyT','KeyC','Escape','KeyP']){const prev=JSON.stringify({calls,input:G.sailInput});const e=press(key,kind);assert.equal(e.prevented,false);assert.equal(controls.k.left,false);assert.equal(JSON.stringify({calls,input:G.sailInput}),prev,kind+' excludes shortcuts');}
assert.equal(press('ArrowLeft','page').prevented,true);assert.equal(controls.k.left,true);
console.log('PASS: focused ranges retain 8 native navigation keys and allow A/D/Q/E/T/C/Escape/P; text/select/editable fields stay excluded; unfocused arrow steering works.');
