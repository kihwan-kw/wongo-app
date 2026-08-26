// js/auth.js — 인증 (회원가입/로그인/로그아웃)

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toast } from "./utils.js";

// ── 익명 별명 생성 ──────────────────────────────────────
const ADJECTIVES = ['용감한','씩씩한','밝은','날쌘','현명한','따뜻한','차분한','활발한','다정한','신중한'];
const ANIMALS    = ['호랑이','독수리','여우','토끼','사자','늑대','고래','판다','펭귄','다람쥐'];
function randomAnonName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a} ${b}${n}`;
}

// ── 회원가입 ────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  const btn = document.getElementById('signup-submit-btn');
  btn.disabled = true;
  btn.textContent = '처리 중...';

  const name      = document.getElementById('signup-name').value.trim();
  const studentId = document.getElementById('signup-studentId').value.trim();
  const grade     = document.getElementById('signup-grade').value;
  const classNum  = document.getElementById('signup-class').value;
  const number    = document.getElementById('signup-number').value;
  const email     = document.getElementById('signup-email').value.trim();
  const password  = document.getElementById('signup-password').value;

  if (!name || !studentId || !grade || !classNum || !number) {
    toast('모든 항목을 입력해주세요.', 'error');
    btn.disabled = false; btn.textContent = '가입 신청';
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;
    await setDoc(doc(db, 'users', uid), {
      name, studentId,
      grade:     Number(grade),
      classNum:  Number(classNum),
      number:    Number(number),
      email,
      role:           'student',
      status:         'pending',
      department:     null,
      anonName:       randomAnonName(),
      managedClubIds: [],
      createdAt:      serverTimestamp(),
    });
    toast('가입 신청이 완료되었습니다. 승인을 기다려주세요.', 'success');
  } catch (err) {
    console.error(err);
    toast(friendlyAuthError(err.code), 'error');
    btn.disabled = false; btn.textContent = '가입 신청';
  }
}

// ── 로그인 ──────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true;
  btn.textContent = '로그인 중...';

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    // 브라우저를 닫아도 로그인 유지 (localStorage 기반)
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    toast(friendlyAuthError(err.code), 'error');
    btn.disabled = false; btn.textContent = '로그인';
  }
}

// ── 비밀번호 초기화 이메일 발송 (관리자 전용) ──────────
export async function sendPasswordReset(email, name) {
  try {
    await sendPasswordResetEmail(auth, email);
    toast(`${name}님 이메일(${email})로 비밀번호 재설정 링크를 발송했습니다.`, 'success');
  } catch (err) {
    console.error(err);
    const code = err.code;
    if (code === 'auth/user-not-found') {
      toast('해당 이메일로 등록된 계정이 없습니다.', 'error');
    } else {
      toast(`발송 실패: ${code}`, 'error');
    }
  }
}

// ── 로그아웃 ────────────────────────────────────────────
export async function handleLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    toast('로그아웃 중 오류가 발생했습니다.', 'error');
  }
}

// ── 친절한 에러 메시지 ──────────────────────────────────
function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':   '이미 사용 중인 이메일입니다.',
    'auth/invalid-email':          '올바르지 않은 이메일 형식입니다.',
    'auth/weak-password':          '비밀번호는 6자 이상이어야 합니다.',
    'auth/user-not-found':         '등록되지 않은 이메일입니다.',
    'auth/wrong-password':         '비밀번호가 올바르지 않습니다.',
    'auth/invalid-credential':     '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests':      '잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
  };
  return map[code] || `오류가 발생했습니다. (${code})`;
}

// ── 폼 전환 ─────────────────────────────────────────────
function showSignup() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.remove('hidden');
}
function showLogin() {
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
}

// ── 사용자 정보 가져오기 ────────────────────────────────
export async function fetchUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

// ── Auth 초기화 (app.js에서 호출) ──────────────────────
export function initAuth(onUser) {
  // 폼 이벤트
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('show-signup').addEventListener('click', showSignup);
  document.getElementById('show-login').addEventListener('click', showLogin);

  // 테스트 계정 빠른 로그인
  document.getElementById('test-login-btn').addEventListener('click', async () => {
    const emailInput    = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    emailInput.value    = 'test123@test.com';
    passwordInput.value = 'test123';
    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.textContent = '로그인 중...';
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, 'test123@test.com', 'test123');
    } catch (err) {
      console.error(err);
      toast(friendlyAuthError(err.code), 'error');
      btn.disabled = false;
      btn.textContent = '로그인';
    }
  });

  let unsubUser = null;
  // Auth 상태 변화 감지
  return onAuthStateChanged(auth, (user) => {
    if (unsubUser) {
      unsubUser();
      unsubUser = null;
    }
    if (!user) {
      onUser(null);
      return;
    }
    
    // 실시간 사용자 정보 연동
    unsubUser = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (!snap.exists()) {
        onUser(null);
      } else {
        onUser({ uid: user.uid, ...snap.data() });
      }
    }, (err) => {
      console.error('사용자 정보 실시간 조회 실패:', err);
      onUser(null);
    });
  });
}

