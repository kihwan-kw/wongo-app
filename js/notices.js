// js/notices.js — 공지사항 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, formatDate, toast, isAdminRole, canWrite, emptyState, confirmDialog } from "./utils.js";

let unsubscribe = null;

export function renderNotices(container, me) {
  container.innerHTML = '';

  // ── 작성 폼 (회장단·부장만 표시) ──────────────────────
  if (canWrite(me.role)) {
    let isOpen = false;
    const formBody = el('div', { class: 'hidden' },
      buildWriteForm(me),
    );
    const toggleBtn = el('button', {
      class: 'btn btn-primary btn-sm',
      onclick: () => {
        isOpen = !isOpen;
        isOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
        toggleBtn.textContent = isOpen ? '✕ 닫기' : '✏️ 공지 작성';
      },
    }, '✏️ 공지 작성');

    const writePanel = el('div', { class: 'write-panel' },
      el('div', { class: 'write-panel-header' },
        el('span', { class: 'write-panel-title' }, '공지사항'),
        toggleBtn,
      ),
      formBody,
    );
    container.appendChild(writePanel);
  } else {
    container.appendChild(el('div', { class: 'section-header' },
      el('h2', { class: 'section-title' }, '공지사항'),
    ));
  }

  // ── 목록 ───────────────────────────────────────────────
  const listEl = el('div', { class: 'notice-list' });
  container.appendChild(listEl);

  const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(q, snap => {
    listEl.innerHTML = '';
    if (snap.empty) {
      listEl.appendChild(emptyState('📢', '아직 공지사항이 없습니다.'));
      return;
    }
    snap.forEach(docSnap => {
      listEl.appendChild(buildNoticeItem(docSnap, me));
    });
  }, err => {
    console.error(err);
    listEl.appendChild(emptyState('⚠️', '공지사항을 불러오지 못했습니다.'));
  });
}

export function unmountNotices() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

// ── 공지 카드 ─────────────────────────────────────────
function buildNoticeItem(docSnap, me) {
  const d = docSnap.data();
  const canEdit = isAdminRole(me.role) || (me.role === 'department_head' && d.authorUid === me.uid);

  const body = el('div', { class: 'notice-body' }, d.content || '');
  const meta = el('div', { class: 'notice-meta' },
    el('span', {}, d.authorName || ''),
    el('span', {}, d.departmentName || ''),
    el('span', {}, formatDate(d.createdAt)),
  );

  const actions = canEdit ? el('div', { style: { display:'flex', gap:'6px', marginTop:'10px' } },
    el('button', { class: 'btn btn-ghost btn-xs', onclick: (e) => { e.stopPropagation(); startEdit(docSnap, me, item); } }, '✏️ 수정'),
    el('button', { class: 'btn btn-danger btn-xs',  onclick: (e) => { e.stopPropagation(); handleDelete(docSnap.id); } }, '🗑️ 삭제'),
  ) : null;

  const item = el('div', { class: 'notice-item', onclick: () => item.classList.toggle('open') },
    el('div', { class: 'notice-title' }, d.title || '(제목 없음)'),
    meta,
    body,
    actions,
  );
  return item;
}

// ── 작성 폼 ──────────────────────────────────────────
function buildWriteForm(me, existing = null, onDone = null) {
  const titleInput   = el('input',    { type: 'text',     placeholder: '공지 제목', value: existing?.title || '' });
  const contentInput = el('textarea', { placeholder: '공지 내용을 입력하세요...', rows: '4' }, existing?.content || '');
  const submitBtn    = el('button',   { class: 'btn btn-primary', type: 'button' }, existing ? '수정하기' : '등록하기');

  submitBtn.addEventListener('click', async () => {
    const title   = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) { toast('제목과 내용을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      if (existing) {
        await updateDoc(doc(db, 'notices', existing.id), { title, content, updatedAt: serverTimestamp() });
        toast('공지가 수정되었습니다.', 'success');
      } else {
        await addDoc(collection(db, 'notices'), {
          title, content,
          authorUid:  me.uid,
          authorName: me.name,
          departmentName: me.departmentName || '',
          createdAt: serverTimestamp(),
        });
        toast('공지가 등록되었습니다.', 'success');
        titleInput.value = '';
        contentInput.value = '';
      }
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return el('div', { class: 'flex flex-col gap-3' },
    el('div', { class: 'form-group' }, el('label', {}, '제목'), titleInput),
    el('div', { class: 'form-group' }, el('label', {}, '내용'), contentInput),
    submitBtn,
  );
}

async function handleDelete(id) {
  if (!confirmDialog('공지를 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'notices', id));
    toast('삭제되었습니다.', 'success');
  } catch (err) {
    console.error(err);
    toast('삭제 중 오류가 발생했습니다.', 'error');
  }
}

function startEdit(docSnap, me, item) {
  const d = docSnap.data();
  const editForm = buildWriteForm(me, { id: docSnap.id, ...d }, () => {
    editSection.remove();
  });
  const editSection = el('div', { style: { marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' } },
    editForm,
  );
  item.appendChild(editSection);
  item.classList.add('open');
}
