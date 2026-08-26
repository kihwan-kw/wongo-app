// js/faq.js — 자주 묻는 질문 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, isAdminRole, canWrite, emptyState, confirmDialog } from "./utils.js";

let unsubFaq = null;

const CATEGORIES = ['전체', '학사', '생활지도', '동아리', '학생자치', '기타'];

export function renderFaq(container, me) {
  container.innerHTML = '';

  // ── 작성 폼 (회장단·부장) ──────────────────────────
  if (canWrite(me.role)) {
    let formOpen = false;
    const formBody = el('div', { class: 'hidden' });
    buildFaqForm(formBody, me, null, () => {
      formOpen = false;
      formBody.classList.add('hidden');
      toggleBtn.textContent = '✏️ FAQ 작성';
    });

    const toggleBtn = el('button', {
      class: 'btn btn-primary btn-sm',
      onclick: () => {
        formOpen = !formOpen;
        formOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
        toggleBtn.textContent = formOpen ? '✕ 닫기' : '✏️ FAQ 작성';
      },
    }, '✏️ FAQ 작성');

    container.appendChild(el('div', { class: 'write-panel', style: { marginBottom:'16px' } },
      el('div', { class: 'write-panel-header' },
        el('span', { class: 'write-panel-title' }, '자주 묻는 질문'),
        toggleBtn,
      ),
      formBody,
    ));
  } else {
    container.appendChild(el('div', { class: 'section-header' },
      el('h2', { class: 'section-title' }, '자주 묻는 질문'),
    ));
  }

  // ── 검색창 ────────────────────────────────────────
  const searchInput = el('input', {
    type: 'text',
    placeholder: '🔍 질문 또는 답변 검색...',
    id: 'faq-search-input',
  });
  container.appendChild(el('div', { class: 'faq-search' }, searchInput));

  // ── 카테고리 필터 ─────────────────────────────────
  let activeCategory = '전체';
  const catBar = el('div', { class: 'faq-category-filter' });

  CATEGORIES.forEach(cat => {
    const btn = el('button', {
      class: `faq-cat-btn${cat === '전체' ? ' active' : ''}`,
      onclick: () => {
        activeCategory = cat;
        catBar.querySelectorAll('.faq-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      },
    }, cat);
    catBar.appendChild(btn);
  });
  container.appendChild(catBar);

  // ── FAQ 목록 ──────────────────────────────────────
  const listEl = el('div', { class: 'faq-list' });
  container.appendChild(listEl);

  let allFaqs = [];

  const applyFilters = () => {
    const keyword = searchInput.value.toLowerCase().trim();
    listEl.innerHTML = '';

    const filtered = allFaqs.filter(faq => {
      const matchCat = activeCategory === '전체' || faq.category === activeCategory;
      const matchKeyword = !keyword
        || faq.question.toLowerCase().includes(keyword)
        || faq.answer.toLowerCase().includes(keyword);
      return matchCat && matchKeyword;
    });

    if (filtered.length === 0) {
      listEl.appendChild(emptyState('❓', '검색 결과가 없습니다.'));
      return;
    }
    filtered.forEach(faq => listEl.appendChild(buildFaqItem(faq, me)));
  };

  searchInput.addEventListener('input', applyFilters);

  const q = query(collection(db, 'faqs'), orderBy('order', 'asc'));
  unsubFaq = onSnapshot(q, snap => {
    allFaqs = [];
    snap.forEach(ds => allFaqs.push({ id: ds.id, ...ds.data() }));
    applyFilters();
  }, err => {
    console.error(err);
    listEl.appendChild(emptyState('⚠️', 'FAQ를 불러오지 못했습니다.'));
  });
}

export function unmountFaq() {
  if (unsubFaq) { unsubFaq(); unsubFaq = null; }
}

// ── FAQ 아코디언 아이템 ───────────────────────────
function buildFaqItem(faq, me) {
  const canEdit = isAdminRole(me.role) || faq.createdBy === me.uid;

  const categoryBadge = faq.category
    ? el('span', { class: 'badge badge-gray', style:{ marginLeft:'8px', fontSize:'.68rem' } }, faq.category)
    : null;

  const answerEl = el('div', { class: 'faq-answer' }, faq.answer || '');

  // 수정/삭제 액션
  let editSection = null;
  const actionsEl = canEdit
    ? el('div', { class: 'faq-actions', onclick: e => e.stopPropagation() },
        el('button', { class: 'btn btn-ghost btn-xs', onclick: () => {
          if (editSection) { editSection.remove(); editSection = null; return; }
          editSection = el('div', { style:{ marginTop:'10px', borderTop:'1px solid var(--border-light)', paddingTop:'10px' } });
          buildFaqForm(editSection, me, faq, () => { editSection?.remove(); editSection = null; });
          answerEl.appendChild(editSection);
          item.classList.add('open');
        }}, '✏️ 수정'),
        el('button', { class: 'btn btn-danger btn-xs',
          onclick: async () => {
            if (!confirmDialog('FAQ를 삭제하시겠습니까?')) return;
            try {
              await deleteDoc(doc(db, 'faqs', faq.id));
              toast('삭제되었습니다.', 'success');
            } catch (err) {
              toast('삭제 중 오류가 발생했습니다.', 'error');
            }
          },
        }, '🗑️ 삭제'),
      )
    : null;

  const item = el('div', { class: 'faq-item' },
    el('div', { class: 'faq-question',
      onclick: () => item.classList.toggle('open'),
    },
      el('span', { class: 'faq-question-text' }, faq.question || '', categoryBadge),
      el('span', { class: 'faq-chevron' }, '▾'),
    ),
    el('div', { class: 'faq-answer' },
      el('p', { style:{ whiteSpace:'pre-wrap' } }, faq.answer || ''),
      actionsEl,
    ),
  );

  return item;
}

// ── FAQ 작성/수정 폼 ──────────────────────────────
function buildFaqForm(container, me, existing, onDone) {
  const questionInput = el('input', { type:'text', placeholder:'질문', value: existing?.question || '' });
  const answerInput   = el('textarea', { placeholder:'답변', rows:'4' }, existing?.answer || '');
  const catSelect     = el('select', {},
    ...CATEGORIES.filter(c => c !== '전체').map(c =>
      el('option', { value:c, selected: existing?.category===c ? '' : null }, c)
    ),
  );
  const submitBtn = el('button', { class:'btn btn-primary', type:'button' },
    existing ? '수정하기' : '등록하기');

  submitBtn.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    const answer   = answerInput.value.trim();
    if (!question || !answer) { toast('질문과 답변을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      if (existing) {
        await updateDoc(doc(db, 'faqs', existing.id), {
          question, answer,
          category:  catSelect.value,
          updatedAt: serverTimestamp(),
        });
        toast('수정되었습니다.', 'success');
      } else {
        await addDoc(collection(db, 'faqs'), {
          question, answer,
          category:  catSelect.value,
          order:     Date.now(),
          createdBy: me.uid,
          updatedAt: serverTimestamp(),
        });
        toast('FAQ가 등록되었습니다.', 'success');
      }
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.innerHTML = '';
  container.appendChild(el('div', { class:'flex flex-col gap-3', style:{ marginTop:'12px' } },
    el('div', { class:'form-group' }, el('label',{}, '질문'), questionInput),
    el('div', { class:'form-group' }, el('label',{}, '답변'), answerInput),
    el('div', { class:'form-group' }, el('label',{}, '카테고리'), catSelect),
    submitBtn,
  ));
}
