import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, apiVersion, requestUrl } from 'obsidian';
import { Entry, GitHub, Manifest, compatible, directory, manifest, replace, repository, sanitizeSettings, state, updateOrder } from './core';
import { Lifecycle } from './lifecycle';

export default class Manager extends Plugin {
 entries:Entry[]=[]; busy=new Set<string>(); bulk=false; summary=''; tab!:ManagerTab;
 github=new GitHub(async url=>{const r=await requestUrl({url,throw:false});return {status:r.status,text:r.text};});
 async onload(){this.entries=sanitizeSettings(await this.loadData()); // A new running process activates staged self-updates.
 for(const e of this.entries){if(e.restart){e.restart=false;e.status=undefined;}}
 this.tab=new ManagerTab(this.app,this);this.addSettingTab(this.tab);this.addCommand({id:'check-updates',name:'Check tracked plugins for updates',callback:()=>{void this.runBulk(false);}});}
 async save(){await this.saveData({schema:1,entries:this.entries});}
 refresh(){this.tab?.display();}
 root(e:Entry){return `${this.app.vault.configDir}/plugins/${e.id}`;}
 async local(e:Entry):Promise<Manifest|null>{const p=`${this.root(e)}/manifest.json`;if(!await this.app.vault.adapter.exists(p)){if(await this.app.vault.adapter.exists(this.root(e)))throw Error('Plugin directory exists without a manifest. Resolve it manually before installation.');return null;}const m=manifest(await this.app.vault.adapter.read(p));if(m.id!==e.id)throw Error('Installed manifest ID does not match its directory.');return m;}
 async inspect(e:Entry){const snapshot=await this.github.resolve(e);if(snapshot.manifest.id!==e.id)throw Error('Remote plugin ID changed. Remove tracking and review the repository again.');const local=await this.local(e);e.name=snapshot.manifest.name;e.remoteVersion=snapshot.manifest.version;e.installedVersion=local?.version;e.status=e.restart?'Restart required':state(local,snapshot.manifest,apiVersion,Platform.isMobile);e.detail=e.status==='Incompatible'?`Requires Obsidian ${snapshot.manifest.minAppVersion}${snapshot.manifest.isDesktopOnly?'; desktop only':''}`:'';e.checked=Date.now();return {snapshot,local};}
 async operation(e:Entry,install=false,fromBulk=false){if(this.busy.has(e.id)||(this.bulk&&!fromBulk))return 'Skipped: operation in progress';this.busy.add(e.id);this.refresh();let result='';try{const {snapshot,local}=await this.inspect(e);
 if(install&&!e.restart&&(!local||e.status==='Update available')){
 if(!compatible(snapshot.manifest,apiVersion,Platform.isMobile))throw Error('Plugin is incompatible with this Obsidian version or platform.');
 const files=await this.github.package(e,snapshot); // Finish network validation before unloading.
 // Detect an external update between download and replacement.
 const latest=await this.local(e);if(latest?.version!==local?.version)throw Error('Installed version changed during download. Check again.');
 e.status='Updating';this.refresh();const lifecycle=new Lifecycle(this.app);const paused=await lifecycle.pause(e.id,e.id===this.manifest.id);let committed=false;
 try{const a=this.app.vault.adapter;await replace({exists:p=>a.exists(p),read:p=>a.read(p),write:(p,s)=>a.write(p,s),mkdir:p=>a.mkdir(p),remove:async p=>{const st=await a.stat(p);if(st?.type==='folder')await a.rmdir(p,true);else await a.remove(p);}},this.root(e),files,e.managedStyles===true);committed=true;
 e.managedStyles=files['styles.css']!==undefined;e.installedVersion=snapshot.manifest.version;e.restart=paused.restart;
 }finally{try{await lifecycle.resume(e.id,paused.paused);}catch(err){e.restart=true;e.detail=`Reload failed: ${String(err)}. Restart Obsidian.`;if(!committed)throw err;}}
 e.status=e.restart?'Restart required':'Up to date';result=`Updated ${e.name} to ${e.installedVersion}${e.restart?' (restart required)':''}`;
 }else result=`Skipped ${e.name}: ${e.status}`;
 }catch(err){e.status='Check failed';e.detail=String(err);e.checked=Date.now();result=`Failed ${e.name}: ${String(err)}`;}finally{this.busy.delete(e.id);try{await this.save();}catch(err){result+=` — settings save failed: ${String(err)}`;}this.refresh();}return result;}
 async runBulk(update:boolean){if(this.bulk||this.busy.size)return;this.bulk=true;this.refresh();const results:string[]=[];try{for(const e of updateOrder(this.entries,this.manifest.id)){
 // Update all checks every entry, but never installs a tracked-only entry.
 if(update){try{const local=await this.local(e);results.push(await this.operation(e,!!local,true));}catch(err){e.status='Check failed';e.detail=String(err);results.push(`Failed ${e.name}: ${String(err)}`);}}else results.push(await this.operation(e,false,true));}
 this.summary=results.join('\n');new Notice(update?'Update all finished. See settings for results.':'Checks finished. See settings for results.');await this.save();}finally{this.bulk=false;this.refresh();}}
}

class ManagerTab extends PluginSettingTab {
 constructor(app:App,private manager:Manager){super(app,manager);}
 display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'Git Installer & Updater'});const p=this.manager;const locked=p.bulk||p.busy.size>0;
 c.createEl('p',{text:'Only add repositories you trust. Installed plugins can access your vault. Newly installed plugins stay disabled.'});
 new Setting(c).setName('Repositories').addButton(b=>b.setButtonText('Add repository').setDisabled(locked).onClick(()=>new RepositoryModal(this.app,p).open())).addButton(b=>b.setButtonText('Check for updates').setDisabled(locked).onClick(()=>void p.runBulk(false))).addButton(b=>b.setButtonText('Update all').setDisabled(locked).onClick(()=>void p.runBulk(true)));
 if(p.summary)c.createEl('p',{text:p.summary,cls:'giu-status'});
 for(const e of p.entries){const box=c.createDiv({cls:'giu-entry'});box.createEl('h3',{text:`${e.name} (${e.id})`});box.createEl('p',{text:`${e.owner}/${e.repo} · ${e.branch} · ${e.directory||'repository root'}`});box.createEl('p',{text:`Installed: ${e.installedVersion??'not checked'} · Remote: ${e.remoteVersion??'not checked'}\n${p.busy.has(e.id)?'Working…':e.status??'Not checked'}${e.detail?' — '+e.detail:''}\nLast check: ${e.checked?new Date(e.checked).toLocaleString():'never'}`,cls:'giu-status'});
 new Setting(box).addButton(b=>b.setButtonText('Check').setDisabled(locked).onClick(()=>void p.operation(e))).addButton(b=>b.setButtonText(e.status==='Not installed'?'Install':'Update').setDisabled(locked||e.restart===true||!['Not installed','Update available'].includes(e.status??'')).onClick(()=>void p.operation(e,true))).addButton(b=>b.setButtonText('Edit').setDisabled(locked).onClick(()=>new RepositoryModal(this.app,p,e).open())).addButton(b=>b.setButtonText('Remove tracking').setDisabled(locked).onClick(async()=>{p.entries=p.entries.filter(x=>x!==e);await p.save();p.refresh();}));}
 }
}

class RepositoryModal extends Modal {
 constructor(app:App,private manager:Manager,private entry?:Entry){super(app);}
 onOpen(){const c=this.contentEl;c.createEl('h2',{text:this.entry?'Edit repository':'Add repository'});let repo=this.entry?`${this.entry.owner}/${this.entry.repo}`:'';let branch=this.entry?.branch??'';let dir=this.entry?.directory??'';let working=false;
 new Setting(c).setName('GitHub URL or owner/repository').addText(t=>t.setValue(repo).onChange(v=>repo=v));new Setting(c).setName('Branch').setDesc('Leave blank to use the default branch.').addText(t=>t.setValue(branch).onChange(v=>branch=v));new Setting(c).setName('Built files directory').setDesc('Relative path; blank means repository root.').addText(t=>t.setValue(dir).onChange(v=>dir=v));const preview=c.createDiv();
 new Setting(c).addButton(b=>b.setButtonText('Review manifest').setCta().onClick(async()=>{if(working)return;working=true;b.setDisabled(true);preview.empty();try{
 const r=repository(repo);const d=directory(dir);const resolvedBranch=branch.trim()||await this.manager.github.defaultBranch(r.owner,r.repo);const config={...r,branch:resolvedBranch,directory:d};const s=await this.manager.github.resolve(config);const m=s.manifest;
 if(this.entry&&(this.entry.owner.toLowerCase()!==r.owner.toLowerCase()||this.entry.repo.toLowerCase()!==r.repo.toLowerCase()||this.entry.id!==m.id))throw Error('Editing cannot switch repository or plugin ID. Remove tracking first.');
 if(this.manager.entries.some(e=>e!==this.entry&&e.id===m.id))throw Error('A repository already claims this plugin ID.');
 const candidate:Entry={...config,id:m.id,name:m.name};const local=await this.manager.local(candidate);const ok=compatible(m,apiVersion,Platform.isMobile);
 preview.createEl('p',{text:`${m.name} (${m.id})\nVersion ${m.version} · requires Obsidian ${m.minAppVersion}${m.isDesktopOnly?' · desktop only':''}\n${ok?'Compatible':'Incompatible'} · branch ${resolvedBranch}\n${local?'Already installed: '+local.version:'Not installed'}`,cls:'giu-status'});
 const save=async(install:boolean)=>{if(this.manager.bulk||this.manager.busy.size)throw Error('Wait for the current operation.');if(this.manager.entries.some(e=>e!==this.entry&&e.id===m.id))throw Error('This plugin is already tracked.');let e=candidate;if(this.entry){Object.assign(this.entry,config,{status:undefined,remoteVersion:undefined,checked:undefined,detail:undefined});e=this.entry;}else this.manager.entries.push(e);await this.manager.save();this.close();this.manager.refresh();await this.manager.operation(e,install);};
 new Setting(preview).addButton(x=>x.setButtonText(this.entry?'Save configuration':local?'Track existing installation':'Track without installing').onClick(()=>{void save(false).catch(err=>new Notice(String(err)));}));
 if(!local&&!this.entry&&ok)new Setting(preview).addButton(x=>x.setButtonText('Track and install (disabled)').setCta().onClick(()=>{void save(true).catch(err=>new Notice(String(err)));}));
 }catch(err){preview.createEl('p',{text:String(err)});}finally{working=false;b.setDisabled(false);}}));
 }
 onClose(){this.contentEl.empty();}
}
