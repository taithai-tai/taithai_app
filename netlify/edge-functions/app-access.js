import { checkAppAccess } from '../../server-lib/site-app-gate.js';
import { applyAccessHeaders, isFunctionRequestPath, platformFunctionPath, privateError } from '../lib/access.js';

// Keep this uncached and before the CDN. Do not enable Netlify Split Testing:
// Netlify skips Edge Functions for split-tested sites, bypassing access checks.
export function createNetlifyAppGate({checkAccess=checkAppAccess}={}) {
  return async (request,context)=>{
    const url=new URL(request.url);
    if(platformFunctionPath(url.pathname))return privateError('NOT_FOUND',404);
    try {
      const access=await checkAccess(request);
      if(access.response)return applyAccessHeaders(access.response,{},url.pathname);
      // Continuing without context.next keeps long Node operations outside the
      // Edge40s header deadline. Node wrappers repeat authorization and headers.
      if(isFunctionRequestPath(url.pathname))return undefined;
      return applyAccessHeaders(await context.next(),access.headers,url.pathname);
    } catch {return privateError('APP_SETTINGS_UNAVAILABLE');}
  };
}
export default createNetlifyAppGate();
