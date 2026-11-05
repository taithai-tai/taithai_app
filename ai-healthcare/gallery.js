import { auth, loginWithGoogle, subscribeAuth } from '../firebase-auth.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, orderBy,
  startAfter, limit, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const images = collection(getFirestore(getApp(), 'ai-studio-remixtaithaiapp-75e1f35e-2cc5-45a8-8a42-e4a81ea8cffb'), 'healthcarePublicImages');
const list = document.querySelector('#history-list');
const status = document.querySelector('#history-status');
const more = document.querySelector('#history-more');
const login = document.querySelector('#gallery-login');
const pageSize = 6;
let cursor;
let loading = false;

export function galleryUser() {
  return auth.currentUser;
}

export async function publishImage(image, imageId) {
  const user = galleryUser();
  if (!user) throw new Error('ลงชื่อเข้าใช้ Google ก่อนเผยแพร่รูป');
  await setDoc(doc(images, imageId), { owner: user.uid, image, createdAt: serverTimestamp() });
}

export function mountGallery(onReuse) {
  async function load(reset = false) {
    if (loading) return;
    loading = true;
    more.disabled = true;
    status.textContent = 'กำลังโหลดแกลเลอรี…';
    try {
      const constraints = [orderBy('createdAt', 'desc')];
      if (!reset && cursor) constraints.push(startAfter(cursor));
      const page = await getDocs(query(images, ...constraints, limit(pageSize)));
      if (reset) list.replaceChildren();
      for (const item of page.docs) {
        const { image, owner, createdAt } = item.data();
        if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,/9j/')) continue;
        const card = document.createElement('article');
        card.className = 'history-entry';
        const date = document.createElement('time');
        date.textContent = createdAt?.toDate().toLocaleString('th-TH') ?? 'เพิ่งเพิ่ม';
        const thumbnail = new Image();
        thumbnail.alt = 'รูปที่แชร์ในแกลเลอรี';
        thumbnail.loading = 'lazy';
        thumbnail.src = image;
        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const reuse = document.createElement('button');
        reuse.textContent = 'ใช้รูปนี้ถาม AI';
        reuse.onclick = () => onReuse(image);
        actions.append(reuse);
        if (owner === galleryUser()?.uid) {
          const remove = document.createElement('button');
          remove.textContent = 'ลบรูปของฉัน';
          remove.onclick = async () => {
            if (!window.confirm('ลบรูปนี้ออกจากแกลเลอรีสาธารณะ?')) return;
            try {
              await deleteDoc(item.ref);
              card.remove();
              if (!list.children.length) status.textContent = 'ยังไม่มีรูปในหน้านี้';
            } catch {
              status.textContent = 'ลบรูปไม่สำเร็จ กรุณาลองใหม่';
            }
          };
          actions.append(remove);
        }
        card.append(date, thumbnail, actions);
        list.append(card);
      }
      cursor = page.docs.at(-1) ?? cursor;
      more.hidden = page.size < pageSize;
      status.textContent = list.children.length ? '' : 'ยังไม่มีรูปที่แชร์';
    } catch {
      status.textContent = 'โหลดแกลเลอรีไม่ได้ กรุณาลองรีเฟรชหน้า';
    } finally {
      more.disabled = false;
      loading = false;
    }
  }

  login.onclick = async () => {
    try {
      await loginWithGoogle();
    } catch {
      status.textContent = 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';
    }
  };
  subscribeAuth((user) => {
    login.hidden = Boolean(user);
    void load(true);
  });
  more.onclick = () => load();
  return () => load(true);
}
