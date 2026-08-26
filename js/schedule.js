// js/schedule.js — 학사일정 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, isAdminRole, emptyState, loadingSpinner, monthRange, formatYMD, confirmDialog } from "./utils.js";

let unsubEvents = null;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

export function renderSchedule(container, me) {
  container.innerHTML = '';
  currentYear  = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  buildScheduleView(container, me);
}

export function unmountSchedule() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
}

function buildScheduleView(container, me) {
  // 이전 리스너 정리
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  container.innerHTML = '';

  // ── 달 네비게이션 ──────────────────────────────────
  const monthLabel = el('span', { class: 'schedule-month-label' },
    `${currentYear}년 ${currentMonth}월`
  );
  const prevBtn = el('button', { class: 'btn btn-outline btn-sm',
    onclick: () => {
      currentMonth--;
      if (currentMonth < 1) { currentMonth = 12; currentYear--; }
      buildScheduleView(container, me);
    }
  }, '◀ 이전 달');
  const nextBtn = el('button', { class: 'btn btn-outline btn-sm',
    onclick: () => {
      currentMonth++;
      if (currentMonth > 12) { currentMonth = 1; currentYear++; }
      buildScheduleView(container, me);
    }
  }, '다음 달 ▶');

  container.appendChild(el('div', { class: 'schedule-nav' }, prevBtn, monthLabel, nextBtn));

  // ── 회장단 전용 행사 등록 폼 ──────────────────────
  if (isAdminRole(me.role)) {
    let formOpen = false;
    const formBody = el('div', { class: 'hidden' }, buildEventForm(me, () => {
      formOpen = false;
      formBody.classList.add('hidden');
      toggleBtn.textContent = '➕ 행사 등록';
    }));

    const toggleBtn = el('button', {
      class: 'btn btn-accent btn-sm',
      onclick: () => {
        formOpen = !formOpen;
        formOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
        toggleBtn.textContent = formOpen ? '✕ 닫기' : '➕ 행사 등록';
      },
    }, '➕ 행사 등록');

    container.appendChild(el('div', { class: 'write-panel', style: { marginBottom:'16px' } },
      el('div', { class: 'write-panel-header' },
        el('span', { class: 'write-panel-title' }, '학생회 행사 등록'),
        toggleBtn,
      ),
      formBody,
    ));
  }

  // ── 일정 목록 영역 ─────────────────────────────────
  const listEl    = el('div', { class: 'schedule-list' });
  const spinner   = loadingSpinner();
  container.appendChild(spinner);

  const { from, to } = monthRange(currentYear, currentMonth);

  // NEIS API + Firestore 병합
  Promise.all([
    fetchNeisSchedule(from, to),
    listenManualEvents(from, to, listEl, me, spinner),
  ]).catch(err => {
    console.error(err);
  });

  // listenManualEvents가 container 추가까지 담당
}

// ── NEIS 학사일정 가져오기 ──────────────────────────
async function fetchNeisSchedule(from, to) {
  try {
    const res = await fetch(`/api/schedule?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.events || [];
  } catch (err) {
    console.warn('NEIS 학사일정 API 오류:', err.message);
    return [];
  }
}

// ── Firestore 수동 행사 리스너 ──────────────────────
function listenManualEvents(from, to, listEl, me, spinner) {
  return new Promise((resolve) => {
    const q = query(
      collection(db, 'calendarEvents'),
      where('source', '==', 'manual'),
      orderBy('date', 'asc'),
    );

    unsubEvents = onSnapshot(q, async snap => {
      spinner.remove();

      const manualEvents = [];
      snap.forEach(ds => {
        const d = ds.data();
        const dateStr = d.date || '';
        if (dateStr >= from && dateStr <= to) {
          manualEvents.push({ date: dateStr, title: d.title, type: 'council', id: ds.id, memo: d.memo, isAdmin: isAdminRole(me.role) });
        }
      });

      // NEIS 병합
      let neisEvents = [];
      try {
        neisEvents = await fetchNeisSchedule(from, to);
      } catch (_) {}

      // 날짜별 그룹핑
      const dateMap = new Map();
      neisEvents.forEach(ev => {
        const key = ev.date;
        if (!dateMap.has(key)) dateMap.set(key, []);
        dateMap.get(key).push({ ...ev, type: 'neis' });
      });
      manualEvents.forEach(ev => {
        const key = ev.date;
        if (!dateMap.has(key)) dateMap.set(key, []);
        dateMap.get(key).push(ev);
      });

      // 정렬 & 렌더
      const sortedDates = [...dateMap.keys()].sort();
      listEl.innerHTML = '';

      if (sortedDates.length === 0) {
        listEl.appendChild(emptyState('📅', '이번 달 일정이 없습니다.'));
        resolve();
        return;
      }

      sortedDates.forEach(date => {
        const events = dateMap.get(date);
        const dateCol = el('div', { class: 'schedule-date-col' }, formatYMD(date));
        const eventsCol = el('div', { class: 'schedule-events' });

        events.forEach(ev => {
          const badge = ev.type === 'neis'
            ? el('span', { class: 'event-badge event-badge-neis' }, '학사일정')
            : el('span', { class: 'event-badge event-badge-council' }, '학생회');

          const deleteBtn = (ev.type === 'council' && isAdminRole(me.role))
            ? el('button', {
                class: 'btn btn-danger btn-xs',
                style: { marginLeft: '6px' },
                onclick: async (e) => {
                  e.stopPropagation();
                  if (!confirmDialog(`"${ev.title}" 행사를 삭제하시겠습니까?`)) return;
                  try {
                    await deleteDoc(doc(db, 'calendarEvents', ev.id));
                    toast('삭제되었습니다.', 'success');
                  } catch(err) {
                    toast('삭제 실패', 'error');
                  }
                },
              }, '🗑️')
            : null;

          eventsCol.appendChild(el('div', { class: 'event-item' },
            badge,
            el('span', {}, ev.title || ''),
            ev.memo ? el('span', { class: 'text-xs text-muted' }, ` — ${ev.memo}`) : null,
            deleteBtn,
          ));
        });

        listEl.appendChild(el('div', { class: 'schedule-date-group' }, dateCol, eventsCol));
      });

      if (spinner.parentNode) spinner.remove();
      if (!listEl.parentNode) {
        spinner.parentNode && spinner.parentNode.replaceChild(listEl, spinner);
      }
      resolve();
    }, err => {
      console.error(err);
      spinner.remove();
      listEl.appendChild(emptyState('⚠️', '일정을 불러오지 못했습니다.'));
      resolve();
    });

    // listEl을 컨테이너에 추가
    const spinnerParent = spinner.parentNode;
    if (spinnerParent) {
      spinnerParent.insertBefore(listEl, spinner.nextSibling);
    }
  });
}

// ── 행사 등록 폼 ───────────────────────────────────
function buildEventForm(me, onDone) {
  const titleInput = el('input', { type: 'text', placeholder: '행사 제목' });
  const dateInput  = el('input', { type: 'date' });
  const endInput   = el('input', { type: 'date' });
  const memoInput  = el('textarea', { placeholder: '메모 (선택)', rows: '2' });
  const submitBtn  = el('button', { class: 'btn btn-accent', type: 'button' }, '등록');

  submitBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const date  = dateInput.value.replace(/-/g,'');
    if (!title || !date) { toast('제목과 시작일을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      await addDoc(collection(db, 'calendarEvents'), {
        title,
        date,
        endDate:    endInput.value ? endInput.value.replace(/-/g,'') : date,
        category:   'council',
        memo:       memoInput.value.trim(),
        source:     'manual',
        createdBy:  me.uid,
        createdAt:  serverTimestamp(),
      });
      toast('행사가 등록되었습니다.', 'success');
      titleInput.value = '';
      dateInput.value  = '';
      endInput.value   = '';
      memoInput.value  = '';
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast('등록 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  return el('div', { class: 'flex flex-col gap-3', style: { marginTop: '12px' } },
    el('div', { class: 'form-group' }, el('label', {}, '행사 제목'), titleInput),
    el('div', { class: 'form-row' },
      el('div', { class: 'form-group' }, el('label', {}, '시작일'), dateInput),
      el('div', { class: 'form-group' }, el('label', {}, '종료일 (선택)'), endInput),
    ),
    el('div', { class: 'form-group' }, el('label', {}, '메모'), memoInput),
    submitBtn,
  );
}
