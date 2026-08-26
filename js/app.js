// js/app.js — 탭 라우터 & 앱 진입점

import { initAuth, handleLogout } from "./auth.js";
import { isAdminRole, ROLE_LABEL } from "./utils.js";

import { renderNotices,    unmountNotices    } from "./notices.js";
import { renderSuggestions,unmountSuggestions} from "./suggestions.js";
import { renderBoard,      unmountBoard      } from "./board.js";
import { renderMeal,       unmountMeal       } from "./meal.js";
import { renderSchedule,   unmountSchedule   } from "./schedule.js";
import { renderClubs,      unmountClubs      } from "./clubs.js";
import { renderPolls,      unmountPolls      } from "./polls.js";
import { renderFaq,        unmountFaq        } from "./faq.js";
import { renderAdmin,      unmountAdmin      } from "./admin.js";

// ── 탭 정의 ─────────────────────────────────────────────
const TABS = [
  { id: 'notices',     icon: '📢', label: '공지',   mount: renderNotices,     unmount: unmountNotices,     visible: () => true },
  { id: 'suggestions', icon: '📬', label: '건의함', mount: renderSuggestions, unmount: unmountSuggestions, visible: () => true },
  { id: 'board',       icon: '💬', label: '익명',   mount: renderBoard,       unmount: unmountBoard,       visible: () => true },
  { id: 'meal',        icon: '🍱', label: '급식',   mount: renderMeal,        unmount: unmountMeal,        visible: () => true },
  { id: 'schedule',    icon: '📅', label: '학사일정', mount: renderSchedule,    unmount: unmountSchedule,    visible: () => true },
  { id: 'clubs',       icon: '🎯', label: '동아리', mount: renderClubs,       unmount: unmountClubs,       visible: () => true },
  { id: 'polls',       icon: '📊', label: '설문',   mount: renderPolls,       unmount: unmountPolls,       visible: () => true },
  { id: 'faq',         icon: '❓',  label: 'FAQ',    mount: renderFaq,         unmount: unmountFaq,         visible: () => true },
  { id: 'admin',       icon: '⚙️', label: '관리자', mount: renderAdmin,       unmount: unmountAdmin,       visible: (me) => isAdminRole(me?.role) },
];

// ── 상태 ────────────────────────────────────────────────
let currentTab    = null;
let currentMe     = null;

// ── 화면 제어 ───────────────────────────────────────────
const authOverlay    = document.getElementById('auth-overlay');
const pendingScreen  = document.getElementById('pending-screen');
const appEl          = document.getElementById('app');
const tabNav         = document.getElementById('tab-nav');
const tabContent     = document.getElementById('tab-content');
const headerUserInfo = document.getElementById('header-user-info');

function showScreen(screen) {
  authOverlay.classList.add('hidden');
  pendingScreen.classList.add('hidden');
  appEl.classList.add('hidden');

  if (screen === 'auth')    authOverlay.classList.remove('hidden');
  if (screen === 'pending') pendingScreen.classList.remove('hidden');
  if (screen === 'app')     appEl.classList.remove('hidden');
}

// ── 탭 전환 ─────────────────────────────────────────────
function switchTab(id) {
  // 현재 탭 unmount
  if (currentTab) {
    const prev = TABS.find(t => t.id === currentTab);
    if (prev) prev.unmount();
    const prevBtn = tabNav.querySelector(`[data-tab="${currentTab}"]`);
    if (prevBtn) prevBtn.classList.remove('active');
  }

  // 새 탭 mount
  tabContent.innerHTML = '';
  currentTab = id;

  const tab = TABS.find(t => t.id === id);
  if (!tab) return;

  const btn = tabNav.querySelector(`[data-tab="${id}"]`);
  if (btn) {
    btn.classList.add('active');
    btn.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
  }

  tab.mount(tabContent, currentMe);
}

// ── 탭 네비게이션 구성 ──────────────────────────────────
function buildNav(me) {
  tabNav.innerHTML = '';
  TABS.forEach(tab => {
    if (!tab.visible(me)) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    // 이모지 span + 텍스트 span 세로 배치
    const iconEl = document.createElement('span');
    iconEl.className = 'tab-icon';
    iconEl.textContent = tab.icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'tab-label';
    labelEl.textContent = tab.label;
    btn.appendChild(iconEl);
    btn.appendChild(labelEl);
    btn.addEventListener('click', () => switchTab(tab.id));
    tabNav.appendChild(btn);
  });
}

// ── 헤더 사용자 정보 ────────────────────────────────────
function updateHeaderUser(me) {
  if (!me) { headerUserInfo.textContent = ''; return; }
  const roleLabel = ROLE_LABEL[me.role] || '';
  headerUserInfo.textContent = `${me.name} (${me.grade}학년 ${me.classNum}반 | ${roleLabel})`;
}

// ── 인증 상태 처리 ──────────────────────────────────────
function handleAuthState(me) {
  if (!me) {
    currentMe = null;
    currentTab && TABS.find(t => t.id === currentTab)?.unmount();
    currentTab = null;
    showScreen('auth');
    return;
  }

  currentMe = me;
  updateHeaderUser(me);

  if (me.status === 'pending') {
    showScreen('pending');
    return;
  }

  if (me.status === 'rejected') {
    showScreen('auth');
    // 거절 메시지는 auth 화면에 표시할 수 있지만 간단히 alert 사용
    alert('가입 신청이 거절되었습니다. 학생자치회에 문의해주세요.');
    handleLogout();
    return;
  }

  // approved
  showScreen('app');
  buildNav(me);

  // 현재 탭 유지하거나 첫 탭으로
  const firstTab = TABS.find(t => t.visible(me));
  if (!currentTab || !TABS.find(t => t.id === currentTab && t.visible(me))) {
    switchTab(firstTab?.id || 'notices');
  } else {
    // 역할이 바뀐 경우 탭 재렌더
    switchTab(currentTab);
  }
}

// ── 앱 시작 ─────────────────────────────────────────────
initAuth(handleAuthState);
