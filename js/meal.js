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
    dates.forEach((date, i) => {
      const ymd  = toYMD(date);
      const menu = mealMap[ymd];
      const card = el('div', { class: 'meal-card' },
        el('div', { class: 'meal-card-date' }, `${date.getMonth()+1}/${date.getDate()} (${dayNames[i]})`),
        el('div', { class: 'meal-card-menu' },
          menu ? menu : el('span', { class: 'text-muted text-sm' }, '급식 없음')
        ),
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

async function fetchMeal(from, to) {
  const res = await fetch(`/api/meal?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // data.meals: [{ date: 'YYYYMMDD', menu: '...' }]
  const map = {};
  (data.meals || []).forEach(m => { map[m.date] = m.menu; });
  return map;
}
