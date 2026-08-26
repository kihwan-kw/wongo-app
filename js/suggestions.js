// js/suggestions.js — 건의함 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, onSnapshot,
  orderBy, query, where, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, formatDate, toast, isAdminRole, emptyState } from "./utils.js";

let unsubscribe = null;

const DEPARTMENTS_STATIC = [
  { id: 'academic',  name: '학업부' },
  { id: 'culture',   name: '문화부' },
  { id: 'sports',    name: '체육부' },
  { id: 'welfare',   name: '복지부' },
  { id: 'safety',    name: '안전부' },
  { id: 'general',   name: '전체/기타' },
];

const STATUS_LABEL = { pending: '접수 대기', received: '접수됨', done: '처리 완료' };
const STATUS_CLASS = { pending: 'pending', received: 'received', done: 'done' };

export function renderSuggestions(container, me) {
  container.innerHTML = '';

  // ── 작성 폼 ──────────────────────────────────────────
  let formOpen = false;
  const formBody = el('div', { class: 'hidden flex flex-col gap-3' });
  buildSuggestionForm(formBody, me);

  const toggleBtn = el('button', {
    class: 'btn btn-primary btn-sm',
    onclick: () => {
      formOpen = !formOpen;
      formOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
      toggleBtn.textContent = formOpen ? '✕ 닫기' : '✏️ 건의 작성';
    },
  }, '✏️ 건의 작성');

  container.appendChild(el('div', { class: 'write-panel' },
    el('div', { class: 'write-panel-header' },
      el('span', { class: 'write-panel-title' }, '건의함'),
      toggleBtn,
    ),
    formBody,
  ));

  // ── 목록 ─────────────────────────────────────────────
  const listEl = el('div', { class: 'notice-list' });
  container.appendChild(listEl);

  // 권한별 쿼리
  let q;
  if (isAdminRole(me.role)) {
    q = query(collection(db, 'suggestions'), orderBy('createdAt', 'desc'));
  } else if (me.role === 'department_head') {
    q = query(collection(db, 'suggestions'),
      where('departmentId', '==', me.department || ''),
      orderBy('createdAt', 'desc'));
  } else {
    q = query(collection(db, 'suggestions'),
      where('submitterUid', '==', me.uid),
      orderBy('createdAt', 'desc'));
  }

  unsubscribe = onSnapshot(q, snap => {
    listEl.innerHTML = '';
    if (snap.empty) {
      listEl.appendChild(emptyState('📬', '건의 내역이 없습니다.'));
      return;
    }
    snap.forEach(docSnap => listEl.appendChild(buildSuggestionItem(docSnap, me)));
  }, err => {
    console.error(err);
    listEl.appendChild(emptyState('⚠️', '건의함을 불러오지 못했습니다.'));
  });
}

export function unmountSuggestions() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

// ── 작성 폼 빌더 ─────────────────────────────────────
function buildSuggestionForm(container, me) {
  const deptSelect = el('select', {},
    el('option', { value: '' }, '-- 부서 선택 --'),
    ...DEPARTMENTS_STATIC.map(d => el('option', { value: d.id }, d.name)),
  );
  const contentInput = el('textarea', { placeholder: '건의 내용을 입력하세요...', rows: '4' });
  const anonCheck    = el('input',  { type: 'checkbox', id: 'sug-anon' });
  const submitBtn    = el('button', { class: 'btn btn-primary', type: 'button' }, '건의하기');

  submitBtn.addEventListener('click', async () => {
    const departmentId = deptSelect.value;
    const content      = contentInput.value.trim();
    if (!departmentId) { toast('부서를 선택해주세요.', 'error'); return; }
    if (!content)      { toast('내용을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      const deptName = DEPARTMENTS_STATIC.find(d => d.id === departmentId)?.name || departmentId;
      await addDoc(collection(db, 'suggestions'), {
        departmentId,
        departmentName: deptName,
        content,
        submitterUid:   me.uid,
        submitterName:  anonCheck.checked ? '익명' : me.name,
        status:         'pending',
        createdAt:      serverTimestamp(),
      });
      toast('건의가 접수되었습니다.', 'success');
      contentInput.value = '';
      deptSelect.value   = '';
    } catch (err) {
      console.error(err);
      toast('건의 접수 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.append(
    el('div', { class: 'form-group' }, el('label', {}, '대상 부서'), deptSelect),
    el('div', { class: 'form-group' }, el('label', {}, '내용'), contentInput),
    el('label', { style: { display:'flex', alignItems:'center', gap:'6px', fontSize:'.88rem', cursor:'pointer' } },
      anonCheck, '익명으로 제출'),
    submitBtn,
  );
}

// ── 건의 카드 ─────────────────────────────────────────
function buildSuggestionItem(docSnap, me) {
  const d  = docSnap.data();
  const canChangeStatus = isAdminRole(me.role) || me.role === 'department_head';

  const statusBadge = el('span', { class: `suggestion-status ${STATUS_CLASS[d.status] || 'pending'}` },
    STATUS_LABEL[d.status] || d.status,
  );

  const item = el('div', { class: 'notice-item' },
    el('div', { class: 'flex items-center justify-between gap-2' },
      el('span', { class: 'notice-title' }, d.departmentName || '건의'),
      statusBadge,
    ),
    el('div', { class: 'notice-meta' },
      el('span', {}, d.submitterName || ''),
      el('span', {}, formatDate(d.createdAt)),
    ),
    el('div', { class: 'notice-body' },
      el('p', { style: { whiteSpace:'pre-wrap' } }, d.content || ''),
      el('p', { class: 'text-sm text-muted mt-2' }, `부서: ${d.departmentName || ''}`),
      canChangeStatus ? buildStatusChanger(docSnap) : null,
    ),
  );
  item.addEventListener('click', () => item.classList.toggle('open'));
  return item;
}

function buildStatusChanger(docSnap) {
  const d = docSnap.data();
  const select = el('select', {
    style: { marginTop:'10px', padding:'5px 10px', fontSize:'.82rem', borderRadius:'6px', border:'1px solid var(--border)' },
    onclick: e => e.stopPropagation(),
  },
    el('option', { value:'pending',  selected: d.status==='pending'  ? '' : null }, '접수 대기'),
    el('option', { value:'received', selected: d.status==='received' ? '' : null }, '접수됨'),
    el('option', { value:'done',     selected: d.status==='done'     ? '' : null }, '처리 완료'),
  );
  select.addEventListener('change', async () => {
    try {
      await updateDoc(doc(db, 'suggestions', docSnap.id), { status: select.value });
      toast('상태가 변경되었습니다.', 'success');
    } catch (err) {
      console.error(err);
      toast('상태 변경 중 오류가 발생했습니다.', 'error');
    }
  });
  return el('div', { onclick: e => e.stopPropagation() },
    el('label', { style: { fontSize:'.78rem', fontWeight:'600', color:'var(--text-muted)' } }, '상태 변경: '),
    select,
  );
}
