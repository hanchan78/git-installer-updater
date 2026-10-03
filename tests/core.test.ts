import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Disk, Entry, GitHub, directory, manifest, pluginId, replace, repository, sanitizeSettings, state, updateOrder, version } from '../src/core';
const m={id:'sample',name:'Sample',version:'1.9.0',minAppVersion:'1.5.0',author:'Me',description:'Test'};
const entry:Entry={owner:'someone',repo:'sample',branch:'main',directory:'dist',id:'sample',name:'Sample'};
class MemoryDisk implements Disk {
 files=new Map<string,string>(); folders=new Set<string>(); fail=''; recoveryFail=false;
 async exists(p:string){return this.files.has(p)||this.folders.has(p);}
 async read(p:string){if(!this.files.has(p))throw Error('missing '+p);return this.files.get(p)!;}
 async write(p:string,s:string){if(p===this.fail){this.fail='';throw Error('disk failure');}if(this.recoveryFail&&p==='plugins/sample/main.js')throw Error('persistent failure');this.files.set(p,s);}
 async mkdir(p:string){this.folders.add(p);}
 async remove(p:string){this.files.delete(p);for(const k of this.files.keys())if(k.startsWith(p+'/'))this.files.delete(k);this.folders.delete(p);}
}
test('semantic ordering, prereleases, equal versions, downgrades and compatibility',()=>{
 assert.equal(state(m,{...m,version:'1.10.0'},'1.6.0',false),'Update available');
 assert.equal(state(m,m,'1.6.0',false),'Up to date');
 assert.equal(state({...m,version:'2.0.0'},m,'1.6.0',false),'Installed version newer than remote');
 assert.equal(state({...m,version:'2.0.0-beta.2'},{...m,version:'2.0.0-beta.11'},'1.6.0',false),'Update available');
 assert.equal(state(null,{...m,isDesktopOnly:true},'1.6.0',true),'Incompatible');
 assert.equal(state(null,m,'1.4.0',false),'Incompatible');assert.equal(state(null,m,'1.6.0',false),'Not installed');
 for(const v of ['1.2','v1.2.3','01.2.3','1.0.0-01',' 1.2.3'])assert.throws(()=>version(v));
});
test('strict manifests and paths reject malformed and escaping inputs',()=>{
 assert.equal(manifest(JSON.stringify(m)).id,'sample');
 for(const bad of [{...m,id:'../bad'},{...m,version:'oops'},{...m,minAppVersion:'no'},{...m,author:''},{...m,isDesktopOnly:'yes'}])assert.throws(()=>manifest(JSON.stringify(bad)));
 for(const p of ['../dist','/dist','a/../../b','a\\b','a//b','C:/dist','a/.','a/..'])assert.throws(()=>directory(p));
 for(const id of ['../bad','a/b','UPPER','a\\b',''])assert.throws(()=>pluginId(id));
 assert.deepEqual(repository('https://github.com/me/my-plugin.git'),{owner:'me',repo:'my-plugin'});
 assert.throws(()=>repository('https://evil.test/me/plugin'));assert.equal(directory('build/plugins'),'build/plugins');
});
test('all files use one commit, missing stylesheet is optional; server errors fail',async()=>{
 const urls:string[]=[];const sha='a'.repeat(40);let cssStatus=404;
 const gh=new GitHub(async url=>{urls.push(url);if(url.includes('/commits/'))return {status:200,text:JSON.stringify({sha})};if(url.endsWith('manifest.json'))return {status:200,text:JSON.stringify(m)};if(url.endsWith('main.js'))return {status:200,text:'module.exports = class {};'};return {status:cssStatus,text:''};});
 const snapshot=await gh.resolve(entry);const files=await gh.package(entry,snapshot);assert.equal(files['styles.css'],undefined);assert.ok(urls.slice(1).every(u=>u.includes('/'+sha+'/')));
 cssStatus=500;await assert.rejects(()=>gh.package(entry,snapshot),/HTTP 500/);
});
test('fresh installation and update preserve settings and unrelated files, remove only managed styles',async()=>{
 const d=new MemoryDisk();const root='plugins/sample';d.files.set(root+'/data.json','{"secret":"keep"}');d.files.set(root+'/custom.txt','keep');
 await replace(d,root,{'main.js':'old','manifest.json':JSON.stringify(m),'styles.css':'old css'},false);
 await replace(d,root,{'main.js':'new','manifest.json':JSON.stringify({...m,version:'1.10.0'})},true);
 assert.equal(d.files.get(root+'/main.js'),'new');assert.equal(d.files.get(root+'/data.json'),'{"secret":"keep"}');assert.equal(d.files.get(root+'/custom.txt'),'keep');assert.equal(d.files.has(root+'/styles.css'),false);
 d.files.set(root+'/styles.css','unmanaged');await replace(d,root,{'main.js':'newer','manifest.json':JSON.stringify(m)},false);assert.equal(d.files.get(root+'/styles.css'),'unmanaged');
});
test('replacement failure rolls back installed files and keeps settings',async()=>{
 const d=new MemoryDisk();const root='plugins/sample';d.files.set(root+'/main.js','old');d.files.set(root+'/manifest.json','old manifest');d.files.set(root+'/styles.css','old css');d.files.set(root+'/data.json','settings');d.fail=root+'/main.js';
 await assert.rejects(()=>replace(d,root,{'main.js':'new','manifest.json':'new manifest'},true),/disk failure/);
 assert.equal(d.files.get(root+'/manifest.json'),'old manifest');assert.equal(d.files.get(root+'/main.js'),'old');assert.equal(d.files.get(root+'/styles.css'),'old css');assert.equal(d.files.get(root+'/data.json'),'settings');
});
test('failed fresh installation leaves no program files and failed rollback keeps backup',async()=>{
 const d=new MemoryDisk();d.fail='plugins/sample/main.js';await assert.rejects(()=>replace(d,'plugins/sample',{'main.js':'new','manifest.json':'new'},false));assert.equal(d.files.has('plugins/sample/manifest.json'),false);
 d.files.set('plugins/sample/main.js','old');d.recoveryFail=true;await assert.rejects(()=>replace(d,'plugins/sample',{'main.js':'new','manifest.json':'new'},false),/Backup retained/);assert.ok([...d.files.keys()].some(p=>p.includes('.backup-')&&p.endsWith('main.js')));
});
test('settings recover from malformed data and reject duplicate plugin sources; self updates are last',()=>{
 assert.deepEqual(sanitizeSettings(null),[]);assert.deepEqual(sanitizeSettings({entries:'bad'}),[]);
 const entries=sanitizeSettings({entries:[entry,{...entry,repo:'other'}, {...entry,id:'../escape'}, {...entry,id:'manager'}]});assert.equal(entries.length,2);
 const ordered=updateOrder([entries[1],entries[0]],'manager');assert.equal(ordered[ordered.length-1]?.id,'manager');
});
