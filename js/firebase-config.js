// js/firebase-config.js
// ──────────────────────────────────────────────────────
// Firebase SDK (v9 compat CDN을 통해 import)
// 실제 배포 시 아래 firebaseConfig 값을 Firebase 콘솔의 프로젝트 설정에서 복사해 교체하세요.
// ──────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⚠️  여기에 실제 Firebase 프로젝트 설정값을 입력하세요
const firebaseConfig = {
  apiKey: "AIzaSyA75Pa6mpUyBfZtbRvqix4U98HSaO8sAoI",
  authDomain: "wongo-app.firebaseapp.com",
  projectId: "wongo-app",
  storageBucket: "wongo-app.firebasestorage.app",
  messagingSenderId: "677127003375",
  appId: "1:677127003375:web:9d39be1a45f935f3984f1a",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
