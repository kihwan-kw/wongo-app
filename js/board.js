// js/board.js — 익명 게시판 탭

import { db } from "./firebase-config.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { el, formatDate, toast, isAdminRole, emptyState, confirmDialog } from "./utils.js";

let unsubPosts = null;

export function renderBoard(container, me) {
  container.innerHTML = '';

  // ── 작성 폼 ──────────────────────────────────────────
  let formOpen = false;
  const contentInput = el('textarea', { placeholder: '자유롭게 의견을 남겨보세요. (게시판 내 모든 글에는 고정 별명이 표시됩니다)', rows: '3' });
  const submitBtn    = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, '게시');
  const formBody     = el('div', { class: 'hidden flex flex-col gap-3' },
    el('div', { class: 'form-group' }, el('label', {}, '내용'), contentInput),
    el('p', { class: 'text-xs text-muted' }, `나의 별명: ${me.anonName || '?'}`),
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
    const content = contentInput.value.trim();
    if (!content) { toast('내용을 입력해주세요.', 'error'); return; }
    submitBtn.disabled = true;
    try {
      await addDoc(collection(db, 'posts'), {
        content,
        authorUid:  me.uid,
        authorName: me.anonName || '익명',
        createdAt:  serverTimestamp(),
      });
      toast('게시되었습니다.', 'success');
      contentInput.value = '';
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
    snap.forEach(docSnap => listEl.appendChild(buildPostItem(docSnap, me)));
  }, err => {
    console.error(err);
    listEl.appendChild(emptyState('⚠️', '게시판을 불러오지 못했습니다.'));
  });
}

export function unmountBoard() {
  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
}

// ── 게시글 카드 ──────────────────────────────────────
function buildPostItem(docSnap, me) {
  const d = docSnap.data();
  const canDelete = isAdminRole(me.role) || d.authorUid === me.uid;

  const commentsEl = el('div', { class: 'comment-section' });
  let commentsLoaded = false;

  const item = el('div', { class: 'post-item' },
    el('div', { class: 'flex items-center justify-between' },
      el('span', { class: 'post-title' }, d.authorName || '익명'),
      canDelete
        ? el('button', { class: 'btn btn-danger btn-xs',
            onclick: e => { e.stopPropagation(); handleDeletePost(docSnap.id); }
          }, '🗑️')
        : null,
    ),
    el('div', { class: 'post-meta' }, el('span', {}, formatDate(d.createdAt))),
    el('div', { class: 'post-body', style: { display:'block', marginTop:'8px' } }, d.content || ''),
    el('button', {
      class: 'btn btn-ghost btn-xs mt-2',
      style: { fontSize:'.78rem' },
      onclick: e => { e.stopPropagation(); toggleComments(docSnap.id, commentsEl, me, commentsLoaded, (v) => { commentsLoaded = v; }); },
    }, '💬 댓글 보기'),
    commentsEl,
  );
  return item;
}

function toggleComments(postId, container, me, loaded, setLoaded) {
  if (container.children.length > 0) {
    container.innerHTML = '';
    setLoaded(false);
    return;
  }
  loadComments(postId, container, me);
  setLoaded(true);
}

async function loadComments(postId, container, me) {
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'text-xs text-muted' }, '댓글 로딩 중...'));

  try {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    container.innerHTML = '';

    const commentList = el('div', { class: 'comment-list' });
    snap.forEach(cs => {
      const cd = cs.data();
      const canDel = isAdminRole(me.role) || cd.authorUid === me.uid;
      commentList.appendChild(el('div', { class: 'comment-item' },
        el('div', { class: 'flex items-center justify-between' },
          el('div', { class: 'comment-author' }, cd.authorName || '익명'),
          canDel ? el('button', { class: 'btn btn-danger btn-xs',
            onclick: () => handleDeleteComment(postId, cs.id, container, me),
          }, '✕') : null,
        ),
        el('div', { class: 'comment-text' }, cd.content || ''),
      ));
    });

    if (snap.empty) {
      commentList.appendChild(el('p', { class: 'text-xs text-muted' }, '댓글이 없습니다.'));
    }

    const input   = el('input', { type: 'text', placeholder: '댓글 입력...', onclick: e => e.stopPropagation() });
    const postBtn = el('button', { class: 'btn btn-primary btn-sm', onclick: e => e.stopPropagation() }, '등록');

    postBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
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
        await loadComments(postId, container, me);
      } catch (err) {
        console.error(err);
        toast('댓글 등록 중 오류가 발생했습니다.', 'error');
      } finally {
        postBtn.disabled = false;
      }
    });

    container.appendChild(commentList);
    container.appendChild(el('div', { class: 'comment-input-row', onclick: e => e.stopPropagation() }, input, postBtn));
  } catch (err) {
    console.error(err);
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'text-xs text-muted' }, '댓글을 불러오지 못했습니다.'));
  }
}

async function handleDeletePost(id) {
  if (!confirmDialog('게시글을 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'posts', id));
    toast('삭제되었습니다.', 'success');
  } catch (err) {
    console.error(err);
    toast('삭제 중 오류가 발생했습니다.', 'error');
  }
}

async function handleDeleteComment(postId, commentId, container, me) {
  if (!confirmDialog('댓글을 삭제하시겠습니까?')) return;
  try {
    await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
    await loadComments(postId, container, me);
    toast('삭제되었습니다.', 'success');
  } catch (err) {
    console.error(err);
    toast('삭제 중 오류가 발생했습니다.', 'error');
  }
}
