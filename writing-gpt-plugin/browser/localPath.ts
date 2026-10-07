const norm=(s:string)=>s.replace(/\/{2,}/g,'/');
export default {resolve:(s:string)=>norm(s),join:(...s:string[])=>norm(s.join('/')),dirname:(s:string)=>s.slice(0,s.lastIndexOf('/'))||'/'};
