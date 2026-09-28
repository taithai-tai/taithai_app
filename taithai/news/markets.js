import {safeLink} from './crypto.js';
export function tradeMetrics(p){
 const values=[p?.entryLow,p?.entryHigh,p?.stop,...(p?.targets||[])];
 if(!Array.isArray(p?.targets)||p.targets.length!==2||values.length<5||values.some(v=>!Number.isFinite(v)||v<=0)||p.entryLow>p.entryHigh||p.stop>=p.entryLow||p.targets.some((v,i)=>v<=p.entryHigh||(i&&v<p.targets[i-1])))return null;
 const risk=p.entryHigh-p.stop;
 return {risk,rewardRisk:(p.targets[0]-p.entryHigh)/risk};
}
export function marketStatus(m,now=Date.now(),historical=false){
 if(!m)return 'missing';
 const dates=['checkedAt','quoteAsOf','validFrom','validUntil'].map(k=>Date.parse(m[k]));
 if(m.currency!=='USD'||!Array.isArray(m.picks)||!m.picks.length||dates.some(v=>!Number.isFinite(v))||dates[0]<dates[1]||dates[3]<=dates[2]||dates[0]>now+300000||m.picks.some(p=>!tradeMetrics(p)||!Number.isFinite(p.reference)||p.reference<=0||!safeLink(p.source?.url)))return 'invalid';
 if(historical)return 'historical';
 if(now>=dates[3])return 'expired';
 if(now<dates[2])return 'upcoming';
 return 'watch';
}
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const stamp=s=>new Date(s).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
function node(tag,value,cls){const n=document.createElement(tag);n.textContent=value||'';if(cls)n.className=cls;return n;}
export function renderMarkets(root,m,{historical=false,now=Date.now()}={}){
 root.replaceChildren();const state=marketStatus(m,now,historical);root.dataset.state=state;
 if(state==='missing'){root.append(node('p','ฉบับนี้ยังไม่มีคอลัมน์หุ้น','status'));return;}
 if(state==='invalid'){root.append(node('p','ข้อมูลแผนหุ้นไม่ครบหรือไม่ถูกต้อง จึงยังไม่แสดงราคาซื้อขาย กรุณาอัปเดตฉบับข่าว','status error'));return;}
 const labels={historical:'ฉบับย้อนหลัง · แผน ณ เวลาจัดทำ ไม่ใช่สัญญาณปัจจุบัน',expired:'แผนหมดอายุ · อ่านย้อนหลังได้ รอวิเคราะห์รอบใหม่ก่อนใช้ราคา',upcoming:'เตรียมแผนรอบถัดไป · ยังไม่ใช่สัญญาณให้ซื้อทันที',watch:'รอเงื่อนไขยืนยัน · เว็บนี้ไม่ได้ตรวจราคาสดหรือยืนยันสัญญาณเข้า'};
 root.append(node('p',labels[state],'market-state'),node('p',`รอบซื้อขาย ${m.sessionLabel} · ${m.horizon}`,'subtle'),node('p',`ราคาปิดอ้างอิง ${stamp(m.quoteAsOf)} น. · ตรวจข้อมูล ${stamp(m.checkedAt)} น. (เวลาไทย)`,'source'));
 root.append(node('p',m.intro,'market-intro'));
 for(const p of m.picks){
  const card=node('article','','stock-card');card.append(node('h4',p.symbol+' · '+p.name),node('p',`ราคาปิดอ้างอิง ${money(p.reference)} · ${p.bias}`,'source'));
  const prices=node('dl','','stock-prices');
  for(const [label,value] of [['ช่วงรอซื้อ',money(p.entryLow)+'–'+money(p.entryHigh)],['ขายเป้าแรก',money(p.targets[0])],['ขายเป้าถัดไป',money(p.targets[1])],['จุดตัดขาดทุน',money(p.stop)]]){prices.append(node('dt',label),node('dd',value));}
  card.append(prices,node('p',p.trigger),node('p','เหตุผล: '+p.reason),node('p','งดเข้าเมื่อ: '+p.cancel,'subtle'));
  const metric=tradeMetrics(p);card.append(node('p',`กำไรต่อความเสี่ยงถึงเป้าแรกประมาณ ${metric.rewardRisk.toFixed(2)}:1 คำนวณจากซื้อที่ขอบบนของช่วง ก่อนค่าธรรมเนียมและราคาคลาดเคลื่อน ไม่ใช่โอกาสชนะ`,'source'));
  const a=node('a',p.source.label,'source');a.href=safeLink(p.source.url);a.target='_blank';a.rel='noopener noreferrer';card.append(a);root.append(card);
 }
 root.append(node('p',m.method,'subtle'),node('p',m.riskNote,'subtle'),node('p',`ใช้เปิดสถานะใหม่ถึง ${stamp(m.validUntil)} น. (ไทย) แล้วต้องทบทวนแผนใหม่ ปุ่มอัปเดตโหลดฉบับที่จัดทำไว้ ไม่ได้ดึงราคาตลาดแบบสด`,'source'));
 if(safeLink(m.guide?.url)){const a=node('a',m.guide.label,'source');a.href=safeLink(m.guide.url);a.target='_blank';a.rel='noopener noreferrer';root.append(a);}
}
