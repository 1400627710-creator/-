// A synchronous staging layer for the existing Store; IndexedDB commits are
// awaited by HostBridge before any successful state is shown to the author.
const files=new Map<string,string>();const handles=new Map<number,string>();let fd=0;
const durable=(p:string)=>/\/state(?:\.previous)?\.json$/.test(p);
export function loadFiles(main?:string,previous?:string){files.clear();if(main)files.set('/writer/state.json',main);if(previous)files.set('/writer/state.previous.json',previous);}
export function stagedFiles(){return {main:files.get('/writer/state.json'),previous:files.get('/writer/state.previous.json'),corrupt:[...files.entries()].filter(([p])=>p.includes('state.corrupt'))};}
export default {
  mkdirSync:()=>{},existsSync:(p:string)=>files.has(p),
  readFileSync:(p:string)=>{if(!files.has(p))throw Error('Not found');return files.get(p)!;},
  openSync:(p:string,mode:string)=>{if(mode==='wx'&&files.has(p))throw Error('Already exists');const n=++fd;handles.set(n,p);if(mode==='wx')files.set(p,'');return n;},
  writeFileSync:(n:number,s:string)=>{const p=handles.get(n);if(!p)throw Error('Invalid handle');files.set(p,s);},
  fsyncSync:()=>{},closeSync:(n:number)=>{handles.delete(n);},
  renameSync:(from:string,to:string)=>{if(!files.has(from))throw Error('Not found');if(durable(to)||to.includes('state.corrupt'))files.set(to,files.get(from)!);files.delete(from);},
  unlinkSync:(p:string)=>{files.delete(p);},
  copyFileSync:(from:string,to:string)=>{files.set(to,files.get(from)!);},
};
