// js/clubs.js — 동아리 소개 · 부원 모집 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, isAdminRole, emptyState, confirmDialog } from "./utils.js";

let unsubClubs = null;

const CATEGORIES = ['전체', '운동', '문화', '학술', '봉사', '기타'];

export function renderClubs(container, me) {
  container.innerHTML = '';
  unsubClubs = null;

  // ── 필터 바 ──────────────────────────────────────
  let filterCat      = '전체';
  let filterRecruiting = false;

  const catSelect = el('select', { class: '' },
    ...CATEGORIES.map(c => el('option', { value: c }, c)),
  );
  catSelect.style.cssText = 'padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);font-size:.88rem;outline:none;';

  const recruitCheck = document.createElement('input');
  recruitCheck.type = 'checkbox';
  recruitCheck.id   = 'recruit-filter';

  const filterBar = el('div', { class: 'club-filters' },
    catSelect,
    el('label', { class: 'club-filter-check', htmlFor: 'recruit-filter' },
      recruitCheck,
      '모집중만 보기',
    ),
  );
  container.appendChild(filterBar);

  // ── 동아리 신청 버튼 ──────────────────────────────
  let requestFormOpen = false;
  const reqFormBody = el('div', { class: 'hidden' });
  buildRequestForm(reqFormBody, me, null, () => {
    requestFormOpen = false;
    reqFormBody.classList.add('hidden');
    reqToggleBtn.textContent = '➕ 동아리 등록 신청';
  });

  const reqToggleBtn = el('button', {
    class: 'btn btn-accent btn-sm',
    onclick: () => {
      requestFormOpen = !requestFormOpen;
      requestFormOpen ? reqFormBody.classList.remove('hidden') : reqFormBody.classList.add('hidden');
      reqToggleBtn.textContent = requestFormOpen ? '✕ 닫기' : '➕ 동아리 등록 신청';
    },
  }, '➕ 동아리 등록 신청');

  container.appendChild(el('div', { class: 'write-panel', style: { marginBottom:'16px' } },
    el('div', { class: 'write-panel-header' },
      el('span', { class: 'write-panel-title' }, '동아리'),
      reqToggleBtn,
    ),
    reqFormBody,
  ));

  // ── 동아리 목록 ───────────────────────────────────
  const gridEl = el('div', { class: 'club-grid' });
  container.appendChild(gridEl);

  let allClubs = [];

  const renderGrid = () => {
    gridEl.innerHTML = '';
    const filtered = allClubs.filter(c => {
      if (filterCat !== '전체' && c.category !== filterCat) return false;
      if (filterRecruiting && !c.recruiting) return false;
      return true;
    });
    if (filtered.length === 0) {
      gridEl.appendChild(emptyState('🎯', '조건에 맞는 동아리가 없습니다.'));
      return;
    }
    filtered.forEach(club => gridEl.appendChild(buildClubCard(club, me)));
  };

  catSelect.addEventListener('change', () => { filterCat = catSelect.value; renderGrid(); });
  recruitCheck.addEventListener('change', () => { filterRecruiting = recruitCheck.checked; renderGrid(); });

  const q = query(collection(db, 'clubs'), orderBy('name', 'asc'));
  unsubClubs = onSnapshot(q, snap => {
    allClubs = [];
    snap.forEach(ds => allClubs.push({ id: ds.id, ...ds.data() }));
    renderGrid();
  }, err => {
    console.error(err);
    gridEl.appendChild(emptyState('⚠️', '동아리 목록을 불러오지 못했습니다.'));
  });
}

export function unmountClubs() {
  if (unsubClubs) { unsubClubs(); unsubClubs = null; }
}

// ── 동아리 카드 ───────────────────────────────────
function buildClubCard(club, me) {
  const isManager  = (club.managerUids || []).includes(me.uid) || (me.managedClubIds || []).includes(club.id);
  const isAdmin    = isAdminRole(me.role);

  const recruitingBadge = club.recruiting
    ? el('span', { class: 'recruiting-badge' }, '모집중 🔥')
    : null;

  const detailSection = el('div', { class: 'club-card-detail' },
    el('p', { class: 'text-sm' }, `📍 ${club.meetingInfo || '모임 정보 없음'}`),
    club.contactInfo ? el('p', { class: 'text-sm mt-2' }, `📞 ${club.contactInfo}`) : null,
    club.recruitDeadline ? el('p', { class: 'text-sm mt-2 text-muted' }, `마감: ${club.recruitDeadline}`) : null,

    // 모집 상태 즉시 변경 (매니저)
    isManager || isAdmin
      ? el('div', { class: 'mt-3', onclick: e => e.stopPropagation() },
          el('label', { style: { display:'flex', alignItems:'center', gap:'8px', fontSize:'.88rem', cursor:'pointer', fontWeight:'600' } },
            buildRecruitingToggle(club),
            '모집 상태 즉시 변경',
          ),
        )
      : null,

    // 정보 수정 신청 버튼
    isManager || isAdmin
      ? el('button', {
          class: 'btn btn-outline btn-sm mt-3',
          onclick: (e) => { e.stopPropagation(); openUpdateRequest(club, me, card); },
        }, '✏️ 정보 수정 신청')
      : null,
  );

  const card = el('div', { class: 'club-card' },
    el('div', { class: 'club-card-header' },
      el('div', {},
        el('div', { class: 'club-card-name' }, club.name || ''),
        el('div', { class: 'text-xs text-muted mt-2' },
          el('span', { class: 'badge badge-gray' }, club.category || '기타'),
        ),
      ),
      recruitingBadge,
    ),
    el('div', { class: 'club-card-body' }, club.description || '소개 없음'),
    detailSection,
  );

  card.addEventListener('click', () => card.classList.toggle('open'));
  return card;
}

function buildRecruitingToggle(club) {
  const toggle = document.createElement('input');
  toggle.type    = 'checkbox';
  toggle.checked = !!club.recruiting;
  toggle.style.accentColor = 'var(--accent)';
  toggle.addEventListener('change', async (e) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'clubs', club.id), {
        recruiting:      toggle.checked,
        updatedAt:       serverTimestamp(),
      });
      toast(`모집 상태가 "${toggle.checked ? '모집중' : '마감'}"으로 변경되었습니다.`, 'success');
    } catch (err) {
      console.error(err);
      toast('상태 변경 중 오류가 발생했습니다.', 'error');
      toggle.checked = !toggle.checked;
    }
  });
  return toggle;
}

// ── 동아리 등록/수정 신청 폼 ─────────────────────
function buildRequestForm(container, me, existingClub, onDone) {
  const nameInput  = el('input', { type:'text', placeholder:'동아리 이름', value: existingClub?.name || '' });
  const catSelect  = el('select', {},
    ...['운동','문화','학술','봉사','기타'].map(c => el('option', { value:c, selected: existingClub?.category===c ? '' : null }, c)),
  );
  const descInput  = el('textarea', { placeholder:'동아리 소개', rows:'3' }, existingClub?.description || '');
  const meetInput  = el('input', { type:'text', placeholder:'모임 요일·시간·장소', value: existingClub?.meetingInfo || '' });
  const contInput  = el('input', { type:'text', placeholder:'연락처 (선택)', value: existingClub?.contactInfo || '' });
  const submitBtn  = el('button', { class:'btn btn-accent', type:'button' },
    existingClub ? '수정 신청' : '등록 신청');

  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const desc = descInput.value.trim();
    if (!name) { toast('동아리 이름을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      const payload = {
        type:          existingClub ? 'update' : 'create',
        clubId:        existingClub?.id || null,
        name,
        category:      catSelect.value,
        description:   desc,
        meetingInfo:   meetInput.value.trim(),
        contactInfo:   contInput.value.trim(),
        requesterUid:  me.uid,
        requesterName: me.name,
        status:        'pending',
        createdAt:     serverTimestamp(),
      };
      await addDoc(collection(db, 'clubRequests'), payload);
      toast('신청이 접수되었습니다. 회장단 승인 후 반영됩니다.', 'success');
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast('신청 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.innerHTML = '';
  container.append(
    el('div', { class:'flex flex-col gap-3', style:{ marginTop:'12px' } },
      el('div', { class:'form-row' },
        el('div', { class:'form-group' }, el('label',{}, '이름'), nameInput),
        el('div', { class:'form-group' }, el('label',{}, '카테고리'), catSelect),
      ),
      el('div', { class:'form-group' }, el('label',{}, '소개'), descInput),
      el('div', { class:'form-group' }, el('label',{}, '모임 정보'), meetInput),
      el('div', { class:'form-group' }, el('label',{}, '연락처'), contInput),
      submitBtn,
    )
  );
}

function openUpdateRequest(club, me, card) {
  const existingDetail = card.querySelector('.club-update-form');
  if (existingDetail) { existingDetail.remove(); return; }

  const formContainer = el('div', { class:'club-update-form', style:{ padding:'12px 16px', borderTop:'1px solid var(--border-light)', background:'var(--bg)' } });
  buildRequestForm(formContainer, me, club, () => formContainer.remove());
  card.appendChild(formContainer);
}
