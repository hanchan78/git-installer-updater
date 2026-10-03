import { test } from 'node:test';
import assert from 'node:assert/strict';
import Manager from '../src/main';
import { Entry, GitHub } from '../src/core';
function fixture(){
 const files=new Map<string,string>();const folders=new Set<string>();const events:string[]=[];
 const adapter={exists:async(p:string)=>files.has(p)||folders.has(p),read:async(p:string)=>{if(!files.has(p))throw Error('Missing file');return files.get(p)!;},write:async(p:string,v:string)=>{events.push('write:'+p);files.set(p,v);},mkdir:async(p:string)=>{folders.add(p);},stat:async(p:string)=>({type:folders.has(p)?'folder':'file'}),remove:async(p:string)=>{files.delete(p);},rmdir:async(p:string)=>{folders.delete(p);for(const k of files.keys())if(k.startsWith(p+'/'))files.delete(k);}};
 const p=new Manager({} as any,{} as any);p.app={vault:{configDir:'.custom',adapter},plugins:{enabledPlugins:new Set(['alpha','git-installer-updater']),unloadPlugin:async(id:string)=>{events.push('unload:'+id);},loadPlugin:async(id:string)=>{events.push('load:'+id);}}} as any;p.manifest={id:'git-installer-updater'} as any;p.refresh=()=>{};
 const entry=(id:string):Entry=>({owner:'me',repo:id,branch:'main',directory:'',id,name:id});
 const remote=(id:string,version='2.0.0')=>JSON.stringify({id,name:id,version,minAppVersion:'1.5.0',description:'test',author:'Me'});
 p.github=new GitHub(async(url:string)=>{const id=url.split('/')[4];if(id==='broken')return {status:500,text:''};if(url.includes('/commits/'))return {status:200,text:JSON.stringify({sha:'a'.repeat(40)})};if(url.endsWith('manifest.json'))return {status:200,text:remote(id)};if(url.endsWith('styles.css'))return {status:404,text:''};return {status:200,text:'module.exports = class {};'};});
 const install=(id:string)=>{files.set(`.custom/plugins/${id}/manifest.json`,remote(id,'1.0.0'));files.set(`.custom/plugins/${id}/main.js`,'old');files.set(`.custom/plugins/${id}/data.json`,'settings');};
 return {p,files,events,entry,install};
}
test('tracking and checking existing installation are read-only; individual update preserves enabled state and settings',async()=>{
 const {p,files,events,entry,install}=fixture();install('alpha');const e=entry('alpha');p.entries=[e];const before=[...files];await p.operation(e);assert.deepEqual([...files],before);assert.equal(e.status,'Update available');assert.equal(events.length,0);
 await p.operation(e,true);assert.equal(e.installedVersion,'2.0.0');assert.equal(files.get('.custom/plugins/alpha/data.json'),'settings');assert.equal(events[0],'unload:alpha');assert.equal(events[events.length-1],'load:alpha');
 // Removing tracking touches only manager persistence.
 const updated=[...files];p.entries=[];await p.save();assert.deepEqual([...files],updated);
});
test('explicit fresh installation stays disabled; disk versions override cached state',async()=>{
 const {p,files,events,entry,install}=fixture();const e=entry('new');p.entries=[e];await p.operation(e);assert.equal(e.status,'Not installed');await p.operation(e,true);assert.equal(e.status,'Up to date');assert.ok(files.has('.custom/plugins/new/main.js'));assert.ok(!events.some(e=>e.startsWith('load:')));
 install('alpha');const a=entry('alpha');a.installedVersion='99.0.0';await p.operation(a);assert.equal(a.installedVersion,'1.0.0');assert.equal(a.status,'Update available');
});
test('bulk failures are isolated, tracked-only entries skipped, self update last with restart and no unload',async()=>{
 const {p,files,events,entry,install}=fixture();for(const id of ['alpha','beta','git-installer-updater'])install(id);
 p.entries=['git-installer-updater','broken','tracked','alpha','beta'].map(entry);await p.runBulk(true);
 assert.equal(files.has('.custom/plugins/tracked/main.js'),false);assert.equal(p.entries.find(e=>e.id==='broken')?.status,'Check failed');assert.equal(p.entries.find(e=>e.id==='beta')?.installedVersion,'2.0.0');
 const liveWrites=events.filter(e=>/^write:\.custom\/plugins\/[^/]+\/main.js$/.test(e));assert.equal(liveWrites[liveWrites.length-1],'write:.custom/plugins/git-installer-updater/main.js');assert.ok(!events.includes('unload:git-installer-updater'));assert.ok(!events.includes('load:beta'));assert.equal(p.entries[0].status,'Restart required');assert.equal(files.get('.custom/plugins/git-installer-updater/data.json'),'settings');assert.match(p.summary,/Failed broken/);assert.match(p.summary,/Skipped tracked/);
});
