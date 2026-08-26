// js/board.js — 익명 게시판 (목록 → 상세 / 실시간 조회수)

import { db } from "./firebase-config.js";
import {
  collection, addDoc, deleteDoc, doc, increment,
  onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, formatDate, toast, isAdminRole, emptyState, confirmDialog } from "./utils.js";

let unsubPosts   = null;  // 목록 구독
let unsubDetail  = null;  // 게시글 문서 구독
let unsubComment = null;  // 댓글 컬렉션 구독

// ══════════════════════════════════════════════════════════
// 목록 화면
// ══════════════════════════════════════════════════════════
export function renderBoard(container, me) {
  _cleanDetail();
  container.innerHTML = '';

  // ── 작성 폼 ──────────────────────────────────────────
  const titleInput   = el('input',    { type: 'text', placeholder: '글 제목' });
  const contentInput = el('textarea', { placeholder: '내용을 자유롭게 적어보세요.\n익명 별명으로 표시됩니다.', rows: '3' });
  const submitBtn    = el('button',   { class: 'btn btn-primary btn-sm', type: 'button' }, '게시');
  let formOpen = false;

  const formBody = el('div', { class: 'hidden flex flex-col gap-3' },
    el('div', { class: 'alert warning', style: { fontSize: '0.8rem', padding: '8px', marginBottom: '4px' } },
      '⚠️ 타인을 비방하거나 조롱, 욕설이 포함된 글은 통보 없이 삭제되며 이용이 제한될 수 있습니다. 서로를 배려하는 따뜻한 공간을 만들어주세요.'
    ),
    el('div', { class: 'form-group' }, el('label', {}, '제목'), titleInput),
    el('div', { class: 'form-group' }, el('label', {}, '내용'), contentInput),
    el('p',   { class: 'text-xs text-muted' }, `나의 별명: ${me.anonName || '?'}`),
    submitBtn,
  );

  const toggleBtn = el('button', {
    class: 'btn btn-primary btn-sm',
    onclick: () => {
      formOpen = !formOpen;
      formOpen ? formBody.classList.remove('hidden') : formBody.classList.add('hidden');
      toggleBtn.textContent = formOpen ? '✕ 닫기' : '✏️ 글쓰기';
    },
  }, '✏️ 글쓰기');

  submitBtn.addEventListener('click', async () => {
    const title   = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title)   { toast('제목을 입력해주세요.', 'error');  return; }
    if (!content) { toast('내용을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      await addDoc(collection(db, 'posts'), {
        title,
        content,
        authorUid:  me.uid,
        authorName: me.anonName || '익명',
        createdAt:  serverTimestamp(),
        viewCount:  0,
      });
      toast('게시되었습니다.', 'success');
      titleInput.value   = '';
      contentInput.value = '';
      formOpen = false;
      formBody.classList.add('hidden');
      toggleBtn.textContent = '✏️ 글쓰기';
    } catch (err) {
      console.error(err);
      toast('게시 중 오류가 발생했습니다.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  container.appendChild(el('div', { class: 'write-panel' },
    el('div', { class: 'write-panel-header' },
      el('span', { class: 'write-panel-title' }, '익명 게시판'),
      toggleBtn,
    ),
    formBody,
  ));

  // ── 게시글 목록 ──────────────────────────────────────
  const listEl = el('div', { class: 'post-list' });
  container.appendChild(listEl);

  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  unsubPosts = onSnapshot(q, snap => {
    listEl.innerHTML = '';
    if (snap.empty) {
      listEl.appendChild(emptyState('💬', '아직 게시글이 없습니다. 첫 글을 남겨보세요!'));
      return;
    }
    snap.forEach(docSnap => {
      const d     = docSnap.data();
      const title = d.title || d.content?.slice(0, 30) + '…' || '(제목 없음)';
      const views = d.viewCount || 0;

      const item = el('div', { class: 'post-item post-list-item' },
        el('div', { class: 'post-title' }, title),
        el('div', { class: 'post-meta' },
          el('span', {}, d.authorName || '익명'),
          el('span', {}, formatDate(d.createdAt)),
          el('span', { class: 'post-view-count' }, `👁 ${views}`),
        ),
      );
      item.addEventListener('click', () => openPostDetail(docSnap.id, container, me));
      listEl.appendChild(item);
    });
  }, err => {
    console.error(err);
    listEl.appendChild(emptyState('⚠️', '게시판을 불러오지 못했습니다.'));
  });
}

export function unmountBoard() {
  _cleanAll();
}

// ══════════════════════════════════════════════════════════
// 상세 화면
// ══════════════════════════════════════════════════════════
function openPostDetail(postId, container, me) {
  // 목록 구독 해제 (상세 화면으로 전환)
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  container.innerHTML = '';

  // 조회수 +1
  updateDoc(doc(db, 'posts', postId), { viewCount: increment(1) }).catch(console.error);

  // 뒤로가기 버튼
  const backBtn = el('button', { class: 'board-back-btn' }, '← 목록으로');
  backBtn.addEventListener('click', () => {
    _cleanDetail();
    renderBoard(container, me);
  });
  container.appendChild(backBtn);

  // 게시글 본문 (실시간)
  const detailBox = el('div', { class: 'post-detail' });
  container.appendChild(detailBox);

  const postRef = doc(db, 'posts', postId);
  unsubDetail = onSnapshot(postRef, snap => {
    if (!snap.exists()) {
      detailBox.innerHTML = '';
      detailBox.appendChild(emptyState('⚠️', '삭제된 게시글입니다.'));
      return;
    }
    const d         = snap.data();
    const canDelete = isAdminRole(me.role) || d.authorUid === me.uid;

    detailBox.innerHTML = '';
    detailBox.appendChild(
      el('div', { class: 'post-detail-inner' },
        // 제목
        el('h3', { class: 'post-detail-title' }, d.title || '(제목 없음)'),
        // 메타
        el('div', { class: 'post-detail-meta' },
          el('span', {}, `✍️ ${d.authorName || '익명'}`),
          el('span', {}, formatDate(d.createdAt)),
          el('span', { class: 'post-view-count' }, `👁 ${d.viewCount || 0}`),
        ),
        // 본문
        el('div', { class: 'post-detail-body' }, d.content || ''),
        // 삭제 버튼
        canDelete
          ? el('div', { class: 'post-detail-actions' },
              el('button', {
                class: 'btn btn-danger btn-xs',
                onclick: async () => {
                  if (!confirmDialog('게시글을 삭제하시겠습니까?')) return;
                  await deleteDoc(postRef).catch(console.error);
                  _cleanDetail();
                  renderBoard(container, me);
                },
              }, '🗑️ 삭제'),
            )
          : null,
      ),
    );
  });

  // 댓글 섹션 (실시간)
  const commentsBox = el('div');
  container.appendChild(commentsBox);
  _renderComments(postId, commentsBox, me);
}

// ══════════════════════════════════════════════════════════
// 댓글
// ══════════════════════════════════════════════════════════
function _renderComments(postId, container, me) {
  container.innerHTML = '';

  const commentList = el('div', { class: 'comment-list' });
  const inputRow    = _buildCommentInput(postId, me);

  container.appendChild(
    el('div', { class: 'comment-section' },
      el('div', { class: 'comment-section-title' }, '💬 댓글'),
      commentList,
      inputRow,
    ),
  );

  const q = query(
    collection(db, 'posts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
  );
  unsubComment = onSnapshot(q, snap => {
    commentList.innerHTML = '';
    if (snap.empty) {
      commentList.appendChild(
        el('p', { class: 'text-xs text-muted', style: { padding: '6px 0' } }, '아직 댓글이 없습니다.'),
      );
      return;
    }
    snap.forEach(cs => {
      const cd     = cs.data();
      const canDel = isAdminRole(me.role) || cd.authorUid === me.uid;
      commentList.appendChild(
        el('div', { class: 'comment-item' },
          el('div', { class: 'flex items-center justify-between' },
            el('div', { class: 'comment-author' }, cd.authorName || '익명'),
            canDel
              ? el('button', {
                  class: 'btn btn-danger btn-xs',
                  onclick: async () => {
                    if (!confirmDialog('댓글을 삭제하시겠습니까?')) return;
                    await deleteDoc(doc(db, 'posts', postId, 'comments', cs.id)).catch(console.error);
                  },
                }, '✕')
              : null,
          ),
          el('div', { class: 'comment-text' }, cd.content || ''),
        ),
      );
    });
  });
}

function _buildCommentInput(postId, me) {
  const input   = el('input', { type: 'text', placeholder: '댓글을 입력하세요...' });
  const postBtn = el('button', { class: 'btn btn-primary btn-sm' }, '등록');

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    postBtn.disabled = true;
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        content:    text,
        authorUid:  me.uid,
        authorName: me.anonName || '익명',
        createdAt:  serverTimestamp(),
      });
      input.value = '';
    } catch (err) {
      console.error(err);
      toast('댓글 등록 중 오류가 발생했습니다.', 'error');
    } finally {
      postBtn.disabled = false;
    }
  };

  postBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  return el('div', { class: 'comment-input-row' }, input, postBtn);
}

// ── 구독 정리 ─────────────────────────────────────────────
function _cleanDetail() {
  if (unsubDetail)  { unsubDetail();  unsubDetail  = null; }
  if (unsubComment) { unsubComment(); unsubComment = null; }
}
function _cleanAll() {
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  _cleanDetail();
}
