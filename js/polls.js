// js/polls.js — 설문 · 투표 탭

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

  card.appendChild(el('div', { class: 'poll-header' },
    el('div', { class: 'flex items-center justify-between gap-2', style:{ marginBottom:'4px' } },
      el('div', { class: 'poll-question' }, poll.question || ''),
      el('div', { class: 'flex items-center gap-2' }, statusBadge, closeBtn),
    ),
    poll.description ? el('div', { class: 'poll-desc' }, poll.description) : null,
  ));

  // 본문 (비동기로 투표 여부 확인 후 렌더)
  const body = el('div', { class: 'poll-body' },
    el('div', { class: 'text-sm text-muted' }, '로딩 중...'),
  );
  card.appendChild(body);

  // 푸터
  const totalVotes = Object.values(poll.voteCounts || {}).reduce((a,b) => a+b, 0);
  card.appendChild(el('div', { class: 'poll-footer' },
    el('span', {}, `작성: ${poll.createdByName || ''} · ${formatDate(poll.createdAt)}`),
    el('span', {}, `총 ${totalVotes}명 참여`),
  ));

  // 투표 상태 비동기 로드
  checkMyVote(poll.id, me.uid).then(myVote => {
    body.innerHTML = '';
    if (myVote || isClosed) {
      renderResults(body, poll, myVote, isClosed);
    } else {
      renderVoting(body, poll, me, card);
    }
  });

  return card;
}

// ── 투표 UI ───────────────────────────────────────
function renderVoting(container, poll, me, card) {
  const options = poll.options || [];
  const selectedIds = new Set();

  const optionEls = options.map(opt => {
    const btn = el('button', { class: 'poll-option-btn', 'data-id': opt.id },
      poll.multiple
        ? (() => { const cb = document.createElement('input'); cb.type='checkbox'; cb.style.accentColor='var(--primary)'; return cb; })()
        : null,
      el('span', {}, opt.text || ''),
    );
    btn.addEventListener('click', () => {
      if (poll.multiple) {
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
      await castVote(poll.id, me.uid, [...selectedIds]);
      toast('투표가 완료되었습니다!', 'success');
      // 카드 새로 고침
      const updatedSnap = await getDoc(doc(db, 'polls', poll.id));
      if (updatedSnap.exists()) {
        const updated = { id: updatedSnap.id, ...updatedSnap.data() };
        container.innerHTML = '';
        renderResults(container, updated, { optionIds: [...selectedIds] }, false);
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
function renderResults(container, poll, myVote, isClosed) {
  if (poll.hideResultsUntilClosed && !isClosed && myVote) {
    container.appendChild(el('p', { class: 'text-sm text-secondary', style:{ padding:'12px 0' } },
      '✅ 투표가 완료되었습니다. 마감 후 결과를 공개합니다.'
    ));
    return;
  }

  if (!myVote && !isClosed) return;

  const options   = poll.options || [];
  const counts    = poll.voteCounts || {};
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

// ── 투표 트랜잭션 ─────────────────────────────────
async function castVote(pollId, uid, optionIds) {
  const pollRef = doc(db, 'polls', pollId);
  const voteRef = doc(db, 'polls', pollId, 'votes', uid);

  await runTransaction(db, async tx => {
    const voteSnap = await tx.get(voteRef);
    if (voteSnap.exists()) throw new Error('already_voted');

    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists()) throw new Error('poll_not_found');

    const data     = pollSnap.data();
    const newCounts = { ...(data.voteCounts || {}) };
    optionIds.forEach(id => { newCounts[id] = (newCounts[id] || 0) + 1; });

    tx.update(pollRef, { voteCounts: newCounts });
    tx.set(voteRef, { optionIds, votedAt: serverTimestamp() });
  });
}

// ── 내 투표 확인 ───────────────────────────────────
async function checkMyVote(pollId, uid) {
  try {
    const snap = await getDoc(doc(db, 'polls', pollId, 'votes', uid));
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
  const questionInput = el('input', { type:'text', placeholder:'질문을 입력하세요' });
  const descInput     = el('textarea', { placeholder:'설명 (선택)', rows:'2' });
  const multipleCheck = document.createElement('input');
  multipleCheck.type = 'checkbox';
  const hideCheck = document.createElement('input');
  hideCheck.type = 'checkbox';
  const closesAtInput = el('input', { type:'datetime-local' });

  // 선택지 목록
  const optionsList = el('div', { class: 'options-list' });
  let optionCount = 0;

  function addOption(defaultVal = '') {
    optionCount++;
    const id   = `opt_${Date.now()}_${optionCount}`;
    const inp  = el('input', { type:'text', placeholder:`선택지 ${optionCount}`, value: defaultVal });
    const delBtn = el('button', { class:'btn btn-danger btn-xs', type:'button',
      onclick: () => row.remove(),
    }, '✕');
    const row = el('div', { class:'option-input-row', dataset:{ optId: id } }, inp, delBtn);
    row._optId = id;
    row._input = inp;
    optionsList.appendChild(row);
  }
  addOption('선택지 1');
  addOption('선택지 2');

  const addOptBtn = el('button', { class:'btn btn-outline btn-sm', type:'button',
    onclick: () => addOption(),
  }, '+ 선택지 추가');

  const submitBtn = el('button', { class:'btn btn-primary', type:'button' }, '설문 등록');
  submitBtn.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    if (!question) { toast('질문을 입력해주세요.', 'error'); return; }

    const options = [];
    optionsList.querySelectorAll('.option-input-row').forEach(row => {
      const text = row._input?.value.trim();
      if (text) options.push({ id: row._optId || `opt_${Date.now()}`, text });
    });
    if (options.length < 2) { toast('선택지를 2개 이상 입력해주세요.', 'error'); return; }

    const voteCounts = {};
    options.forEach(o => { voteCounts[o.id] = 0; });

    submitBtn.disabled = true;
    try {
      const payload = {
        question,
        description:           descInput.value.trim(),
        options,
        voteCounts,
        multiple:              multipleCheck.checked,
        hideResultsUntilClosed: hideCheck.checked,
        status:                'open',
        createdBy:             me.uid,
        createdByName:         me.name,
        createdAt:             serverTimestamp(),
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
    el('div', { class:'form-group' }, el('label',{}, '질문'), questionInput),
    el('div', { class:'form-group' }, el('label',{}, '설명 (선택)'), descInput),
    el('div', { class:'form-group' }, el('label',{}, '선택지'), optionsList, addOptBtn),
    el('label', { style:{ display:'flex', alignItems:'center', gap:'8px', fontSize:'.88rem', cursor:'pointer' } },
      multipleCheck, '복수 선택 허용'),
    el('label', { style:{ display:'flex', alignItems:'center', gap:'8px', fontSize:'.88rem', cursor:'pointer' } },
      hideCheck, '마감 전 결과 비공개'),
    el('div', { class:'form-group' }, el('label',{}, '마감일시 (선택)'), closesAtInput),
    submitBtn,
  ));
}
