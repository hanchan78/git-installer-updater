export class Plugin {app:any;manifest={id:'git-installer-updater'};data:any; async loadData(){return this.data;} async saveData(data:any){this.data=JSON.parse(JSON.stringify(data));} addSettingTab(){} addCommand(){} }
export class PluginSettingTab {constructor(...args:any[]){} }
export class Modal {constructor(...args:any[]){} }
export class Notice {constructor(...args:any[]){} }
export class Setting {}
export class App {}
export const Platform={isMobile:false};
export const apiVersion='1.6.0';
export async function requestUrl(){throw Error('Unexpected real network request in test.');}
