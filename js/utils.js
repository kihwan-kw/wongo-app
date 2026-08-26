// js/utils.js — 공통 유틸리티 함수

// ── DOM 생성 헬퍼 ──────────────────────────────────────
/**
 * el(tag, attrs?, ...children) → HTMLElement
 * attrs: { class, id, style, onclick, dataset, ... }
 * children: string | HTMLElement | null | false
 */
export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val === null || val === undefined || val === false) continue;
    if (key === 'class')   { elem.className = val; }
    else if (key === 'style' && typeof val === 'object') {
      Object.assign(elem.style, val);
    }
    else if (key === 'dataset' && typeof val === 'object') {
      Object.assign(elem.dataset, val);
    }
    else if (key.startsWith('on') && typeof val === 'function') {
      elem.addEventListener(key.slice(2).toLowerCase(), val);
    }
    else if (key === 'htmlFor') { elem.htmlFor = val; }
    else { elem.setAttribute(key, val); }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      elem.appendChild(document.createTextNode(String(child)));
    } else {
      elem.appendChild(child);
    }
  }
  return elem;
}

// ── 날짜 포맷 ──────────────────────────────────────────
/** Firestore Timestamp 또는 Date → "YYYY년 M월 D일 H:MM" */
export function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYYMMDD" → "M/D (요일)" */
export function formatYMD(ymd) {
  if (!ymd || ymd.length !== 8) return ymd;
  const y = +ymd.slice(0,4), m = +ymd.slice(4,6)-1, d = +ymd.slice(6,8);
  const date = new Date(y, m, d);
  const days = ['일','월','화','수','목','금','토'];
  return `${m+1}/${d} (${days[date.getDay()]})`;
}

/** Date → "YYYYMMDD" */
export function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}${m}${d}`;
}

/** 해당 연월의 첫날/말일 "YYYYMMDD" */
export function monthRange(year, month) {
  const from = `${year}${String(month).padStart(2,'0')}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}${String(month).padStart(2,'0')}${String(lastDay).padStart(2,'0')}`;
  return { from, to };
}

// ── Toast 알림 ─────────────────────────────────────────
export function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = el('div', { class: `toast ${type}` }, msg);
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 250);
  }, 3000);
}

// ── 확인 다이얼로그 ────────────────────────────────────
export function confirmDialog(msg) {
  return window.confirm(msg);
}

// ── 역할 관련 ──────────────────────────────────────────
export const ROLE_LABEL = {
  student:          '학생',
  department_head:  '부장',
  vice_president:   '부학생회장',
  president:        '회장',
};

export function isAdminRole(role) {
  return role === 'president' || role === 'vice_president';
}

export function canWrite(role) {
  return role === 'president' || role === 'vice_president' || role === 'department_head';
}

// ── 모달 헬퍼 ─────────────────────────────────────────
export function openModal(contentEl) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-content');
  if (!overlay || !box) return;
  box.innerHTML = '';
  box.appendChild(contentEl);
  overlay.classList.remove('hidden');
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ── 빈 상태 ───────────────────────────────────────────
export function emptyState(icon = '📭', text = '아직 내용이 없습니다.') {
  return el('div', { class: 'empty-state' },
    el('div', { class: 'empty-state-icon' }, icon),
    el('p', {}, text),
  );
}

// ── 로딩 스피너 ───────────────────────────────────────
export function loadingSpinner() {
  return el('div', { class: 'loading-center' },
    el('div', { class: 'spinner' }),
  );
}
