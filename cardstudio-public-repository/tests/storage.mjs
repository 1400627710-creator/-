import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function makeStorage(filename=':memory:'){
 const sql=new DatabaseSync(filename);sql.exec(fs.readFileSync(new URL('../drizzle/0000_slow_dormammu.sql',import.meta.url),'utf8'));
 const DB={prepare(query){return {bind(...values){return {async all(){return {results:sql.prepare(query).all(...values)}},async first(){return sql.prepare(query).get(...values)||null},async run(){return {meta:sql.prepare(query).run(...values)}},_run(){return {meta:sql.prepare(query).run(...values)}}}}}},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>s._run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
 const files=new Map(),BUCKET={async put(key,body,options){files.set(key,{bytes:new Uint8Array(body),type:options.httpMetadata.contentType})},async get(key){const file=files.get(key);return file?{body:file.bytes,writeHttpMetadata(headers){headers.set('Content-Type',file.type)}}:null},async delete(key){files.delete(key)}};
 return {DB,BUCKET,sql,files};
}
