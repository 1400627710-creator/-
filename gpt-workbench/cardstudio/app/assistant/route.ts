import {ASSISTANT_HTML} from '../../lib/assistant-html.mjs';
export async function GET(){return new Response(ASSISTANT_HTML.replace('content="mcp-local"','content="web-local"'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
