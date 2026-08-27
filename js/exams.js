// js/exams.js — 시험범위 탭

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, canWrite, emptyState, loadingSpinner } from "./utils.js";

// 시험 구분 정의
const EXAMS = [
  { id: '1_1', label: '1학기 1회고사' },
  { id: '1_2', label: '1학기 2회고사' },
  { id: '2_1', label: '2학기 1회고사' },
  { id: '2_2', label: '2학기 2회고사' },
];
const GRADES = [1, 2, 3];

let unsubscribe = null;

export function renderExams(container, me) {
  container.innerHTML = '';

  // 현재 선택 상태
  let selectedExam  = EXAMS[0].id;
  let selectedGrade = GRADES[0];

  // ── 섹션 제목 ────────────────────────────────────
  container.appendChild(el('h2', { class: 'section-title mb-3' }, '📝 시험범위'));

  // ── 시험 탭 (1학기1회고사 등) ────────────────────
  const examTabsEl = el('div', { class: 'exam-tab-row' });
  container.appendChild(examTabsEl);

  // ── 학년 탭 ──────────────────────────────────────
  const gradeTabsEl = el('div', { class: 'grade-tab-row' });
  container.appendChild(gradeTabsEl);

  // ── 콘텐츠 영역 ──────────────────────────────────
  const contentEl = el('div', { class: 'exam-content-area' });
  container.appendChild(contentEl);

  function renderTabs() {
    // 시험 탭
    examTabsEl.innerHTML = '';
    EXAMS.forEach(exam => {
      const btn = el('button', {
        class: `exam-tab-btn ${selectedExam === exam.id ? 'active' : ''}`,
        onclick: () => { selectedExam = exam.id; renderTabs(); loadContent(); },
      }, exam.label);
      examTabsEl.appendChild(btn);
    });

    // 학년 탭
    gradeTabsEl.innerHTML = '';
    GRADES.forEach(g => {
      const btn = el('button', {
        class: `grade-tab-btn ${selectedGrade === g ? 'active' : ''}`,
        onclick: () => { selectedGrade = g; renderTabs(); loadContent(); },
      }, `${g}학년`);
      gradeTabsEl.appendChild(btn);
    });
  }

  function loadContent() {
    // 기존 구독 해제
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    contentEl.innerHTML = '';
    const spinner = loadingSpinner();
    contentEl.appendChild(spinner);

    const docId  = `${selectedExam}_grade${selectedGrade}`;
    const docRef = doc(db, 'exam_ranges', docId);

    unsubscribe = onSnapshot(docRef, snap => {
      spinner.remove();
      contentEl.innerHTML = '';

      const data = snap.exists() ? snap.data() : null;

      // ── 작성 권한자에게 편집 버튼 노출 ────────────
      if (canWrite(me.role)) {
        renderEditor(contentEl, data, docRef, me);
      } else {
        renderReadonly(contentEl, data);
      }
    }, err => {
      console.error(err);
      spinner.remove();
      contentEl.innerHTML = '';
      contentEl.appendChild(emptyState('⚠️', '시험범위를 불러오지 못했습니다.'));
    });
  }

  renderTabs();
  loadContent();
}

export function unmountExams() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
}

// ── 읽기 전용 뷰 ─────────────────────────────────
function renderReadonly(container, data) {
  if (!data || !data.content) {
    container.appendChild(emptyState('📝', '아직 등록된 시험범위가 없습니다.'));
    return;
  }

  const updatedStr = data.updatedAt
    ? (() => {
        const d = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
        return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      })()
    : '';

  container.appendChild(
    el('div', { class: 'exam-view' },
      updatedStr
        ? el('div', { class: 'exam-updated-at' }, `최종 업데이트: ${updatedStr} · ${data.updatedByName || ''}`)
        : null,
      el('pre', { class: 'exam-content-text' }, data.content),
    )
  );
}

// ── 편집 뷰 (권한자) ──────────────────────────────
function renderEditor(container, data, docRef, me) {
  let isEditing = false;

  const updatedStr = data?.updatedAt
    ? (() => {
        const d = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
        return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      })()
    : '';

  const viewArea = el('div', { class: 'exam-view' });
  if (!data || !data.content) {
    viewArea.appendChild(el('div', { class: 'exam-empty-hint' }, '아직 등록된 내용이 없습니다. 아래 편집 버튼을 눌러 입력해주세요.'));
  } else {
    if (updatedStr) {
      viewArea.appendChild(el('div', { class: 'exam-updated-at' }, `최종 업데이트: ${updatedStr} · ${data.updatedByName || ''}`));
    }
    viewArea.appendChild(el('pre', { class: 'exam-content-text' }, data.content));
  }

  const textarea = el('textarea', {
    class: 'exam-textarea hidden',
    placeholder: '과목별 시험범위를 입력하세요.\n예)\n국어: 1단원~3단원\n수학: p.20~p.80\n영어: 교과서 1~5과',
    rows: '14',
  }, data?.content || '');

  const editBtn = el('button', { class: 'btn btn-primary btn-sm', onclick: () => startEdit() }, '✏️ 편집');
  const saveBtn = el('button', { class: 'btn btn-primary btn-sm hidden', onclick: saveEdit }, '💾 저장');
  const cancelBtn = el('button', { class: 'btn btn-outline btn-sm hidden', onclick: cancelEdit }, '취소');

  function startEdit() {
    isEditing = true;
    viewArea.classList.add('hidden');
    textarea.classList.remove('hidden');
    editBtn.classList.add('hidden');
    saveBtn.classList.remove('hidden');
    cancelBtn.classList.remove('hidden');
    textarea.focus();
  }

  function cancelEdit() {
    isEditing = false;
    textarea.value = data?.content || '';
    textarea.classList.add('hidden');
    viewArea.classList.remove('hidden');
    editBtn.classList.remove('hidden');
    saveBtn.classList.add('hidden');
    cancelBtn.classList.add('hidden');
  }

  async function saveEdit() {
    const content = textarea.value.trim();
    saveBtn.disabled = true;
    try {
      await setDoc(docRef, {
        content,
        updatedAt:     serverTimestamp(),
        updatedByName: me.name,
        updatedByUid:  me.uid,
      });
      toast('시험범위가 저장되었습니다.', 'success');
    } catch (err) {
      console.error(err);
      toast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  container.appendChild(
    el('div', { class: 'exam-editor-wrap' },
      el('div', { class: 'exam-editor-toolbar' }, editBtn, saveBtn, cancelBtn),
      viewArea,
      textarea,
    )
  );
}
