import {createSocialApi,createSocialOutbox,verifiedSocialUser,validateSocialFiles,socialAttachmentPath,publicProfileUrl,safeSocialMediaUrl,uploadSocialFile,removeSocialUpload,fetchSocialVideo,SOCIAL_LIMITS} from './site-social-client.js';

const TEXT={
  th:{loading:'กำลังโหลด…',retry:'ลองอีกครั้ง',signIn:'เข้าสู่ระบบด้วย Google',signOut:'ออกจากระบบ',guestTitle:'พื้นที่เล่าเรื่องของคุณ',guestText:'อ่านโพสต์สาธารณะได้เลย เข้าสู่ระบบเพื่อสร้างโปรไฟล์ โพสต์ ติดตาม และส่งข้อความ',setupTitle:'สร้างโปรไฟล์สาธารณะ',editProfile:'แก้ไขโปรไฟล์',setupText:'เลือกชื่อที่คนอื่นค้นหาและติดตามได้ โปรไฟล์จะปรากฏหลังคุณกดบันทึก',handle:'ชื่อผู้ใช้',handleHint:'3–24 ตัวอักษร ใช้ภาษาอังกฤษตัวเล็ก ตัวเลข และ _ ชื่อเดิมยังสงวนไว้ให้บัญชีคุณหลังเปลี่ยนชื่อ',displayName:'ชื่อที่แสดง',bio:'เกี่ยวกับคุณ',googlePhoto:'ใช้รูปโปรไฟล์จาก Google',publicProfileNote:'ชื่อผู้ใช้ ชื่อที่แสดง รูปโปรไฟล์ ประวัติ และโพสต์เป็นข้อมูลสาธารณะ อีเมลเข้าสู่ระบบไม่แสดงในโปรไฟล์',saveProfile:'บันทึกโปรไฟล์',cancel:'ยกเลิก',saving:'กำลังบันทึก…',saved:'บันทึกแล้ว',profileMissing:'ยังไม่มีโปรไฟล์นี้',profileMissingText:'ตรวจสอบลิงก์หรือค้นหาชื่อผู้ใช้อีกครั้ง',myProfile:'โปรไฟล์ของฉัน',community:'ชุมชน',messages:'ข้อความ',latest:'โพสต์ล่าสุด',refresh:'รีเฟรช',more:'โหลดเพิ่มเติม',emptyPosts:'ยังไม่มีโพสต์',emptyPostsText:'เมื่อมีการเผยแพร่เรื่องราว โพสต์จะปรากฏที่นี่',compose:'อยากเล่าอะไร',composePlaceholder:'เรื่องราวของวันนี้…',publish:'เผยแพร่โพสต์',publishing:'กำลังเผยแพร่…',attach:'แนบรูปหรือวิดีโอ',mediaHint:'แนบรูปได้ 4 รูป รูปละไม่เกิน 10 MB หรือวิดีโอ MP4/WebM 1 คลิป ไม่เกิน 100 MB',publicPostNote:'โพสต์และสื่อที่เผยแพร่นี้เป็นสาธารณะ',remove:'เอาออก',uploading:'กำลังอัปโหลด',uploaded:'อัปโหลดแล้ว',uploadFailed:'อัปโหลดไม่สำเร็จ',uploadRetry:'อัปโหลดอีกครั้ง',cancelUpload:'ยกเลิกอัปโหลด',discard:'ล้างร่าง',discardConfirm:'ล้างข้อความและไฟล์ที่แนบในร่างนี้หรือไม่?',posted:'เผยแพร่โพสต์แล้ว',edit:'แก้ไข',delete:'ลบโพสต์',deleteConfirm:'ลบโพสต์และสื่อที่แนบนี้หรือไม่? โพสต์จะหายจากหน้าโปรไฟล์และชุมชน',deleted:'ลบโพสต์แล้ว',cleanupPending:'โพสต์ถูกซ่อนแล้ว แต่ยังยืนยันการลบสื่อไม่ได้ กดตรวจสอบรายการเดิมเพื่อลองลบสื่ออีกครั้ง',editPost:'แก้ไขข้อความในโพสต์',save:'บันทึก',share:'แชร์',copyLink:'คัดลอกลิงก์',copied:'คัดลอกลิงก์แล้ว',manualCopy:'คัดลอกลิงก์ด้านล่างได้เลย',follow:'ติดตาม',following:'กำลังติดตาม',unfollow:'เลิกติดตาม',followers:'ผู้ติดตาม',followingCount:'กำลังติดตาม',posts:'โพสต์',sendMessage:'ส่งข้อความ',block:'บล็อกบัญชี',unblock:'เลิกบล็อก',blocked:'บล็อกแล้ว',blockConfirm:'บล็อกบัญชีนี้หรือไม่? ระบบจะยกเลิกการติดตามทั้งสองฝ่ายและหยุดข้อความใหม่ โพสต์สาธารณะและข้อความเก่ายังอ่านได้',unblockConfirm:'เลิกบล็อกบัญชีนี้หรือไม่?',blockedText:'บัญชีนี้ถูกบล็อก จึงยังติดตามหรือส่งข้อความไม่ได้',contactUnavailable:'ยังไม่สามารถติดต่อบัญชีนี้ได้',close:'ปิด',emptyPeople:'ยังไม่มีบัญชีในรายการนี้',findPeople:'ค้นหาผู้คนได้จากช่องค้นหาด้านบน',chatTitle:'ข้อความของคุณ',chatEmpty:'ยังไม่มีบทสนทนา',chatEmptyText:'เปิดโปรไฟล์ของคนที่อยากคุยด้วย แล้วกดส่งข้อความ',chooseConversation:'เลือกบทสนทนา',chooseConversationText:'ข้อความเห็นได้เฉพาะสองบัญชีในบทสนทนา',messagePlaceholder:'เขียนข้อความ…',send:'ส่ง',sending:'กำลังส่ง…',emptyMessages:'เริ่มบทสนทนาได้ที่นี่',older:'โหลดข้อความก่อนหน้า',privateNote:'บทสนทนาส่วนตัวระหว่างสองบัญชี อัปเดตอัตโนมัติเมื่อเปิดหน้านี้',blockedAccounts:'บัญชีที่คุณบล็อก',back:'บทสนทนาทั้งหมด',messageSent:'ส่งข้อความแล้ว',uncertain:'ยังยืนยันผลรายการไม่ได้ ข้อมูลรายการนี้ถูกล็อกไว้เพื่อป้องกันการส่งซ้ำ',retryOriginal:'ตรวจสอบรายการเดิม',pendingOther:'มีรายการเดิมที่รอยืนยัน กรุณาตรวจสอบก่อนเริ่มรายการใหม่',clearPending:'เริ่มรายการใหม่',clearPendingConfirm:'ตรวจสอบผลเดิมในโปรไฟล์หรือบทสนทนาแล้วหรือยัง? การเริ่มรายการใหม่ไม่ได้ยกเลิกรายการที่เซิร์ฟเวอร์อาจบันทึกแล้ว',failed:'ดำเนินการไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองอีกครั้งได้',offline:'ขณะนี้ออฟไลน์ เชื่อมต่ออินเทอร์เน็ตเพื่อโหลดหรือส่งข้อมูล',timeout:'เชื่อมต่อนานเกินไป กรุณาลองอีกครั้ง',auth:'กรุณาเข้าสู่ระบบด้วยบัญชีที่ยืนยันอีเมลแล้ว',taken:'ชื่อนี้มีผู้ใช้อยู่แล้ว เลือกชื่ออื่นได้เลย',invalidHandle:'ชื่อผู้ใช้ต้องมี 3–24 ตัวอักษร ใช้ a–z ตัวเลข หรือ _',invalidProfile:'ตรวจสอบชื่อที่แสดงและประวัติอีกครั้ง',invalidPost:'เพิ่มข้อความหรือสื่อ และตรวจสอบความยาวก่อนเผยแพร่',mediaCount:'แนบรูปได้ไม่เกิน 4 รูป',mediaMixed:'เลือก 4 รูปหรือน้อยกว่า หรือวิดีโอ 1 คลิป โดยไม่ผสมกัน',mediaType:'รองรับรูป JPEG, PNG, WebP, GIF และวิดีโอ MP4, WebM',mediaSize:'รูปต้องไม่เกิน 10 MB และวิดีโอต้องไม่เกิน 100 MB',mediaUnavailable:'ยังใช้สื่อนี้ไม่ได้ กรุณาตรวจไฟล์หรืออัปโหลดอีกครั้ง',rate:'ทำรายการบ่อยเกินไป กรุณารอสักครู่',permission:'บัญชีนี้ไม่มีสิทธิ์ดำเนินการ',changed:'บัญชีที่ใช้งานเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง',end:'โหลดโพสต์ที่มีครบแล้ว',draftLeave:'ยังมีข้อความหรือไฟล์แนบที่ไม่ได้ส่ง ต้องการออกจากหน้านี้หรือไม่?',report:'แจ้งปัญหา',postEdited:'แก้ไขโพสต์แล้ว',profileOnly:'สร้างโปรไฟล์ก่อนเพื่อโพสต์ ติดตาม และส่งข้อความ',profileRequired:'คุณต้องสร้างโปรไฟล์สาธารณะก่อน',join:'ตั้งค่าโปรไฟล์',dateUnknown:'ไม่ทราบเวลา',emptyPage:'ไม่มีโพสต์ที่แสดงได้ในหน้านี้',allPeople:'ทุกบัญชี',fileFallback:'ไฟล์แนบที่อัปโหลดแล้ว',localDraft:'ร่างเก็บไว้ในแท็บนี้สำหรับบัญชีของคุณ',loadingFailed:'โหลดข้อมูลไม่สำเร็จ',messageLong:'ข้อความยาวเกินกำหนด',noUser:'บัญชี',uploadCancelled:'ยกเลิกอัปโหลดแล้ว',fileChanged:'ไฟล์นี้ต่างจากไฟล์เดิม กรุณาเลือกไฟล์ต้นฉบับเพื่ออัปโหลดต่อ หรือเอาไฟล์นี้ออกแล้วแนบใหม่'},
  en:{loading:'Loading…',retry:'Try again',signIn:'Sign in with Google',signOut:'Sign out',guestTitle:'Your place to share',guestText:'Read public posts now. Sign in to create a profile, post, follow people and send messages.',setupTitle:'Create a public profile',editProfile:'Edit profile',setupText:'Choose a name people can find and follow. Your profile appears after you save it.',handle:'Username',handleHint:'3–24 lowercase English letters, numbers or _. Previous names remain reserved to your account after a change.',displayName:'Display name',bio:'About you',googlePhoto:'Use my Google profile photo',publicProfileNote:'Your username, display name, photo, bio and posts are public. Your sign-in email is not shown on your profile.',saveProfile:'Save profile',cancel:'Cancel',saving:'Saving…',saved:'Saved',profileMissing:'Profile not found',profileMissingText:'Check the link or search for the username again.',myProfile:'My profile',community:'Community',messages:'Messages',latest:'Latest posts',refresh:'Refresh',more:'Load more',emptyPosts:'No posts yet',emptyPostsText:'Published stories will appear here.',compose:'What would you like to share?',composePlaceholder:'Something from your day…',publish:'Publish post',publishing:'Publishing…',attach:'Add photos or video',mediaHint:'Up to 4 photos, 10 MB each, or one MP4/WebM video up to 100 MB.',publicPostNote:'This post and its published media will be public.',remove:'Remove',uploading:'Uploading',uploaded:'Uploaded',uploadFailed:'Upload failed',uploadRetry:'Retry upload',cancelUpload:'Cancel upload',discard:'Clear draft',discardConfirm:'Clear the text and attached files in this draft?',posted:'Post published',edit:'Edit',delete:'Delete post',deleteConfirm:'Delete this post and its attached media? It will disappear from your profile and community.',deleted:'Post deleted',cleanupPending:'The post is hidden, but media deletion is not confirmed. Check the original request to retry deleting the files.',editPost:'Edit post text',save:'Save',share:'Share',copyLink:'Copy link',copied:'Link copied',manualCopy:'You can copy the link below.',follow:'Follow',following:'Following',unfollow:'Unfollow',followers:'Followers',followingCount:'Following',posts:'Posts',sendMessage:'Message',block:'Block account',unblock:'Unblock',blocked:'Blocked',blockConfirm:'Block this account? Both follow relationships will be removed and new messages stopped. Public posts and earlier messages remain readable.',unblockConfirm:'Unblock this account?',blockedText:'This account is blocked. Following and sending messages are unavailable.',contactUnavailable:'This account cannot be contacted right now.',close:'Close',emptyPeople:'No accounts in this list yet',findPeople:'Find people using the search above.',chatTitle:'Your messages',chatEmpty:'No conversations yet',chatEmptyText:'Open someone’s profile and choose Message to start a conversation.',chooseConversation:'Choose a conversation',chooseConversationText:'Messages are visible only to the two accounts in a conversation.',messagePlaceholder:'Write a message…',send:'Send',sending:'Sending…',emptyMessages:'Start the conversation here.',older:'Load earlier messages',privateNote:'A private conversation between two accounts. Updates automatically while this page is open.',blockedAccounts:'Accounts you blocked',back:'All conversations',messageSent:'Message sent',uncertain:'The result is not confirmed. This request is locked to prevent duplicate delivery.',retryOriginal:'Check original request',pendingOther:'An earlier request is awaiting confirmation. Check it before starting a new one.',clearPending:'Start a new request',clearPendingConfirm:'Have you checked the original result in the profile or conversation? Starting a new request does not undo anything the server may already have saved.',failed:'The action failed. Your entered details are still here. You can try again.',offline:'You are offline. Connect to load or send data.',timeout:'The connection took too long. Try again.',auth:'Sign in using an account with a verified email.',taken:'This username is already in use. Choose another.',invalidHandle:'Use 3–24 lowercase a–z letters, numbers or _.',invalidProfile:'Check the display name and bio.',invalidPost:'Add text or media and check the length before publishing.',mediaCount:'Choose no more than 4 photos.',mediaMixed:'Choose up to 4 photos or one video, without mixing them.',mediaType:'Supported photos: JPEG, PNG, WebP, GIF. Videos: MP4, WebM.',mediaSize:'Photos must be up to 10 MB and videos up to 100 MB.',mediaUnavailable:'This media is not available yet. Check the file or upload it again.',rate:'Too many requests. Wait a moment before trying again.',permission:'This account cannot perform that action.',changed:'The signed-in account changed. Check your account and try again.',end:'All available posts are loaded.',draftLeave:'Unsent text or attachments remain. Leave this page?',report:'Report a problem',postEdited:'Post updated',profileOnly:'Create a profile before posting, following people or sending messages.',profileRequired:'Create a public profile first.',join:'Set up profile',dateUnknown:'Unknown time',emptyPage:'There are no visible posts on this page.',allPeople:'All accounts',fileFallback:'Uploaded attachment',localDraft:'A draft is kept in this tab for your account.',loadingFailed:'The data could not be loaded.',messageLong:'The message is too long.',noUser:'Account',uploadCancelled:'Upload cancelled',fileChanged:'This file differs from the original. Choose the original file to resume, or remove this attachment and add it again.'}
};
export function socialErrorText(failure,language='th',online=true){
  const t=TEXT[language==='en'?'en':'th'],code=failure?.code||failure?.message||'';
  if(!online)return t.offline;
  const map={AUTH_REQUIRED:'auth',VERIFIED_ACCOUNT_REQUIRED:'auth',HANDLE_TAKEN:'taken',HANDLE_RESERVED:'taken',INVALID_HANDLE:'invalidHandle',INVALID_PROFILE:'invalidProfile',INVALID_POST:'invalidPost',INVALID_MESSAGE:'messageLong',PROFILE_REQUIRED:'profileRequired',PROFILE_NOT_FOUND:'profileMissing',MEDIA_COUNT:'mediaCount',MEDIA_MIXED:'mediaMixed',MEDIA_TYPE:'mediaType',MEDIA_SIZE:'mediaSize',INVALID_MEDIA:'mediaUnavailable',MEDIA_NOT_READY:'mediaUnavailable',CHUNK_CONFLICT:'mediaUnavailable',CONTACT_UNAVAILABLE:'contactUnavailable',ACCOUNT_CHANGED:'changed',TOO_MANY_REQUESTS:'rate',REQUEST_TIMEOUT:'timeout',POST_OWNER_REQUIRED:'permission',PENDING_REQUEST:'pendingOther',UPLOAD_CANCELLED:'uploadCancelled',UPLOAD_FILE_CHANGED:'fileChanged','storage/canceled':'uploadCancelled'};
  return t[map[code]]||(failure?.deliveryUnknown?t.uncertain:t.failed);
}
export function socialDate(value,language='th'){
  const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat(language==='en'?'en-GB':'th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(date):TEXT[language==='en'?'en':'th'].dateUnknown;
}
const AUTH='/firebase-auth.js?v=20260725-2';

export function initSocialPage({window:win=globalThis.window,document:doc=win?.document,loadAuth=()=>import(AUTH),request,uploadFile=uploadSocialFile,removeUpload=removeSocialUpload}={}){
  const root=doc?.getElementById('socialRoot'),page=doc?.body?.dataset.socialPage;
  if(!root||!['community','profile','messages'].includes(page)||root.dataset.socialInitialized)return null;
  root.dataset.socialInitialized='true';
  const locale=()=>win.TaithaiPreferences?.get?.().language==='en'||!win.TaithaiPreferences&&doc.documentElement.lang==='en'?'en':'th',t=()=>TEXT[locale()];
  const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
  const button=(label,action,{primary=false,danger=false,disabled=false,id,cls=''}={})=>{const node=el('button',label,`button ${primary?'button-primary':danger?'button-danger':'button-secondary'} ${cls}`.trim());node.type='button';node.disabled=disabled;if(id)node.id=id;node.addEventListener('click',action);return node;};
  const link=(label,href,primary=false)=>{const node=el('a',label,`button ${primary?'button-primary':'button-secondary'}`);node.href=href;return node;};
  const panel=(title,copy,cls='')=>{const node=el('section',undefined,'panel '+cls);if(title)node.append(el('h2',title));if(copy)node.append(el('p',copy,'muted'));return node;};
  const field=(label,input,hint)=>{const row=el('div',undefined,'field'),name=el('label',label);name.htmlFor=input.id;row.append(name,input);if(hint){const p=el('p',hint,'field-hint');p.id=input.id+'Hint';input.setAttribute('aria-describedby',p.id);row.append(p);}return row;};
  const avatar=(profile,size='')=>{const url=safeSocialMediaUrl(profile?.photoURL,{avatar:true});if(url){const image=el('img');image.src=url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.className='social-avatar '+size;image.addEventListener('error',()=>{const replacement=el('span',(profile?.displayName||profile?.handle||'t.').slice(0,1),'social-avatar '+size);replacement.setAttribute('aria-hidden','true');image.replaceWith?.(replacement);},{once:true});return image;}const fallback=el('span',(profile?.displayName||profile?.handle||'t.').slice(0,1),'social-avatar '+size);fallback.setAttribute('aria-hidden','true');return fallback;};
  const identity=(profile,{large=false,href=true}={})=>{const row=el('div',undefined,'social-identity'),text=el('div');row.append(avatar(profile,large?'large':''));const name=el(href?'a':'strong',profile?.displayName||profile?.handle||t().noUser);if(href)name.href='/profile/?uid='+encodeURIComponent(profile?.uid||'');text.append(name);if(profile?.handle)text.append(el('span','@'+profile.handle,'social-handle'));row.append(text);return row;};
  const empty=(title,copy)=>{const card=el('section',undefined,'social-empty');card.append(el('h2',title));if(copy)card.append(el('p',copy));return card;};
  const currentUid=()=>verifiedSocialUser(user)?user.uid:null;
  let auth=null,user=null,me=null,epoch=0,disposed=false,unsubscribe=()=>{},authGeneration=0;
  let loading=true,loadError=null,notice='',failure=null,busy=false,pollTimer=null,authTimer=null,composing=false,renderQueued=false;
  let profile=null,viewer={},posts=[],postCursor=null,postLoading=false,postSequence=0,profileNotFound=false,editingProfile=false,profileForm=null,profileDirty=false,editingPost=null;
  let threads=[],threadCursor=null,threadLoading=false,messages=[],messageCursor=null,messageLoading=false,messageSequence=0,peer=null,canMessage=false,conversationBlocked=false,blocks=[];
  let postDraft='',postId=null,postMayExist=false,uploads=[],postOutbox=null,genericOutbox=null,messageOutbox=null,selectedPeer='',messageDraft='',copyValue='',conversationBlocking=false,loadedOlderMessages=false;
  let followersDialog=null,followersItems=[],followersCursor=null,followersKind=null,followersLoading=false;
  const api=createSocialApi({getUser:()=>user,window:win,request});
  const videoFallbacks=new Map();
  const scopeValid=(version,uid=currentUid())=>!disposed&&version===epoch&&uid===currentUid();
  const storage=()=>{try{return win.sessionStorage;}catch{return null;}};
  const draftKey=kind=>`taithai.social.draft.v1:${currentUid()}:${kind}`;
  function saveDraft(kind,value){try{storage()?.setItem(draftKey(kind),JSON.stringify(value));}catch{}}
  function readDraft(kind){try{return JSON.parse(storage()?.getItem(draftKey(kind))||'null');}catch{return null;}}
  function clearOwnStorage(uid){try{const store=storage(),keys=[];for(let i=0;i<(store?.length||0);i++){const key=store.key(i);if(key?.startsWith(`taithai.social.outbox.v1:${uid}:`)||key?.startsWith(`taithai.social.draft.v1:${uid}:`))keys.push(key);}for(const key of keys)store.removeItem(key);}catch{}}
  function params(){return new URL(win.location.href).searchParams;}
  const wantedProfile=()=>params().get('uid')||(!params().get('handle')?currentUid():null);
  const ownProfile=()=>Boolean(profile&&profile.uid===currentUid());
  const profileReady=()=>Boolean(verifiedSocialUser(user)&&me?.profile);
  const postPending=()=>postOutbox?.peek();
  const operationPending=()=>genericOutbox?.peek();
  const messagePending=()=>messageOutbox?.peek();
  const locked=()=>busy||Boolean(operationPending());
  const uploading=()=>uploads.some(item=>item.status==='uploading');
  function persistPostDraft(){saveDraft('post',{text:postDraft,postId,postMayExist,attachments:uploads.filter(item=>item.status==='uploaded').map(item=>item.attachment),pendingUploads:uploads.filter(item=>item.status!=='uploaded'&&item.path).map(item=>({id:item.id,path:item.path,type:item.type,name:item.name,size:item.file?.size||item.size,progress:item.progress||0}))});}
  function revokePreviews(){for(const item of uploads){item.task?.cancel();if(item.preview)win.URL?.revokeObjectURL?.(item.preview);}uploads=[];}
  function clearVideoFallbacks(){for(const value of videoFallbacks.values()){value.task?.cancel();if(value.url)win.URL?.revokeObjectURL?.(value.url);}videoFallbacks.clear();}
  function resetPrivate({forget=false}={}){
    const previous=currentUid();api.abort();win.clearTimeout(pollTimer);epoch++;postSequence++;messageSequence++;revokePreviews();clearVideoFallbacks();followersDialog?.close?.();followersDialog?.remove?.();followersDialog=null;
    if(forget&&previous)clearOwnStorage(previous);
    me=null;user=null;profile=null;viewer={};posts=[];postCursor=null;profileNotFound=false;threads=[];threadCursor=null;messages=[];messageCursor=null;peer=null;blocks=[];canMessage=false;conversationBlocked=conversationBlocking=false;loadedOlderMessages=false;
    postDraft='';postId=null;postMayExist=false;postOutbox=genericOutbox=messageOutbox=null;messageDraft='';selectedPeer='';copyValue='';profileForm=null;profileDirty=false;editingProfile=false;editingPost=null;busy=false;failure=null;loadError=null;notice='';loading=true;postLoading=messageLoading=threadLoading=followersLoading=false;composing=renderQueued=false;
    root.replaceChildren(panel('',t().loading));
  }
  function restoreDrafts(){
    if(!currentUid())return;
    postOutbox=createSocialOutbox({storage:storage(),uid:currentUid(),scope:'post',uuid:()=>win.crypto.randomUUID()});
    genericOutbox=createSocialOutbox({storage:storage(),uid:currentUid(),scope:'operation',uuid:()=>win.crypto.randomUUID()});
    const pending=postOutbox.peek(),draft=readDraft('post'),operation=genericOutbox.peek();
    const data=pending?.action==='post-create'?{text:pending.data.text,postId:pending.requestId,attachments:pending.data.attachments}:draft;
    if(data&&typeof data.text==='string'&&data.text.length<=SOCIAL_LIMITS.postText){postDraft=data.text;postId=/^[0-9a-f-]{36}$/i.test(data.postId||'')?data.postId:null;postMayExist=Boolean(pending||data.postMayExist);uploads=(Array.isArray(data.attachments)?data.attachments:[]).slice(0,4).filter(item=>typeof item?.path==='string'&&item.path.startsWith(`social-media/${currentUid()}/${postId}/`)).map(item=>({id:item.path,status:'uploaded',attachment:item,name:item.name,type:item.type,progress:100}));
      if(!pending)for(const item of (Array.isArray(data.pendingUploads)?data.pendingUploads:[]).slice(0,4-uploads.length)){try{validateSocialFiles([item]);if(typeof item.path!=='string'||!item.path.startsWith(`social-media/${currentUid()}/${postId}/`))continue;uploads.push({...item,status:'error',file:null,preview:null});}catch{}}
    }
    if(operation?.action==='profile-update'){profileForm={handle:String(operation.data.handle||''),displayName:String(operation.data.displayName||''),bio:String(operation.data.bio||''),photo:Boolean(operation.data.photoURL)};profileDirty=true;editingProfile=true;}
    if(operation?.action==='post-update')editingPost={id:operation.data.id,text:String(operation.data.text||'')};
  }
  function snapshotFocus(){const active=doc.activeElement;return active?.id&&root.contains?.(active)?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;}
  function render(){
    if(disposed)return;if(composing){renderQueued=true;return;}renderQueued=false;
    const focus=snapshotFocus(),scroll=doc.getElementById('socialChatScroll'),scrollState=scroll?{top:scroll.scrollTop,height:scroll.scrollHeight,near:scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100}:null;
    root.replaceChildren();
    if(loading){root.append(panel('',t().loading));return;}
    renderSession(root);renderNotices(root);
    if(loadError){const card=empty(t().loadingFailed,socialErrorText(loadError,locale(),win.navigator?.onLine!==false));card.append(button(t().retry,()=>auth?refresh():start()));root.append(card);return;}
    if(page==='messages'){renderMessagesPage(root);}else if(page==='profile'){renderProfilePage(root);}else{renderCommunity(root);}
    if(focus){const node=doc.getElementById(focus.id);if(node&&!node.disabled){node.focus?.({preventScroll:true});try{if(typeof focus.start==='number')node.setSelectionRange?.(focus.start,focus.end);}catch{}}}
    const newScroll=doc.getElementById('socialChatScroll');if(newScroll&&scrollState)newScroll.scrollTop=scrollState.near?newScroll.scrollHeight:scrollState.top;else if(newScroll&&messages.length)newScroll.scrollTop=newScroll.scrollHeight;
  }
  function renderSession(container){
    if(!verifiedSocialUser(user))return;
    const row=el('div',undefined,'social-session'),details=el('div');details.append(el('p',me?.profile?'@'+me.profile.handle:(user.displayName||t().noUser)));
    if(typeof me?.media?.ready==='boolean'){
      const ready=me.media.ready,note=el('p',ready?(locale()==='th'?'พร้อมแนบรูปและวิดีโอ':'Photo and video uploads are ready'):(locale()==='th'?'ยังแนบไฟล์ไม่ได้ ลองรีเฟรชอีกครั้ง':'Attachments are unavailable. Try refreshing.'),'small');note.setAttribute('role','status');details.append(note);
      if(!ready)details.append(button(t().refresh,()=>refresh(),{disabled:busy}));
    }
    row.append(details);
    const actions=el('div',undefined,'button-row');if(me?.profile)actions.append(link(t().myProfile,'/profile/?uid='+encodeURIComponent(user.uid)));actions.append(button(t().signOut,async()=>{if(dirty()&&!win.confirm(t().draftLeave))return;try{await auth?.logout();}catch(error){failure=error;render();}},{disabled:busy}));row.append(actions);container.append(row);
  }
  function pendingPanel(box){
    const job=box?.peek();if(!job)return null;
    const card=el('section',undefined,'notice social-notice');card.setAttribute('role','status');card.append(el('p',t().uncertain));if(job.data?.text)card.append(el('p',job.data.text,'social-post-text'));
    const controls=el('div',undefined,'button-row');controls.append(button(busy?t().saving:t().retryOriginal,()=>execute(box),{primary:true,disabled:busy}),button(t().clearPending,()=>{if(busy||!win.confirm(t().clearPendingConfirm))return;box.clear();if(box===postOutbox){revokePreviews();postDraft='';postId=null;postMayExist=false;persistPostDraft();}if(box===messageOutbox){messageDraft='';saveDraft('message:'+selectedPeer,{text:''});}failure=null;render();},{disabled:busy}));card.append(controls);return card;
  }
  function renderNotices(container){
    if(win.navigator?.onLine===false){const note=el('p',t().offline,'notice social-offline');note.setAttribute('role','status');container.append(note);}
    if(notice||failure){const note=el('div',undefined,'notice social-notice'+(failure?' notice-error':''));note.setAttribute('role',failure?'alert':'status');note.append(el('p',failure?socialErrorText(failure,locale(),win.navigator?.onLine!==false):t()[notice]||notice));if(copyValue){const input=el('input');input.id='socialCopyLink';input.readOnly=true;input.value=copyValue;input.className='social-copy-field';input.setAttribute('aria-label',t().copyLink);input.addEventListener('focus',()=>input.select?.());note.append(input);}container.append(note);}
    const generic=pendingPanel(genericOutbox);if(generic)container.append(generic);
  }
  function signInCard(){const card=empty(t().guestTitle,t().guestText);card.append(button(t().signIn,async()=>{try{await auth?.loginWithGoogle();}catch(error){failure=error;render();}},{primary:true}));return card;}
  function setupCallout(){const card=panel(t().setupTitle,t().profileOnly);const actions=el('div',undefined,'button-row');actions.append(link(t().join,'/profile/',true));card.append(actions);return card;}
  function profileEditor(){
    if(!profileForm){const initial=me?.profile||me?.defaults||{};profileForm={handle:initial.handle||'',displayName:initial.displayName||user?.displayName||'',bio:initial.bio||'',photo:Boolean(initial.photoURL)};}
    const card=panel(me?.profile?t().editProfile:t().setupTitle,t().setupText),form=el('form');form.id='socialProfileForm';form.className='social-profile-form';
    const handle=el('input');handle.id='socialHandle';handle.value=profileForm.handle;handle.type='text';handle.required=true;handle.minLength=3;handle.maxLength=24;handle.pattern='[a-z0-9_]{3,24}';handle.autocomplete='username';handle.spellcheck=false;handle.disabled=locked();handle.addEventListener('input',()=>{profileForm.handle=handle.value.toLowerCase();profileDirty=true;});
    const name=el('input');name.id='socialDisplayName';name.value=profileForm.displayName;name.required=true;name.maxLength=80;name.autocomplete='nickname';name.disabled=locked();name.addEventListener('input',()=>{profileForm.displayName=name.value;profileDirty=true;});
    const bio=el('textarea');bio.id='socialBio';bio.value=profileForm.bio;bio.maxLength=300;bio.disabled=locked();bio.addEventListener('input',()=>{profileForm.bio=bio.value;profileDirty=true;});
    form.append(field(t().handle,handle,t().handleHint),field(t().displayName,name),field(t().bio,bio));
    const photo=el('input');photo.type='checkbox';photo.id='socialGooglePhoto';photo.checked=profileForm.photo;photo.disabled=locked();photo.addEventListener('change',()=>{profileForm.photo=photo.checked;profileDirty=true;});const photoRow=el('label',undefined,'social-checkbox');photoRow.append(photo,el('span',t().googlePhoto));form.append(photoRow,el('p',t().publicProfileNote,'social-public-note'));
    const actions=el('div',undefined,'button-row'),save=el('button',busy?t().saving:t().saveProfile,'button button-primary');save.type='submit';save.disabled=locked();actions.append(save);if(me?.profile)actions.append(button(t().cancel,()=>{editingProfile=false;profileForm=null;profileDirty=false;failure=null;render();},{disabled:locked()}));form.append(actions);
    form.addEventListener('submit',event=>{event.preventDefault();const data={handle:profileForm.handle.trim().toLowerCase(),displayName:profileForm.displayName.trim(),bio:profileForm.bio.trim(),photoURL:profileForm.photo?(me?.defaults?.photoURL||''):''};if(!/^[a-z0-9_]{3,24}$/.test(data.handle)){failure={code:'INVALID_HANDLE'};render();return;}if(!data.displayName||data.displayName.length>80||data.bio.length>300){failure={code:'INVALID_PROFILE'};render();return;}void mutate('profile-update',data);});card.append(form);return card;
  }
  function renderCommunity(container){
    const layout=el('div',undefined,'social-layout'),stream=el('div',undefined,'social-stream'),aside=el('aside',undefined,'social-aside');
    if(!verifiedSocialUser(user))stream.append(signInCard());else if(!me?.profile)stream.append(setupCallout());else stream.append(composer());
    stream.append(feedHead());renderPosts(stream);aside.append(communityAside());layout.append(stream,aside);container.append(layout);
  }
  function communityAside(){const card=panel(t().community,t().findPeople);const links=el('div',undefined,'button-row');links.append(link(t().myProfile,'/profile/'),link(t().messages,'/messages/'));card.append(links,el('p',t().publicPostNote,'social-public-note'));return card;}
  function renderProfilePage(container){
    if(!wantedProfile()&&!params().get('handle')){container.append(verifiedSocialUser(user)?profileEditor():signInCard());return;}
    if(profileNotFound){container.append(verifiedSocialUser(user)&&wantedProfile()===currentUid()?profileEditor():empty(t().profileMissing,t().profileMissingText));return;}
    if(!profile){container.append(empty(t().profileMissing,t().profileMissingText));return;}
    const layout=el('div',undefined,'social-layout'),stream=el('div',undefined,'social-stream'),aside=el('aside',undefined,'social-aside');
    const header=panel('','', 'social-profile-header'),top=el('div',undefined,'social-profile-top');top.append(identity(profile,{large:true,href:false}));const actions=el('div',undefined,'button-row');
    if(ownProfile())actions.append(button(t().editProfile,()=>{editingProfile=!editingProfile;profileForm=null;render();},{disabled:locked()}));else if(profileReady()){
      actions.append(button(viewer.following?t().unfollow:t().follow,()=>mutate('follow-set',{uid:profile.uid,following:!viewer.following}),{primary:!viewer.following,disabled:locked()||viewer.blocked===true}));
      if(viewer.canMessage)actions.append(link(t().sendMessage,'/messages/?uid='+encodeURIComponent(profile.uid)));
    }else if(verifiedSocialUser(user))actions.append(link(t().join,'/profile/',true));else actions.append(button(t().signIn,async()=>{try{await auth?.loginWithGoogle();}catch(error){failure=error;render();}},{primary:true}));
    actions.append(button(t().share,()=>shareProfile(profile),{disabled:busy}));top.append(actions);header.append(top);if(profile.bio)header.append(el('p',profile.bio,'social-bio'));
    const stats=el('div',undefined,'social-profile-stats');for(const [kind,key,value] of [['followers','followers',profile.followersCount],['following','followingCount',profile.followingCount],['posts','posts',profile.postsCount]]){const stat=el('button',undefined,'social-stat');stat.type='button';stat.append(el('strong',new Intl.NumberFormat(locale()==='th'?'th-TH':'en-GB').format(Number.isSafeInteger(value)?value:0)),el('span',t()[key]));if(kind==='posts')stat.disabled=true;else stat.addEventListener('click',()=>showFollows(kind));stats.append(stat);}header.append(stats);stream.append(header);
    if(viewer.blocked)stream.append(el('p',t().blockedText,'notice'));
    if(editingProfile&&ownProfile())stream.append(profileEditor());
    if(ownProfile()&&profileReady()&&!editingProfile)stream.append(composer());
    stream.append(feedHead());renderPosts(stream);
    const about=panel(t().community,t().publicProfileNote);about.append(el('div',undefined,'button-row'));about.lastElementChild?.append(link(t().community,'/community/'));
    if(profileReady()&&!ownProfile()){const controls=el('div',undefined,'button-row');controls.append(button(viewer.blocked?t().unblock:t().block,()=>confirmBlock(profile.uid,!viewer.blocked),{danger:!viewer.blocked,disabled:locked()}),link(t().report,'https://taithai.app/support/?app=community'));about.append(controls);}aside.append(about);layout.append(stream,aside);container.append(layout);
  }
  function feedHead(){const head=el('div',undefined,'social-section-head');head.append(el('h2',t().latest),button(t().refresh,()=>loadPosts(false),{disabled:postLoading}));return head;}
  function renderPosts(container){
    if(postLoading&&!posts.length)container.append(el('p',t().loading,'social-loading'));
    else if(!posts.length)container.append(empty(t().emptyPosts,t().emptyPostsText));
    const retained=new Set(posts.flatMap(post=>(post.attachments||[]).filter(item=>String(item.type).startsWith('video/')).map(item=>item.url)));for(const [key,value]of videoFallbacks){if(!retained.has(key)){value.task?.cancel();if(value.url)win.URL?.revokeObjectURL?.(value.url);videoFallbacks.delete(key);}}
    for(const post of posts)container.append(postCard(post));
    if(postCursor)container.append(button(postLoading?t().loading:t().more,()=>loadPosts(true),{disabled:postLoading}));
    else if(posts.length)container.append(el('p',t().end,'social-feed-end'));
  }
  function postCard(post){
    const card=el('article',undefined,'panel social-post');card.id='post-'+post.id;const header=el('div',undefined,'social-post-head');header.append(identity(post.author||{uid:post.uid}));const time=el('time',socialDate(post.createdAt,locale()),'social-time');if(typeof post.createdAt==='string')time.dateTime=post.createdAt;header.append(time);card.append(header);
    if(editingPost?.id===post.id){const form=el('form');form.className='social-post-editor';const area=el('textarea');area.id='socialPostEdit';area.value=editingPost.text;area.maxLength=me?.limits?.postText||3000;area.disabled=locked();area.setAttribute('aria-label',t().editPost);area.addEventListener('input',()=>{editingPost.text=area.value;});const controls=el('div',undefined,'button-row');const save=el('button',busy?t().saving:t().save,'button button-primary');save.type='submit';save.disabled=locked();controls.append(save,button(t().cancel,()=>{editingPost=null;render();},{disabled:locked()}));form.append(area,controls);form.addEventListener('submit',event=>{event.preventDefault();void mutate('post-update',{id:post.id,text:editingPost.text});});card.append(form);}else if(post.text)card.append(el('p',post.text,'social-post-text'));
    const attachments=Array.isArray(post.attachments)?post.attachments:[];if(attachments.length){const media=el('div',undefined,'social-post-media'+(attachments.length===1?' single':''));for(const asset of attachments){const url=safeSocialMediaUrl(asset.url);if(!url)continue;if(String(asset.type).startsWith('video/'))media.append(videoPlayer(asset,url));else{const a=el('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';const image=el('img');image.src=url;image.alt=asset.name||'';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';a.append(image);media.append(a);}}if(media.children.length)card.append(media);}
    const footer=el('div',undefined,'social-post-meta'),controls=el('div',undefined,'button-row');if(post.canEdit&&post.uid===currentUid()){controls.append(button(t().edit,()=>{editingPost={id:post.id,text:post.text||''};failure=null;render();doc.getElementById('socialPostEdit')?.focus();},{disabled:locked()}),button(t().delete,()=>{if(!win.confirm(t().deleteConfirm))return;void mutate('post-delete',{id:post.id});},{danger:true,disabled:locked()}));}else controls.append(link(t().report,'https://taithai.app/support/?app=community'));footer.append(controls);if(post.updatedAt&&post.updatedAt!==post.createdAt)footer.append(el('span',t().postEdited,'small'));card.append(footer);return card;
  }
  function videoPlayer(asset,url){
    const wrapper=el('div',undefined,'social-video'),video=el('video'),state=videoFallbacks.get(url),version=epoch;
    video.src=state?.url||url;video.controls=true;video.preload='metadata';video.playsInline=true;video.setAttribute('aria-label',asset.name||t().attach);
    const controls=el('div',undefined,'social-video-controls');controls.hidden=!state;
    video.addEventListener('error',()=>{
      if(disposed||version!==epoch)return;
      controls.hidden=false;
      if(state?.url&&!state.codecError){state.codecError=true;render();}
      else if(!videoFallbacks.has(url))videoFallbacks.set(url,{status:'native-error',progress:0});
    },{once:true});
    if(state?.status==='loading'){
      const progress=el('progress');progress.max=100;progress.value=state.progress||0;progress.id='socialVideoProgress-'+String(asset.path||url).split('/').at(-1);progress.setAttribute('aria-label',locale()==='th'?'กำลังโหลดวิดีโอ':'Loading video');controls.append(progress,el('span',(state.progress||0)+'%','small'),button(t().cancel,()=>{state.cancelled=true;state.task?.cancel();state.status='native-error';render();}));
    }else{
      controls.append(el('p',state?.error?socialErrorText(state.error,locale(),win.navigator?.onLine!==false):(locale()==='th'?'หากเล่นวิดีโอยังไม่ได้ ให้โหลดเพื่อเล่นในหน้านี้':'If the video does not play, load it to play on this page.'),'small'));
      if(!state?.url)controls.append(button(locale()==='th'?'โหลดวิดีโอเพื่อเล่น':'Load video to play',()=>startVideoFallback(asset,url)));
      else{const download=link(locale()==='th'?'ดาวน์โหลดวิดีโอ':'Download video',state.url);download.download=asset.name||'video';controls.append(download);}
    }
    wrapper.append(video,controls);return wrapper;
  }
  async function startVideoFallback(asset,url){
    const previous=videoFallbacks.get(url);if(previous?.status==='loading')return;
    const version=epoch,state={status:'loading',progress:0,cancelled:false};videoFallbacks.set(url,state);
    state.task=fetchSocialVideo({url,size:asset.size,type:asset.type,request,onProgress:progress=>{if(disposed||version!==epoch||videoFallbacks.get(url)!==state)return;state.progress=progress;const bar=doc.getElementById('socialVideoProgress-'+String(asset.path||url).split('/').at(-1));if(bar){bar.value=progress;if(bar.nextElementSibling)bar.nextElementSibling.textContent=progress+'%';}}});render();
    try{const blob=await state.task.promise;if(disposed||version!==epoch||state.cancelled||videoFallbacks.get(url)!==state)return;state.url=win.URL.createObjectURL(blob);state.status='ready';}
    catch(error){if(disposed||version!==epoch||state.cancelled||videoFallbacks.get(url)!==state)return;state.status='error';state.error=error;}
    finally{if(!disposed&&version===epoch&&videoFallbacks.get(url)===state){state.task=null;render();}}
  }
  function composer(){
    const card=panel('','', 'social-composer');card.append(identity(me.profile));const label=el('label',t().compose);label.htmlFor='socialPostText';const area=el('textarea');area.id='socialPostText';area.value=postDraft;area.maxLength=me?.limits?.postText||3000;area.placeholder=t().composePlaceholder;area.disabled=busy||Boolean(postPending())||Boolean(operationPending());area.addEventListener('input',()=>{postDraft=area.value;persistPostDraft();const count=doc.getElementById('socialPostCounter');if(count)count.textContent=`${postDraft.length} / ${me?.limits?.postText||3000}`;const clear=doc.getElementById('socialClearDraft');if(clear)clear.disabled=busy||Boolean(postPending())||Boolean(operationPending())||(!postDraft&&!uploads.length);});compositionEvents(area);card.append(label,area);
    if(uploads.length){const list=el('div',undefined,'social-uploads');for(const item of uploads){const row=el('div',undefined,'social-upload');if(item.preview){const media=el(item.type.startsWith('video/')?'video':'img');media.src=item.preview;if(media.tagName.toLowerCase()==='video'){media.controls=true;media.muted=true;media.preload='metadata';}else media.alt='';row.append(media);}const info=el('div',undefined,'social-upload-info');info.append(el('p',item.name||item.attachment?.name||t().fileFallback));if(item.status==='uploading'){const progress=el('progress');progress.max=100;progress.value=item.progress||0;progress.setAttribute('aria-label',t().uploading);progress.id='socialUpload-'+item.id;info.append(progress,el('span',t().uploading+' '+(item.progress||0)+'%','social-upload-status'));}else info.append(el('span',item.status==='uploaded'?t().uploaded:t().uploadFailed,'social-upload-status'));if(item.status==='error'){
        if(item.file)info.append(button(t().uploadRetry,()=>startUpload(item),{disabled:locked()||Boolean(postPending())}));
        else{const choose=el('input');choose.type='file';choose.accept=item.type;choose.hidden=true;choose.id='socialResume-'+item.id;choose.addEventListener('change',()=>{const file=choose.files?.[0];if(!file)return;if(file.type!==item.type||file.size!==item.size||file.name.normalize('NFC')!==String(item.name).normalize('NFC')){failure={code:'INVALID_MEDIA'};render();return;}item.file=file;item.preview=win.URL?.createObjectURL?.(file);void startUpload(item);});info.append(choose,button(locale()==='th'?'เลือกไฟล์เดิมเพื่ออัปโหลดต่อ':'Choose original file to resume',()=>choose.click(),{disabled:locked()||Boolean(postPending())}));}
      }info.append(button(item.status==='uploading'?t().cancelUpload:t().remove,()=>removeFile(item),{disabled:busy||Boolean(postPending())}));row.append(info);list.append(row);}card.append(list);}
    const composeDisabled=busy||Boolean(postPending())||Boolean(operationPending());
    const input=el('input');input.type='file';input.id='socialMediaInput';input.accept='image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';input.multiple=true;input.hidden=true;input.disabled=composeDisabled||me?.media?.ready===false;input.addEventListener('change',()=>{void addFiles(input.files);input.value='';});card.append(input);
    const tools=el('div',undefined,'social-compose-tools'),controls=el('div',undefined,'button-row');controls.append(button(t().attach,()=>input.click(),{disabled:input.disabled}),button(t().discard,clearComposer,{id:'socialClearDraft',disabled:composeDisabled||(!postDraft&&!uploads.length)}));const publish=button(busy?t().publishing:t().publish,publishPost,{primary:true,disabled:locked()||Boolean(postPending())||uploading()});tools.append(controls,publish);card.append(tools);const count=el('p',`${postDraft.length} / ${me?.limits?.postText||3000}`,'social-counter');count.id='socialPostCounter';card.append(count,el('p',t().mediaHint,'social-file-note'),el('p',t().publicPostNote,'social-public-note'));
    const pending=pendingPanel(postOutbox);if(pending)card.append(pending);return card;
  }
  function compositionEvents(node){node.addEventListener('compositionstart',()=>{composing=true;});node.addEventListener('compositionend',()=>{composing=false;if(renderQueued)render();});}
  async function addFiles(files){
    if(!profileReady()||locked()||postPending()||me?.media?.ready===false)return;
    let list;try{list=validateSocialFiles([...uploads.map(item=>({type:item.type,size:item.file?.size||item.attachment?.size})),...Array.from(files||[])]);}catch(error){failure=error;render();return;}
    void list;if(!postId)postId=win.crypto.randomUUID();failure=null;
    for(const file of Array.from(files||[])){const id=win.crypto.randomUUID(),item={id,file,name:file.name,type:file.type,path:socialAttachmentPath(user.uid,postId,id,file.type),preview:win.URL?.createObjectURL?.(file),status:'queued',progress:0};uploads.push(item);void startUpload(item);}
    persistPostDraft();render();
  }
  async function startUpload(item){
    if(!item.file||busy||postPending()||!currentUid()||!uploads.includes(item))return;
    const version=epoch,uid=currentUid();item.status='uploading';item.progress=0;failure=null;
    item.task=uploadFile({file:item.file,path:item.path,user,getUser:()=>user,onProgress:progress=>{if(!scopeValid(version,uid)||!uploads.includes(item))return;item.progress=progress;persistPostDraft();const bar=doc.getElementById('socialUpload-'+item.id);if(bar)bar.value=progress;const status=bar?.nextElementSibling;if(status)status.textContent=t().uploading+' '+progress+'%';}});persistPostDraft();render();
    try{const attachment=await item.task.promise;if(!scopeValid(version,uid)||!uploads.includes(item))return;item.status='uploaded';item.progress=100;item.attachment=attachment;persistPostDraft();}catch(error){if(!scopeValid(version,uid)||!uploads.includes(item))return;item.status='error';failure=error;}finally{if(scopeValid(version,uid)){item.task=null;render();}}
  }
  async function removeFile(item){
    if(busy||postPending())return;item.task?.cancel();uploads=uploads.filter(row=>row!==item);if(item.preview)win.URL?.revokeObjectURL?.(item.preview);persistPostDraft();render();
    if((item.attachment?.path||item.path)&&!postMayExist)try{await removeUpload(item.attachment?.path||item.path,{user,getUser:()=>user});}catch{/* A failed unused-upload cleanup never publishes it. */}
  }
  function clearComposer(){if(busy||postPending()||!win.confirm(t().discardConfirm))return;const previous=uploads.slice(),mayExist=postMayExist;revokePreviews();postDraft='';postId=null;postMayExist=false;persistPostDraft();failure=null;render();if(!mayExist)for(const item of previous)if(item.attachment?.path||item.path)void removeUpload(item.attachment?.path||item.path,{user,getUser:()=>user}).catch(()=>{});}
  async function publishPost(){
    if(!profileReady()||locked()||postPending())return;
    if(uploading()||uploads.some(item=>item.status!=='uploaded')){failure={code:'INVALID_MEDIA'};render();return;}
    const text=postDraft.trim(),attachments=uploads.map(item=>item.attachment);if((!text&&!attachments.length)||text.length>(me?.limits?.postText||3000)){failure={code:'INVALID_POST'};render();return;}
    if(!postId)postId=win.crypto.randomUUID();postOutbox.begin('post-create',{text,attachments},postId);postMayExist=true;persistPostDraft();await execute(postOutbox);
  }
  async function mutate(action,data){if(!currentUid()||locked())return;if(genericOutbox.peek()){failure={code:'PENDING_REQUEST'};render();return;}genericOutbox.begin(action,data);await execute(genericOutbox);}
  async function execute(box){
    const job=box?.peek();if(!job||busy||job.uid!==currentUid())return;
    const version=epoch,uid=currentUid();busy=true;failure=null;notice='';render();
    try{
      const result=await api.call(job.action,{method:'POST',data:{...job.data,requestId:job.requestId}});if(!scopeValid(version,uid))return;
      if(job.action==='post-delete'&&result.cleanupPending){posts=posts.filter(post=>post.id!==job.data.id);notice='cleanupPending';await refreshMe();}
      else{box.clear();await applyMutation(job,result,version,uid);}
    }catch(error){if(scopeValid(version,uid)){failure=error;if(!error.deliveryUnknown){box.clear();if(job.action==='post-create'&&error.code!=='REQUEST_ID_REUSED'){postMayExist=false;persistPostDraft();}}}}
    finally{if(scopeValid(version,uid)){busy=false;render();}}
  }
  async function applyMutation(job,result,version,uid){
    if(job.action==='profile-update'){
      me={...(me||{}),profile:result.profile};profileDirty=false;profileForm=null;editingProfile=false;notice='saved';
      if(page==='profile'){profile=result.profile;profileNotFound=false;viewer={isSelf:true,following:false,blocked:false,canMessage:false};await loadPosts(false);}return;
    }
    if(job.action==='post-create'){
      if(result.post&&(!profile||profile.uid===uid))posts=[result.post,...posts.filter(post=>post.id!==result.post.id)];
      revokePreviews();postDraft='';postId=null;postMayExist=false;persistPostDraft();notice='posted';await refreshMe();return;
    }
    if(job.action==='post-update'){posts=posts.map(post=>post.id===job.data.id?result.post:post);editingPost=null;notice='postEdited';return;}
    if(job.action==='post-delete'){posts=posts.filter(post=>post.id!==job.data.id);editingPost=null;notice='deleted';await refreshMe();return;}
    if(job.action==='follow-set'){if(profile?.uid===job.data.uid){profile=result.profile||profile;viewer.following=result.following===true;}await refreshMe();return;}
    if(job.action==='message-send'){
      saveDraft('message:'+job.data.uid,{text:''});
      if(selectedPeer===job.data.uid){messages=[...new Map([...messages,result.message].filter(Boolean).map(message=>[message.id,message])).values()];messageDraft='';if(messageOutbox?.peek()?.requestId===job.requestId)messageOutbox.clear();notice='messageSent';}
      await loadThreads(false,true);return;
    }
    if(job.action==='block-set'){
      if(profile?.uid===job.data.uid){viewer.blocked=result.blocked===true;viewer.following=false;viewer.canMessage=!result.blocked;}
      if(selectedPeer===job.data.uid){conversationBlocked=conversationBlocking=result.blocked===true;canMessage=!result.blocked;}
      const list=await api.call('blocks');if(!scopeValid(version,uid))return;blocks=Array.isArray(list.items)?list.items:[];await refreshMe();if(page==='profile')await loadProfile();if(page==='messages'&&selectedPeer)await loadMessages(false,true);notice=result.blocked?'blocked':'saved';
    }
  }
  async function refreshMe(){if(!currentUid())return;const version=epoch,uid=currentUid();try{const value=await api.call('me');if(scopeValid(version,uid)){me=value;if(profile?.uid===uid&&value.profile)profile=value.profile;}}catch(error){if(scopeValid(version,uid))failure=error;}}
  async function loadProfile(){
    const version=epoch,uid=currentUid(),target=wantedProfile(),handle=params().get('handle');if(!target&&!handle)return;
    try{const result=await api.call('profile',{params:target?{uid:target}:{handle}});if(!scopeValid(version,uid))return;profile=result.profile;viewer=result.viewer||{};profileNotFound=false;}
    catch(error){if(!scopeValid(version,uid))return;if(error.code==='PROFILE_NOT_FOUND'){profileNotFound=true;profile=null;}else throw error;}
  }
  async function loadPosts(more=false){
    if(postLoading||page==='messages'||page==='profile'&&!profile)return;
    const version=epoch,uid=currentUid(),sequence=++postSequence;postLoading=true;failure=null;render();
    try{const value=await api.call('posts',{params:{...(page==='profile'?{uid:profile.uid}:{}),limit:20,...(more&&postCursor?{cursor:postCursor}:{})}});if(!scopeValid(version,uid)||sequence!==postSequence)return;posts=[...new Map([...(more?posts:[]),...(Array.isArray(value.items)?value.items:[])].map(post=>[post.id,post])).values()];postCursor=value.nextCursor||null;}
    catch(error){if(scopeValid(version,uid)&&sequence===postSequence)failure=error;}
    finally{if(scopeValid(version,uid)&&sequence===postSequence){postLoading=false;render();}}
  }
  async function shareProfile(value){const url=publicProfileUrl(value);try{if(win.navigator?.share){await win.navigator.share({title:value.displayName||value.handle,url});return;}await win.navigator?.clipboard?.writeText(url);if(!win.navigator?.clipboard?.writeText)throw Error();notice='copied';copyValue='';}catch(error){if(error?.name==='AbortError')return;notice='manualCopy';copyValue=url;}failure=null;render();}
  function confirmBlock(uid,blocked){if(locked()||!win.confirm(blocked?t().blockConfirm:t().unblockConfirm))return;void mutate('block-set',{uid,blocked});}
  async function showFollows(kind,more=false){
    if(!profile||followersLoading)return;
    const version=epoch,uid=currentUid();followersKind=kind;followersLoading=true;if(!more)followersItems=[];
    if(!followersDialog){followersDialog=el('dialog',undefined,'dialog social-dialog');followersDialog.id='socialFollowersDialog';doc.body.append(followersDialog);followersDialog.addEventListener('close',()=>{followersDialog?.remove();followersDialog=null;followersItems=[];followersCursor=null;});}
    renderFollowers();if(!followersDialog.open)followersDialog.showModal?.();
    try{const value=await api.call('follows',{params:{uid:profile.uid,kind,limit:30,...(more&&followersCursor?{cursor:followersCursor}:{})}});if(!scopeValid(version,uid)||followersKind!==kind||!followersDialog)return;followersItems=[...new Map([...(more?followersItems:[]),...(value.items||[])].map(item=>[item.uid,item])).values()];followersCursor=value.nextCursor||null;}
    catch(error){if(scopeValid(version,uid)){failure=error;followersDialog?.close();render();}}
    finally{if(scopeValid(version,uid)){followersLoading=false;if(followersDialog)renderFollowers();}}
  }
  function renderFollowers(){if(!followersDialog)return;followersDialog.replaceChildren(el('h2',followersKind==='followers'?t().followers:t().followingCount));const list=el('div',undefined,'social-follow-list');for(const person of followersItems){const row=el('div',undefined,'social-person-row');row.append(identity(person));list.append(row);}if(!followersItems.length)list.append(el('p',followersLoading?t().loading:t().emptyPeople,'muted'));followersDialog.append(list);if(followersCursor)followersDialog.append(button(t().more,()=>showFollows(followersKind,true),{disabled:followersLoading}));followersDialog.append(button(t().close,()=>followersDialog?.close(),{cls:'social-dialog-close'}));}
  function renderMessagesPage(container){
    if(!verifiedSocialUser(user)){container.append(signInCard());return;}if(!me?.profile){container.append(setupCallout());return;}
    const layout=el('div',undefined,'social-chat-layout'+(selectedPeer?' has-peer':'')),list=panel(t().chatTitle,'','social-thread-panel'),head=el('div',undefined,'social-section-head');head.append(el('p',t().findPeople,'small'),button(t().refresh,()=>loadThreads(false),{disabled:threadLoading}));list.append(head);
    const rows=el('div',undefined,'social-thread-list');for(const thread of threads){if(!thread.peer?.uid)continue;const row=button('',()=>selectPeer(thread.peer.uid),{cls:'social-thread'});row.setAttribute('aria-current',String(thread.peer.uid===selectedPeer));row.replaceChildren(avatar(thread.peer));const text=el('span',undefined,'social-thread-main');text.append(el('span',thread.peer.displayName||thread.peer.handle,'social-thread-name'),el('span',thread.lastMessage?.text||'@'+thread.peer.handle,'social-thread-preview'));row.append(text);if(thread.unread){const dot=el('span',undefined,'social-unread');dot.setAttribute('aria-label','Unread');row.append(dot);}rows.append(row);}if(!threads.length)rows.append(el('p',threadLoading?t().loading:t().chatEmpty,'muted'));list.append(rows);if(threadCursor)list.append(button(threadLoading?t().loading:t().more,()=>loadThreads(true),{disabled:threadLoading}));
    if(blocks.length){const blocked=el('div',undefined,'social-block-list');blocked.append(el('h3',t().blockedAccounts));for(const account of blocks){const row=el('div',undefined,'social-person-row');row.append(identity(account),button(t().unblock,()=>confirmBlock(account.uid,false),{disabled:locked()}));blocked.append(row);}list.append(blocked);}
    const chat=panel('','','social-chat');if(!selectedPeer){const emptyCard=el('div',undefined,'social-chat-empty');emptyCard.append(el('h2',t().chooseConversation),el('p',t().chooseConversationText,'muted'),el('p',t().chatEmptyText,'small'));chat.append(emptyCard);}else renderConversation(chat);layout.append(list,chat);container.append(layout);
  }
  function renderConversation(chat){
    const head=el('div',undefined,'social-chat-head');head.append(button(t().back,()=>selectPeer(''),{cls:'social-mobile-back'}));if(peer)head.append(identity(peer));else head.append(el('h2',t().messages));const controls=el('div',undefined,'button-row');if(peer)controls.append(button(conversationBlocking?t().unblock:t().block,()=>confirmBlock(peer.uid,!conversationBlocking),{danger:!conversationBlocking,disabled:locked()}),link(t().report,'https://taithai.app/support/?app=messages'));head.append(controls);chat.append(head);
    const scroll=el('div',undefined,'social-chat-scroll');scroll.id='socialChatScroll';scroll.setAttribute('aria-label',t().messages);if(messageCursor)scroll.append(button(t().older,()=>loadMessages(true),{disabled:messageLoading}));const list=el('div',undefined,'social-messages');for(const message of messages){const item=el('article',undefined,'social-message'+(message.isMine?' mine':''));item.append(el('p',message.text||'','social-message-body'));const date=el('time',socialDate(message.createdAt,locale()));if(typeof message.createdAt==='string')date.dateTime=message.createdAt;item.append(date);list.append(item);}if(!messages.length)list.append(el('p',messageLoading?t().loading:t().emptyMessages,'muted'));scroll.append(list);chat.append(scroll);
    const form=el('form');form.id='socialMessageForm';form.className='social-chat-compose';if(conversationBlocked||!canMessage){form.append(el('p',conversationBlocking?t().blockedText:t().contactUnavailable,'notice'));}else{
      const label=el('label',t().messagePlaceholder);label.htmlFor='socialMessageText';const input=el('textarea');input.id='socialMessageText';input.value=messageDraft;input.maxLength=me?.limits?.messageText||4000;input.placeholder=t().messagePlaceholder;input.disabled=busy||Boolean(messagePending())||Boolean(operationPending());input.addEventListener('input',()=>{messageDraft=input.value;saveDraft('message:'+selectedPeer,{text:messageDraft});const counter=doc.getElementById('socialMessageCounter');if(counter)counter.textContent=`${messageDraft.length} / ${me?.limits?.messageText||4000}`;});compositionEvents(input);form.append(label,input);const actions=el('div',undefined,'button-row'),counter=el('span',`${messageDraft.length} / ${me?.limits?.messageText||4000}`,'social-counter');counter.id='socialMessageCounter';const submit=el('button',busy?t().sending:t().send,'button button-primary');submit.type='submit';submit.disabled=input.disabled;actions.append(counter,submit);form.append(actions);
    }const pending=pendingPanel(messageOutbox);if(pending)form.append(pending);form.append(el('p',t().privateNote,'small'));form.addEventListener('submit',event=>{event.preventDefault();void sendMessage();});chat.append(form);
  }
  function restoreMessageDraft(){if(!currentUid()||!selectedPeer){messageDraft='';messageOutbox=null;return;}messageOutbox=createSocialOutbox({storage:storage(),uid:currentUid(),scope:'message:'+selectedPeer,uuid:()=>win.crypto.randomUUID()});const job=messageOutbox.peek(),draft=readDraft('message:'+selectedPeer);messageDraft=job?.action==='message-send'&&job.data.uid===selectedPeer?job.data.text:typeof draft?.text==='string'?draft.text.slice(0,me?.limits?.messageText||4000):'';}
  async function selectPeer(uid){
    if(uid===currentUid())return;messageSequence++;selectedPeer=uid;messages=[];peer=null;messageCursor=null;loadedOlderMessages=false;messageLoading=false;canMessage=false;conversationBlocked=conversationBlocking=false;failure=null;notice='';restoreMessageDraft();const url=new URL(win.location.href);if(uid)url.searchParams.set('uid',uid);else url.searchParams.delete('uid');win.history?.replaceState?.(null,'',url.href);render();if(uid)await loadMessages(false);schedulePoll();
  }
  async function sendMessage(){
    if(!profileReady()||!selectedPeer||!canMessage||locked()||messagePending())return;const text=messageDraft.trim();if(!text||text.length>(me?.limits?.messageText||4000)){failure={code:'INVALID_POST'};render();return;}messageOutbox.begin('message-send',{uid:selectedPeer,text});await execute(messageOutbox);
  }
  async function loadThreads(more=false,silent=false){
    if(!profileReady()||threadLoading)return;const version=epoch,uid=currentUid();threadLoading=true;if(!silent)render();
    try{const value=await api.call('threads',{params:{limit:30,...(more&&threadCursor?{cursor:threadCursor}:{})}});if(!scopeValid(version,uid))return;const next=[...new Map([...(more?threads:[]),...(value.items||[])].map(thread=>[thread.id,thread])).values()];const changed=JSON.stringify(next)!==JSON.stringify(threads);threads=next;threadCursor=value.nextCursor||null;if(changed)render();}
    catch(error){if(scopeValid(version,uid)&&!silent){failure=error;render();}}
    finally{if(scopeValid(version,uid)){threadLoading=false;if(!silent)render();}}
  }
  async function loadMessages(older=false,silent=false){
    if(!profileReady()||!selectedPeer||messageLoading)return;const version=epoch,uid=currentUid(),target=selectedPeer,sequence=++messageSequence;messageLoading=true;if(!silent)render();
    try{const value=await api.call('messages',{params:{uid:target,limit:40,...(older&&messageCursor?{cursor:messageCursor}:{})}});if(!scopeValid(version,uid)||target!==selectedPeer||sequence!==messageSequence)return;
      const next=[...new Map([...(older?value.items||[]:messages),...(older?messages:value.items||[])].map(message=>[message.id,message])).values()].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id));
      const changed=JSON.stringify(next)!==JSON.stringify(messages)||canMessage!==(value.canMessage===true)||conversationBlocked!==(value.blocked===true)||conversationBlocking!==(value.blocking===true);messages=next;peer=value.peer;canMessage=value.canMessage===true;conversationBlocked=value.blocked===true;conversationBlocking=value.blocking===true;if(older){loadedOlderMessages=true;messageCursor=value.nextCursor||null;}else if(!loadedOlderMessages)messageCursor=value.nextCursor||null;if(changed||!silent)render();
    }catch(error){if(scopeValid(version,uid)&&target===selectedPeer&&sequence===messageSequence){if(error.status===401||error.status===403){messages=[];canMessage=false;}if(!silent||error.status===401||error.status===403){failure=error;render();}}}
    finally{if(scopeValid(version,uid)&&target===selectedPeer&&sequence===messageSequence){messageLoading=false;if(!silent)render();}}
  }
  function schedulePoll(){win.clearTimeout(pollTimer);if(disposed||page!=='messages'||!profileReady()||doc.visibilityState==='hidden')return;pollTimer=win.setTimeout(async()=>{await Promise.all([loadThreads(false,true),selectedPeer?loadMessages(false,true):Promise.resolve()]);schedulePoll();},15000);}
  async function refresh(){
    const version=epoch,uid=currentUid();loading=true;loadError=null;failure=null;render();
    try{
      if(uid){const value=await api.call('me');if(!scopeValid(version,uid))return;me=value;}
      if(page==='profile')await loadProfile();
      if(!scopeValid(version,uid))return;loading=false;render();
      if(page==='messages'&&profileReady()){
        selectedPeer=params().get('uid')||'';if(selectedPeer===uid)selectedPeer='';restoreMessageDraft();
        const blockResult=await api.call('blocks');if(!scopeValid(version,uid))return;blocks=blockResult.items||[];
        await Promise.all([loadThreads(false),selectedPeer?loadMessages(false):Promise.resolve()]);schedulePoll();
      }else if(page!=='messages')await loadPosts(false);
    }catch(error){if(scopeValid(version,uid)){loading=false;loadError=error;render();}}
  }
  async function accountChanged(value){
    const previous=currentUid(),next=verifiedSocialUser(value)?value.uid:null;resetPrivate({forget:Boolean(previous&&previous!==next)});user=value;restoreDrafts();await refresh();
  }
  function dirty(){const composeHere=page==='community'||page==='profile'&&ownProfile();return Boolean(profileDirty||editingPost||composeHere&&(postDraft.trim()||uploads.length||postPending())||page==='messages'&&(messageDraft.trim()||messagePending())||operationPending()||busy);}
  const beforeUnload=event=>{if(!dirty())return;event.preventDefault();event.returnValue='';};
  const preferences=()=>{render();if(followersDialog)renderFollowers();};
  const wake=()=>{if(doc.visibilityState!=='hidden'&&page==='messages'&&profileReady()){void Promise.all([loadThreads(false,true),selectedPeer?loadMessages(false,true):Promise.resolve()]).then(schedulePoll);}else schedulePoll();};
  const suspend=()=>{authGeneration++;win.clearTimeout(authTimer);unsubscribe();unsubscribe=()=>{};resetPrivate();};
  const restore=event=>{if(event.persisted&&!disposed)void start();};
  async function start(){const generation=++authGeneration;win.clearTimeout(authTimer);loading=true;loadError=null;render();try{const module=await Promise.race([Promise.resolve().then(loadAuth),new Promise((_,reject)=>{authTimer=win.setTimeout(()=>reject(Object.assign(Error('REQUEST_TIMEOUT'),{code:'REQUEST_TIMEOUT'})),15000);})]);if(disposed||generation!==authGeneration)return;auth=module;unsubscribe=module.subscribeAuth(value=>{if(!disposed&&generation===authGeneration)void accountChanged(value);});}catch(error){if(!disposed&&generation===authGeneration){loading=false;loadError=error;render();}}finally{if(generation===authGeneration)win.clearTimeout(authTimer);}}
  win.addEventListener('beforeunload',beforeUnload);win.addEventListener('taithai:preferences',preferences);win.addEventListener('pagehide',suspend);win.addEventListener('pageshow',restore);win.addEventListener('focus',wake);win.addEventListener('online',wake);doc.addEventListener('visibilitychange',wake);void start();
  return {refresh,destroy(){disposed=true;authGeneration++;unsubscribe();api.abort();win.clearTimeout(pollTimer);win.clearTimeout(authTimer);revokePreviews();clearVideoFallbacks();followersDialog?.close?.();followersDialog?.remove?.();win.removeEventListener('beforeunload',beforeUnload);win.removeEventListener('taithai:preferences',preferences);win.removeEventListener('pagehide',suspend);win.removeEventListener('pageshow',restore);win.removeEventListener('focus',wake);win.removeEventListener('online',wake);doc.removeEventListener('visibilitychange',wake);delete root.dataset.socialInitialized;}};
}
if(typeof window!=='undefined')initSocialPage();
