# 아수라장 내전 오버레이

칼바람 내전 홈페이지(https://sohada2.github.io/aram/)의 **인게임 오버레이** 데스크톱 앱.
롤 게임/클라이언트 옆에 **팀 배정·참가자 명단·MVP 투표·정산**을 띄운다. 홈페이지·브릿지와 **같은 Firebase**로 실시간 연동 — 앱을 켠 사람은 오버레이로, 안 켠 사람은 홈페이지로 보며 서로 동기화된다.

---

## 🎮 팀원용 — 한 번 설치 → 이후 자동 업데이트

1. [**Releases**](https://github.com/SOHADA2/aram-overlay/releases/latest) 에서 **`아수라장내전-Setup-X.X.X.exe`** 받기 (또는 진행자가 전달)
2. 더블클릭 → 자동 설치(바탕화면 바로가기 생성)
3. 롤을 켜면 오버레이가 **클라이언트 오른쪽에 자동으로** 붙는다

- **🔄 자동 업데이트**: 새 버전이 나오면 앱이 **알아서 받아서 다음 실행 때 적용**된다(또는 트레이 → 「🔄 지금 업데이트」). 팀원은 재설치 불필요.
- **입장**: 처음 화면에서 본인 닉네임(홈페이지 등록명) 선택 → 입장
- **끄기**: 트레이 아이콘(작업표시줄 우하단) 우클릭 → 종료. 창을 닫아도 트레이에 상주.
- **단축키**: `Shift+F5` 오버레이 토글 · `Shift+F6` 홈페이지 오버레이
- ⚠️ 처음 설치 시 Windows 보안 경고(SmartScreen) → **「추가 정보 → 실행」**(서명 없는 무료 앱이라 정상)
- ⚠️ 오버레이는 **테두리 없음(borderless) 창모드**에서 게임 위로 올라온다.

---

## 🛠️ 개발 / 배포 (진행자·개발용)

```bash
npm install        # 최초 1회
npm start          # 개발 실행(소스 그대로 — 자동 업데이트는 꺼짐)
```

### 새 버전 배포 = 태그 푸시 (GitHub Actions가 빌드·배포)
```bash
# 1) package.json version 올리기 (예: 0.1.0 → 0.1.1)
# 2) 커밋 후 태그 푸시
git commit -am "v0.1.1 …" && git tag v0.1.1 && git push origin master --tags
```
→ **GitHub Actions(windows 러너)가 자동으로** electron-builder 빌드 → **Releases에 Setup.exe + latest.yml 업로드** → 팀원 앱이 자동 감지·설치.
- ⚠️ **로컬 빌드는 electron-builder의 winCodeSign 심볼릭링크가 Windows 권한(개발자 모드) 없이 실패** → 그래서 **CI(GitHub Actions)에서 빌드**한다(러너는 권한 있음). 로컬 빌드가 꼭 필요하면 Windows 개발자 모드 ON 후 `npm run dist`.
- 자동 업데이트는 `electron-updater` + `build.publish=github(SOHADA2/aram-overlay)` 로 동작. `GH_TOKEN`은 Actions가 `secrets.GITHUB_TOKEN`으로 자동 주입.

### 구조
```
main.js        Electron 메인: 창·트레이·단축키 + Firebase/게임 폴링 + 팀짜기·투표·정산 + 자동 업데이트
preload.js     렌더러에 안전 API 노출(contextBridge)
teams.js       ⚔️ 팀 짜기 — 홈페이지 makeTeams 1:1 이식(승률 밸런스·관전자·전판 회피)
shared.css     두 창 공유 디자인 토큰(시즌2 웜블랙+골드·청록1팀/골드2팀)
overlay/ desktop/   인게임 오버레이 · 데스크톱 창(로그인·홈·팀 짜기)
assets/        아이콘(icon.png → gen-ico.mjs로 icon.ico 생성)
.github/workflows/release.yml   태그 → 빌드 → Releases
```

---

## 연동 방식 (핵심)

앱이 **홈페이지와 똑같은 Firebase `session` / `lastSettlement`** 를 읽고 쓴다 → 앱에서 한 팀 짜기·투표가 홈페이지 유저에게도 평소처럼 뜨고, 반대도 된다.

- **팀 짜기(방장)**: 아이템 15초 → 홈 `makeTeams`와 동일 페이로드로 `session` 기록 → 홈 유저는 아이템 타이머·팀 발표·관전 배팅이 자동 노출
- **투표**: MVP(상대팀)·매너왕(우리팀) → `session/mvp·manner`에 write → 홈에서 실시간 집계(확정·저장·정산은 라이브 계정이 처리)
- **정산**: `lastSettlement` 감지 → LP 변화·수상자 요약 표시
- **게임 명단/LP**: Live Client Data(127.0.0.1:2999) + Firebase `season2/players` 이름 매칭

## 다음 (미구현)
- riotId ↔ 홈페이지 닉네임 매핑(인게임 이름 ≠ 등록명 시 LP 매칭 실패)
- 정산 골드 델타 표시 · 관전 제외 UI
- 코드 서명(SmartScreen 경고 제거) · 자동 업데이트
