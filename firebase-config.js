// ─────────────────────────────────────────────────────────────
// 팜빌 활성화 PM · 환경 설정
// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"의 값을 붙여 넣으세요.
// (이 값들은 공개되어도 되는 웹 앱 식별자입니다. 데이터 보호는 firestore.rules가 담당합니다.)
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

export const APP = {
  // 로그인 방식
  //  "password" : 최초 1회 메일 인증 후 비밀번호 로그인 (무료 Spark 요금제로 충분)
  //  "link"     : 로그인할 때마다 메일로 로그인 링크 발송 (Spark는 하루 5통 제한 → Blaze 요금제 권장)
  authMode: "password",

  // 최고 관리자 메일 (firestore.rules의 SUPER_ADMINS와 반드시 같게 유지)
  superAdmins: ["ojungin@mcircle.biz"],

  // 업무 주관팀 기본 목록 (화면에서 직접 입력도 가능)
  defaultTeams: ["콘텐츠운영팀", "개발팀", "마케팅팀", "영업팀", "디자인팀", "CH본부", "더샵", "제로샵"],
};
