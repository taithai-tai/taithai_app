import { handleAI } from '../../ace/worker/index.template.js';
import { createWebFunction, privateError } from '../lib/access.js';
export const config={path:['/api/ace','/api/ace/']};
export function createACEFunction({handle=handleAI,env=process.env,now=()=>Date.now(),checkAccess}={}) {
  return createWebFunction(async(request,context,{startedAt})=>{
    if(request.method==='GET')return Response.json({configured:Boolean(env.NINEARM_API_KEY),mode:'LIVE_AI_MODE'},
      {headers:{'Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'}});
    if(request.method!=='POST')return new Response(JSON.stringify({ok:false,error:'รองรับเฉพาะการอ่านสถานะและส่งคำขอ AI'}),
      {status:405,headers:{Allow:'GET, POST','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    // Stateless generation uses the same model, prompt and token allowance. A
    // bounded deadline returns the established AI_TIMEOUT recovery response,
    // preserving input instead of losing the request at the platform's60s cap.
    const remaining=55000-(now()-startedAt);
    if(remaining<1000)return privateError('AI_TIMEOUT',504);
    return handle(request,env,{timeoutMs:Math.min(52000,Math.floor(remaining))});
  },{paths:config.path,now,...(checkAccess?{checkAccess}:{})});
}
export default createACEFunction();
