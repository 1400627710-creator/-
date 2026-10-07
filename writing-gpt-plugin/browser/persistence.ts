import {loadFiles,stagedFiles} from './localFs.js';
const DB_NAME='author-writing-gpt-local-v1';
export class Persistence {
  private db!:IDBDatabase;private loadedRevision=-1;private main?:string;private previous?:string;
  private revision(s?:string){if(!s)return -1;try{return JSON.parse(s).revision??-2;}catch{return -2;}}
  async open(){
    if(!globalThis.indexedDB)throw Error('当前窗口不允许本机存稿。请保留原稿，在支持插件窗口的 GPT 浏览器中打开。');
    this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('本机存稿无法打开；已有原稿不会被删除。'));r.onblocked=()=>reject(Error('另一个窗口正在更新本机存稿，请关闭旧窗口后重试。'));});
    this.db.onversionchange=()=>this.db.close();await this.refresh();
  }
  async refresh(){
    const [v,p]=await new Promise<any[]>((resolve,reject)=>{const t=this.db.transaction('files','readonly'),s=t.objectStore('files'),a=s.get('manuscript'),b=s.get('previous');t.oncomplete=()=>resolve([a.result,b.result]);t.onerror=t.onabort=()=>reject(Error('本机存稿读取失败。'));});
    this.main=v;this.previous=p;this.loadedRevision=this.revision(v);loadFiles(v,p);
  }
  async commit(){
    const {main,previous,corrupt}=stagedFiles();if(!main)throw Error('存稿未准备好');const value=JSON.parse(main);
    if(main===this.main&&previous===this.previous&&!corrupt.length)return;
    await new Promise<void>((resolve,reject)=>{
      const t=this.db.transaction('files','readwrite'),s=t.objectStore('files');let conflict=false;
      const r=s.get('manuscript');r.onsuccess=()=>{const rev=this.revision(r.result);if(rev!==this.loadedRevision){conflict=true;t.abort();return;}s.put(main,'manuscript');if(previous)s.put(previous,'previous');for(const [key,body] of corrupt)s.put(body,key);};
      t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('本机保存失败。未保存稿仍在窗口，请下载应急副本。'));t.onabort=()=>reject(Error(conflict?'另一窗口已修改存稿；请核对新版后再保存。':'本机保存失败。请保留未保存稿并导出应急副本。'));
    });this.loadedRevision=value.revision;this.main=main;this.previous=previous;
  }
  read(key:string):Promise<any>{return new Promise((resolve,reject)=>{const r=this.db.transaction('files','readonly').objectStore('files').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('本机存稿读取失败。'));});}
  put(key:string,value:any):Promise<void>{return new Promise((resolve,reject)=>{const t=this.db.transaction('files','readwrite');t.objectStore('files').put(value,key);t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(Error('本机请求保存失败，请重试。'));});}
}
