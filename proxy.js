import { next } from '@vercel/functions';
import { checkAppAccess } from './server-lib/site-app-gate.js';

// Runs before Vercel's static cache, including app assets and direct API routes.
export default async function proxy(request) {
  const access = await checkAppAccess(request);
  if (access.response) return access.response;
  const response = next();
  for (const [name, value] of Object.entries(access.headers)) response.headers.set(name, value);
  return response;
}
