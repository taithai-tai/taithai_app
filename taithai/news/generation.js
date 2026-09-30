import {createQueueClient} from './queue.js';
export function setupGeneration({getArchive,refresh}){
 const button=document.getElementById('generate');const label=document.getElementById('generation-status');let client,identity,polling=false,sending=false;
 function configure(){const config=getArchive()?.queueConfig;if(!config)return null;if(identity!==config.uid){client=createQueueClient(config);identity=config.uid;}return client;}
 const set=s=>{label.textContent=s;};
 function show(q){
  const r=q?.request;const lastSeen=Date.parse(q?.workerSeenAt);const offline=!Number.isFinite(lastSeen)||Date.now()-lastSeen>5*60000;
  button.disabled=Boolean(r&&['queued','running'].includes(r.state));
  if(!r){set('สร้างข่าวอัตโนมัติทุกวัน 06:00 น. · กดสร้างฉบับพิเศษได้ทุกเมื่อ');return;}
  const when=new Date(r.requestedAt).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'});
  if(r.state==='queued')set(offline?'รับคำขอแล้ว '+when+' น. · รอเครื่องจัดทำข่าวออนไลน์':'รับคำขอแล้ว '+when+' น. · รอ Codex รับงานรอบถัดไป');
  if(r.state==='running')set('กำลังอ่านข้อมูลและจัดทำข่าวใหม่ · ใช้เวลาหลายนาที คุณปิดหน้านี้ได้');
  if(r.state==='failed')set('จัดทำฉบับใหม่ไม่สำเร็จ · ข่าวฉบับเดิมยังอยู่ กดสร้างใหม่เพื่อลองอีกครั้ง');
  if(r.state==='succeeded'){
   const current=getArchive()?.editions?.[0];set(current?.id===r.editionId?'ฉบับใหม่พร้อมอ่านแล้ว':'จัดทำฉบับใหม่เสร็จแล้ว กำลังโหลด…');
   if(current?.id!==r.editionId)refresh();
  }
 }
 async function poll(){if(polling||document.hidden||!getArchive())return;polling=true;try{const c=configure();if(!c){button.disabled=false;set('รอบเช้า 06:00 น. · ปุ่มสร้างฉบับพิเศษยังรอเปิดสิทธิ์คิวรับคำขอ');return;}const {queue}=await c.read();show(queue);}catch{button.disabled=false;set('เช็กสถานะการจัดทำข่าวไม่ได้ กรุณาลองอีกครั้ง');}finally{polling=false;}}
 button.onclick=async()=>{if(sending)return;const c=configure();if(!c){set('ยังส่งคำขอไม่ได้: ต้องเปิดสิทธิ์คิวรับคำขอก่อน ยังไม่มีการเริ่มจัดทำข่าว');return;}
  sending=true;button.disabled=true;set('กำลังส่งคำขอสร้างข่าวใหม่…');try{const r=await c.enqueue();show(r.queue);}catch{button.disabled=false;set('ยืนยันการส่งคำขอไม่ได้ กำลังตรวจสถานะก่อนลองใหม่');await poll();}finally{sending=false;}
 };
 setInterval(poll,20000);document.addEventListener('visibilitychange',poll);return {poll};
}
