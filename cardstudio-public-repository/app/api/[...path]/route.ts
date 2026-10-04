import {env} from 'cloudflare:workers';
import {handleRepository} from '../../repository-api.mjs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleRepository(request,env);
export const POST=(request:Request)=>handleRepository(request,env);
export const DELETE=(request:Request)=>handleRepository(request,env);
export const OPTIONS=(request:Request)=>handleRepository(request,env);
