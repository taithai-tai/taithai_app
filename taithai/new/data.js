export const TIME_ZONE = 'Asia/Bangkok';
export function dayKey(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  return ['year','month','day'].map(k => p.find(x=>x.type===k).value).join('-');
}
export function dayWindow(now = new Date()) {
  const start = new Date(`${dayKey(now)}T00:00:00+07:00`);
  return { timeMin:start.toISOString(),timeMax:new Date(+start+86400000).toISOString() };
}
export function todayTasks(tasks, date = dayKey()) { return tasks.filter(x=>x.date===date).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')); }
export function safeGoogleLink(value, fallback) { try {const u=new URL(value);return u.protocol==='https:'&&['calendar.google.com','www.google.com','mail.google.com'].includes(u.hostname)?u.href:fallback;} catch{return fallback;} }
export async function getJson(url, token, fetcher = fetch) {
  const r=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok) {const e=new Error(r.status===401?'สิทธิ์หมดอายุ กรุณาเชื่อมบัญชีใหม่':r.status===403?'บัญชียังไม่อนุญาต หรือยังไม่ได้เปิด API ของบริการนี้':'ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่');e.status=r.status;throw e;}
  return r.json();
}
export async function loadCalendar(token, fetcher=fetch) {
  const items=[];let pageToken='';
  do {const p=new URLSearchParams({...dayWindow(),singleEvents:'true',orderBy:'startTime',maxResults:'250'});if(pageToken)p.set('pageToken',pageToken);const data=await getJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`,token,fetcher);items.push(...(data.items||[]));pageToken=data.nextPageToken||'';}while(pageToken);
  return items.filter(x=>x.status!=='cancelled');
}
export function prioritizeMail(message, now=Date.now()) {
  const headers=message.payload?.headers||[],subject=headers.find(h=>h.name.toLowerCase()==='subject')?.value||'';
  const text=`${subject} ${message.snippet||''}`;
  const reasons=[];
  if(/กำหนดส่ง|ส่งงาน|deadline|assignment|due date|ครบกำหนด|ชำระภายใน/i.test(text))reasons.push('มีกำหนดส่งหรือวันครบกำหนด');
  if(/เลื่อน|ยกเลิก|เปลี่ยนแปลง|cancelled|canceled|rescheduled|schedule change/i.test(text))reasons.push('มีการเปลี่ยนแปลงหรือยกเลิก');
  if(/นัดหมาย|ตารางเรียน|สอบ|meeting|appointment|exam|interview/i.test(text))reasons.push('เกี่ยวกับนัดหมาย การเรียน หรือการสอบ');
  if(/ดำเนินการ|ยืนยัน|action required|verify|security alert|เข้าสู่ระบบใหม่|แจ้งเตือนความปลอดภัย/i.test(text))reasons.push('อาจต้องตรวจสอบหรือดำเนินการ');
  const age=Math.max(0,(now-Number(message.internalDate||0))/86400000);
  const recent=age<=7?12:age<=30?5:0;
  return {...message,reasons,score:reasons.length*6+recent+(message.labelIds?.includes('STARRED')?4:0),age};
}
export async function scanMail(token,{fetcher=fetch,query='',onProgress=()=>{},isActive=()=>true}={}) {
  let pageToken='',messages=[];
  do {
    if(!isActive())throw new Error('ยกเลิกการอ่านข้อมูล');
    const p=new URLSearchParams({maxResults:'100'});if(query)p.set('q',query);if(pageToken)p.set('pageToken',pageToken);
    const data=await getJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${p}`,token,fetcher);
    const ids=data.messages||[];
    for(let i=0;i<ids.length;i+=5){
      if(!isActive())throw new Error('ยกเลิกการอ่านข้อมูล');
      const batch=await Promise.all(ids.slice(i,i+5).map(m=>getJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,token,fetcher)));
      messages.push(...batch);onProgress(messages.length);
    }
    pageToken=data.nextPageToken||'';
  }while(pageToken);
  return messages;
}
export const AREAS=[{name:'รังสิต',latitude:13.98333,longitude:100.61667},{name:'ดอนเมือง',latitude:13.91338,longitude:100.58974}];
export async function loadWeather(fetcher=fetch){return Promise.all(AREAS.map(async area=>{const p=new URLSearchParams({latitude:String(area.latitude),longitude:String(area.longitude),daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',timezone:TIME_ZONE,forecast_days:'1'});const r=await fetcher(`https://api.open-meteo.com/v1/forecast?${p}`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('พยากรณ์อากาศไม่พร้อมใช้งาน');const data=await r.json();if(data.daily?.time?.[0]!==dayKey())throw new Error('วันที่พยากรณ์ไม่ตรงกับวันนี้');return {...area,daily:data.daily};}));}
export async function graphPages(url,token,{fetcher=fetch,isActive=()=>true,onProgress=()=>{}}={}){
  const items=[];
  while(url){if(!isActive())throw new Error('ยกเลิกการอ่านข้อมูล');const u=new URL(url);if(u.origin!=='https://graph.microsoft.com'||!u.pathname.startsWith('/v1.0/'))throw new Error('Invalid Microsoft pagination URL');const data=await getJson(u.href,token,fetcher);items.push(...(data.value||[]));onProgress(items.length);url=data['@odata.nextLink']||'';}
  return items;
}
export async function loadMicrosoftCalendar(token,options={}){const range=dayWindow(),p=new URLSearchParams({startDateTime:range.timeMin,endDateTime:range.timeMax,'$top':'100','$select':'id,subject,start,end,location,webLink,isCancelled'});const values=await graphPages(`https://graph.microsoft.com/v1.0/me/calendarView?${p}`,token,options);return values.filter(x=>!x.isCancelled).map(e=>({id:e.id,summary:e.subject,location:e.location?.displayName,htmlLink:e.webLink,start:{dateTime:e.start.dateTime+(e.start.timeZone==='UTC'&&!/Z$|[+-]\d\d:\d\d$/.test(e.start.dateTime)?'Z':'')},end:{dateTime:e.end.dateTime+(e.end.timeZone==='UTC'&&!/Z$|[+-]\d\d:\d\d$/.test(e.end.dateTime)?'Z':'')}}));}
export async function scanMicrosoftMail(token,options={}){const p=new URLSearchParams({'$top':'100','$select':'id,subject,from,receivedDateTime,bodyPreview,webLink,isDraft,flag,importance'});if(options.incremental)p.set('$filter',`receivedDateTime ge ${new Date(Date.now()-172800000).toISOString()}`);const values=await graphPages(`https://graph.microsoft.com/v1.0/me/messages?${p}`,token,options);return values.filter(m=>!m.isDraft).map(m=>({id:m.id,webLink:m.webLink,internalDate:String(Date.parse(m.receivedDateTime)),snippet:m.bodyPreview,labelIds:m.flag?.flagStatus==='flagged'?['STARRED']:[],payload:{headers:[{name:'Subject',value:m.subject},{name:'From',value:m.from?.emailAddress?.address||''}]}}));}
export function safeMailLink(value,fallback){try{const u=new URL(value);return u.protocol==='https:'&&['outlook.office.com','outlook.office365.com','outlook.live.com','calendar.google.com','www.google.com','mail.google.com'].includes(u.hostname)?u.href:fallback;}catch{return fallback;}}
