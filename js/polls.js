// js/polls.js — 설문 · 투표 탭 (다중 질문 지원)

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, getDoc,
  onSnapshot, orderBy, query, serverTimestamp,
  runTransaction, updateDoc, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, toast, isAdminRole, canWrite, emptyState, formatDate, confirmDialog } from "./utils.js";

let unsubPolls = null;

export function renderPolls(container, me) {
  container.innerHTML = '';

  // ── 작성 폼 (회장단·부장) ──────────────────────────
  if (canWrite(me.role)) {
    let formOpen = false;
    const formBody = el('div', { class: 'hidden' });
    buildPollForm(formBody, me, () => {
      formOpen = false;
      formBody.classList.add('hidden');
      toggleBtn.textContent = '➕ 설문 만들기';
    });

    const toggleBtn = el('button', {
      class: 'btn btn-primary btn-sm',
      onclick: () => {
        formOpen = !formOpen;
        formOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
        toggleBtn.textContent = formOpen ? '✕ 닫기' : '➕ 설문 만들기';
      },
    }, '➕ 설문 만들기');

    container.appendChild(el('div', { class: 'write-panel', style: { marginBottom:'16px' } },
      el('div', { class: 'write-panel-header' },
        el('span', { class: 'write-panel-title' }, '설문 / 투표'),
        toggleBtn,
      ),
      formBody,
    ));
  } else {
    container.appendChild(el('div', { class: 'section-header' },
      el('h2', { class: 'section-title' }, '설문 / 투표'),
    ));
  }

  // ── 진행중 / 마감 섹션 ────────────────────────────
  const openSection   = el('div', {});
  const closedHeader  = el('div', { class: 'collapsible-header', onclick: () => closedBody.classList.toggle('hidden') },
    '마감된 설문', el('span', {}, '▾'),
  );
  const closedBody    = el('div', { class: 'collapsible-body hidden' });

  container.appendChild(el('h3', { class: 'section-title mb-3' }, '진행중인 설문'));
  container.appendChild(openSection);
  container.appendChild(el('div', { style: { marginTop:'24px' } }, closedHeader, closedBody));

  // ── onSnapshot ────────────────────────────────────
  const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
  unsubPolls = onSnapshot(q, snap => {
    openSection.innerHTML = '';
    closedBody.innerHTML  = '';
    let hasOpen = false, hasClosed = false;

    snap.forEach(ds => {
      const poll = { id: ds.id, ...ds.data() };
      const isOpen = isPollOpen(poll);
      if (isOpen) {
        openSection.appendChild(buildPollCard(poll, me));
        hasOpen = true;
      } else {
        closedBody.appendChild(buildPollCard(poll, me, true));
        hasClosed = true;
      }
    });

    if (!hasOpen)  openSection.appendChild(emptyState('📊', '진행중인 설문이 없습니다.'));
    if (!hasClosed) closedBody.appendChild(el('p', { class: 'text-sm text-muted', style:{ padding:'12px' } }, '마감된 설문이 없습니다.'));
  }, err => {
    console.error(err);
    openSection.appendChild(emptyState('⚠️', '설문을 불러오지 못했습니다.'));
  });
}

export function unmountPolls() {
  if (unsubPolls) { unsubPolls(); unsubPolls = null; }
}

function isPollOpen(poll) {
  if (poll.status === 'closed') return false;
  if (poll.closesAt) {
    const closeDate = poll.closesAt.toDate ? poll.closesAt.toDate() : new Date(poll.closesAt);
    if (closeDate < new Date()) return false;
  }
  return true;
}

// ── 설문 카드 ─────────────────────────────────────
function buildPollCard(poll, me, isClosed = false) {
  const card = el('div', { class: 'poll-card' });
  const canManage = isAdminRole(me.role) || poll.createdBy === me.uid;

  // 하위 호환: 구버전 poll(단일 question)을 questions 배열로 변환
  const questions = poll.questions || [
    {
      id: 'q0',
      question: poll.question || '',
      description: poll.description || '',
      options: poll.options || [],
      voteCounts: poll.voteCounts || {},
      multiple: poll.multiple || false,
      hideResultsUntilClosed: poll.hideResultsUntilClosed || false,
    }
  ];

  // 헤더
  const statusBadge = isClosed
    ? el('span', { class: 'badge badge-gray' }, '마감')
    : el('span', { class: 'badge badge-accent' }, '진행중');

  const closeBtn = (!isClosed && canManage)
    ? el('button', {
        class: 'btn btn-outline btn-xs',
        onclick: () => handleClosePoll(poll.id),
      }, '마감하기')
    : null;

  // 전체 참여자 수 (첫 번째 질문 기준)
  const totalVotes = Object.values(questions[0]?.voteCounts || {}).reduce((a,b) => a+b, 0);

  card.appendChild(el('div', { class: 'poll-header' },
    el('div', { class: 'flex items-center justify-between gap-2', style:{ marginBottom:'4px' } },
      el('div', { class: 'poll-question' }, poll.title || questions[0]?.question || ''),
      el('div', { class: 'flex items-center gap-2' }, statusBadge, closeBtn),
    ),
  ));

  // 각 질문 블록
  const questionsWrap = el('div', { class: 'poll-questions-wrap' });
  card.appendChild(questionsWrap);

  questions.forEach((q, idx) => {
    const qBlock = el('div', { class: 'poll-question-block' });
    if (questions.length > 1) {
      qBlock.appendChild(el('div', { class: 'poll-question-label' }, `Q${idx+1}. ${q.question}`));
    }
    if (q.description) {
      qBlock.appendChild(el('div', { class: 'poll-desc' }, q.description));
    }

    const body = el('div', { class: 'poll-body' },
      el('div', { class: 'text-sm text-muted' }, '로딩 중...'),
    );
    qBlock.appendChild(body);
    questionsWrap.appendChild(qBlock);

    // 각 질문별 투표 여부 확인
    checkMyVote(poll.id, me.uid, q.id).then(myVote => {
      body.innerHTML = '';
      if (myVote || isClosed) {
        renderResults(body, q, myVote, isClosed);
      } else {
        renderVoting(body, q, poll, me, card);
      }
    });
  });

  // 푸터
  card.appendChild(el('div', { class: 'poll-footer' },
    el('span', {}, `작성: ${poll.createdByName || ''} · ${formatDate(poll.createdAt)}`),
    el('span', {}, `총 ${totalVotes}명 참여`),
  ));

  return card;
}

// ── 투표 UI ───────────────────────────────────────
function renderVoting(container, q, poll, me, card) {
  const options = q.options || [];
  const selectedIds = new Set();

  const optionEls = options.map(opt => {
    const btn = el('button', { class: 'poll-option-btn', 'data-id': opt.id },
      q.multiple
        ? (() => { const cb = document.createElement('input'); cb.type='checkbox'; cb.style.accentColor='var(--primary)'; return cb; })()
        : null,
      el('span', {}, opt.text || ''),
    );
    btn.addEventListener('click', () => {
      if (q.multiple) {
        if (selectedIds.has(opt.id)) { selectedIds.delete(opt.id); btn.classList.remove('selected'); }
        else { selectedIds.add(opt.id); btn.classList.add('selected'); }
        const cb = btn.querySelector('input[type=checkbox]');
        if (cb) cb.checked = selectedIds.has(opt.id);
      } else {
        optionEls.forEach(b => b.classList.remove('selected'));
        selectedIds.clear();
        selectedIds.add(opt.id);
        btn.classList.add('selected');
      }
    });
    return btn;
  });

  const voteBtn = el('button', { class: 'btn btn-primary btn-sm mt-3' }, '투표하기');
  voteBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) { toast('선택지를 선택해주세요.', 'error'); return; }
    voteBtn.disabled = true;
    try {
      await castVote(poll.id, q.id, me.uid, [...selectedIds]);
      toast('투표가 완료되었습니다!', 'success');
      // 결과로 전환
      const updatedSnap = await getDoc(doc(db, 'polls', poll.id));
      if (updatedSnap.exists()) {
        const updatedPoll = updatedSnap.data();
        const updatedQ = (updatedPoll.questions || []).find(x => x.id === q.id) || q;
        container.innerHTML = '';
        renderResults(container, updatedQ, { optionIds: [...selectedIds] }, false);
      }
    } catch (err) {
      console.error(err);
      if (err.message === 'already_voted') {
        toast('이미 투표했습니다.', 'warning');
      } else {
        toast('투표 중 오류가 발생했습니다.', 'error');
      }
      voteBtn.disabled = false;
    }
  });

  container.appendChild(el('div', { class: 'poll-options' }, ...optionEls));
  container.appendChild(voteBtn);
}

// ── 결과 UI ───────────────────────────────────────
function renderResults(container, q, myVote, isClosed) {
  if (q.hideResultsUntilClosed && !isClosed && myVote) {
    container.appendChild(el('p', { class: 'text-sm text-secondary', style:{ padding:'12px 0' } },
      '✅ 투표가 완료되었습니다. 마감 후 결과를 공개합니다.'
    ));
    return;
  }

  if (!myVote && !isClosed) return;

  const options   = q.options || [];
  const counts    = q.voteCounts || {};
  const total     = Object.values(counts).reduce((a,b) => a+b, 0);
  const myIds     = new Set(myVote?.optionIds || []);

  if (myVote) {
    container.appendChild(el('p', { class: 'text-xs text-muted mb-3' }, '✅ 이미 참여했습니다'));
  }

  const resultItems = options.map(opt => {
    const count   = counts[opt.id] || 0;
    const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
    const isMine  = myIds.has(opt.id);

    const fill = el('div', { class: 'poll-bar-fill', style: { width: '0%' } });
    setTimeout(() => { fill.style.width = `${pct}%`; }, 50);

    return el('div', { class: 'poll-result-item' },
      el('div', { class: 'poll-result-label' },
        el('span', { style: { fontWeight: isMine ? '700' : '400', color: isMine ? 'var(--primary)' : 'inherit' } },
          `${isMine ? '✓ ' : ''}${opt.text}`),
        el('span', { class: 'text-sm text-muted' }, `${pct}% (${count}명)`),
      ),
      el('div', { class: 'poll-bar' }, fill),
    );
  });

  container.appendChild(el('div', {}, ...resultItems));
}

// ── 투표 트랜잭션 (질문 id 기반) ─────────────────
async function castVote(pollId, questionId, uid, optionIds) {
  const pollRef = doc(db, 'polls', pollId);
  // 질문별 votes 서브컬렉션 키를 "uid_questionId"로 구분
  const voteRef = doc(db, 'polls', pollId, 'votes', `${uid}_${questionId}`);

  await runTransaction(db, async tx => {
    const voteSnap = await tx.get(voteRef);
    if (voteSnap.exists()) throw new Error('already_voted');

    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists()) throw new Error('poll_not_found');

    const data = pollSnap.data();
    const questions = data.questions || [];
    const qIdx = questions.findIndex(q => q.id === questionId);

    if (qIdx === -1) throw new Error('question_not_found');

    const newCounts = { ...(questions[qIdx].voteCounts || {}) };
    optionIds.forEach(id => { newCounts[id] = (newCounts[id] || 0) + 1; });

    const updatedQuestions = questions.map((q, i) =>
      i === qIdx ? { ...q, voteCounts: newCounts } : q
    );

    tx.update(pollRef, { questions: updatedQuestions });
    tx.set(voteRef, { optionIds, questionId, votedAt: serverTimestamp() });
  });
}

// ── 내 투표 확인 ───────────────────────────────────
async function checkMyVote(pollId, uid, questionId) {
  try {
    const snap = await getDoc(doc(db, 'polls', pollId, 'votes', `${uid}_${questionId}`));
    return snap.exists() ? snap.data() : null;
  } catch (_) { return null; }
}

// ── 설문 마감 ─────────────────────────────────────
async function handleClosePoll(pollId) {
  if (!confirmDialog('이 설문을 마감하시겠습니까?')) return;
  try {
    await updateDoc(doc(db, 'polls', pollId), { status: 'closed' });
    toast('설문이 마감되었습니다.', 'success');
  } catch (err) {
    console.error(err);
    toast('마감 중 오류가 발생했습니다.', 'error');
  }
}

// ── 설문 작성 폼 ──────────────────────────────────
function buildPollForm(container, me, onDone) {
  const titleInput    = el('input', { type:'text', placeholder:'설문 제목 (예: 체육대회 종목 투표)' });
  const closesAtInput = el('input', { type:'datetime-local' });

  // ── 질문 목록 ────────────────────────────────────
  const questionsList = el('div', { class: 'flex flex-col gap-3' });
  let questionCount = 0;

  function buildQuestionBlock() {
    questionCount++;
    const qIdx = questionCount;
    const qId  = `q_${Date.now()}_${qIdx}`;

    const qInput      = el('input', { type:'text', placeholder:`질문 ${qIdx}` });
    const descInput   = el('textarea', { placeholder:'질문 설명 (선택)', rows:'2' });
    const multipleChk = (() => { const c = document.createElement('input'); c.type='checkbox'; return c; })();
    const hideChk     = (() => { const c = document.createElement('input'); c.type='checkbox'; return c; })();

    // 선택지
    const optionsList = el('div', { class: 'options-list' });
    let optCount = 0;

    function addOption(val = '') {
      optCount++;
      const optId  = `opt_${Date.now()}_${optCount}`;
      const inp    = el('input', { type:'text', placeholder:`선택지 ${optCount}`, value: val });
      const delBtn = el('button', { class:'btn btn-danger btn-xs', type:'button',
        onclick: () => row.remove(),
      }, '✕');
      const row = el('div', { class:'option-input-row' }, inp, delBtn);
      row._optId  = optId;
      row._input  = inp;
      optionsList.appendChild(row);
    }
    addOption('선택지 1');
    addOption('선택지 2');

    const addOptBtn = el('button', { class:'btn btn-outline btn-xs', type:'button',
      onclick: () => addOption(),
    }, '+ 선택지 추가');

    const block = el('div', { class: 'poll-question-editor' });
    block._qId    = qId;
    block._qInput = qInput;
    block._descInput = descInput;
    block._multipleChk = multipleChk;
    block._hideChk = hideChk;
    block._optionsList = optionsList;

    const removeBtn = el('button', { class:'btn btn-danger btn-xs', type:'button',
      onclick: () => { if (questionsList.children.length > 1) block.remove(); else toast('질문은 최소 1개 이상이어야 합니다.', 'error'); },
    }, '질문 삭제');

    block.appendChild(
      el('div', { class:'poll-question-editor-inner' },
        el('div', { class:'poll-q-header' },
          el('span', { class:'poll-q-num' }, `질문 ${qIdx}`),
          removeBtn,
        ),
        el('div', { class:'form-group' }, el('label', {}, '질문'), qInput),
        el('div', { class:'form-group' }, el('label', {}, '설명 (선택)'), descInput),
        el('div', { class:'form-group' }, el('label', {}, '선택지'), optionsList, addOptBtn),
        el('label', { style:{ display:'flex', alignItems:'center', gap:'8px', fontSize:'.85rem', cursor:'pointer', marginTop:'6px' } },
          multipleChk, '복수 선택 허용'),
        el('label', { style:{ display:'flex', alignItems:'center', gap:'8px', fontSize:'.85rem', cursor:'pointer' } },
          hideChk, '마감 전 결과 비공개'),
      )
    );
    return block;
  }

  questionsList.appendChild(buildQuestionBlock());

  const addQBtn = el('button', { class:'btn btn-outline btn-sm', type:'button',
    onclick: () => questionsList.appendChild(buildQuestionBlock()),
  }, '➕ 질문 추가');

  // ── 등록 버튼 ────────────────────────────────────
  const submitBtn = el('button', { class:'btn btn-primary', type:'button' }, '설문 등록');
  submitBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) { toast('설문 제목을 입력해주세요.', 'error'); return; }

    const questions = [];
    let valid = true;

    Array.from(questionsList.children).forEach(block => {
      const qText = block._qInput?.value.trim();
      if (!qText) { toast('모든 질문을 입력해주세요.', 'error'); valid = false; return; }

      const options = [];
      block._optionsList?.querySelectorAll('.option-input-row').forEach(row => {
        const text = row._input?.value.trim();
        if (text) options.push({ id: row._optId || `opt_${Date.now()}`, text });
      });
      if (options.length < 2) { toast(`질문 "${qText}"에 선택지를 2개 이상 입력해주세요.`, 'error'); valid = false; return; }

      const voteCounts = {};
      options.forEach(o => { voteCounts[o.id] = 0; });

      questions.push({
        id: block._qId || `q_${Date.now()}`,
        question:               qText,
        description:            block._descInput?.value.trim() || '',
        options,
        voteCounts,
        multiple:               block._multipleChk?.checked || false,
        hideResultsUntilClosed: block._hideChk?.checked || false,
      });
    });

    if (!valid || questions.length === 0) return;

    submitBtn.disabled = true;
    try {
      const payload = {
        title,
        questions,
        status:        'open',
        createdBy:     me.uid,
        createdByName: me.name,
        createdAt:     serverTimestamp(),
      };
      if (closesAtInput.value) {
        payload.closesAt = Timestamp.fromDate(new Date(closesAtInput.value));
      }
      await addDoc(collection(db, 'polls'), payload);
      toast('설문이 등록되었습니다.', 'success');
      if (onDone) onDone();
    } catch (err) {
      console.error(err);
      toast('등록 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.innerHTML = '';
  container.appendChild(el('div', { class:'flex flex-col gap-3', style:{ marginTop:'12px' } },
    el('div', { class:'form-group' }, el('label',{}, '설문 제목'), titleInput),
    el('div', { class:'form-group' }, el('label',{}, '마감일시 (선택)'), closesAtInput),
    el('div', { class:'form-group' }, el('label',{}, '질문 목록'), questionsList),
    addQBtn,
    submitBtn,
  ));
}
