// Owner-only operations UI. Access must also be enforced by the data store rules.
import { createAppVisibilityPanel } from './site-admin-apps.js';
const OWNER_EMAIL = 'taithai5002@gmail.com';
const AUTH_MODULE = '/firebase-auth.js?v=20260725-2';
const DATA_MODULE = '/assets/site-data.js';
const EVENT_NAMES = ['page_view', 'app_open', 'click', 'heartbeat', 'preference_change', 'report_submitted', 'help_view', 'signin', 'signout'];
const REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const MAX_REPLY_LENGTH = 4000;
const DAY = 86400000;
const TAB_NAMES = ['overview', 'activity', 'reports', 'apps'];
const translations = {
  en: {
    loading: 'Checking administrator access…', deniedTitle: 'Administrator access only', denied: 'This area is available only to the verified site owner. Your account does not have access.', signedOut: 'Sign in with the site owner’s Google account to continue.', signIn: 'Sign in with Google', signOut: 'Sign out', retry: 'Try again', authFailed: 'We could not check administrator access. Check your connection and try again.', dataFailed: 'We could not load this data. Check your connection and try again.', authError: 'Sign-in could not be completed. Please try again.', popupClosed: 'The sign-in window was closed. You can try again.', popupBlocked: 'Allow pop-ups for this site, then try again.', network: 'You are offline or the connection failed. Reconnect and try again.', permission: 'Administrator access was denied. Check that you are signed in with the verified owner account.',
    overview: 'Overview', activity: 'Activity', reports: 'Reports', apps: 'Manage apps', scope: 'These statistics include only visitors who opted in to usage measurement. Collection starts after consent; past visits are not recovered. Private form content, movie notes, files, and chat messages are not recorded.',
    range: 'Date range', days7: 'Last 7 days', days30: 'Last 30 days', days90: 'Last 90 days', app: 'App', allApps: 'All apps', event: 'Event', allEvents: 'All events', actor: 'Person or account', actorHint: 'Search name, email, account or session ID', clearFilters: 'Clear filters',
    actorActivity: 'Accounts and anonymous sessions', actorSummaryNote: 'This view summarizes loaded records matching the filters. Anonymous sessions and signed-in accounts are separate groups; signing in can place one visit in both groups.', firstSeen: 'First seen', lastSeen: 'Last seen', appsUsed: 'Apps used', viewActivity: 'View activity', groups: 'groups', pageViews: 'Page views', appOpens: 'App opens', clicks: 'Clicks', sessions: 'Sessions', accounts: 'Signed-in accounts', activeTime: 'Active time', seconds: 'seconds', minutes: 'min', hours: 'hr', daily: 'Daily activity', dailyHint: 'Number of recorded events by Bangkok date', topApps: 'Apps used', topActions: 'Actions recorded', count: 'Count', noEvents: 'No matching activity', noEventsHelp: 'There may be no consenting visitors in this period, or no events matching your filters. No sample activity is shown.',
    loadingEvents: 'Loading activity…', moreEvents: 'Load more activity', loaded: 'events loaded', matching: 'matching the current filters', bounded: 'Statistics describe the loaded events only. Load more to include older records in this period.', allLoaded: 'All available events in this period are loaded', exportCsv: 'Export displayed activity as CSV', csvHint: 'The export includes only the loaded rows matching the current filters. It may contain account names and emails.',
    time: 'Time (Bangkok)', person: 'Person', action: 'Action', device: 'Device', path: 'Page', anonymous: 'Anonymous visitor', unknown: 'Not available', show: 'Showing', rows: 'rows', previous: 'Previous', next: 'Next', activityCaption: 'Consented activity, newest first',
    reportStatus: 'Report status', allReports: 'All statuses', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed', loadingReports: 'Loading reports…', moreReports: 'Load more reports', noReports: 'No reports in this view', noReportsHelp: 'Reports appear here after visitors submit them successfully. Try another status to review previous reports.', reportsLoaded: 'reports loaded', reportBounded: 'Only loaded reports are shown. Use Load more to include older reports.', reportAllLoaded: 'All reports for this status are loaded', details: 'View report', report: 'Report', reportId: 'Reference', submitted: 'Submitted', category: 'Category', subject: 'Subject', description: 'Description', contact: 'Contact supplied by visitor', reporter: 'Submitted by', guest: 'Visitor without a signed-in account', noContact: 'No contact supplied', noReply: 'No reply yet', steps: 'Steps to reproduce', expected: 'Expected result', currentReply: 'Reply visible to the reporter', reply: 'Reply to the reporter', replyHint: 'Up to 4,000 characters. Do not include passwords, secret keys, or private information about other visitors.', save: 'Save changes', saving: 'Saving…', saved: 'Status and reply saved', saveFailed: 'Changes could not be saved. Your draft is still here. Try again.', saveUncertain: 'We could not confirm whether the changes were saved. Check the saved version before trying again.', checkSaved: 'Check saved version', serverChecked: 'The saved version was checked. Your unsaved draft has been kept.', close: 'Close', discard: 'Discard your unsaved report changes?', replyInvalid: 'Keep the reply within 4,000 characters and remove control characters.', noChanges: 'There are no changes to save', statusChanged: 'This report changed while you were editing it. Reload the report before saving.', reportEmpty: 'No description supplied', updated: 'Last updated', accountChanged: 'Your account changed. Unsaved changes were not submitted.', home: 'Back to apps', signedInAs: 'Administrator',
    page_view: 'Page view', app_open: 'App opened', click: 'Click', heartbeat: 'Active visit', preference_change: 'Preference changed', report_submitted: 'Report submitted', help_view: 'Help opened', signin: 'Sign-in', signout: 'Sign-out',
  },
  th: {
    loading: 'กำลังตรวจสอบสิทธิ์ผู้ดูแล…', deniedTitle: 'สำหรับผู้ดูแลเว็บไซต์', denied: 'ส่วนนี้เปิดให้เจ้าของเว็บไซต์ที่ยืนยันบัญชีแล้วเท่านั้น บัญชีนี้ไม่มีสิทธิ์เข้าถึง', signedOut: 'เข้าสู่ระบบด้วยบัญชี Google ของเจ้าของเว็บไซต์เพื่อดำเนินการต่อ', signIn: 'เข้าสู่ระบบด้วย Google', signOut: 'ออกจากระบบ', retry: 'ลองอีกครั้ง', authFailed: 'ตรวจสอบสิทธิ์ผู้ดูแลไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', dataFailed: 'โหลดข้อมูลไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', authError: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง', popupClosed: 'ปิดหน้าต่างเข้าสู่ระบบแล้ว สามารถลองใหม่ได้', popupBlocked: 'อนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง', network: 'ขณะนี้ออฟไลน์หรือการเชื่อมต่อขัดข้อง เชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง', permission: 'ไม่มีสิทธิ์ผู้ดูแล ตรวจสอบว่าเข้าสู่ระบบด้วยบัญชีเจ้าของเว็บไซต์ที่ยืนยันแล้ว',
    overview: 'ภาพรวม', activity: 'การใช้งาน', reports: 'เรื่องร้องเรียน', apps: 'จัดการแอป', scope: 'สถิตินับเฉพาะผู้ที่ยินยอมให้เก็บข้อมูลการใช้งาน เริ่มบันทึกหลังยินยอมและไม่สามารถเรียกคืนการเข้าชมในอดีต ไม่บันทึกเนื้อหาแบบฟอร์มส่วนตัว บันทึกหนัง ไฟล์ หรือข้อความแชต',
    range: 'ช่วงเวลา', days7: '7 วันที่ผ่านมา', days30: '30 วันที่ผ่านมา', days90: '90 วันที่ผ่านมา', app: 'แอป', allApps: 'ทุกแอป', event: 'เหตุการณ์', allEvents: 'ทุกเหตุการณ์', actor: 'บุคคลหรือบัญชี', actorHint: 'ค้นหาชื่อ อีเมล รหัสบัญชีหรือเซสชัน', clearFilters: 'ล้างตัวกรอง',
    actorActivity: 'บัญชีและเซสชันไม่ระบุตัวตน', actorSummaryNote: 'สรุปจากข้อมูลที่โหลดแล้วและตรงกับตัวกรอง แยกเซสชันไม่ระบุตัวตนจากบัญชีที่เข้าสู่ระบบ การเข้าสู่ระบบระหว่างใช้งานอาจทำให้การเยี่ยมชมเดียวอยู่ในทั้งสองกลุ่ม', firstSeen: 'พบครั้งแรก', lastSeen: 'พบล่าสุด', appsUsed: 'แอปที่ใช้', viewActivity: 'ดูการใช้งาน', groups: 'กลุ่ม', pageViews: 'การเปิดหน้า', appOpens: 'การเปิดแอป', clicks: 'การคลิก', sessions: 'เซสชัน', accounts: 'บัญชีที่เข้าสู่ระบบ', activeTime: 'เวลาที่ใช้งาน', seconds: 'วินาที', minutes: 'นาที', hours: 'ชม.', daily: 'การใช้งานรายวัน', dailyHint: 'จำนวนเหตุการณ์ที่บันทึก แยกตามวันที่เวลาไทย', topApps: 'แอปที่ใช้', topActions: 'การกระทำที่บันทึก', count: 'จำนวน', noEvents: 'ไม่มีการใช้งานที่ตรงกับตัวกรอง', noEventsHelp: 'อาจยังไม่มีผู้ใช้ที่ยินยอมเก็บสถิติในช่วงนี้ หรือไม่มีข้อมูลตรงกับตัวกรอง หน้านี้ไม่แสดงข้อมูลตัวอย่าง',
    loadingEvents: 'กำลังโหลดการใช้งาน…', moreEvents: 'โหลดการใช้งานเพิ่มเติม', loaded: 'เหตุการณ์ที่โหลดแล้ว', matching: 'ตรงกับตัวกรองปัจจุบัน', bounded: 'สถิติคำนวณจากเหตุการณ์ที่โหลดแล้วเท่านั้น กดโหลดเพิ่มเติมเพื่อนับข้อมูลเก่ากว่าในช่วงเวลานี้', allLoaded: 'โหลดเหตุการณ์ทั้งหมดที่มีในช่วงเวลานี้แล้ว', exportCsv: 'ส่งออกการใช้งานที่แสดงเป็น CSV', csvHint: 'ส่งออกเฉพาะข้อมูลที่โหลดแล้วและตรงกับตัวกรองปัจจุบัน ไฟล์อาจมีชื่อบัญชีและอีเมล',
    time: 'เวลา (ประเทศไทย)', person: 'บุคคล', action: 'การกระทำ', device: 'อุปกรณ์', path: 'หน้าเว็บ', anonymous: 'ผู้เยี่ยมชมไม่ระบุตัวตน', unknown: 'ไม่มีข้อมูล', show: 'แสดง', rows: 'รายการ', previous: 'ก่อนหน้า', next: 'ถัดไป', activityCaption: 'การใช้งานที่ยินยอมให้เก็บ เรียงจากใหม่ไปเก่า',
    reportStatus: 'สถานะเรื่อง', allReports: 'ทุกสถานะ', open: 'รับเรื่องแล้ว', in_progress: 'กำลังดำเนินการ', resolved: 'แก้ไขแล้ว', closed: 'ปิดเรื่อง', loadingReports: 'กำลังโหลดเรื่องร้องเรียน…', moreReports: 'โหลดเรื่องเพิ่มเติม', noReports: 'ไม่มีเรื่องร้องเรียนในมุมมองนี้', noReportsHelp: 'เรื่องจะปรากฏเมื่อผู้ใช้ส่งสำเร็จ เลือกสถานะอื่นเพื่อดูเรื่องก่อนหน้าได้', reportsLoaded: 'เรื่องที่โหลดแล้ว', reportBounded: 'แสดงเฉพาะเรื่องที่โหลดแล้ว กดโหลดเพิ่มเติมเพื่อดูเรื่องเก่ากว่า', reportAllLoaded: 'โหลดทุกเรื่องในสถานะนี้แล้ว', details: 'ดูรายละเอียด', report: 'เรื่องร้องเรียน', reportId: 'เลขอ้างอิง', submitted: 'ส่งเมื่อ', category: 'ประเภท', subject: 'หัวข้อ', description: 'รายละเอียด', contact: 'ช่องทางติดต่อที่ผู้ใช้ระบุ', reporter: 'ผู้ส่ง', guest: 'ผู้เยี่ยมชมที่ไม่ได้เข้าสู่ระบบ', noContact: 'ไม่ได้ระบุช่องทางติดต่อ', noReply: 'ยังไม่มีข้อความตอบกลับ', steps: 'ขั้นตอนที่พบปัญหา', expected: 'ผลลัพธ์ที่คาดหวัง', currentReply: 'ข้อความที่ผู้ส่งเห็น', reply: 'ตอบกลับผู้ส่ง', replyHint: 'ไม่เกิน 4,000 ตัวอักษร ห้ามใส่รหัสผ่าน คีย์ลับ หรือข้อมูลส่วนตัวของผู้ใช้คนอื่น', save: 'บันทึกการเปลี่ยนแปลง', saving: 'กำลังบันทึก…', saved: 'บันทึกสถานะและข้อความตอบกลับแล้ว', saveFailed: 'บันทึกไม่สำเร็จ ข้อความที่ร่างยังอยู่ กรุณาลองอีกครั้ง', saveUncertain: 'ยังยืนยันไม่ได้ว่าบันทึกสำเร็จหรือไม่ ตรวจสอบฉบับที่บันทึกก่อนลองส่งอีกครั้ง', checkSaved: 'ตรวจสอบฉบับที่บันทึก', serverChecked: 'ตรวจสอบฉบับที่บันทึกแล้ว ข้อความที่ยังไม่ได้บันทึกของคุณยังอยู่', close: 'ปิด', discard: 'ละทิ้งการแก้ไขเรื่องที่ยังไม่ได้บันทึกหรือไม่', replyInvalid: 'ข้อความตอบกลับต้องไม่เกิน 4,000 ตัวอักษรและไม่มีอักขระควบคุม', noChanges: 'ยังไม่มีการเปลี่ยนแปลงให้บันทึก', statusChanged: 'เรื่องนี้เปลี่ยนแปลงระหว่างแก้ไข กรุณาโหลดเรื่องใหม่ก่อนบันทึก', reportEmpty: 'ไม่ได้ระบุรายละเอียด', updated: 'แก้ไขล่าสุด', accountChanged: 'บัญชีเปลี่ยนแล้ว การแก้ไขที่ยังไม่ได้บันทึกจะไม่ถูกส่ง', home: 'กลับหน้าแอป', signedInAs: 'ผู้ดูแล',
    page_view: 'เปิดหน้าเว็บ', app_open: 'เปิดแอป', click: 'คลิก', heartbeat: 'กำลังใช้งาน', preference_change: 'เปลี่ยนการตั้งค่า', report_submitted: 'ส่งเรื่องร้องเรียน', help_view: 'เปิดความช่วยเหลือ', signin: 'เข้าสู่ระบบ', signout: 'ออกจากระบบ',
  },
};

export function isSiteOwner(user) {
  return Boolean(user?.emailVerified === true && String(user.email || '').trim().toLowerCase() === OWNER_EMAIL);
}
function eventTime(event) {
  const time = new Date(event?.createdAt || event?.clientAt || '').getTime();
  return Number.isFinite(time) ? time : 0;
}
function dayKey(time) {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok' }).formatToParts(new Date(time));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
export function filterUsageEvents(events, filters = {}) {
  const actor = String(filters.actor || '').trim().toLocaleLowerCase();
  const from = filters.from ? new Date(filters.from).getTime() : -Infinity;
  const to = filters.to ? new Date(filters.to).getTime() : Infinity;
  return (Array.isArray(events) ? events : []).filter(item => {
    if (item?.consentVersion !== 1 || !EVENT_NAMES.includes(item.name)) return false;
    const time = eventTime(item);
    if (!time || time < from || time > to) return false;
    if (filters.app && item.app !== filters.app) return false;
    if (filters.event && item.name !== filters.event) return false;
    return !actor || [item.actorName, item.actorEmail, item.actorUid, item.sessionId].some(value => String(value || '').toLocaleLowerCase().includes(actor));
  }).sort((a, b) => eventTime(b) - eventTime(a));
}
export function aggregateUsageEvents(events, { from, to } = {}) {
  const valid = filterUsageEvents(events, { from, to });
  const apps = new Map(); const actions = new Map(); const days = new Map();
  const sessions = new Set(); const accounts = new Set();
  let activeSeconds = 0; let pageViews = 0; let appOpens = 0; let clicks = 0;
  if (from && to && Number.isFinite(new Date(from).getTime()) && Number.isFinite(new Date(to).getTime())) {
    const start = new Date(from).getTime(); const end = new Date(to).getTime();
    for (let time = start; time <= end && days.size <= 92; time += DAY) days.set(dayKey(time), 0);
    days.set(dayKey(end), days.get(dayKey(end)) || 0);
  }
  for (const item of valid) {
    if (item.sessionId) sessions.add(item.sessionId);
    if (item.actorUid) accounts.add(item.actorUid);
    if (item.name === 'page_view') pageViews++;
    if (item.name === 'app_open') appOpens++;
    if (item.name === 'click') clicks++;
    if (item.name === 'heartbeat' && typeof item.durationSeconds === 'number' && Number.isFinite(item.durationSeconds)) activeSeconds += Math.min(60, Math.max(0, item.durationSeconds));
    const day = dayKey(eventTime(item)); days.set(day, (days.get(day) || 0) + 1);
    if (item.app) apps.set(item.app, (apps.get(item.app) || 0) + 1);
    const action = item.action || item.name; actions.set(action, (actions.get(action) || 0) + 1);
  }
  const ranked = map => [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total: valid.length, pageViews, appOpens, clicks, sessions: sessions.size, accounts: accounts.size, activeSeconds, daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })), apps: ranked(apps), actions: ranked(actions) };
}
export function summarizeUsageActors(events) {
  const groups = new Map();
  for (const item of filterUsageEvents(events)) {
    const key = item.actorUid ? `account:${item.actorUid}` : item.sessionId ? `session:${item.sessionId}` : '';
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, actorUid: item.actorUid || '', actorName: item.actorUid ? item.actorName || '' : '', actorEmail: item.actorUid ? item.actorEmail || '' : '', sessionId: item.actorUid ? '' : item.sessionId, firstSeen: eventTime(item), lastSeen: eventTime(item), pageViews: 0, clicks: 0, activeSeconds: 0, eventCount: 0, apps: new Set(), sessions: new Set() });
    const group = groups.get(key); const time = eventTime(item);
    group.firstSeen = Math.min(group.firstSeen, time); group.lastSeen = Math.max(group.lastSeen, time);
    if (!group.actorName && item.actorUid && item.actorName) group.actorName = item.actorName;
    if (!group.actorEmail && item.actorUid && item.actorEmail) group.actorEmail = item.actorEmail;
    if (item.name === 'page_view') group.pageViews++;
    if (item.name === 'click') group.clicks++;
    if (item.name === 'heartbeat' && typeof item.durationSeconds === 'number' && Number.isFinite(item.durationSeconds)) group.activeSeconds += Math.min(60, Math.max(0, item.durationSeconds));
    if (item.app) group.apps.add(item.app);
    if (item.sessionId) group.sessions.add(item.sessionId);
    group.eventCount++;
  }
  return [...groups.values()].map(group => ({ ...group, firstSeen: new Date(group.firstSeen).toISOString(), lastSeen: new Date(group.lastSeen).toISOString(), apps: [...group.apps].sort(), sessions: group.sessions.size })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.key.localeCompare(b.key));
}
function csvCell(value) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function activityCsv(events) {
  const rows = [['Time (Bangkok)', 'Event', 'App', 'Action', 'Page', 'Account name', 'Account email', 'Account ID', 'Session ID', 'Device', 'Active seconds']];
  for (const item of filterUsageEvents(events)) rows.push([formatTime(eventTime(item), 'en'), item.name, item.app, item.action, item.path, item.actorName, item.actorEmail, item.actorUid, item.sessionId, item.device, item.name === 'heartbeat' ? Math.min(60, Math.max(0, Number(item.durationSeconds) || 0)) : 0]);
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function validateReportChanges(value) {
  if (!REPORT_STATUSES.includes(value?.status)) throw new Error('INVALID_STATUS');
  const publicReply = String(value?.publicReply ?? '').trim();
  if ([...publicReply].length > MAX_REPLY_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(publicReply)) throw new Error('INVALID_REPLY');
  return { status: value.status, publicReply };
}
function formatTime(value, language) {
  const time = new Date(value).getTime();
  if (!time || !Number.isFinite(time)) return translations[language].unknown;
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(time));
}
function reportId(report) { return String(report.id || report.reportId || ''); }
function records(result, key) { return Array.isArray(result) ? result : (result?.items || result?.[key] || []); }
function nextCursor(result) { return result?.nextCursor || result?.cursor || null; }
function unique(items, id) { return [...new Map(items.map(item => [id(item), item])).values()]; }

export async function initAdminPage(options = {}) {
  const win = options.window || globalThis.window;
  const doc = options.document || win?.document;
  const root = options.root || doc?.getElementById('adminPanel');
  if (!root || root.dataset.adminInitialized) return null;
  root.dataset.adminInitialized = 'true';
  const loadAuth = options.loadAuth || (() => import(AUTH_MODULE));
  const loadData = options.loadData || (() => import(DATA_MODULE));
  const now = options.now || (() => new Date());
  const locale = () => win.TaithaiPreferences?.get?.().language === 'th' || (!win.TaithaiPreferences && doc.documentElement.lang === 'th') ? 'th' : 'en';
  const t = () => translations[locale()];
  let auth; let data; let user = null; let authChecked = false; let authFailed = false; let authBusy = false; let authMessage = '';
  let disposed = false; let unsubscribe = () => {}; let authTimer; let authRequest = 0; let ownerEpoch = 0;
  let currentTab = win.location?.hash === '#apps' ? 'apps' : 'overview'; let days = 7; let filters = { app: '', event: '', actor: '' };
  let from; let to; let events = []; let eventCursor = null; let eventLoading = false; let eventError = ''; let eventLoaded = false; let eventRequest = 0; let activityPage = 0;
  let reports = []; let reportCursor = null; let reportLoading = false; let reportError = ''; let reportLoaded = false; let reportRequest = 0; let statusFilter = 'open';
  let activeReport = null; let reportDraft = null; let dialogMessage = ''; let reportSaving = false; let dialogUncertain = false;
  let lastLocale = locale();
  const appsPanel = createAppVisibilityPanel({ document: doc, window: win, locale, isOwner: hasOwner, loadData: dataSource, redraw: renderPanels });

  function el(tag, text, className) { const item = doc.createElement(tag); if (text !== undefined) item.textContent = text; if (className) item.className = className; return item; }
  function button(text, handler, primary = false) { const item = el('button', text, 'button ' + (primary ? 'button-primary' : 'button-secondary')); item.type = 'button'; item.addEventListener('click', handler); return item; }
  function link(text, href) { const item = el('a', text); item.href = href; return item; }
  function panel(title, text) { const item = el('section', undefined, 'panel'); if (title) item.append(el('h2', title)); if (text) item.append(el('p', text, 'muted')); return item; }
  function option(value, label, selected) { const item = el('option', label); item.value = value; item.selected = selected; return item; }
  function field(labelText, input) { const container = el('div', undefined, 'field'); const label = el('label', labelText, 'field-label'); label.htmlFor = input.id; container.append(label, input); return container; }
  function select(id, values, selected, handler) { const input = el('select'); input.id = id; for (const [value, label] of values) input.append(option(value, label, value === selected)); input.value = selected; input.addEventListener('change', () => handler(input.value)); return input; }
  function notice(text, error = false) { const item = el('p', text, error ? 'notice notice-error' : 'notice'); item.setAttribute('role', error ? 'alert' : 'status'); return item; }
  function errorText(error) {
    if (win.navigator?.onLine === false) return t().network;
    const code = String(error?.code || error?.message || '');
    if (/permission|forbidden|unauth|denied/i.test(code)) return t().permission;
    return t().dataFailed;
  }
  function authError(error) {
    const code = error?.code || '';
    if (win.navigator?.onLine === false || code === 'auth/network-request-failed') return t().network;
    if (code === 'auth/popup-blocked') return t().popupBlocked;
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code)) return t().popupClosed;
    return t().authError;
  }
  function resetRange() { to = now().toISOString(); from = new Date(new Date(to).getTime() - days * DAY).toISOString(); }
  resetRange();
  function currentEvents() { return filterUsageEvents(events, { ...filters, from, to }); }
  function currentReports() { return reports.filter(item => !statusFilter || item.status === statusFilter); }
  function dirtyReport() { return Boolean(activeReport && reportDraft && (reportDraft.status !== activeReport.status || reportDraft.publicReply !== (activeReport.publicReply || ''))); }
  function hasOwner(epoch = ownerEpoch) { return !disposed && epoch === ownerEpoch && isSiteOwner(user); }
  function applyStyles() {
    if (doc.getElementById('taithaiAdminStyles')) return;
    const style = el('style'); style.id = 'taithaiAdminStyles';
    style.textContent = '#adminPanel .admin-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-block:24px}#adminPanel .admin-tabs [aria-selected="true"]{background:var(--text,#242522);color:var(--bg,#faf9f7)}#adminPanel .admin-controls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-block:24px}#adminPanel .admin-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-block:24px}#adminPanel .admin-stat-value{font-size:32px;font-weight:500;font-variant-numeric:tabular-nums}#adminPanel .admin-split{display:grid;grid-template-columns:1fr 1fr;gap:16px}#adminPanel .admin-table-wrap{overflow-x:auto;margin-block:16px}#adminPanel table{width:100%;border-collapse:collapse;font-size:14px}#adminPanel th,#adminPanel td{padding:12px;text-align:start;vertical-align:top;border-bottom:1px solid var(--border,#dedfd9)}#adminPanel th{font-weight:500;white-space:nowrap}#adminPanel caption{text-align:start;padding-block:12px;color:var(--text-mid,#595b55)}#adminPanel .admin-person{display:block;overflow-wrap:anywhere}#adminPanel .admin-secondary{display:block;font-size:12px;color:var(--text-muted,#6b6e66)}#adminPanel .admin-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-block:16px}#adminPanel .admin-rank{list-style:none;padding:0}#adminPanel .admin-rank li{display:flex;justify-content:space-between;gap:24px;padding-block:12px;border-bottom:1px solid var(--border,#dedfd9)}#adminPanel .admin-rank span{overflow-wrap:anywhere}#adminPanel .admin-rank strong{font-weight:500;font-variant-numeric:tabular-nums}#adminPanel .admin-chart{width:100%;height:auto;max-height:240px;display:block}#adminPanel .admin-report-list{display:grid;gap:16px;margin-block:16px}#adminPanel .admin-report-head{display:flex;justify-content:space-between;align-items:start;gap:16px}#adminPanel .admin-report-head h3{font-size:18px;font-weight:500;overflow-wrap:anywhere}#adminPanel dialog{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;margin:auto;padding:24px;border:1px solid var(--border,#dedfd9);border-radius:16px;background:var(--surface,#fff);color:var(--text,#242522)}#adminPanel dialog::backdrop{background:#0008}#adminPanel .admin-report-description{white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto}#adminPanel .admin-report-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-block:24px}#adminPanel dt{font-size:14px;color:var(--text-mid,#595b55)}#adminPanel dd{margin:4px 0 0;overflow-wrap:anywhere}#adminPanel textarea{width:100%;min-height:160px;resize:vertical}#adminPanel .admin-note{font-size:14px;color:var(--text-mid,#595b55);margin-block:12px}#adminPanel [hidden]{display:none!important}@media(max-width:760px){#adminPanel .admin-controls{grid-template-columns:repeat(2,minmax(0,1fr))}#adminPanel .admin-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#adminPanel .admin-split{grid-template-columns:1fr}#adminPanel th,#adminPanel td{padding:8px}}@media(max-width:420px){#adminPanel .admin-controls,#adminPanel .admin-report-meta{grid-template-columns:1fr}}';
    root.append(style);
  }
  function renderShell() {
    if (disposed) return;
    root.replaceChildren(); applyStyles();
    root.setAttribute('aria-busy', String(!authChecked && !authFailed));
    if (!authChecked) {
      const loading = panel('', authFailed ? t().authFailed : t().loading);
      loading.setAttribute('role', 'status'); if (authFailed) loading.append(button(t().retry, start)); root.append(loading); return;
    }
    if (!isSiteOwner(user)) {
      const gate = panel(t().deniedTitle, user ? t().denied : t().signedOut);
      const status = el('p', authMessage); status.id = 'adminAuthMessage'; status.setAttribute('role', 'status'); gate.append(status);
      if (!user) { const signInButton = button(t().signIn, signIn, true); signInButton.disabled = authBusy; signInButton.id = 'adminSignIn'; gate.append(signInButton); }
      else { const signOutButton = button(t().signOut, signOut); signOutButton.disabled = authBusy; gate.append(signOutButton); }
      gate.append(link(t().home, '/')); root.append(gate); return;
    }
    const heading = el('div', undefined, 'admin-actions');
    const signOutButton = button(t().signOut, signOut); signOutButton.disabled = authBusy;
    heading.append(el('span', `${t().signedInAs} · ${user.email}`, 'muted'), signOutButton);
    const authStatus = el('p', authMessage, 'notice'); authStatus.id = 'adminAuthMessage'; authStatus.setAttribute('role', 'status'); authStatus.hidden = !authMessage; const scopeNote = notice(t().scope); scopeNote.id = 'adminAnalyticsScope'; root.append(heading, authStatus, scopeNote);
    const tabs = el('div', undefined, 'admin-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', t().overview);
    for (const name of TAB_NAMES) {
      const tab = button(t()[name], () => chooseTab(name)); tab.id = `adminTab-${name}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(currentTab === name)); tab.setAttribute('aria-controls', `adminView-${name}`); tab.tabIndex = currentTab === name ? 0 : -1;
      tab.addEventListener('keydown', event => {
        const names = TAB_NAMES; let index = names.indexOf(currentTab);
        if (event.key === 'ArrowRight') index = (index + 1) % names.length;
        else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = names.length - 1;
        else return;
        event.preventDefault(); chooseTab(names[index]); doc.getElementById(`adminTab-${names[index]}`)?.focus();
      });
      tabs.append(tab);
    }
    root.append(tabs);
    const controls = el('div', undefined, 'admin-controls'); controls.id = 'adminUsageControls';
    controls.append(field(t().range, select('adminDays', [[7, t().days7], [30, t().days30], [90, t().days90]].map(([value, label]) => [String(value), label]), String(days), value => { days = Number(value); activityPage = 0; resetRange(); void fetchEvents(true); })));
    const apps = [...new Set(events.map(item => item.app).filter(Boolean))].sort();
    controls.append(field(t().app, select('adminAppFilter', [['', t().allApps], ...apps.map(name => [name, name])], filters.app, value => { filters.app = value; activityPage = 0; renderPanels(); })));
    controls.append(field(t().event, select('adminEventFilter', [['', t().allEvents], ...EVENT_NAMES.map(name => [name, t()[name]])], filters.event, value => { filters.event = value; activityPage = 0; renderPanels(); })));
    const actor = el('input'); actor.id = 'adminActorFilter'; actor.type = 'search'; actor.placeholder = t().actorHint; actor.value = filters.actor; actor.maxLength = 160; actor.addEventListener('input', () => { filters.actor = actor.value; activityPage = 0; renderPanels(); });
    controls.append(field(t().actor, actor));
    controls.append(button(t().clearFilters, () => { filters = { app: '', event: '', actor: '' }; activityPage = 0; renderShell(); })); root.append(controls);
    for (const name of TAB_NAMES) { const view = el('div'); view.id = `adminView-${name}`; view.setAttribute('role', 'tabpanel'); view.setAttribute('aria-labelledby', `adminTab-${name}`); root.append(view); }
    renderPanels();
    if (activeReport) renderReportDialog();
  }
  function chooseTab(name) {
    currentTab = name;
    for (const key of TAB_NAMES) { const tab = doc.getElementById(`adminTab-${key}`); tab?.setAttribute('aria-selected', String(key === name)); if (tab) tab.tabIndex = key === name ? 0 : -1; }
    renderPanels();
    if (name === 'reports' && !reportLoaded && !reportLoading) void fetchReports(true);
    if (name === 'apps') void appsPanel.ensureLoaded();
  }
  function activityFooter(container) {
    const selected = currentEvents();
    container.append(el('p', `${events.length.toLocaleString()} ${t().loaded} · ${selected.length.toLocaleString()} ${t().matching}`, 'admin-note'));
    container.append(el('p', eventCursor ? t().bounded : (eventLoaded ? t().allLoaded : ''), 'admin-note'));
    if (eventError) { container.append(notice(eventError, true), button(t().retry, () => fetchEvents(!eventLoaded))); }
    if (eventLoading) container.append(notice(t().loadingEvents));
    if (eventCursor && !eventLoading) container.append(button(t().moreEvents, () => fetchEvents(false)));
  }
  function stat(label, value) { const item = panel(); item.append(el('p', label, 'muted'), el('p', String(value), 'admin-stat-value')); return item; }
  function timeLabel(seconds) { if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} ${t().hours}`; if (seconds >= 60) return `${(seconds / 60).toFixed(1)} ${t().minutes}`; return `${Math.round(seconds)} ${t().seconds}`; }
  function rank(title, values) {
    const section = panel(title); if (!values.length) { section.append(el('p', t().noEvents, 'muted')); return section; }
    const list = el('ol', undefined, 'admin-rank');
    for (const item of values.slice(0, 10)) { const row = el('li'); row.append(el('span', item.label), el('strong', item.count.toLocaleString())); list.append(row); }
    section.append(list); return section;
  }
  function chart(daily) {
    const section = panel(t().daily, t().dailyHint);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('admin-chart'); svg.setAttribute('viewBox', '0 0 800 220'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${t().daily}: ${daily.map(item => `${item.date}: ${item.count}`).join(', ')}`);
    const max = Math.max(1, ...daily.map(item => item.count)); const barWidth = 736 / Math.max(1, daily.length);
    const baseline = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); baseline.setAttribute('d', 'M32 180H768'); baseline.setAttribute('stroke', 'var(--border,#dedfd9)'); svg.append(baseline);
    daily.forEach((item, index) => { const bar = doc.createElementNS('http://www.w3.org/2000/svg', 'rect'); const height = item.count / max * 140; bar.setAttribute('x', String(32 + index * barWidth + 2)); bar.setAttribute('y', String(180 - height)); bar.setAttribute('width', String(Math.max(2, barWidth - 4))); bar.setAttribute('height', String(height)); bar.setAttribute('rx', '2'); bar.setAttribute('fill', 'var(--accent,#a74128)'); const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = `${item.date}: ${item.count}`; bar.append(title); svg.append(bar); });
    for (const [date, x, anchor] of [[daily[0]?.date, 32, 'start'], [daily.at(-1)?.date, 768, 'end']]) { if (!date) continue; const label = doc.createElementNS('http://www.w3.org/2000/svg', 'text'); label.setAttribute('x', String(x)); label.setAttribute('y', '208'); label.setAttribute('fill', 'var(--text-mid,#595b55)'); label.setAttribute('font-size', '14'); label.setAttribute('text-anchor', anchor); label.textContent = date; svg.append(label); }
    section.append(svg); return section;
  }
  function renderOverview(container) {
    const summary = aggregateUsageEvents(currentEvents(), { from, to });
    const stats = el('div', undefined, 'admin-stats');
    for (const [label, value] of [[t().pageViews, summary.pageViews], [t().appOpens, summary.appOpens], [t().clicks, summary.clicks], [t().sessions, summary.sessions], [t().accounts, summary.accounts], [t().activeTime, timeLabel(summary.activeSeconds)]]) stats.append(stat(label, typeof value === 'number' ? value.toLocaleString() : value));
    container.append(stats);
    if (!summary.total && !eventLoading) container.append(panel(t().noEvents, t().noEventsHelp));
    container.append(chart(summary.daily));
    const split = el('div', undefined, 'admin-split'); split.append(rank(t().topApps, summary.apps), rank(t().topActions, summary.actions)); container.append(split);
    renderActorSummary(container);
    activityFooter(container);
  }
  function renderActorSummary(container) {
    const actors = summarizeUsageActors(currentEvents());
    const section = panel(t().actorActivity, t().actorSummaryNote);
    section.append(el('p', `${t().show} ${Math.min(25, actors.length)} / ${actors.length} ${t().groups}`, 'admin-note'));
    if (!actors.length) { section.append(el('p', t().noEvents, 'muted')); container.append(section); return; }
    const wrap = el('div', undefined, 'admin-table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', t().actorActivity);
    const table = el('table'); const head = el('thead'); const heading = el('tr');
    for (const title of [t().person, t().firstSeen, t().lastSeen, t().pageViews, t().clicks, t().appsUsed, t().activeTime, t().activity]) { const cell = el('th', title); cell.scope = 'col'; heading.append(cell); }
    head.append(heading); table.append(head); const body = el('tbody');
    for (const actor of actors.slice(0, 25)) {
      const row = el('tr'); const person = el('td'); person.append(el('span', actor.actorName || actor.actorEmail || t().anonymous, 'admin-person'));
      if (actor.actorEmail) person.append(el('span', actor.actorEmail, 'admin-secondary'));
      person.append(el('span', actor.actorUid || actor.sessionId, 'admin-secondary'));
      row.append(person, el('td', formatTime(actor.firstSeen, locale())), el('td', formatTime(actor.lastSeen, locale())), el('td', actor.pageViews.toLocaleString()), el('td', actor.clicks.toLocaleString()), el('td', actor.apps.join(', ')), el('td', timeLabel(actor.activeSeconds)));
      const action = el('td'); action.append(button(t().viewActivity, () => { filters.actor = actor.actorUid || actor.sessionId; activityPage = 0; currentTab = 'activity'; renderShell(); doc.getElementById('adminTab-activity')?.focus(); })); row.append(action); body.append(row);
    }
    table.append(body); wrap.append(table); section.append(wrap); container.append(section);
  }
  function renderActivity(container) {
    const all = currentEvents(); const pageSize = 50; const pageCount = Math.max(1, Math.ceil(all.length / pageSize)); activityPage = Math.min(activityPage, pageCount - 1); const start = activityPage * pageSize; const page = all.slice(start, start + pageSize);
    const actions = el('div', undefined, 'admin-actions'); const exportButton = button(t().exportCsv, exportActivity); exportButton.disabled = !all.length; actions.append(exportButton, button(t().clearFilters, () => { filters = { app: '', event: '', actor: '' }; activityPage = 0; renderShell(); })); container.append(actions, el('p', t().csvHint, 'admin-note'));
    if (!all.length && !eventLoading) container.append(panel(t().noEvents, t().noEventsHelp));
    if (page.length) {
      const wrap = el('div', undefined, 'admin-table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', t().activityCaption);
      const table = el('table'); table.append(el('caption', t().activityCaption)); const head = el('thead'); const header = el('tr'); for (const text of [t().time, t().person, t().app, t().event, t().action, t().device]) { const cell = el('th', text); cell.scope = 'col'; header.append(cell); } head.append(header); table.append(head);
      const body = el('tbody');
      for (const item of page) { const row = el('tr'); row.append(el('td', formatTime(eventTime(item), locale()))); const person = el('td'); person.append(el('span', item.actorName || item.actorEmail || t().anonymous, 'admin-person')); if (item.actorEmail && item.actorEmail !== item.actorName) person.append(el('span', item.actorEmail, 'admin-secondary')); if (item.actorUid) person.append(el('span', item.actorUid, 'admin-secondary')); row.append(person, el('td', item.app || t().unknown), el('td', t()[item.name] || item.name)); const action = el('td'); action.append(el('span', item.action || t()[item.name] || item.name), el('span', item.path || '', 'admin-secondary')); row.append(action, el('td', item.device || t().unknown)); body.append(row); }
      table.append(body); wrap.append(table); container.append(wrap);
      const pagination = el('div', undefined, 'admin-actions'); const previous = button(t().previous, () => { activityPage--; renderPanels(); }); previous.disabled = activityPage === 0; const next = button(t().next, () => { activityPage++; renderPanels(); }); next.disabled = activityPage >= pageCount - 1;
      pagination.append(previous, el('span', `${t().show} ${start + 1}–${start + page.length} / ${all.length} ${t().rows}`, 'muted'), next); container.append(pagination);
    }
    activityFooter(container);
  }
  function renderReports(container) {
    const controls = el('div', undefined, 'admin-actions'); controls.append(field(t().reportStatus, select('adminReportFilter', [['', t().allReports], ...REPORT_STATUSES.map(status => [status, t()[status]])], statusFilter, value => { statusFilter = value; void fetchReports(true); }))); container.append(controls);
    const list = el('div', undefined, 'admin-report-list');
    for (const item of currentReports()) {
      const card = panel(); const top = el('div', undefined, 'admin-report-head'); top.append(el('h3', item.subject || item.title || t().report), el('span', t()[item.status] || item.status, 'muted')); card.append(top);
      card.append(el('p', `${item.app || t().unknown} · ${formatTime(item.createdAt || item.clientAt, locale())}`, 'admin-note'), el('p', `${t().reportId}: ${reportId(item)}`, 'admin-note'));
      card.append(button(t().details, () => openReport(item))); list.append(card);
    }
    container.append(list);
    if (!currentReports().length && !reportLoading) container.append(panel(t().noReports, t().noReportsHelp));
    container.append(el('p', `${currentReports().length} ${t().reportsLoaded}`, 'admin-note'), el('p', reportCursor ? t().reportBounded : (reportLoaded ? t().reportAllLoaded : ''), 'admin-note'));
    if (reportError) container.append(notice(reportError, true), button(t().retry, () => fetchReports(!reportLoaded)));
    if (reportLoading) container.append(notice(t().loadingReports));
    if (reportCursor && !reportLoading) container.append(button(t().moreReports, () => fetchReports(false)));
  }
  function renderPanels() {
    if (!hasOwner()) return;
    const controls = doc.getElementById('adminUsageControls'); if (controls) controls.hidden = !['overview', 'activity'].includes(currentTab);
    const scopeNote = doc.getElementById('adminAnalyticsScope'); if (scopeNote) scopeNote.hidden = currentTab === 'apps';
    for (const name of TAB_NAMES) { const target = doc.getElementById(`adminView-${name}`); if (!target) continue; target.hidden = currentTab !== name; target.replaceChildren(); if (name === currentTab) ({ overview: renderOverview, activity: renderActivity, reports: renderReports, apps: container => appsPanel.render(container) })[name](target); }
  }
  function refreshAppFilter() {
    const select = doc.getElementById('adminAppFilter'); if (!select) return;
    const names = [...new Set(events.map(item => item.app).filter(Boolean))].sort();
    select.replaceChildren(option('', t().allApps, !filters.app), ...names.map(name => option(name, name, filters.app === name))); select.value = filters.app;
  }
  async function dataSource(epoch) {
    if (!data) data = await loadData();
    if (!hasOwner(epoch)) throw new Error('ACCOUNT_CHANGED');
    return data;
  }
  async function fetchEvents(reset = false) {
    if (!hasOwner() || eventLoading && !reset) return;
    const epoch = ownerEpoch; const request = ++eventRequest;
    if (reset) { events = []; eventCursor = null; eventLoaded = false; activityPage = 0; }
    eventLoading = true; eventError = ''; renderPanels();
    try {
      const source = await dataSource(epoch);
      const result = await source.listEvents({ from, to, limit: 500, cursor: reset ? null : eventCursor });
      if (!hasOwner(epoch) || request !== eventRequest) return;
      const incoming = records(result, 'events');
      events = unique([...events, ...incoming], item => item.eventId || item.id || `${item.sessionId}:${item.name}:${item.clientAt}:${item.action}`);
      eventCursor = nextCursor(result); eventLoaded = true; refreshAppFilter();
    } catch (error) { if (hasOwner(epoch) && request === eventRequest) eventError = errorText(error); }
    finally { if (hasOwner(epoch) && request === eventRequest) { eventLoading = false; renderPanels(); } }
  }
  async function fetchReports(reset = false) {
    if (!hasOwner() || reportLoading && !reset) return;
    const epoch = ownerEpoch; const request = ++reportRequest;
    if (reset) { reports = []; reportCursor = null; reportLoaded = false; }
    reportLoading = true; reportError = ''; renderPanels();
    try {
      const source = await dataSource(epoch);
      const result = await source.listReports({ status: statusFilter || undefined, limit: 50, cursor: reset ? null : reportCursor });
      if (!hasOwner(epoch) || request !== reportRequest) return;
      reports = unique([...reports, ...records(result, 'reports')], reportId); reportCursor = nextCursor(result); reportLoaded = true;
    } catch (error) { if (hasOwner(epoch) && request === reportRequest) reportError = errorText(error); }
    finally { if (hasOwner(epoch) && request === reportRequest) { reportLoading = false; renderPanels(); } }
  }
  function exportActivity() {
    if (!hasOwner()) return;
    const blob = new win.Blob([activityCsv(currentEvents())], { type: 'text/csv;charset=utf-8' }); const url = win.URL.createObjectURL(blob); const a = link('', url); a.download = `taithai-activity-${to.slice(0, 10)}.csv`; root.append(a); a.click(); a.remove(); win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }
  function openReport(item) { if (!hasOwner()) return; activeReport = item; reportDraft = { status: item.status || 'open', publicReply: item.publicReply || '' }; dialogMessage = ''; dialogUncertain = false; renderReportDialog(); }
  function closeReport(force = false) {
    if (reportSaving && !force) return;
    if (!force && dirtyReport() && typeof win.confirm === 'function' && !win.confirm(t().discard)) return;
    const dialog = doc.getElementById('adminReportDialog'); if (dialog?.open) dialog.close(); dialog?.remove(); activeReport = null; reportDraft = null; dialogMessage = ''; dialogUncertain = false;
  }
  function renderReportDialog() {
    doc.getElementById('adminReportDialog')?.remove();
    if (!activeReport || !hasOwner()) return;
    const record = activeReport; const dialog = el('dialog'); dialog.id = 'adminReportDialog'; dialog.setAttribute('aria-labelledby', 'adminReportHeading');
    const title = el('h2', record.subject || record.title || t().report); title.id = 'adminReportHeading'; dialog.append(title);
    const meta = el('dl', undefined, 'admin-report-meta');
    for (const [label, value] of [[t().reportId, reportId(record)], [t().submitted, formatTime(record.createdAt || record.clientAt, locale())], [t().app, record.app || t().unknown], [t().category, record.category || record.type || t().unknown], [t().reporter, record.ownerName || record.ownerEmail || record.ownerUid || record.actorName || record.actorEmail || t().guest], [t().contact, record.contact || record.contactEmail || t().noContact]]) { const row = el('div'); row.append(el('dt', label), el('dd', String(value))); meta.append(row); }
    dialog.append(meta, el('h3', t().description), el('p', record.description || record.details || record.message || t().reportEmpty, 'admin-report-description'));
    if (record.steps) dialog.append(el('h3', t().steps), el('p', record.steps, 'admin-report-description'));
    if (record.expected) dialog.append(el('h3', t().expected), el('p', record.expected, 'admin-report-description'));
    if (record.ownerEmail) dialog.append(el('p', record.ownerEmail, 'admin-note'));
    if (record.ownerUid) dialog.append(el('p', record.ownerUid, 'admin-note'));
    const form = el('form'); form.id = 'adminReportForm'; form.noValidate = true;
    const status = select('adminReportStatus', REPORT_STATUSES.map(value => [value, t()[value]]), reportDraft.status, value => { reportDraft.status = value; }); status.disabled = reportSaving;
    const reply = el('textarea'); reply.id = 'adminReportReply'; reply.name = 'publicReply'; reply.rows = 6; reply.maxLength = 8000; reply.value = reportDraft.publicReply; reply.disabled = reportSaving; reply.setAttribute('aria-describedby', 'adminReplyHint'); reply.addEventListener('input', () => { reportDraft.publicReply = reply.value; });
    const hint = el('p', t().replyHint, 'field-hint'); hint.id = 'adminReplyHint'; const message = el('p', dialogMessage, 'notice'); message.id = 'adminReportMessage'; message.setAttribute('role', 'status'); message.hidden = !dialogMessage;
    form.append(field(t().reportStatus, status), field(t().reply, reply), hint, message);
    const actions = el('div', undefined, 'admin-actions'); const save = button(reportSaving ? t().saving : t().save, () => {} , true); save.id = 'adminSaveReport'; save.type = 'submit'; save.disabled = reportSaving; const close = button(t().close, () => closeReport()); close.disabled = reportSaving; actions.append(save, close);
    if (dialogUncertain) { const verify = button(t().checkSaved, verifySavedReport); verify.disabled = reportSaving; actions.append(verify); }
    form.append(actions); form.addEventListener('submit', saveReport); dialog.append(form);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeReport(); });
    root.append(dialog); if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  async function saveReport(event) {
    event.preventDefault(); if (!hasOwner() || reportSaving || !activeReport) return;
    let change;
    try { change = validateReportChanges(reportDraft); }
    catch { dialogMessage = t().replyInvalid; renderReportDialog(); doc.getElementById('adminReportReply')?.focus(); return; }
    if (!dirtyReport()) { dialogMessage = t().noChanges; renderReportDialog(); return; }
    const epoch = ownerEpoch; const id = reportId(activeReport); reportSaving = true; dialogMessage = ''; dialogUncertain = false; renderReportDialog();
    try {
      const source = await dataSource(epoch); const result = await source.updateReport(id, change);
      if (!hasOwner(epoch) || reportId(activeReport || {}) !== id) return;
      const updated = result?.report || result?.item || (result && reportId(result) ? result : { ...activeReport, ...change });
      activeReport = { ...activeReport, ...updated, ...change }; reportDraft = { ...change }; reports = reports.map(item => reportId(item) === id ? activeReport : item); dialogMessage = t().saved; renderPanels();
    } catch (error) { if (hasOwner(epoch)) { dialogUncertain = error?.deliveryUnknown === true || error?.code === 'site/timeout-uncertain'; dialogMessage = dialogUncertain ? t().saveUncertain : (/permission|denied/i.test(String(error?.code || '')) ? t().permission : t().saveFailed); } }
    finally { if (hasOwner(epoch)) { reportSaving = false; renderReportDialog(); } }
  }
  async function verifySavedReport() {
    if (!hasOwner() || reportSaving || !activeReport) return;
    const epoch = ownerEpoch; const id = reportId(activeReport); reportSaving = true; renderReportDialog();
    try {
      const source = await dataSource(epoch); const result = await source.getReport(id);
      if (!hasOwner(epoch) || reportId(activeReport || {}) !== id) return;
      const latest = result?.report || result?.item || result;
      if (!latest || reportId(latest) !== id) throw new Error('site/not-found');
      activeReport = latest; reports = reports.map(item => reportId(item) === id ? latest : item);
      const matches = latest.status === reportDraft.status && (latest.publicReply || '') === reportDraft.publicReply.trim();
      if (matches) reportDraft = { status: latest.status, publicReply: latest.publicReply || '' };
      dialogUncertain = false; dialogMessage = matches ? t().saved : t().serverChecked; renderPanels();
    } catch { if (hasOwner(epoch)) dialogMessage = t().dataFailed; }
    finally { if (hasOwner(epoch)) { reportSaving = false; renderReportDialog(); } }
  }
  async function signIn() {
    if (authBusy || !auth) return; authBusy = true; authMessage = ''; renderShell();
    try { const signedIn = await auth.loginWithGoogle(); if (signedIn) acceptUser(signedIn); }
    catch (error) { authMessage = authError(error); }
    finally { authBusy = false; renderShell(); }
  }
  async function signOut() {
    if (authBusy || !auth) return;
    if ((dirtyReport() || appsPanel.dirty()) && typeof win.confirm === 'function' && !win.confirm(appsPanel.dirty() ? appsPanel.leaveMessage() : t().discard)) return;
    closeReport(true); authBusy = true; authMessage = ''; renderShell();
    try { await auth.logout(); acceptUser(null); }
    catch (error) { authMessage = authError(error); }
    finally { authBusy = false; renderShell(); }
  }
  function acceptUser(next) {
    if (disposed) return;
    win.clearTimeout(authTimer); authChecked = true; authFailed = false;
    const sameOwner = isSiteOwner(user) && isSiteOwner(next) && user.uid === next.uid;
    user = next;
    if (!sameOwner) { ownerEpoch++; eventRequest++; reportRequest++; appsPanel.reset(); events = []; reports = []; eventCursor = reportCursor = null; eventLoading = reportLoading = false; eventLoaded = reportLoaded = false; eventError = reportError = ''; reportSaving = false; closeReport(true); }
    renderShell();
    if (isSiteOwner(user) && !eventLoaded && !eventLoading) void fetchEvents(true);
    if (isSiteOwner(user) && currentTab === 'apps') void appsPanel.ensureLoaded();
  }
  async function start() {
    const request = ++authRequest; unsubscribe(); unsubscribe = () => {}; win.clearTimeout(authTimer); authChecked = false; authFailed = false; renderShell();
    authTimer = win.setTimeout(() => { if (request === authRequest && !authChecked && !disposed) { authFailed = true; renderShell(); } }, 12000);
    try { const result = await loadAuth(); if (disposed || request !== authRequest) return; auth = result; unsubscribe = auth.subscribeAuth(next => { if (request === authRequest) acceptUser(next); }); }
    catch { if (!disposed && request === authRequest) { win.clearTimeout(authTimer); authFailed = true; renderShell(); } }
  }
  const onPreferences = () => { const next = locale(); if (next !== lastLocale) { lastLocale = next; renderShell(); } };
  const beforeUnload = event => { if (dirtyReport() || appsPanel.dirty() || appsPanel.isSaving()) { event.preventDefault(); event.returnValue = ''; } };
  win.addEventListener('taithai:preferences', onPreferences); win.addEventListener('beforeunload', beforeUnload);
  await start();
  return { destroy() { disposed = true; ownerEpoch++; authRequest++; appsPanel.destroy(); unsubscribe(); win.clearTimeout(authTimer); win.removeEventListener('taithai:preferences', onPreferences); win.removeEventListener('beforeunload', beforeUnload); closeReport(true); delete root.dataset.adminInitialized; }, render: renderShell };
}
if (typeof window !== 'undefined' && window.document?.getElementById('adminPanel')) void initAdminPage();
