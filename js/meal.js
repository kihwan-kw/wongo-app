// js/meal.js — 급식 탭

import { el, emptyState, loadingSpinner, formatYMD } from "./utils.js";

let currentWeekOffset = 0;

export function renderMeal(container, me) {
  container.innerHTML = '';
  currentWeekOffset = 0;
  buildMealView(container);
}

export function unmountMeal() {
  // stateless (no onSnapshot), nothing to clean up
}

function getWeekDates(offset = 0) {
  const today = new Date();
  const day   = today.getDay(); // 0=일
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);

  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function toYMD(date) {
  return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
}

function buildMealView(container) {
  container.innerHTML = '';

  const dates = getWeekDates(currentWeekOffset);
  const fromYMD = toYMD(dates[0]);
  const toYMD2  = toYMD(dates[4]);

  const weekLabel = el('span', { class: 'meal-date-label' },
    `${dates[0].getMonth()+1}/${dates[0].getDate()} ~ ${dates[4].getMonth()+1}/${dates[4].getDate()}`
  );

  const prevBtn = el('button', { class: 'btn btn-outline btn-sm', onclick: () => { currentWeekOffset--; buildMealView(container); } }, '◀ 이전 주');
  const nextBtn = el('button', { class: 'btn btn-outline btn-sm', onclick: () => { currentWeekOffset++; buildMealView(container); } }, '다음 주 ▶');

  container.appendChild(el('div', { class: 'meal-nav' }, prevBtn, weekLabel, nextBtn));

  const grid = el('div', { class: 'meal-grid' });
  const spinner = loadingSpinner();
  container.appendChild(spinner);

  fetchMeal(fromYMD, toYMD2).then(mealMap => {
    spinner.remove();

    const dayNames = ['월','화','수','목','금'];
    const todayYmd = toYMD(new Date());

    dates.forEach((date, i) => {
      const ymd  = toYMD(date);
      const menu = mealMap[ymd];
      const isToday = (ymd === todayYmd);
      
      const menuContainer = el('div', { class: 'meal-card-menu' });
      if (menu) {
        menuContainer.innerHTML = menu; // 나이스 API의 <br/> 태그 처리
      } else {
        menuContainer.appendChild(el('span', { class: 'text-muted text-sm' }, '급식 없음'));
      }

      const card = el('div', { class: `meal-card ${isToday ? 'today-meal' : ''}` },
        el('div', { class: 'meal-card-date' }, 
          `${date.getMonth()+1}/${date.getDate()} (${dayNames[i]})` + (isToday ? ' - 오늘' : '')
        ),
        menuContainer
      );
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }).catch(err => {
    console.error(err);
    spinner.remove();
    container.appendChild(emptyState('🍱', '급식 정보를 불러오지 못했습니다.\n네트워크 또는 API 설정을 확인해주세요.'));
  });
}

// 나이스 API 설정 (원주고등학교)
const NEIS_API_KEY = ''; // 발급받은 키가 있다면 여기에 넣으세요. (없어도 조회는 가능합니다)
const ATPT_OFCDC_SC_CODE = 'K10'; // 강원특별자치도교육청
const SD_SCHUL_CODE = '7801164'; // 원주고등학교

async function fetchMeal(from, to) {
  let url = `https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=${ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${SD_SCHUL_CODE}&MLSV_FROM_YMD=${from}&MLSV_TO_YMD=${to}`;
  if (NEIS_API_KEY) {
    url += `&KEY=${NEIS_API_KEY}`;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  
  const map = {};
  if (data.mealServiceDietInfo && data.mealServiceDietInfo[1].row) {
    data.mealServiceDietInfo[1].row.forEach(m => {
      // 메뉴 데이터 정리 (가독성을 위해 알레르기 번호 제거)
      let menu = m.DDISH_NM.replace(/\([\d\.]+\)/g, '');
      map[m.MLSV_YMD] = menu;
    });
  }
  return map;
}
