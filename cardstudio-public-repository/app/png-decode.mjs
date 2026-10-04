// Use pngjs's validated parser and pixel conversion, with the public zlib API.
// Its synchronous decoder otherwise depends on Node's private zlib handle,
// which is unavailable in Cloudflare Workers.
import {inflateSync} from 'node:zlib';
import Parser from 'pngjs/lib/parser.js';
import SyncReader from 'pngjs/lib/sync-reader.js';
import FilterSync from 'pngjs/lib/filter-parse-sync.js';
import bitmapper from 'pngjs/lib/bitmapper.js';
import normalise from 'pngjs/lib/format-normaliser.js';
export function decodePng(buffer){
 let error,metadata;const chunks=[],reader=new SyncReader(buffer);
 const parser=new Parser({checkCRC:true},{read:reader.read.bind(reader),error:e=>{error=e},metadata:m=>{metadata=m},gamma:()=>{},palette:p=>{metadata.palette=p},transColor:c=>{metadata.transColor=c},simpleTransparency:()=>{metadata.alpha=true},inflateData:c=>chunks.push(c)});
 parser.start();reader.process();if(error)throw error;
 if(metadata.interlace)throw Error('Interlaced PNG requires normalization');
 const expected=(Math.ceil(metadata.width*metadata.bpp*metadata.depth/8)+1)*metadata.height;
 const inflated=inflateSync(Buffer.concat(chunks),{maxOutputLength:expected});
 if(inflated.length!==expected)throw Error('PNG pixels are incomplete');
 const bitmap=bitmapper.dataToBitMap(FilterSync.process(inflated,metadata),metadata);
 return {...metadata,data:normalise(bitmap,metadata,false)};
}
