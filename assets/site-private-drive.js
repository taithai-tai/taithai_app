/* Private connection values come only from the owner-gated SDK at runtime.
 * Never store them in localStorage, telemetry, HTML source or a status error. */
const OWNER_EMAIL = 'taithai5002@gmail.com';
export const isPrivateDriveOwner = user => Boolean(user?.emailVerified && typeof user.email === 'string' && user.email.toLowerCase() === OWNER_EMAIL);
const FIELD_PROTOCOLS = {shareUrl:'https:',smbUrl:'smb:',smbShareUrl:'smb:',webdavUrl:'https:'};
function validConfig(value) {
  if (!value || typeof value.shareUrl !== 'string' || !value.shareUrl) return false;
  return Object.entries(FIELD_PROTOCOLS).every(([key,protocol]) => {
    const text = value[key];
    if (key !== 'shareUrl' && (text === '' || text == null)) return true;
    try { const url = new URL(text); return url.protocol === protocol && !url.username && !url.password; } catch { return false; }
  });
}
export function createPrivateDriveController({document:doc,window:win,navigator:nav,loadServices}) {
  const ids = ['statusText','privateDriveSignIn','privateDriveSignOut','privateDriveRetry','privateDriveAccess','privateDriveConnections','privateDriveAccount','openDrive','privateDriveNoConnections','smbUrl','smbShareUrl','webdavUrl','toast'];
  const ui = Object.fromEntries(ids.map(id => [id,doc.getElementById(id)]));
  let authApi = null, dataApi = null, user = null, config = null, generation = 0, unsubscribe = null, timeout = null, toastTimer = null, booting = false, bootEpoch = 0;
  function status(text) { ui.statusText.textContent = text; }
  function toast(text) { ui.toast.textContent = text; ui.toast.classList.add('show'); win.clearTimeout(toastTimer); toastTimer=win.setTimeout(()=>ui.toast.classList.remove('show'),4500); }
  function clearPrivate() {
    config=null; ui.privateDriveAccess.hidden=true; ui.privateDriveConnections.hidden=true;
    ui.privateDriveAccount.textContent=''; ui.openDrive.removeAttribute('href'); ui.openDrive.setAttribute('aria-disabled','true');
    for (const key of ['smbUrl','smbShareUrl','webdavUrl']) ui[key].value='';
    doc.querySelectorAll('[data-config-section]').forEach(section=>{section.hidden=true;});
  }
  function errorMessage(error) {
    if (error?.code === 'site/not-found') return 'ยังไม่มีข้อมูลเชื่อมต่อสำหรับบัญชีนี้ กรุณาลองใหม่ภายหลังหรือติดต่อผ่านศูนย์ช่วยเหลือ';
    if (error?.code === 'site/invalid-config') return 'ข้อมูลเชื่อมต่อยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง';
    if (error?.code === 'site/permission-denied' || error?.code === 'permission-denied') return 'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลไดรฟ์ กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ';
    if (nav.onLine === false) return 'ขณะนี้ออฟไลน์ เชื่อมต่ออินเทอร์เน็ตแล้วลองตรวจสอบอีกครั้ง';
    return 'โหลดข้อมูลเชื่อมต่อไม่สำเร็จ ลองอีกครั้งได้โดยไม่ต้องกรอกรหัสไดรฟ์ที่หน้านี้';
  }
  async function onUser(nextUser) {
    const request = ++generation; user=nextUser; win.clearTimeout(timeout); clearPrivate();
    ui.privateDriveRetry.hidden=true; ui.privateDriveSignIn.disabled=false; ui.privateDriveSignOut.disabled=false;
    ui.privateDriveSignOut.hidden=!user;
    ui.privateDriveSignIn.hidden=false; ui.privateDriveSignIn.textContent=user?'เปลี่ยนบัญชี Google':'เข้าสู่ระบบด้วย Google';
    if (!user) { status('เข้าสู่ระบบด้วยบัญชีเจ้าของเพื่อดูข้อมูลเชื่อมต่อ'); return; }
    if (!isPrivateDriveOwner(user)) { status('บัญชีนี้ไม่มีสิทธิ์ดูไดรฟ์ส่วนตัว ใช้บัญชีเจ้าของที่ยืนยันอีเมลแล้ว'); return; }
    ui.privateDriveSignIn.hidden=true; status('ยืนยันบัญชีเจ้าของแล้ว กำลังโหลดข้อมูลเชื่อมต่อ');
    try {
      const result = await dataApi.getPrivateDriveConfig();
      if (request!==generation || !isPrivateDriveOwner(user)) return;
      if (!validConfig(result)) { const e=new Error('Configuration unavailable'); e.code='site/invalid-config'; throw e; }
      config=Object.fromEntries(Object.keys(FIELD_PROTOCOLS).map(key=>[key,result[key]||'']));
      ui.openDrive.href=config.shareUrl; ui.openDrive.setAttribute('aria-disabled','false');
      ui.privateDriveAccount.textContent=`บัญชีเจ้าของ · ${user.displayName || user.email}`;
      let connections=0;
      for (const key of ['smbUrl','smbShareUrl','webdavUrl']) {
        ui[key].value=config[key];
        const section=doc.querySelector(`[data-config-section="${key}"]`);
        if(section) section.hidden=!config[key];
        if(config[key]) connections++;
      }
      ui.privateDriveNoConnections.hidden=connections>0;
      ui.privateDriveAccess.hidden=false; ui.privateDriveConnections.hidden=false;
      status('ข้อมูลเชื่อมต่อพร้อมใช้ ยังไม่ได้ตรวจสถานะเครื่องไดรฟ์');
    } catch (error) {
      if(request!==generation)return;
      clearPrivate(); status(errorMessage(error)); ui.privateDriveRetry.hidden=false;
    }
  }
  async function boot() {
    if(booting)return;
    booting=true; const epoch=++bootEpoch; ++generation; user=null; clearPrivate(); unsubscribe?.(); unsubscribe=null;
    ui.privateDriveSignIn.hidden=true; ui.privateDriveSignOut.hidden=true; ui.privateDriveRetry.hidden=true;
    status('กำลังตรวจสอบบัญชี'); win.clearTimeout(timeout);
    try {
      const deadline=new Promise((_,reject)=>{
        timeout=win.setTimeout(()=>{const e=new Error('Account loading timeout');e.code='drive/auth-timeout';reject(e);},15000);
      });
      const services=await Promise.race([loadServices(),deadline]);
      if(epoch!==bootEpoch)return;
      win.clearTimeout(timeout);
      ({authApi,dataApi}=services);
      timeout=win.setTimeout(()=>{
        if(epoch!==bootEpoch)return;
        ++bootEpoch; ++generation; booting=false; unsubscribe?.(); unsubscribe=null; clearPrivate();
        status('การตรวจสอบบัญชีใช้เวลานานกว่าปกติ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');ui.privateDriveRetry.hidden=false;
      },15000);
      unsubscribe=authApi.subscribeAuth(next=>{if(epoch===bootEpoch)void onUser(next);});
    } catch (error) {
      if(epoch!==bootEpoch)return;
      win.clearTimeout(timeout);
      status(error?.code==='drive/auth-timeout'
        ? 'การตรวจสอบบัญชีใช้เวลานานกว่าปกติ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'
        : 'โหลดระบบบัญชีไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
      ui.privateDriveRetry.hidden=false;
    } finally {if(epoch===bootEpoch)booting=false;}
  }
  ui.privateDriveRetry.addEventListener('click',()=>{void boot();});
  ui.privateDriveSignIn.addEventListener('click',async()=>{
    if(!authApi)return;
    ui.privateDriveSignIn.disabled=true; status('กำลังเปิด Google เพื่อยืนยันบัญชี');
    try { await authApi.loginWithGoogle(); }
    catch { status('ยังเข้าสู่ระบบไม่สำเร็จ ลองเปิด Google อีกครั้งและตรวจว่าเบราว์เซอร์อนุญาตหน้าต่างลงชื่อเข้าใช้'); }
    finally {ui.privateDriveSignIn.disabled=false;}
  });
  ui.privateDriveSignOut.addEventListener('click',async()=>{
    if(!authApi)return;
    ++generation; clearPrivate(); ui.privateDriveSignOut.disabled=true;
    try { await authApi.logout(); }
    catch { status('ออกจากบัญชีไม่สำเร็จ ข้อมูลเชื่อมต่อถูกซ่อนไว้แล้ว ลองตรวจสอบอีกครั้ง'); ui.privateDriveRetry.hidden=false; }
    finally {ui.privateDriveSignOut.disabled=false;}
  });
  doc.querySelectorAll('[data-copy-field]').forEach(button=>button.addEventListener('click',async()=>{
    const key=button.dataset.copyField;
    if(!isPrivateDriveOwner(user)||!config||!config[key]||!ui[key])return;
    try { if(!nav.clipboard?.writeText)throw new Error('Clipboard unavailable'); await nav.clipboard.writeText(config[key]); toast('คัดลอกข้อมูลเชื่อมต่อแล้ว'); }
    catch { if(!isPrivateDriveOwner(user)||!config)return; ui[key].focus();ui[key].select();ui[key].setSelectionRange(0,ui[key].value.length);toast('เลือกข้อความไว้แล้ว ใช้คำสั่งคัดลอกของอุปกรณ์ หรือกด Control/Command + C'); }
  }));
  win.addEventListener('pagehide',()=>{++bootEpoch;booting=false;++generation;user=null;clearPrivate();unsubscribe?.();win.clearTimeout(timeout);win.clearTimeout(toastTimer);});
  win.addEventListener('pageshow',event=>{if(event.persisted)void boot();});
  return {boot};
}
if (typeof document !== 'undefined' && document.getElementById('privateDriveAccess')) {
  const loadServices=async()=>{
    const [authApi,dataApi]=await Promise.all([import('/firebase-auth.js?v=20260725-2'),import('./site-data.js')]);
    return {authApi,dataApi};
  };
  const controller=createPrivateDriveController({document,window,navigator,loadServices});
  void controller.boot();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/Private%20Drive/sw.js').catch(()=>{});
}
