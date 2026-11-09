// ─────────────────────────────────────────────────────────────
// 팜빌 활성화 PM · 환경 설정
// Supabase 대시보드 → Project Settings → API(Data API / API Keys)의 값을 넣으세요.
// anon(publishable) 키는 공개되어도 되는 키입니다. 데이터 보호는 supabase-setup.sql의 RLS가 담당합니다.
// service_role(secret) 키는 절대 넣지 마세요.
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = "https://keamsvxqrtdfnibutcwr.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlYW1zdnhxcnRkZm5pYnV0Y3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDEzMzIsImV4cCI6MjEwOTc3NzMzMn0.G6t1zs0DVDWOZ6Gcs6T9zAqz4Zo6pDiUPhfwc-ECwUE";

export const APP = {
  // 최고 관리자 메일 (supabase-setup.sql의 super_admins()와 반드시 같게 유지)
  superAdmins: ["ojungin@mcircle.biz"],

  // 업무 주관팀 기본 목록 (화면에서 직접 입력도 가능)
  defaultTeams: ["콘텐츠운영팀", "개발팀", "마케팅팀", "영업팀", "디자인팀", "CH본부", "더샵", "제로샵"],
};
