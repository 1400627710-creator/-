import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_dusty_arachne.sql','utf8').replaceAll('--> statement-breakpoint',''));
class Statement{constructor(query,args=[]){this.query=query;this.args=args;}bind(...args){return new Statement(this.query,args);}async first(){return sql.prepare(this.query).get(...this.args)||null;}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){const r=sql.prepare(this.query).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}}
const files=new Map;let blobVersion=0;
const bucket={
 async put(key,value,options={}){const old=files.get(key);if(options.onlyIf?.etagDoesNotMatch==='*'&&old||options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const etag=String(++blobVersion);files.set(key,{text:String(value),etag,customMetadata:options.customMetadata});return {etag};},
 async get(key){const file=files.get(key);return file?{etag:file.etag,json:async()=>JSON.parse(file.text),text:async()=>file.text}:null;},
 async list({prefix}){return {objects:[...files].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,customMetadata:value.customMetadata}))};},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])files.delete(key);}
};
export const env={DB:{prepare:q=>new Statement(q),async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}},BUCKET:bucket};
