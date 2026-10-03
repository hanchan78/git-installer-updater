import { App } from 'obsidian';
// Obsidian exposes no public API for another plugin's enable/unload/reload state.
// Never change the persisted enabled set; feature-detect the internal methods.
type Plugins={enabledPlugins:Set<string>; unloadPlugin(id:string):Promise<void>; loadPlugin(id:string):Promise<void>};
export class Lifecycle {
 private api:Plugins|null;
 constructor(app:App){const p=(app as unknown as {plugins?:Partial<Plugins>}).plugins;this.api=p?.enabledPlugins instanceof Set&&typeof p.unloadPlugin==='function'&&typeof p.loadPlugin==='function'?p as Plugins:null;}
 async pause(id:string,self:boolean):Promise<{enabled:boolean;paused:boolean;restart:boolean}>{if(self||!this.api)return {enabled:false,paused:false,restart:true};const enabled=this.api.enabledPlugins.has(id);if(enabled)await this.api.unloadPlugin(id);return {enabled,paused:enabled,restart:false};}
 async resume(id:string,paused:boolean):Promise<void>{if(paused&&this.api)await this.api.loadPlugin(id);}
}
