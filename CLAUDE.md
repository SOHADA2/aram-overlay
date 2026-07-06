# 아수라장 내전 오버레이 (aram-overlay)

## 개요
칼바람 내전 홈페이지(https://sohada2.github.io/aram/)의 **인게임 오버레이 데스크톱 앱**.
롤 클라이언트/게임 위에 **팀 배정·참가자 명단·(예정)투표·정산**을 띄운다. **Electron**(borderless) 기반.
- **가입/로그인/설치 관문 없음** — VBS 더블클릭으로 실행 (Overwolf는 계정·광고 강제라 포기하고 Electron으로 감)
- **홈페이지·브릿지와 같은 Firebase 공유** → 앱 켠 사람=오버레이 / 안 켠 사람=홈페이지, 자동 연동
- 리포: 로컬 git (⚠️ GitHub 미푸시 상태일 수 있음 — 다른 PC에서 이어가려면 `SOHADA2/aram-overlay`로 push 필요)

## 실행
```bash
cd <경로>\aram-overlay
npm install            # 최초 1회(electron 내려받음·node_modules는 gitignore)
# 실행: 내전 오버레이.vbs 더블클릭(콘솔 없음) 또는 npm start / 내전 오버레이 실행.bat(디버그용)
```
끄기 = 트레이 아이콘 우클릭 → 종료.

## 현재 상태(구현됨)
- **창 3종**: 오버레이(투명·항상위·프레임없음)/데스크톱(로그인·홈)/홈페이지오버레이(webview로 실제 홈 임베드·Shift+F6)
- **데스크톱 = 게임 로그인 화면**: 히어로 배경+⚔️로고(Black Han Sans)+계정 선택 입장 → 방장 체크 → 상태
- **⚔️ 아이콘**: `make-icon.mjs`로 교차검 렌더(assets/icon.png 256·icon-tray 64)
- **롤 클라 우측 '바깥' 도킹(GGQ 스타일)**: PowerShell(FindWindow/GetWindowRect·네이티브모듈無)로 'League of Legends' 창 감지→DIP변환(scaleFactor)→클라 오른쪽 바깥에 스냅(2.5초 폴링). 화면밖이면 클램프. 트레이 체크박스 on/off. ✅실기확인=클라 817,223·1280×720·배율100%
- **팀 배정 뷰**(session 기반): 좌1팀(청록)/우2팀(골드) 카드·반응형(좁으면 세로스택)·LP배지·내팀 글로우·(나) 표시. Firebase `session` 3초 폴링→새 팀(teamsFormedAt 변경) 감지시 자동 표시
- **참가자 명단 뷰**(인게임 2999): Live Client Data playerlist→이름+챔프+팀색+LP
- **내 이름(입장 ID)**: 등록 players.json에서 선택·`config.myName` 저장(userData JSON). **방장** `config.isHost`
- **미리보기**: 데스크톱 「팀 배정 미리보기」=샘플 session, 「명단 미리보기」=샘플 players (게임/내전 없이 모양 확인)
- **🎨 공통 디자인 토큰(shared.css·2026-07-06)**: 청록1팀 #38d9c0/골드2팀 #e8c84a·Black Han Sans·JetBrains Mono·공통부품(.ui-card/.ui-btn-gold/.ui-btn-ghost/.ui-badge/.ui-lp/.t-blue/.t-red/.ui-scroll). overlay.html·desktop.html이 각자 CSS보다 먼저 로드. **새 화면은 이 토큰 재사용**(기존 화면 로컬 :root가 이겨 무회귀). 
- **💰 정산 뷰(오버레이·2026-07-06)**: 홈 finalizeVotes가 lastSettlement에 publish → main.js pollSettlement(3s)가 새 정산(publishedAt·10분 신선도) 감지 시 season2/players fresh fetch(정산 반영 후 LP)와 함께 오버레이로. 오버레이는 승/패 팀·**LP 변화**(s1LpBefore.lp→lpNow.lp 델타·배치/승급전 특수표시·티어 변동 화살표)·수상자(🏆MVP=mvpWinner/⭐SVP=mvpLoser/💎매너)·확인 버튼. 확인 시 localStorage(ovSeenSettle·matchKey 50개)로 중복 차단. ⚠️골드 델타는 페이로드에 없어(itemEffects 재계산 필요) 생략—LP·수상 요약 위주(상세는 홈). 뷰 우선순위 정산>투표>팀>명단. 검증: 실 lastSettlement 필드 대조·s1LpBefore 키=normName·LP 델타 6케이스 OK.
- **🗳️ MVP·매너왕 투표 뷰(오버레이·2026-07-06)**: 게임 끝나고 라이브가 승리팀 선택(session/manualEog) 또는 누가 투표 시작하면 오버레이에 투표 화면 자동 표시. MVP=상대팀에서·매너왕=우리팀(본인제외)에서 각 1명 → 「투표 확정」 → **홈페이지 castCombinedVote와 동일 경로**(session/mvp·manner/{team}Votes/{fbKey}=뽑힌 사람 원본 이름)에 write → 홈페이지 유저도 실시간 집계. 확정·저장·정산은 라이브 계정이 처리(오버레이는 votes write만). 이미 투표 시 결과+↩다시선택, 하단 1팀/2팀 투표 진행현황 칩.
- **시작 시 메인 화면 표시**(2026-07-06): VBS 런처 `sh.Run(...,0,..)`=SW_HIDE가 Electron 첫 창을 숨겨 트레이만 남던 것 → `createDesktop` `show:false`+`ready-to-show`서 `showDesktop()`(show+moveTop+focus) 강제. ✕닫기=트레이 상주(`app._quitting` 아니면 hide로 가로챔)·트레이 좌클릭/더블클릭/second-instance=메인 화면. `requestSingleInstanceLock`(중복 실행 방지).

## 아키텍처 (핵심 파일)
- `main.js` — Electron 메인: 창·트레이·전역단축키(Shift+F5 명단/F6 홈)·폴링(2999 게임·Firebase session/lp/players·클라도킹). HTTPS는 메인에서(렌더 CORS 회피). IPC로 렌더에 push.
- `preload.js` — contextBridge api(onPlayers/onState/onSession/onMyName·getPlayers/setMyName/setHost·homeToggle·previewOverlay/previewSession)
- `overlay/` — 인게임 오버레이(팀뷰+명단뷰 전환)
- `desktop/` — 로그인·홈 창
- `home/` — 실제 홈페이지 webview 임베드(보조)
- `assets/icon.png` · `make-icon.mjs`(아이콘 생성기)
- 실행: `내전 오버레이.vbs`(콘솔없음) / `내전 오버레이 실행.bat`(디버그)

## 데이터(홈페이지와 같은 Firebase·공개 read)
- `session` = 현재 팀 배정: `{active, teamA:[이름], teamB:[이름], teamSize, mode, teamsFormedAt, spectators, spectatorPickStartAt, mvp, manner, ...}` — 팀 짜면 홈페이지 `makeTeams`가 씀(index.html ~L16296·16422)
- `players` = 등록 플레이어(`{key:{name,...}}`)
- `season2/players` = S2 LP/티어(`{name:{tier,lp,...}}`) — 이름 매칭(공백제거+소문자)
- DB: `aramchaos-ca022-default-rtdb.asia-southeast1` (apiKey는 aram/index.html firebaseConfig)

## ✅ 팀 짜기 — 구현 완료(2026-07-06·로컬 PC) — 홈페이지 완전 연동
**핵심**: 오버레이(방장)가 홈페이지 `startItemPhase`→`makeTeams`와 **동일한 session 쓰기 2단계** 수행 → 홈페이지 쓰는 팀원에겐 아이템 타이머 배너→팀 발표→관전자 배팅이 **평소처럼 자동으로** 뜸(홈은 원래 session 구독으로 그림). 오버레이 유저는 pollSession(teamsFormedAt)이 팀 뷰 표시.
- **`teams.js`(신규)** — 홈페이지 1:1 이식: `normName`(trim+연속공백 1칸 · ⚠️소문자화 아님=LP매칭용 norm과 다름)·`shuffle`·`calcStats`(m.season??0 필터)·`getWinRateScore`(신뢰도 가중)·`buildTeams`(관전자 선정[>10→10명까지·홀수+1·제외자 마지막 순위]·밸런스=랜덤시작 16회×그리디 200스왑·TOL 0.12·전판 prevKey 회피). **밸런스 상수 바꾸지 말 것**(홈과 분포 동일 유지). 점수 메모이즈만 추가(순수함수라 결과 완전 동일·1.7s→5ms).
- **main.js** — ①`fbToken`(익명 auth accounts:signUp·50분 캐시) + `fbSet`(REST PUT=홈 set() 시맨틱·401/403 시 토큰 재발급) ②`startTeamBuild`: prev session(전판 회피용)+currentSeason 선읽기 → `session={phase:'item', itemPhaseEnd:+15s, players:[normName...]}` 쓰기 → 15초 타이머(그동안 matches.json 프리페치·수MB) → `finishTeamBuild`: buildTeams → **홈 makeTeams와 동일 16필드 페이로드** PUT ③`skipItemPhase`(즉시 팀 구성). IPC `tb-start`/`tb-skip`·이벤트 `teambuild`(countdown/building/done/error).
- **desktop** — 방장에게만 「⚔️ 팀 짜기」 버튼 → 참가자 체크리스트(2열·localStorage `tbChecked`로 지난 참가자 기억)+밸런스/랜덤 라디오 → 카운트다운(⏭️스킵) → 결과(1팀/2팀/관전).
- **검증(실데이터 560매치·2026-07-06)**: 점수함수=홈 원본(index.html서 추출 실행)과 18명 전원 일치 ✅ · 인원분배 4/5/7/10/11/13 전 케이스 ✅ · 밸런스 점수차 0.0099 vs 랜덤 0.2259 ✅ · 전판회피 재현 0/50 ✅ · session 16필드+아이템페이즈 필드 대조 ✅. ⚠️**실기(오버레이서 팀짜기→홈페이지 폰에서 타이머·발표 뜨는지) 미검증 — 사장님 확인이 1순위.**

## ⏭️ 다음/미구현
- **실기 확인(1순위)**: 방장 체크→팀 짜기→홈페이지 기기에서 아이템 타이머·팀 발표·관전자 배팅 정상 노출
- 홈 `_lobbyBroadcastPrep`(참가자 선택 중 "준비 중" 하단 배너) 미이식 — 원하면 체크 변경 시 /lobby write 추가
- 관전 제외 설정 UI 없음(`config.spectatorExclude` 배열은 지원·기본 빈값. 홈은 host localStorage 기반)
- makeTeams 부수효과(비밀퀘스트 토큰 `checkQuestEvent` 등)는 홈 호스트 로컬 기능이라 미이식(협의 필요)
- ✅**투표 뷰·정산 뷰 완료**(2026-07-06) — 팀짜기→투표→정산 전체 흐름이 오버레이에서 홈페이지와 연동. ⏭️ 남은: riotId↔닉네임 매핑(인게임 이름≠홈 등록명 시 LP 매칭 실패)·골드 델타 표시(정산 뷰·재계산 필요)·관전 제외 UI·로비 준비중 배너
- ⚠️**투표·정산 실기 미검증**: 게임 종료→라이브 승리팀 선택→오버레이 투표창→투표가 홈에 집계→정산창까지 실제 확인 필요(게임 없이 못 돌림). 코드 정합은 실데이터 대조로 검증됨
- ⚠️**투표 실기 미검증**: 게임 종료→라이브 승리팀 선택→오버레이 투표창 뜨는지·투표가 홈페이지에 집계되는지 사장님 확인 필요. ⚠️브릿지 자동 승패감지(manualEog 없음) 단독+오버레이만 있는 경우는 첫 투표를 누가 시작 못하는 엣지(보통 라이브가 진행하니 실무 무문제)

## 원칙/메모
- **additive 개발**(기능 추가만·롤백 안전). 매 커밋이 복구지점. 홈페이지 임베드(Shift+F6)는 보조로 강등됨(통짜 홈 노출은 사장님이 "별로"라 함 → 각 시점 전용 뷰가 정답)
- 에이전트 환경에선 GUI/롤 못 띄움 → **실기 테스트는 사용자가**. 매 변경 `node --check`
- 롤 클라 창 제목 = `League of Legends`, proc `LeagueClientUx`
