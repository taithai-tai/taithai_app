import { createAdminAccess, SiteAdminError } from './site-admin-access.js';
import { createAdminData } from './site-admin-data.js';
import { initializeMembershipDatabase, verifyMembershipUser, consumeMembershipRate, PRIVATE_API_HEADERS } from './site-membership-core.js';
import { withMembershipOperationBudget, assertMembershipOperationActive, MEMBERSHIP_OPERATION_TIMEOUT_MS } from './site-operation-budget.js';

const ORIGINS = new Set(['https://taithai.app','https://taithai-app.netlify.app']);
const GET_ACTIONS = new Set(['access','admins','reports','report','events','app-settings']);
const POST_ACTIONS = new Set(['admin-set','admin-revoke','report-update','app-settings-update']);
let runtime;
export function getSiteAdminRuntime() {
  if (runtime) return runtime;
  const {store,auth} = initializeMembershipDatabase();
  const access = createAdminAccess({store,auth}), data = createAdminData({store,access});
  runtime = {store,auth,access,data};
  return runtime;
}
function response(data,status=200,origin) {
  return new Response(JSON.stringify(data), {status,headers:{...PRIVATE_API_HEADERS,
    ...(origin ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {})}});
}
function failure(error,origin) {
  const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code || '') ? error.code : 'SERVICE_UNAVAILABLE';
  const status = [400,401,403,404,405,409,413,429,502,503].includes(error?.status) ? error.status : 503;
  const messages = {
    ACCOUNT_MUST_SIGN_IN_FIRST:'ให้บัญชีนี้เข้าสู่เว็บไซต์ด้วย Google ก่อน แล้วจึงเพิ่มเป็นผู้ดูแล',
    VERIFIED_ACTIVE_ACCOUNT_REQUIRED:'บัญชีนี้ต้องยืนยันอีเมลและยังใช้งานได้ก่อนจึงเพิ่มสิทธิ์ได้',
    OWNER_IMMUTABLE:'ไม่สามารถเปลี่ยนหรือลบสิทธิ์บัญชีเจ้าของเว็บไซต์ได้',
    REQUEST_ID_REUSED:'รหัสรายการนี้ใช้กับข้อมูลอื่นแล้ว กรุณาเริ่มรายการใหม่',
    APP_SETTINGS_CONFLICT:'การตั้งค่าแอปเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',
    REPORT_CONFLICT:'เรื่องนี้มีการแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',
  };
  const message = messages[code] || (status === 401 ? 'กรุณาเข้าสู่ระบบอีกครั้ง' : status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ' : status === 429 ? 'ทำรายการบ่อยเกินไป กรุณารอสักครู่' : status === 503 ? 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' : 'ตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง');
  return response({error:{code,message}},status,origin);
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new SiteAdminError('JSON_REQUIRED');
  const maximum = 32768, declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) throw new SiteAdminError('REQUEST_TOO_LARGE',413);
  const reader = request.body?.getReader(), chunks = []; let size = 0;
  if (reader) try {
    for (;;) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new SiteAdminError('REQUEST_TOO_LARGE',413); }
      chunks.push(Buffer.from(item.value));
    }
  } finally { reader.releaseLock(); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw new SiteAdminError('INVALID_REQUEST'); }
}
export function createSiteAdminHandler({getRuntime=getSiteAdminRuntime,verifyUser=verifyMembershipUser,rate=consumeMembershipRate,
  operationTimeoutMs=MEMBERSHIP_OPERATION_TIMEOUT_MS}={}) {
  return async request => {
    const suppliedOrigin = request.headers.get('origin'), origin = ORIGINS.has(suppliedOrigin) ? suppliedOrigin : undefined;
    try {
      return await withMembershipOperationBudget(async()=>{
        if (suppliedOrigin && !origin || request.method === 'POST' && !origin) throw new SiteAdminError('ORIGIN_NOT_ALLOWED',403);
        if (request.method === 'OPTIONS') {
          if (!origin || !['GET','POST'].includes(request.headers.get('access-control-request-method'))) throw new SiteAdminError('ORIGIN_NOT_ALLOWED',403);
          const requestedHeaders = (request.headers.get('access-control-request-headers') || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
          if (requestedHeaders.some(value=>!['authorization','content-type'].includes(value))) throw new SiteAdminError('ORIGIN_NOT_ALLOWED',403);
          return new Response(null,{status:204,headers:{...PRIVATE_API_HEADERS,'Access-Control-Allow-Origin':origin,'Vary':'Origin',
            'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
        }
        if (!['GET','POST'].includes(request.method)) throw new SiteAdminError('METHOD_NOT_ALLOWED',405);
        const url = new URL(request.url), action = url.searchParams.get('action') || 'access';
        if (!(request.method === 'GET' ? GET_ACTIONS : POST_ACTIONS).has(action)) throw new SiteAdminError('UNKNOWN_ACTION',404);
        if (!/^Bearer [A-Za-z0-9_.-]{20,8000}$/.test(request.headers.get('authorization') || '')) throw new SiteAdminError('AUTH_REQUIRED',401);
        const runtime = await getRuntime(), user = await verifyUser(request.headers.get('authorization'),runtime);
        assertMembershipOperationActive();
        await rate(runtime.store,user,`admin:${action}`,{limit:request.method==='POST'?20:120});
        assertMembershipOperationActive();
        if (action === 'access') return response(await runtime.access.resolveAccess(user),200,origin);
        const access = await runtime.access.resolveAccess(user);
        if (!access.adminAccess) throw new SiteAdminError('ADMIN_PERMISSION_REQUIRED',403);
        if (request.method === 'GET') {
          const input = Object.fromEntries(url.searchParams); delete input.action;
          if ('limit' in input) input.limit = Number(input.limit);
          if (action === 'admins') return response(await runtime.access.listAdmins(user,input),200,origin);
          if (action === 'reports') return response(await runtime.data.listReports(user,input),200,origin);
          if (action === 'events') return response(await runtime.data.listEvents(user,input),200,origin);
          if (action === 'report') {
            if (Object.keys(input).some(key=>key!=='id')) throw new SiteAdminError('INVALID_REQUEST');
            return response(await runtime.data.getReport(user,input.id),200,origin);
          }
          if (Object.keys(input).length) throw new SiteAdminError('INVALID_REQUEST');
          return response(await runtime.data.getAppSettings(user),200,origin);
        }
        const input = await readBody(request);
        assertMembershipOperationActive();
        const result = action === 'admin-set' ? await runtime.access.setAdmin(user,input)
          : action === 'admin-revoke' ? await runtime.access.revokeAdmin(user,input)
          : action === 'report-update' ? await runtime.data.updateReport(user,input)
          : await runtime.data.updateAppSettings(user,input);
        return response(result,200,origin);
      },{timeoutMs:operationTimeoutMs,signal:request.signal});
    } catch (error) { return failure(error,origin); }
  };
}
