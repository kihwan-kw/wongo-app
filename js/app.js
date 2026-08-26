// js/app.js — 홈 카드 그리드 & 섹션 라우터

import { initAuth, handleLogout } from "./auth.js";
import { isAdminRole, ROLE_LABEL } from "./utils.js";

import { renderNotices, unmountNotices } from "./notices.js";
import { renderSuggestions, unmountSuggestions } from "./suggestions.js";
import { renderBoard, unmountBoard } from "./board.js";
import { renderMeal, unmountMeal } from "./meal.js";
import { renderSchedule, unmountSchedule } from "./schedule.js";
import { renderClubs, unmountClubs } from "./clubs.js";
import { renderPolls, unmountPolls } from "./polls.js";
import { renderFaq, unmountFaq } from "./faq.js";
import { renderSocoop, unmountSocoop } from "./socoop.js";
import { renderAdmin, unmountAdmin } from "./admin.js";

// ── 섹션 정의 (아이콘 · 색상 · 렌더러) ─────────────────
const SECTIONS = [
  { id: 'notices', icon: '📢', label: '공지사항', color: 'linear-gradient(145deg,#BFDBFE,#93C5FD)', mount: renderNotices, unmount: unmountNotices, visible: () => true },
  { id: 'suggestions', icon: '📬', label: '건의함', color: 'linear-gradient(145deg,#DDD6FE,#C4B5FD)', mount: renderSuggestions, unmount: unmountSuggestions, visible: () => true },
  { id: 'board', icon: '💬', label: '익명게시판', color: 'linear-gradient(145deg,#FED7AA,#FDBA74)', mount: renderBoard, unmount: unmountBoard, visible: () => true },
  { id: 'meal', icon: '🍱', label: '급식', color: 'linear-gradient(145deg,#A7F3D0,#6EE7B7)', mount: renderMeal, unmount: unmountMeal, visible: () => true },
  { id: 'schedule', icon: '📅', label: '학사일정', color: 'linear-gradient(145deg,#C7D2FE,#A5B4FC)', mount: renderSchedule, unmount: unmountSchedule, visible: () => true },
  { id: 'clubs', icon: '🎯', label: '동아리', color: 'linear-gradient(145deg,#FDE68A,#FCD34D)', mount: renderClubs, unmount: unmountClubs, visible: () => true },
  { id: 'polls', icon: '📊', label: '설문/투표', color: 'linear-gradient(145deg,#A5F3FC,#67E8F9)', mount: renderPolls, unmount: unmountPolls, visible: () => true },
  { id: 'socoop', icon: '🏪', label: '소쿱놀이(매점/카페)', color: 'linear-gradient(145deg,#FDA4AF,#FB7185)', mount: renderSocoop, unmount: unmountSocoop, visible: () => true },
  { id: 'faq', icon: '❓', label: 'FAQ', color: 'linear-gradient(145deg,#FBCFE8,#F9A8D4)', mount: renderFaq, unmount: unmountFaq, visible: () => true },
  { id: 'admin', icon: '⚙️', label: '관리자', color: 'linear-gradient(145deg,#E2E8F0,#CBD5E1)', mount: renderAdmin, unmount: unmountAdmin, visible: (me) => isAdminRole(me?.role) },
];

// ── 상태 ────────────────────────────────────────────────
let currentSection = null;
let currentMe = null;

// ── DOM 참조 ────────────────────────────────────────────
const authOverlay = document.getElementById('auth-overlay');
const pendingScreen = document.getElementById('pending-screen');
const appEl = document.getElementById('app');
const homeScreen = document.getElementById('home-screen');
const tabContent = document.getElementById('tab-content');
const backBtn = document.getElementById('back-btn');
const headerLogo = document.getElementById('header-logo');
const headerTitle = document.getElementById('header-title');
const headerUserInfo = document.getElementById('header-user-info');

// ── 화면 전환 (auth / pending / app) ───────────────────
function showScreen(screen) {
  authOverlay.classList.add('hidden');
  pendingScreen.classList.add('hidden');
  appEl.classList.add('hidden');

  if (screen === 'auth') authOverlay.classList.remove('hidden');
  if (screen === 'pending') pendingScreen.classList.remove('hidden');
  if (screen === 'app') appEl.classList.remove('hidden');
}

// ── 홈 UI 적용 (순수 UI, 히스토리 조작 없음) ────────────
function _applyHomeUI() {
  if (currentSection) {
    const prev = SECTIONS.find(s => s.id === currentSection);
    if (prev) prev.unmount();
    currentSection = null;
  }
  tabContent.innerHTML = '';
  tabContent.classList.add('hidden');
  homeScreen.classList.remove('hidden');
  backBtn.classList.add('hidden');
  headerLogo.style.display = '';
  headerTitle.textContent = '원주고 앱';
}

// ── 홈 화면으로 이동 (헤더 뒤로가기 버튼 전용) ───────
function showHome() {
  if (currentSection) {
    history.back();
  }
}

// ── 섹션 열기 ────────────────────────────────────
function openSection(id) {
  if (currentSection) {
    const prev = SECTIONS.find(s => s.id === currentSection);
    if (prev) prev.unmount();
  }
  currentSection = id;

  history.pushState({ section: id }, '');

  homeScreen.classList.add('hidden');
  tabContent.innerHTML = '';
  tabContent.classList.remove('hidden');

  const sec = SECTIONS.find(s => s.id === id);
  if (!sec) return;

  backBtn.classList.remove('hidden');
  headerLogo.style.display = 'none';
  headerTitle.textContent = `${sec.icon} ${sec.label}`;

  sec.mount(tabContent, currentMe);
}

// ── 구글 앱스 스크립트 연동 URL (배포 후 변경) ─────────
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwlwLbjHj7yqPh0GFQAC0C2ZRRyfsstoUo3Vi-9YqpHL6I7WR6EBvZL0VnVDXEke0kmrw/exec';

// ── 홈 화면 빌드 (카드 그리드) ─────────────────────────
function buildHomeScreen(me) {
  homeScreen.innerHTML = '';

  // 인사말 배너 + 위반 횟수
  const greeting = document.createElement('div');
  greeting.className = 'home-greeting';
  const role = ROLE_LABEL[me.role] || '';
  greeting.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; position:relative; z-index:1;">
      <p class="home-greeting-sub" style="margin-bottom:0;">원주고등학교 · ${role}</p>
      <div id="violation-badge" style="background:rgba(255,255,255,0.2); padding:5px 12px; border-radius:12px; font-size:0.8rem; font-weight:700; display:flex; align-items:center; gap:4px; white-space:nowrap;">
        <span style="font-size:0.9rem">🚨</span> 조회 중...
      </div>
    </div>
    <div style="position:relative; z-index:1;">
      <p class="home-greeting-name" style="word-break:keep-all;">${me.name}님,<br/>안녕하세요! 👋</p>
    </div>
  `;
  homeScreen.appendChild(greeting);

  // 구글 앱스 스크립트에서 위반 횟수 가져오기
  if (me.email === 'test123@test.com') {
    // 💡 테스트 계정일 경우 화면을 확인하기 위해 가짜 데이터를 띄워줍니다.
    setTimeout(() => {
      const badge = document.getElementById('violation-badge');
      if (badge) {
        badge.innerHTML = `<span style="font-size:0.9rem">🚨</span> 누적 위반: 3회 (테스트)`;
        badge.style.background = 'rgba(239,68,68,0.9)';
      }
    }, 500);
  } else if (GAS_API_URL && GAS_API_URL.startsWith('http')) {
    const url = `${GAS_API_URL}?action=getViolationCount&studentName=${encodeURIComponent(me.name)}&grade=${me.grade}&classNum=${me.classNum}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const badge = document.getElementById('violation-badge');
        if (badge) {
          badge.innerHTML = `<span style="font-size:0.9rem">🚨</span> 누적 위반: ${data.total || 0}회`;
          if (data.total > 0) {
            badge.style.background = 'rgba(239,68,68,0.9)'; // 빨간색 알림
          }
        }
      })
      .catch(err => {
        console.error('위반 횟수 조회 실패:', err);
        const badge = document.getElementById('violation-badge');
        if (badge) badge.style.display = 'none';
      });
  } else {
    // API URL이 설정되지 않은 경우 배지 숨김
    const badge = document.getElementById('violation-badge');
    if (badge) badge.style.display = 'none';
  }

  // 카드 그리드
  const grid = document.createElement('div');
  grid.className = 'home-grid';

  SECTIONS.forEach(sec => {
    if (!sec.visible(me)) return;

    const card = document.createElement('button');
    card.className = 'home-card';
    card.style.background = sec.color;
    card.setAttribute('aria-label', sec.label);

    const iconEl = document.createElement('span');
    iconEl.className = 'home-card-icon';
    iconEl.textContent = sec.icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'home-card-label';
    labelEl.textContent = sec.label;

    card.appendChild(iconEl);
    card.appendChild(labelEl);
    card.addEventListener('click', () => openSection(sec.id));
    grid.appendChild(card);
  });

  homeScreen.appendChild(grid);
}

// ── 헤더 사용자 정보 ────────────────────────────────────
function updateHeaderUser(me) {
  if (!me) { headerUserInfo.textContent = ''; return; }
  // 모바일에서 짧게 표시
  headerUserInfo.textContent = `${me.name}`;
}

// ── 인증 상태 처리 ──────────────────────────────────────
function handleAuthState(me) {
  if (!me) {
    currentMe = null;
    if (currentSection) {
      SECTIONS.find(s => s.id === currentSection)?.unmount();
      currentSection = null;
    }
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
    alert('가입 신청이 거절되었습니다. 학생자치회에 문의해주세요.');
    handleLogout();
    return;
  }

  // approved
  showScreen('app');
  // 앱 진입 시 홈 상태를 히스토리에 기록 (브라우저 이전 페이지로 나가는 것 방지)
  history.replaceState({ section: null }, '');
  buildHomeScreen(me);

  // 현재 섹션이 유효하면 유지, 아니면 홈으로
  if (currentSection && SECTIONS.find(s => s.id === currentSection && s.visible(me))) {
    openSection(currentSection);
  } else {
    _applyHomeUI(); // 히스토리 조작 없이 UI만 홈으로
  }
}

// ── 헤더 뒤로가기 버튼 → history.back() → popstate ──────
backBtn.addEventListener('click', () => {
  if (currentSection) history.back();
});

// ── Android / 브라우저 뒤로가기 버튼 (popstate) ───────────
window.addEventListener('popstate', () => {
  if (currentSection) {
    _applyHomeUI();
  }
});

// ── 앱 시작 ─────────────────────────────────────────────
initAuth(handleAuthState);
document.getElementById('logout-btn').addEventListener('click', handleLogout);
document.getElementById('pending-logout-btn').addEventListener('click', handleLogout);
