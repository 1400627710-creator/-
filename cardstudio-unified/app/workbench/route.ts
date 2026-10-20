import {WORKBENCH_WEB_HTML} from '../../lib/workbench-html.mjs';
export async function GET(){return new Response(WORKBENCH_WEB_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
