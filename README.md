# 팜빌 활성화 PM

엠서클 닥터빌 · 팜빌 활성화 프로젝트를 마일스톤 형태로 관리하는 웹앱입니다.
GitHub Pages(화면) + Firebase(로그인·메일 인증·데이터)로 동작하며 서버 운영이 필요 없습니다.

## 주요 기능
- 프로젝트 등록: 프로젝트명, 우선순위, 업무 주관팀, 특이사항, 목표일정(시작~목표일), 상태
- 세부업무: 프로젝트 하위에 추가, 목표일은 **프로젝트 기간 안에서만** 선택 (보안 규칙에서도 강제)
- 마일스톤 보드: 프로젝트 기간 막대 + 세부업무 목표일 ◆ + 오늘선 + 지연 표시
- 수정·삭제 시 **사유 필수**, 변경 전/후 값과 함께 이력 기록 (이력은 수정·삭제 불가)
- 로그인: **관리자가 등록한 계정만** 메일 인증 후 로그인 (도메인 제한 없음)
- 계정 관리: 등록 / 사용 중지 / 관리자 지정 / 삭제

## 파일 구성
| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 |
| `app.js` | 동작 로직 |
| `firebase-config.js` | **Firebase 프로젝트 값, 로그인 방식, 최고 관리자, 주관팀 목록** |
| `firestore.rules` | 데이터 보안 규칙 (Firebase 콘솔에 붙여넣기) |

## 최초 설정 (약 15분)

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → **프로젝트 추가** (예: `pharmville-pm`)
2. 프로젝트 개요 → **웹 앱 추가(</>)** → 앱 닉네임 입력 → 표시되는 `firebaseConfig` 값을
   `firebase-config.js`의 `firebaseConfig`에 붙여넣기

### 2. 로그인(메일 인증) 켜기
1. **Authentication → 시작하기 → Sign-in method**
2. **이메일/비밀번호** 사용 설정
   - `authMode: "link"`(매번 메일 링크 로그인)를 쓸 경우 **이메일 링크(비밀번호가 없는 로그인)** 도 사용 설정
3. **Authentication → 설정 → 승인된 도메인**에 GitHub Pages 주소 추가
   예: `doctorville.github.io` (GitHub 사용자명 기준)
4. **Authentication → 템플릿**에서 템플릿 언어 **한국어**, 보낸사람 이름 `팜빌 활성화 PM` 설정 (선택)

### 3. 데이터베이스 만들기
1. **Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**
2. **규칙** 탭에 `firestore.rules` 내용 전체를 붙여넣고 **게시**

### 4. GitHub Pages 배포
1. 저장소 **Settings → Pages → Build and deployment**
2. Source: `Deploy from a branch`, Branch: `main` / `/(root)` → Save
3. 1~2분 뒤 `https://doctorville.github.io/pharmville-pm/` 으로 접속

### 5. 최고 관리자 첫 로그인
1. 접속 → **계정 활성화(최초 1회)** → `ojungin@mcircle.biz` + 비밀번호 입력
2. 받은 인증 메일의 링크 클릭 → 화면에서 **인증 완료**
3. 상단 **계정 관리**에서 팀원 계정 등록 → 팀원은 같은 방법으로 계정 활성화

## 로그인 방식 선택 (`firebase-config.js` → `authMode`)
| 방식 | 동작 | 요금제 |
| --- | --- | --- |
| `"password"` (기본) | 최초 1회 메일 인증 후 비밀번호 로그인. 비밀번호 분실 시 재설정 메일 | 무료(Spark): 인증 메일 1,000통/일, 재설정 150통/일 |
| `"link"` | 로그인할 때마다 메일로 로그인 링크 발송 | Spark는 **하루 5통** 제한 → Blaze(종량제) 필요, 이 규모에서는 실사용 비용 거의 0원 |

> Firebase 메일 발송 한도는 Firebase 정책에 따라 바뀔 수 있습니다. (2026-11 기준 Firebase Authentication 한도 문서)

## 최고 관리자 변경
`firebase-config.js`의 `superAdmins`와 `firestore.rules`의 `SUPER_ADMINS()`를 **둘 다** 고친 뒤,
규칙은 Firebase 콘솔에서 다시 게시합니다. 최고 관리자는 계정 관리 화면에서 중지·삭제할 수 없습니다.

## 보안 메모
- `firebase-config.js`의 값은 공개되어도 되는 웹 앱 식별자입니다. 데이터 보호는 `firestore.rules`가 담당합니다.
- 등록·사용 상태가 아닌 계정, 메일 인증을 마치지 않은 계정은 데이터에 접근할 수 없습니다.
- 계정 삭제·중지 시 데이터 접근은 즉시 차단됩니다. (Firebase Authentication의 사용자 기록은 콘솔에서 별도 삭제 가능)
- 협력사 계약 조건·전략 방향 등 민감 정보 입력 전에는 사내 규정에 따른 사전 승인이 필요합니다.
