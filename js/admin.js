// js/admin.js — 관리자 탭 (회장단 전용)

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, getDoc, getDocs,
  onSnapshot, orderBy, query, where,
  serverTimestamp, updateDoc, deleteDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, ROLE_LABEL, emptyState, confirmDialog } from "./utils.js";
import { sendPasswordReset } from "./auth.js";

let unsubUsers    = null;
let unsubRequests = null;
let unsubClubReqs = null;

const DEPARTMENTS_STATIC = [
  { id: 'academic',  name: '학업부' },
  { id: 'culture',   name: '문화부' },
  { id: 'sports',    name: '체육부' },
  { id: 'welfare',   name: '복지부' },
  { id: 'safety',    name: '안전부' },
  { id: 'general',   name: '전체/기타' },
];

export function renderAdmin(container, me) {
  container.innerHTML = '';
  container.appendChild(el('h2', { class: 'section-title mb-3' }, '⚙️ 관리자'));

  // ── 1. 가입 승인 대기 ─────────────────────────────
  container.appendChild(buildSection('👤 가입 승인 대기', renderPendingUsers));
  // ── 2. 동아리 등록/수정 신청 ──────────────────────
  container.appendChild(buildSection('🎯 동아리 신청 승인', renderClubRequests));
  // ── 3. 학생 역할/부서 관리 ────────────────────────
  container.appendChild(buildSection('🏷️ 학생 역할 관리', renderRoleManagement));
  // ── 4. 설문 관리 ──────────────────────────────────
  container.appendChild(buildSection('📊 설문 관리', renderPollManagement));
}

export function unmountAdmin() {
  if (unsubUsers)    { unsubUsers();    unsubUsers    = null; }
  if (unsubRequests) { unsubRequests(); unsubRequests = null; }
  if (unsubClubReqs) { unsubClubReqs(); unsubClubReqs = null; }
}

// ── 섹션 래퍼 ─────────────────────────────────────
function buildSection(title, renderFn) {
  const body = el('div', { class: 'approve-queue' });
  renderFn(body);
  return el('div', { class: 'admin-section' },
    el('div', { class: 'admin-section-title' }, title),
    body,
  );
}

// ═══════════════════════════════════════════════════
// 1. 가입 승인 대기
// ═══════════════════════════════════════════════════
function renderPendingUsers(container) {
  const q = query(collection(db, 'users'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'));
  unsubUsers = onSnapshot(q, snap => {
    container.innerHTML = '';
    if (snap.empty) {
      container.appendChild(el('p', { class: 'text-sm text-muted' }, '대기 중인 가입 신청이 없습니다.'));
      return;
    }
    snap.forEach(ds => {
      const d = ds.data();
      container.appendChild(el('div', { class: 'approve-item' },
        el('div', { class: 'approve-item-info' },
          el('div', { class: 'approve-item-name' }, `${d.name} (${d.grade}학년 ${d.classNum}반 ${d.number}번)`),
          el('div', { class: 'approve-item-sub' }, `학번: ${d.studentId} · ${d.email}`),
        ),
        el('div', { class: 'approve-item-actions' },
          el('button', { class: 'btn btn-accent btn-sm', onclick: () => approveUser(ds.id) }, '승인'),
          el('button', { class: 'btn btn-danger btn-sm',  onclick: () => rejectUser(ds.id)  }, '거절'),
        ),
      ));
    });
  }, err => {
    console.error(err);
    container.appendChild(el('p', { class: 'text-sm text-muted' }, '가입 신청 목록을 불러오지 못했습니다.'));
  });
}

async function approveUser(uid) {
  try {
    await updateDoc(doc(db, 'users', uid), { status: 'approved' });
    toast('승인되었습니다.', 'success');
  } catch (err) {
    console.error(err); toast('승인 처리 중 오류가 발생했습니다.', 'error');
  }
}

async function rejectUser(uid) {
  if (!confirmDialog('이 가입 신청을 거절하시겠습니까?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), { status: 'rejected' });
    toast('거절되었습니다.', 'success');
  } catch (err) {
    console.error(err); toast('거절 처리 중 오류가 발생했습니다.', 'error');
  }
}

// ═══════════════════════════════════════════════════
// 2. 동아리 신청 승인
// ═══════════════════════════════════════════════════
function renderClubRequests(container) {
  // 기존 구독 정리 (renderAdmin이 여러 번 호출될 때 중복 방지)
  if (unsubClubReqs) { unsubClubReqs(); unsubClubReqs = null; }

  const q = query(collection(db, 'clubRequests'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'));
  unsubClubReqs = onSnapshot(q, snap => {
    container.innerHTML = '';
    if (snap.empty) {
      container.appendChild(el('p', { class: 'text-sm text-muted' }, '대기 중인 동아리 신청이 없습니다.'));
      return;
    }
    snap.forEach(ds => {
      const d = ds.data();
      const typeLabel = d.type === 'create' ? '신규 등록' : '정보 수정';
      const btn = el('button', { class: 'btn btn-accent btn-sm' }, '승인');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '처리 중...';
        await approveClubRequest(ds.id, d);
        btn.disabled = false;
        btn.textContent = '승인';
      });
      container.appendChild(el('div', { class: 'approve-item' },
        el('div', { class: 'approve-item-info' },
          el('div', { class: 'approve-item-name' },
            el('span', { class: 'badge badge-primary', style:{ marginRight:'6px' } }, typeLabel),
            d.name,
          ),
          el('div', { class: 'approve-item-sub' },
            `카테고리: ${d.category} · 신청자: ${d.requesterName} · ${d.meetingInfo || ''}`,
          ),
          el('div', { class: 'text-sm text-secondary', style:{ marginTop:'4px' } }, d.description || ''),
        ),
        el('div', { class: 'approve-item-actions' },
          btn,
          el('button', { class: 'btn btn-danger btn-sm', onclick: () => rejectClubRequest(ds.id) }, '거절'),
        ),
      ));
    });
  }, err => {
    console.error(err);
    container.appendChild(el('p', { class: 'text-sm text-muted' }, '동아리 신청 목록을 불러오지 못했습니다.'));
  });
}

async function approveClubRequest(reqId, reqData) {
  try {
    // 중복 승인 방지: 현재 상태 확인
    const reqSnap = await getDoc(doc(db, 'clubRequests', reqId));
    if (!reqSnap.exists() || reqSnap.data().status !== 'pending') {
      toast('이미 처리된 신청입니다.', 'warning');
      return;
    }

    if (reqData.type === 'create') {
      // 미리 status를 상태를 processing으로 바꾸어 중복 승인 차단
      await updateDoc(doc(db, 'clubRequests', reqId), { status: 'processing' });

      // 새 clubs 문서 생성
      const newClubRef = await addDoc(collection(db, 'clubs'), {
        name:          reqData.name,
        category:      reqData.category,
        description:   reqData.description,
        meetingInfo:   reqData.meetingInfo,
        contactInfo:   reqData.contactInfo || '',
        recruiting:    false,
        managerUids:   [reqData.requesterUid],
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });

      // 신청자 managedClubIds에 추가
      const userSnap = await getDoc(doc(db, 'users', reqData.requesterUid));
      if (userSnap.exists()) {
        const currentIds = userSnap.data().managedClubIds || [];
        if (!currentIds.includes(newClubRef.id)) {
          await updateDoc(doc(db, 'users', reqData.requesterUid), {
            managedClubIds: [...currentIds, newClubRef.id],
          });
        }
      }

      // 최종 approved + 생성된 clubId 기록
      await updateDoc(doc(db, 'clubRequests', reqId), { status: 'approved', clubId: newClubRef.id });

    } else if (reqData.type === 'update' && reqData.clubId) {
      await updateDoc(doc(db, 'clubs', reqData.clubId), {
        name:        reqData.name,
        category:    reqData.category,
        description: reqData.description,
        meetingInfo: reqData.meetingInfo,
        contactInfo: reqData.contactInfo || '',
        updatedAt:   serverTimestamp(),
      });
      await updateDoc(doc(db, 'clubRequests', reqId), { status: 'approved' });
    }

    toast('동아리 신청이 승인되었습니다.', 'success');
  } catch (err) {
    console.error(err);
    toast('승인 처리 중 오류가 발생했습니다.', 'error');
    // 실패 시 processing 상태를 pending으로 복원
    try { await updateDoc(doc(db, 'clubRequests', reqId), { status: 'pending' }); } catch(_) {}
  }
}

async function rejectClubRequest(reqId) {
  if (!confirmDialog('이 동아리 신청을 거절하시겠습니까?')) return;
  try {
    await updateDoc(doc(db, 'clubRequests', reqId), { status: 'rejected' });
    toast('거절되었습니다.', 'success');
  } catch (err) {
    console.error(err); toast('거절 처리 중 오류가 발생했습니다.', 'error');
  }
}

// ═══════════════════════════════════════════════════
// 3. 학생 역할/부서 관리
// ═══════════════════════════════════════════════════
function renderRoleManagement(container) {
  const searchInput = el('input', {
    type: 'text', placeholder: '이름 또는 학번으로 검색...',
    style: 'width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;margin-bottom:12px;font-size:.88rem;outline:none;',
  });
  const listEl = el('div', { class: 'approve-queue' });
  container.appendChild(searchInput);
  container.appendChild(listEl);

  let allUsers = [];

  const renderUsers = () => {
    const kw = searchInput.value.toLowerCase().trim();
    listEl.innerHTML = '';
    const filtered = allUsers.filter(u =>
      !kw || u.name?.toLowerCase().includes(kw) || u.studentId?.toLowerCase().includes(kw)
    );
    if (filtered.length === 0) {
      listEl.appendChild(el('p', { class: 'text-sm text-muted' }, '검색 결과가 없습니다.'));
      return;
    }
    filtered.forEach(u => listEl.appendChild(buildUserRoleRow(u)));
  };

  searchInput.addEventListener('input', renderUsers);

  const q = query(collection(db, 'users'), where('status', '==', 'approved'), orderBy('name'));
  unsubRequests = onSnapshot(q, snap => {
    allUsers = [];
    snap.forEach(ds => allUsers.push({ id: ds.id, ...ds.data() }));
    renderUsers();
  });
}

function buildUserRoleRow(u) {
  const roleSelect = el('select', {},
    ...['student','department_head','vice_president','president','socoop_admin'].map(r =>
      el('option', { value:r, selected: u.role===r ? '' : null }, ROLE_LABEL[r])
    ),
  );
  roleSelect.style.cssText = 'padding:5px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem;';

  const deptSelect = el('select', {},
    el('option', { value:'' }, '-- 부서 없음 --'),
    ...DEPARTMENTS_STATIC.map(d => el('option', { value:d.id, selected: u.department===d.id ? '' : null }, d.name)),
  );
  deptSelect.style.cssText = 'padding:5px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.82rem;';

  const saveBtn = el('button', { class:'btn btn-primary btn-sm',
    onclick: async () => {
      saveBtn.disabled = true;
      try {
        await updateDoc(doc(db, 'users', u.id), {
          role:       roleSelect.value,
          department: deptSelect.value || null,
          status:     'approved',
        });
        toast(`${u.name}님의 역할이 변경되었습니다.`, 'success');
      } catch (err) {
        console.error(err); toast('변경 중 오류가 발생했습니다.', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, '저장');

  const resetBtn = el('button', { class: 'btn btn-outline btn-sm',
    style: { color: 'var(--danger, #e53e3e)', borderColor: 'var(--danger, #e53e3e)' },
    onclick: async () => {
      if (!confirmDialog(`${u.name}님(${u.email})에게 비밀번호 재설정 이메일을 보내시겠습니까?`)) return;
      await sendPasswordReset(u.email, u.name);
    },
  }, '🔑 비밀번호 초기화');

  return el('div', { class: 'approve-item', style:{ flexWrap:'wrap', gap:'8px' } },
    el('div', { class: 'approve-item-info' },
      el('div', { class: 'approve-item-name' }, `${u.name} (${u.grade}학년 ${u.classNum}반 ${u.number}번)`),
      el('div', { class: 'approve-item-sub' }, `학번: ${u.studentId} · ${u.email}`),
    ),
    el('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' } },
      roleSelect, deptSelect, saveBtn, resetBtn,
    ),
  );
}

// ═══════════════════════════════════════════════════
// 4. 설문 관리
// ═══════════════════════════════════════════════════
function renderPollManagement(container) {
  const q = query(collection(db, 'polls'), where('status', '==', 'open'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    container.innerHTML = '';
    if (snap.empty) {
      container.appendChild(el('p', { class: 'text-sm text-muted' }, '진행 중인 설문이 없습니다.'));
      return;
    }
    snap.forEach(ds => {
      const d = ds.data();
      const total = Object.values(d.voteCounts || {}).reduce((a,b) => a+b, 0);
      container.appendChild(el('div', { class: 'approve-item' },
        el('div', { class: 'approve-item-info' },
          el('div', { class: 'approve-item-name' }, d.question || ''),
          el('div', { class: 'approve-item-sub' }, `작성: ${d.createdByName || ''} · ${total}명 참여`),
        ),
        el('button', { class: 'btn btn-outline btn-sm',
          onclick: async () => {
            if (!confirmDialog(`"${d.question}" 설문을 강제 마감하시겠습니까?`)) return;
            try {
              await updateDoc(doc(db, 'polls', ds.id), { status: 'closed' });
              toast('설문이 마감되었습니다.', 'success');
            } catch (err) {
              toast('마감 처리 중 오류가 발생했습니다.', 'error');
            }
          },
        }, '강제 마감'),
      ));
    });
  });
}
