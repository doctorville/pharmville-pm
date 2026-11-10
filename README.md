# 팜빌 활성화 PM

엠서클 닥터빌 · 팜빌 활성화 프로젝트를 마일스톤 형태로 관리하는 웹앱입니다.
GitHub Pages(화면) + Supabase(로그인·메일 인증·데이터)로 동작하며 별도 서버 운영이 필요 없습니다.

- 접속 주소: https://doctorville.github.io/pharmville-pm/

## 주요 기능
- 프로젝트 등록: 프로젝트명, 우선순위, 업무 주관팀, 특이사항, 목표일정(시작~목표일), 상태
- 세부업무: 프로젝트 하위에 추가, 목표일은 **프로젝트 기간 안에서만** 선택 (DB에서도 강제)
- 마일스톤 보드: 프로젝트 기간 막대 + 세부업무 목표일 ◆ + 오늘선 + 지연 표시
- 수정·삭제 시 **사유 필수**(DB에서도 강제), 변경 전/후 값과 함께 이력 기록 — 이력은 수정·삭제 불가
- 로그인: **관리자가 등록한 계정만** 메일로 받은 인증코드(또는 로그인 링크)로 로그인, 도메인 제한 없음
- 첨부파일·참고 URL: 프로젝트·세부업무 등록/수정 화면과 상세 화면에서 추가 (파일당 20MB, 비공개 저장), 삭제 시 사유 필수·이력 기록
- 계정 관리: 등록 / 사용 중지 / 관리자 지정 / 삭제
- Excel 백업: 상단 "Excel 백업" 버튼으로 요약·프로젝트·세부업무·수정이력·첨부목록(관리자는 계정 포함) 시트를 .xlsx로 내려받기

## 파일 구성
| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 |
| `app.js` | 동작 로직 |
| `supabase-config.js` | **Supabase 주소·anon 키, 최고 관리자, 주관팀 목록** |
| `supabase-setup.sql` | DB 테이블·보안 규칙(RLS)·가입 차단·사유 강제 (SQL Editor에서 1회 실행) |
| `supabase-attachments.sql` | 첨부파일·참고 URL 테이블과 파일 저장소(Storage) 설정 (setup 다음에 1회 실행) |

## 최초 설정

### 1. Supabase 프로젝트 만들기
1. https://supabase.com → **Start your project** (GitHub 계정으로 로그인 가능)
2. **New project** → 이름 `pharmville-pm`, 리전 **Northeast Asia (Seoul)**, DB 비밀번호 설정
3. **SQL Editor** → 새 쿼리에 `supabase-setup.sql` 전체를 붙여 넣고 **Run**, 이어서 `supabase-attachments.sql`도 같은 방법으로 **Run**
4. **Project Settings → API**에서 `Project URL`과 `anon`(publishable) 키를 복사해 `supabase-config.js`에 입력
   - `service_role`(secret) 키는 절대 넣지 마세요.

### 2. 로그인(메일 인증) 설정
1. **Authentication → URL Configuration**
   - Site URL: `https://doctorville.github.io/pharmville-pm/`
   - Redirect URLs: `https://doctorville.github.io/pharmville-pm/**`
2. **Authentication → Sign In / Providers → Email**: Email 사용, **Confirm email** 켜짐 유지
3. **메일 발송(SMTP) 설정 — 필수**
   Supabase 기본 발송기는 **시간당 2통, 조직 구성원 메일로만** 발송되어 실사용이 불가합니다.
   **Authentication → Emails → SMTP Settings**에서 Custom SMTP를 켜고 아래 중 하나를 입력하세요.
   | 발송 계정 | Host / Port | 사용자 / 비밀번호 | 비고 |
   | --- | --- | --- | --- |
   | Gmail (doctorville123@gmail.com) | `smtp.gmail.com` / `465` | Gmail 주소 / **앱 비밀번호** | 2단계 인증 후 Google 계정 → 보안 → 앱 비밀번호 발급. 하루 약 500통 |
   | 네이버웍스 (회사 메일) | `smtp.worksmobile.com` / `465` | 회사 메일 / 메일 비밀번호(또는 앱 비밀번호) | 네이버웍스 관리자에서 외부 메일(SMTP) 사용 허용 필요 |
   그 다음 **Authentication → Rate Limits**에서 시간당 메일 발송 수를 필요한 만큼(예: 60) 올립니다.
4. **Authentication → Emails → Templates → Magic Link** 본문에 인증코드가 보이도록 수정 (선택, 권장)
   ```html
   <h2>팜빌 활성화 PM 로그인 인증</h2>
   <p>인증코드: <b style="font-size:24px;letter-spacing:4px">{{ .Token }}</b></p>
   <p>또는 <a href="{{ .ConfirmationURL }}">여기를 눌러 로그인</a></p>
   ```
   **Confirm signup** 템플릿도 같은 내용으로 바꾸면 첫 로그인 때도 코드로 들어올 수 있습니다.

### 3. 첫 로그인
1. https://doctorville.github.io/pharmville-pm/ 접속 → `ojungin@mcircle.biz` 입력 → 인증코드 받기
2. 메일의 코드를 입력(또는 링크 클릭)하면 로그인
3. 상단 **계정 관리**에서 팀원·협력사 계정 등록 → 등록된 사람은 같은 방법으로 로그인

## 보안 구조
- 등록되지 않은 메일은 로그인 계정 자체가 생성되지 않습니다(DB 트리거).
- 데이터 조회·수정은 등록·사용 상태 계정만 가능합니다(RLS).
- 수정·삭제 사유 누락, 세부업무 일정의 프로젝트 기간 이탈은 DB에서 거부됩니다.
- 이력(history)은 추가만 되고 수정·삭제 정책이 없어 변경할 수 없습니다.
- `supabase-config.js`의 anon 키는 공개되어도 되는 키이며, 실제 보호는 RLS가 담당합니다.

## 최고 관리자 변경
`supabase-config.js`의 `superAdmins`와 `supabase-setup.sql`의 `super_admins()`를 **둘 다** 수정하고,
`super_admins()` 함수 부분을 SQL Editor에서 다시 실행합니다. 최고 관리자는 화면에서 중지·삭제할 수 없습니다.

## 운영 메모
- 협력사 계약 조건·전략 방향 등 민감 정보 입력 전에는 사내 규정에 따른 사전 승인이 필요합니다.
- 유선·구두 합의로 일정을 바꿀 때는 수정 사유에 "통화 일자, 메일 확인 예정"처럼 근거를 남겨 주세요.
