# 아수라장 내전 오버레이 (aram-overlay)

## 개요
칼바람 내전 홈페이지(https://sohada2.github.io/aram/)의 **인게임 오버레이 데스크톱 앱**.
롤 클라이언트/게임 위에 **팀 배정·참가자 명단·(예정)투표·정산**을 띄운다. **Electron**(borderless) 기반.
- **가입/로그인/설치 관문 없음** — VBS 더블클릭으로 실행 (Overwolf는 계정·광고 강제라 포기하고 Electron으로 감)
- **홈페이지·브릿지와 같은 Firebase 공유** → 앱 켠 사람=오버레이 / 안 켠 사람=홈페이지, 자동 연동
- 리포: 로컬 git (⚠️ GitHub 미푸시 상태일 수 있음 — 다른 PC에서 이어가려면 `SOHADA2/aram-overlay`로 push 필요)

## 실행 / 배포 (2026-07-06·🔄 자동 업데이트)
```bash
npm install        # 최초 1회
npm start          # 개발 실행(소스 그대로·자동 업데이트 꺼짐)
# 배포 = 태그 푸시(아래) → GitHub Actions가 빌드/배포. 로컬 npm run dist는 개발자모드 필요
```
- **🔄 자동 업데이트(electron-updater + GitHub Releases)**: main.js `setupAutoUpdate()`가 시작+30분마다 새 버전 확인→백그라운드 다운로드→다음 실행/종료 시 자동 설치(+트레이 「지금 업데이트」). 팀원은 Setup.exe 한 번 설치 후 재설치 불필요.
- **배포 = 태그 푸시** → `.github/workflows/release.yml`(windows 러너)이 `npm run release`(electron-builder --win nsis --publish always)로 빌드+**Releases 업로드**. `GH_TOKEN`=Actions `secrets.GITHUB_TOKEN` 자동. 절차: package.json version↑ → commit → `git tag vX.Y.Z && git push --tags`.
- ⚠️ **로컬 electron-builder 빌드 불가**: winCodeSign 7z의 macOS dylib 심볼릭링크가 Windows 권한(개발자모드/관리자) 없이 압축해제 실패(매번 새 랜덤 hash라 캐시 우회도 안 됨) → **CI(GitHub Actions)에서만 빌드**. 로컬 필요 시 개발자모드 ON.
- ⚠️ 이 셸 `ELECTRON_RUN_AS_NODE=1`로 bash서 electron.exe=node모드(ipcMain undefined)—테스트 시 unset. 팀원 무관.
- 첫 실행 SmartScreen(추가정보→실행). vbs/bat 제거(npm start). packager/archiver 제거(electron-builder로 전환)·gen-ico.mjs로 ico.

## 📊 데스크톱 = 좌측 카테고리 레일 + 프로필/기록/랭킹 (v0.1.8·2026-07-06)
- 사장님: 데스크톱 메인창을 홈페이지 프로필처럼 제대로 구성·**세로 카테고리(왼쪽 레일)**로. 범위=일단 **프로필/기록/랭킹**만(상점/가챠/패스는 나중). 게임 시작 전 확인용(인게임 노출은 나중 튜닝).
- **구조**: 로그인 후 `#app`(app-shell) = 좌측 `.rail`(홈/프로필/기록/랭킹 세로 버튼) + `.cat`(콘텐츠). `switchCat(cat)`이 뷰 전환+렌더. 기존 홈 내용은 `#cat-home`으로 이동. 팀짜기는 그대로(#app 숨기고 #teambuild).
- **데이터(main.js IPC·`profile.js` 계산)**: `profile-data`/`records-data`/`ranking-data`. 원자료=fetchMyGold+getMatchesCached+fetchLpPlayers. `profile.js`가 홈 프로필 정보 이식(시즌2): 내전 승/패/승률/경기·최근10폼·챔프 MOST/BEST(participants.champion)·누적 매치골드(calcGoldFromMatchesS2)·MVP/매너·LP/티어/배치/승급전·강철심장(성능/등급/레벨)·시너지(activeSynergy_s2)·단짝(buddy_s2). 기록=최근24 시즌2 매치(내 승패/챔프/KDA). 랭킹=season2/players 티어→LP순. 챔프 초상화=ddragon(버전 1회조회 `_ddVer`·onerror 폴백). preload getProfile/getRecords/getRanking. package.json files에 `profile.js` 추가.
- 검증: profile.js 단위테스트(승/패/폼/챔프/emblem/synergy/buddy/lp/records/ranking)·헤드리스 렌더(name/4stats/2champ/10dots/3loadout/wr). ⚠️실기 미검증(실계정 데이터로 표시·챔프명↔ddragon id 매핑 정확도). ⏭️상점/가챠/패스·인게임 도킹 노출·팀 위치 표시는 다음.

## 🔴 오버레이만으로 경기 저장/정산 = 숨은 라이브 계정 웹뷰 (v0.1.4·2026-07-06) ★★새 세션 필독·이중저장 주의
- **목표(사장님)**: 홈페이지 라이브 계정을 아무도 안 켜도, 방장이 오버레이만 켜면 경기 저장·정산까지 완결. **최우선=이중 기록 절대 방지**(LP/골드 이중적용→수동 되돌림 사태).
- **설계 = 저장 로직 재작성 안 함**. 저장은 이 앱에서 제일 복잡·위험(LP·골드·시너지·강철심장·승급전). 오버레이에 재구현하면 계산 갈라짐+두 번째 저장경로=이중기록 위험. → **방장 오버레이가 진짜 홈페이지를 숨은 백그라운드 창(`liveWin`)으로 띄워 `liveMode`로 부팅** → 홈페이지의 **검증된 saveMatch + 원자적 락 그대로** 사용(재작성 0). main.js `startLiveAccount()`(config.isHost일 때·whenReady/set-host서 기동)·`stopLiveAccount()`(before-quit·host off·`close()`로 beforeunload→`config/liveOwner` 락 반납). 창=`show:false·skipTaskbar·backgroundThrottling:false`. 부팅=첫 로드 후 `localStorage.liveMode='1'` 심고 reload(`_liveArmed` 가드)·실패 시 8초 재시도.
- **🛡️ 이중저장 원천차단(홈페이지 v2.45.565)**: 브릿지가 잡은 **게임 고유 gameId**를 eogStats에 실어(bridge.js 이미 함)→홈 `applyEogData`가 `_currentEogGameId` 캡처→`saveMatch` 최상단에서 `config/savedGames/{gameId}`에 **runTransaction 원자적 마커**. 딱 한 대만 마커 획득→저장, 나머지는 즉시 return(저장 안 함). 실패 시 catch서 마커 해제(고아 방지)·10분 staleness(하드크래시 복구). **기존 saveLock(session/saveLock 트랜잭션)+휴리스틱 위에 게임단위 원자 보장 추가**. 여러 라이브 기기(웹뷰+홈페이지+구브릿지)가 동시 저장 시도해도 이중 불가.
- **팀구성 충돌 방지**: 홈 아이템페이즈 만료 시 `if(liveMode) makeTeams()`(16276)가 있어, 라이브 웹뷰가 오버레이의 팀구성과 겹칠 위험 → 오버레이 item-phase 세션에 **`extBuild:true`** 마킹 → 홈 `startItemCountdown(…,extBuild)`가 `_itemPhaseExtBuild` 세팅→만료 시 `if(liveMode && !_itemPhaseExtBuild) makeTeams()`로 **웹뷰는 팀구성 스킵**(오버레이 finishTeamBuild가 담당). 그 외 liveMode 자동행동(관전자 랜덤픽 등)은 무해·유익.
- **역할 분담(오버레이만 시나리오)**: 참가자 오버레이 브릿지=EOG 캡처(bridge/eogStats) / 방장 오버레이 라이브 웹뷰=그 eogStats 읽어 저장·정산 발행(lastSettlement) → EOG캡처와 저장이 **다른 사람이어도 됨**. 이미 홈페이지 라이브 계정이 있으면 웹뷰는 `handleLiveKicked`로 자동 물러남(공존 안전). ⚠️**실기 미검증**: 실내전에서 방장 오버레이만으로 저장·정산·**이중저장 안 되는지** 꼭 확인. 리소스=홈페이지 풀로딩 백그라운드(무겁지만 방장 1대만).

## 🔌 내장 브릿지 = aram-bridge 완전 대체 (v0.1.1·2026-07-06) ★새 세션 필독
- **`bridge.js`(신규)** = aram-bridge `index.js` **1:1 이식**. 오버레이가 롤 클라(LCU)에 직접 붙어 **게임 페이즈·EOG 통계(KDA·딜량·골드·증강·멀티킬)**를 캡처해서, 홈페이지가 읽는 것과 **동일한 Firebase 경로**(`bridge/eogStats`·`bridge/voteStarted`·`bridge/champSelect`·`bridge/gamePhase`·`bridge/inGame`·`bridge/operators/{id}`·`bridge/heartbeat`·`bridge/connected`·`normal_matches/{gid}`)에 그대로 기록 → **홈페이지 코드 무변경으로 오버레이를 브릿지로 인식**(EOG 저장·투표 시작·진행자 표시·일반게임 기록·진행 배너 전부).
- **이식 시 차이**: ①HTTP 상태페이지(7654)·진행자 드롭다운 제거 → 진행자 이름 = `config.myName` ②axios→Node https(의존성 0) ③Firebase 쓰기 = **인증 없는 PUT**(bridge/·normal_matches/ 무인증 쓰기 허용=실브릿지로 검증된 동작·홈페이지도 auth 안 씀=RTDB 오픈룰) ④operators에 `app:'overlay'` + `ver:'1.1.38'`(홈 `LATEST_BRIDGE_VER` 이상) → 홈페이지 `_bridgeOutdated`가 `app==='overlay'` 스킵(구버전 경고 안 뜸) ⑤`_findLockfile` PowerShell 폴백 **execSync→execFile(async)+15초 스로틀**(Electron 메인 blocking 금지·비표준 설치 대비) ⑥EOG는 **ETag CAS**(다중 오버레이/브릿지 동시=gameId로 중복 저장 자동 차단) 그대로 유지.
- **로버스트**: 참가자 중 **누구든** 오버레이 켜면 그 게임 EOG 캡처(실브릿지는 방장 1명 필수였음). main.js `bridge.start({getOperatorName:()=>config.myName, appVer, log})` 시작·`before-quit`서 `bridge.stop()`(connected/operators/inGame 정리). 별 게이트 없이 항상 동작.
- ⚠️ **실기기 미검증(1순위)**: 이 개발환경엔 롤 클라/LCU가 없어 **EOG 캡처 경로를 실제로 못 돌려봄**(문법·로직·이식 정합만 검증). 방장이 오버레이 켜고 실제 내전 1판 → 홈페이지에 EOG 저장·투표창·기록(KDA/딜량/증강)까지 뜨는지 **첫 확인 필수**. 문제 시 자동 업데이트로 즉시 핫픽스. **폴백**: 기존 aram-bridge exe도 그대로 동작(SOHADA2/aram-bridge 릴리즈에서 직접 다운로드 가능·홈 푸터 링크만 오버레이로 교체됨).
- **홈페이지 연동(aram v2.45.564)**: ①최하단 다운로드 링크 브릿지→**내전 오버레이**(releases/latest의 setup.exe) ②`config/appVersion`에 현재 버전 기록(오버레이가 읽어 표시) ③`_bridgeOutdated` app:'overlay' 스킵.

## 🔖 버전 표시(홈페이지 실시간 동기화)
- 홈페이지가 로드 시 `config/appVersion=APP_VERSION` 기록 → 오버레이 main.js `pollVersion`(시작+5분마다 `config/appVersion.json` 읽음)이 `broadcast('version')` → 데스크톱 로그인/홈 하단 `.app-ver`에 "버전 v2.45.xxx" 표시. **항상 홈페이지와 동일**. getPlayers 응답에도 webVersion 실어 첫 로드 즉시 표시. preload `onVersion`.

## 🪟 창 구조 대개편 (v0.1.14~26·2026-07-06~07) ★새 세션 필독 — 아래 옛 설명보다 우선
> **현재 배포 = v0.1.26** (CI Releases). 배포=package.json v↑→commit→`git tag vX.Y.Z && git push --tags`(CI가 빌드/릴리즈).

### ⚠️ v0.1.19~26 도킹 정밀화·클라 톤 통일 (최신·위 항목보다 우선)
- **도킹 좌표 = DWM 보이는 경계**: `GetWindowRect`는 클라의 투명 리사이즈 테두리(~7px)까지 포함 → 패널이 떠 보임. 도킹 스트림 C#이 `DwmGetWindowAttribute(h,9,…)`(DWMWA_EXTENDED_FRAME_BOUNDS·실패 시 GetWindowRect 폴백)로 **실제 보이는 가장자리** 사용. + `applyDock`/`applyDockLeft`가 클라 쪽으로 **2px 겹침**(틈 완전 제거).
- **창 모서리 각지게 = DWM 강제**: `roundedCorners:false`가 이 환경서 안 먹음 → `forceSquareCorners(win)`=PS 원샷 `DwmSetWindowAttribute(hwnd,33,DONOTROUND=1)`(HWND=getNativeWindowHandle). whenReady서 `squareAllPanels()`+1.5초 재적용. overlay/sidepanel #panel `border-radius:0`.
- **클라 톤 통일(헤더/라인/배경)**: 좌·우 패널 **동일**. 헤더(`header`/`#sbar`) `min-height:80px`(클라 상단 네비바 높이·세로 가운데)·상단 `border-top:2px solid #785A28`(클라 골드 라인)·하단 `border-bottom:1px solid rgba(255,255,255,0.11)`(클라 얇은 회색 구분선). 배경 `~#061117`(클라 로비 톤·블루끼 뺀 블랙, `rgba(9,19,26,0.985)~rgba(4,12,19,0.985)` 그라데이션·sidepanel body #061117). ⚠️라인 높이(80px)·색은 **사장님 실기 스샷+색상선택기 값으로 픽셀 튜닝된 값**(추가 조정 시 이 값에서 ±).
- **사이드패널 레일**: 상단 `.rail-logo`(⚔️) 제거(중복)·`#panel .rail{padding-top:10px}`.
- **⚔️ 팀짜기 참가자 = 홈 member-chip 톤 + 드래그 선택(2026-07-08)**: 네이티브 체크박스 목록 → 홈페이지식 칩(커스텀 ✓박스 `.tb-check`+이름+**티어 배지** `.tb-badge`[배치 N/5·승급전·티어 NLP·S1_TIER_META 색]·티어→LP 정렬). **드래그 다중 선택**(홈 initDragSelect 이식·마우스: mousedown=누른 칩 반대상태 목표→지나는 칩 전부 적용→mouseup 저장). 데이터=main.js `pollLp`에 placementDone/promoActive/placementGames 추가(additive)+`get-players`에 lpMap 동봉(비면 1회 pollLp)+sidepanel `onPlayers`로 실시간 갱신. mock getPlayers에 lpMap 샘플.
- **🛒🃏🎫 상점/가챠/패스 카테고리 신설(2026-07-08·조회+핵심 액션)**: 사이드패널 레일에 3탭 추가. **`store.js`(신규·files 화이트리스트 추가됨)** = 홈 로직 1:1 이식(EMBLEM_TICKETS 가격/성능·gachaRollStar 3/10/87%·doGachaPull[유미0.5%·gachaLog/gachaSpent/baseline 박제·champCardLog]·S2_PASS_QUESTS 25레벨+REWARDS·calcS1PassStats(S2)=내전+**일반게임(normal_matches) 통합**·_normalMatchMember 매핑). main.js IPC: `shop-data`/`shop-buy-ticket`(goldSpendLog 기록)/`gacha-data`(컬렉션+완성 시너지)/`gacha-pull`/`pass-data`(check/prog는 메인서 평가해 직렬화 rows)/`pass-claim`(순차 가드+이전 수령시각 이후 경기만 집계=홈 동일). **상점**=전투아이템 3종(기존 item-buy 재사용)+강화권 ×1/×5+정수는 표시만(만렙 게이트라 구매는 홈) / **가챠**=1회/10연 뽑기+결과 카드+18종 컬렉션(파편/골드/프리즘 수)+완성 시너지 활성화(기존 synergy-equip 재사용) / **패스**=LV/진행바+퀘스트 25행(✓/받기/진행중/🔒·보상 칩). 골드 가드=availableGoldS2(보수적). mock 샘플 3종. 단위검증: 뽑기(비용·카드수·baseline)·패스(순차/afterTs 거부). ⚠️desktop.js(레거시 창)엔 미추가(사이드패널이 메인). ⚠️구매/뽑기/수령 실기 미검증.
- **🔒 계정 조작 잠금 B안(v0.1.30·홈 v2.45.574·2026-07-08)**: 같은 계정 동시 '쓰기' 사고(last-write-wins 증발) 방지 — 보기는 자유·조작 권한만 한 기기. 노드 `accountSession/{fbKey}`={deviceId,app:web|overlay,label,at,hb}·하트비트25s·stale75s. **오버레이**: main.js ensureControl(비어있음/stale/내기기=자동클레임·타기기=ctrl:true 반환)·claimControl·releaseControl(before-quit)·IPC take-control·**쓰기 핸들러 16곳 게이트**(item-*·shop-buy-ticket·gacha-pull·pass-claim·emblem/synergy-equip·forge-* 6·lottery-* 4[aside 제외])·config.deviceId 영구. 렌더러 withCtrl/ovCtrl(확인→takeControl→자동 재시도). **홈**: _ctrlGuard/_acctClaim/_acctSubscribe(onDisconnect 자동반납·liveMode 제외)·뮤테이터 15곳 게이트(buyItem·toggleItemActive·quick*·doGachaPull/Merge·toggleGachaSynergy·emblem 7종·claimS2PassLevel). 강제력 없는 신사협정(사고방지 목적).
- **🎟🔨 복권·대장간 = 네이티브 탭(v0.1.29·2026-07-08·홈창 방식 대체)** ★⚠️밸런스 패치 미러링 필수: 사장님이 홈창 방식 별로라 해서 **오버레이 안에서 직접**. store.js에 홈 1:1 이식 — **복권**: SCRATCH_TIERS(70/200/400·4/6/7칸·매칭2/3·skullAppear 20/40·페널티10)·rollScratch(가중치 셀추첨·cap=matchCount·다중매칭방지·쪼는맛 마지막셀)·**pity**(골드/프리즘만·꽝+1 해골+0.5·상한20·당첨리셋·60회 재추첨 보정·취소시 원복)·**걸작 해골감소**(장착 lottoTkt 줄수→skullAppear round(×(1-red)))·**당첨보너스**(실버차단·min(30,성능)×줄수)·pendingScratch_s2(구매즉시 저장·보류 revealed·이어하기 재롤없음)·lotteryHistory({ts,date,scratch,tierIdx,win,gold=net,season,free,emblemBonus,pity,pityConv}·버리기 gold0 discarded·취소=goldSpent환불/무료권반환). 검증: **실버 회수율 78.5%=홈 실측 78.8% 일치**·해골감소 70%·pity/정산/취소 단위테스트. **대장간**: emblemEnhance(장착품만·성공/실패 무관 슬롯소모·{t,ok} push·5칸 락)·걸작 emblemRollLines(POOL 10종 균등·중복허용 3줄·정수-1)·구매150G(spendLog)·판매(base75+투입35%+성능²×2→emblemSellG_s2+purchaseLog)·애칭3자·_healEmblemLines(forge-data 읽기시). IPC forge-*/lottery-* 12종 + 사이드패널 레일 🎟복권/⚒️대장간 탭 + **긁기 캔버스 모달**(destination-out·55% 공개·해골카운트=홈규칙[당첨확정후/자동공개/복원 제외]·매칭완성=자동공개+받기·꽝=전부긁어야). rec에 pity/pityPrev/pityKey 추가 필드(홈 무해·취소/이력용). 오른 3D 연출은 미이식(결과·확률·기록만 동일). 홈창 딥링크(open-home)는 코드 잔존(미사용). **⚠️상시: 홈에서 복권/대장간/상점 밸런스 패치 시 store.js도 같이 갱신할 것**(SCRATCH_TIERS·EMBLEM_TICKETS·EMBLEM_FX·pity 상수).
- **🔀 동시 실행(홈페이지+오버레이) 검토 결과(2026-07-08)**: ①liveMode localStorage 누수 없음(liveWin=기본 세션 / homeWin webview=persist:aram 분리·설계 확인) ②라이브 중복=config/liveOwner 단일 소유권으로 홈이 자체 조정(기존 문서화) ③오버레이 쓰기(구매/뽑기/수령/토글)는 **쓰기 직전 fetchMyGold로 항상 최신 읽음** → 순차 사용 완전 안전. **같은 계정이 같은 순간(초 단위) 양쪽에서 동시에 조작**할 때만 items_s2/emblemTickets_s2/champCards_s2 같은 배열·맵의 last-write-wins로 한쪽 유실 가능 — 홈 멀티기기와 동일 특성(신규 위험 아님) ④단일 필드(장착/시너지)=안전 ⑤복권/대장간(홈 창)=같은 계정 홈 2탭 시맨틱(onValue 실시간 동기·pendingScratch도 Firebase라 이어긁기 양쪽 반영).
- **📊 프로필/기록/랭킹도 홈 톤 정합(2026-07-08)**: sidepanel.js+desktop.js(중복 렌더러 양쪽) 동일 적용 — ①프로필: 티어 배지/LP 숫자 **티어색**(TB_TIER)+**LP 바**(`.pf-lpbar`·정규전만, 배치/승급전/챌린저 제외)+승급전 `N승 N패`(profile.js lp에 promoWins/promoLosses 추가)+시너지 ★★→**N성**·그룹 이모지 제거 ②기록: **날짜**(`.rc-date` M/D HH:mm·ts 기반) ③랭킹: 티어명/LP **티어색**+행마다 **LP 바**(`.rk-bar`·챌 제외·`.rk-row`가 column+`.rk-main`로 구조 변경). mock에 tier/ts 필드 보강.
- **⏭️ 미착수 제안**: 배경을 **클라 상태별 동적**으로(홈=더 블랙 / 사용자게임 로비=블루). 브릿지가 LCU gameflow-phase(Lobby/None) 감지 가능 → 상태 IPC로 패널 bg 전환 구현 여지(사장님 요청 시). 지금은 #061117 정적.

### 옛 요약: v0.1.10~17 (창구조 대개편·마커·z레이어·아코디언 등)

### 🎨 디자인 목업 (v0.1.18~·게임 없이 브라우저서 디자인 확인)
- **`design/mockup.html`**(런처·미배포) → `overlay/overlay.html`·`sidepanel/sidepanel.html`·`slot/slot.html`를 **브라우저에서 직접 열면** 샘플 데이터로 렌더. 각 화면 상단 「목업」 바에서 뷰 전환(오버레이=팀/아이템/대기/명단/투표/정산+도킹토글 · 사이드=로그인/방장·레일 · 마커=1팀/2팀).
- **원리**: `overlay/mock.js`·`sidepanel/mock.js`가 `overlay.js`/`sidepanel.js`보다 **먼저 로드**되어 `if(window.api)return;`(실앱=preload로 window.api 존재→비활성) 아니면 **Proxy 목 api**(on*=콜백 저장·getProfile/getRanking/getRecords=샘플) 설치 + `window.load`서 툴바+시나리오. slot.html은 인라인 가드. **실제 CSS/JS/마크업 그대로 써서 목업=앱과 안 갈라짐**. 목업 파일(mock.js)은 앱에 포함돼도 무해(inert). `design/`은 files 화이트리스트 밖=미배포.
- 디자인 수정 = `overlay.css`/`sidepanel.css`/`slot.html`/`shared.css` 고치고 새로고침. 데이터/뷰 형태 바꾸려면 각 mock.js의 샘플 상수.

### ⚠️ v0.1.18 갱신 (사장님 피드백 5건 — 최우선)
- **📍 마커 디자인(slot.html)**: 밝은 솔리드 박스 → **롤 클라 헥스텍 칩**(딥블루 반투명+골드 하이라인 테두리+컷코너 clip-path+숨쉬는 글로우, 팀컬러=1팀 청록/2팀 골드 다이아·상단 헤어라인). 배경과 조화. ⚠️위치 비율(colRight)은 그대로(친구목록 유동—실기 조정 여지).
- **⏱️ 타이머 동기화(이슈2·5)**: 좌측 오버레이 `itemSecsLeft`를 로컬 15초 카운트 → **절대 `itemData.endAt` 기준 ceil**(우측 사이드패널 카운트다운과 동일 소스=방장 같은 기기라 정확 일치). + `startTeamBuild`에서 세션 쓰기 직후 **즉시 `broadcast('itemphase')`**(방장이 참가자일 때)로 3초 폴 안 기다리고 좌측 타이머 즉시 표시.
- **🎒 아이템뷰 큰틀 아코디언(이슈3)**: 강철심장/시너지를 **각각 섹션 아코디언 1칸**으로(접힘=장착/활성 요약, 펼침=바꿀 목록 `it-pick`). 기존엔 모든 강철심장을 개별 아코디언으로 다 펼쳐 보여줬음. `secAcc`/`emEffShort`/`.it-pick*` 추가. 전투아이템은 기존 개별 아코디언 유지.
- **🪟 z-레이어(이슈4)**: `applyRaise`가 다른 앱 활성 시 `win.hide()`(사라짐)+클라 재활성 시 topmost(pop)하던 것 → **항상 보임·일반 z-order**(setAlwaysOnTop false·숨김/topmost 안 함). 다른 창 클릭=자연스럽게 그 뒤로(안 사라짐), 클라 재클릭=pop 없음. 사용자가 직접 숨긴(userHid) 경우만 hide. 마커는 `clientFg`일 때만. ⚠️극단(다른 앱 최대화)은 그 뒤로 가림(사장님 수용). 완벽한 "가려지되 항상 클라 위" = owned window(GWLP_HWNDPARENT) 네이티브 필요(미구현).

### ⚠️ v0.1.18 계속 (2026-07-07·디자인 이터레이션+인게임뷰·소스 v0.1.18 유지·릴리즈 보류) ★새 세션 필독
> 사장님과 목업(`overlay/overlay.html` 「목업」 바)으로 반복 튜닝. **전부 커밋·푸시됨(master)·릴리즈 태그는 디자인 확정 후 한 번에**. 검증=로컬서버 없이 `overlay/overlay.html`에 stub 주입+Edge 헤드리스 dump-dom(title에 값 실어 확인).
- **🎒 아이템뷰 효과=이름으로**: 성능이 아이콘만(🎫-23%) 뜨던 것 → 홈 `emblemEffectsOf` 이식(`emblemEff`/`emEffText`=해골 감소 -23% · 막고라 배당 +9%)·시너지 `synEffTxt` 풀설명·★★→N성. 이모지 남발 제거(효과/시너지 개별 아이콘 삭제).
- **🐛 섹션 아코디언 접힘 버그**: `.it-acbody`(접힘 display:none)를 `.it-picks`(display:flex)가 소스순서로 덮어 강철심장/시너지 목록이 **접혀도 항상 보임** → `.it-picks`서 display 제거, `.it-acc.open .it-acbody.it-picks{display:flex}`로 펼침 때만.
- **⏱️ 줄어드는 시간 바**: 숫자만 → `[라벨 · N 초]` + `.it-bar-track/.it-bar`(매 500ms `(endAt-now)/15000` 폭·CSS transition·5초↓ 빨강 `updateItemBar`). **흐름 왼→오른**(트랙 `justify-content:flex-end`=오른쪽 고정·왼쪽부터 비움).
- **🧹 앞쪽 이모지 제거**: 아코디언 헤더 선두 아이콘(🎲🛡️⚔️/⚒️/🃏) 전부 삭제(`accHtml`/`secAcc`에서 `it-ic` 제거)·섹션 제목 🎒 제거. 이름·요약 중심 텍스트 목록.
- **⚒️🃏 헤더에 장착 효과**: `secAcc`에 `effText` 인자 → 접힌 헤더 이름 아래 장착 강철심장(`emEffText`)·활성 시너지(`synEffShort`) 효과 한 줄(`.it-sec-eff`).
- **💰 정산창 = 이번 판 발동 효과 추가**: 기존 승자·수상·LP델타만 → 홈 「⚡ 이번 판 발동 효과」 이식. main.js `fetchMatch(matchKey)`로 `matches/{key}.synergyEffects/emblemEffects/itemEffects` 읽어 `broadcast('settlement',{…,procs})`. overlay `_settleSynProc`(홈 `_synColl` 이식·발동=전원 공개/미발동·역효과=본인만·발동실패·미달·전액방어)·`_settleEmProc`(강철심장 걸작 LP/골드·도박권/배치/승급전 LP 발동 제외)·이름옆 사용 아이템 칩(`SETTLE_ITEM_LABELS`). CSS `.st-procs*`·HTML `#st-procs`. ⚠️골드 델타(각자 총획득)는 payload에 없어 생략(발동 효과 카드로 대체).
- **🎮 인게임 뷰 신설(view-ingame)**: 전투 중 **팀 명단 숨기고** 내 빌드+승패 LP(동기부여). `render()` 우선순위=`item>settle>(hasTeams&&isVoting)>inGame>team>roster`(투표가 인게임보다 우선=경기 종료 순간 확실). `renderIngame`: 티어·LP+LP바 / **이기면·지면 LP**(정규 ±·승급전 진입/배치·승급전 분기·도박권/LP2배권 반영) / **🎯 이번 판 목표**(활성 시너지 발동조건 `cond` 킬8+ 등+효과+발동%) / **⬆️ 승급 컨텍스트**(승급까지 N LP·강등위험·승급전 N-N) / **🔥 오늘 전적·연승**. 데이터=팀빌드 때 박제된 `itemData(lp/gold)`+`lpMap`(게임 내내 유지)+`profile.computeMyStats`(오늘 W/L+연승)→`main.pollMyStats`(시작·인게임 진입·정산 후·매치캐시 재사용/정산시 무효화)→`broadcast('mystats')`·preload `onMystats`. CSS `.ig-*`.
- **🧩 팀 배정 뷰 채움**: `#view-team justify-content:safe center`(세로 가운데)→`flex-start`+`.ta-teams/.ta-team flex:1` → 3v3 등 짧을 때 상하 뜨던 빈 공간 제거(아래 여백=패딩 6px).
- **🔠 LP 시인성 + 폰트 통일**: 팀 LP 9px·dim→11.5px **팀색 칩**(1팀 청록/2팀 골드). **Black Han Sans(두꺼운 디스플레이)→Noto Sans KR 900 앱 전체**(overlay+sidepanel+`shared.css --f-title`·`var(--f-title)` 사용처엔 font-weight:900 명시). 작은 크기서 뭉개짐 해소. (⚠️롤 공식폰트=Beaufort/Spiegel은 라틴전용·유료라 못 씀·한글은 Noto가 롤 KR 톤에 가장 근접)
- **🌐 호스팅 목업(디자인 검토용)**: `shared.css`+`overlay.css`+`overlay.html` 마크업+`mock.js`+`overlay.js`를 단일 HTML로 병합→claude.ai Artifact 발행(URL 하나로 폰/타PC서 열람·7뷰 툴바). ⚠️CSP가 구글폰트 차단→**한글=기기 시스템 고딕 폴백**(폰트 정밀확인은 로컬 앱). 재배포=같은 파일 경로로 Artifact 재호출.
- **🏠 홈페이지(aram 리포·별도) 이번 세션**: v2.45.567 **마지막 경기 되돌리기**(경기직전 LP/골드 스냅샷 박제 `matches/{key}.lpBefore/goldBefore`+`undoLastMatch` 기록탭 라이브전용·중복/오류 안전망) · v2.45.568 **투기장 강화창 장착표시**(선택=setFighter로 전투인형 교체인데 표시없어 혼동→⚔️전투인형/👁미리보기 배지+목록 ⚔️마크+안내문).
- **🔍 홈페이지 정합성 감사(3-에이전트 대조·2026-07-07)**: 시너지11종·강철심장 수치/합산/발동%·경기골드 공식·투표 쓰기경로·팀짜기 세션 16필드 = **전부 홈과 일치**(구조 결함 0). 발견 4건 즉시 수정: ①**LP2배권 보유자만 아이템뷰 표시**(`LP2X_ITEM`·구매 없음 — 릴레이/단짝 보상템을 오버레이서도 활성화 가능) ②**정산창 각자 +NG 골드 칩**(`settleGold`=홈 playerRow 합산: 기본15/5·quest·MVP/매너50·시너지 goldDelta·걸작 matchG/winG/mvpG·`.st-gold`) ③**도박권/LP2x 가드 방향**(LP 조회 실패 시 홈처럼 차단으로) ④**인게임뷰 챌린저=캡 없음**("정점·LP 상한 없음"·승급전진입 미표시)+**플래+ 0미만=이전티어 75LP 강등 표시**(`DEMOTE_TIERS`/`PREV_TIER`). 잔여 무해: weddingGold 미합산(항상 과소=안전)·티어표 아이언/에메랄드 미사용 키·이벤트매치/막고라/한판더 미지원(홈에서 하면 됨)·홈 checkQuestEvent는 no-op(오탐).
- ⏭️ **다음(다른 PC 이어가기)**: 디자인 확정 후 **릴리즈 태그**(package.json v↑→commit→`git tag vX.Y.Z && git push --tags`). 인게임뷰/정산 procs/되돌리기 전부 **실기(실게임 1판) 미검증**. 인게임 목표 데모 시너지가 void(조건없음)라 목업 데모용으로 조건형(warrior 킬8+) 교체 여지.

### ⚠️ v0.1.16~17 갱신 (위 항목보다 우선하는 최신 동작)
- **📍 마커 = 작은 코너 배지**(네모 테두리서 전환): 팀 컬럼 **우상단**에 「◆ 내 팀」 작은 배지(`slot/slot.html`·bw128×bh38). 위치=`updateSlotMarker`서 `colRight = side1? cx+cw*0.39 : cx+cw*0.79`, `y=cy+ch*0.195`(친구목록 **펼침** 기준). ⚠️**친구목록 접힘/창모드면 팀 칸 폭이 달라져 어긋남**(클라 UI 유동적—완벽 고정 불가·필요시 사장님이 비율값 조정). **`clientFg`일 때만 표시**(다른 창 위에 안 뜨게)·게임 중 숨김.
- **🪟 패널 z-레이어 = 클라 추종(hide 방식)**: `applyRaise` 재작성. **도킹 중**엔 `clientFg||panelFg`(클라 or 우리 패널 활성)면 표시+위로, **아니면(다른 앱 활성) `win.hide()`로 숨김**(그 뒤로). 클라 다시 클릭→dock line fg=1→표시. **플로팅(클라 없음)일 땐 항상 표시**(숨김 안 함). `evalRaise` 300ms 드롭 디바운스. `handleDockLine`은 show 직접 안 하고 `evalRaise()` 호출(가시성은 applyRaise가 관리). ⚠️숨김 방식이라 다른 앱 보면 패널이 **사라짐**(트레이 '내 정보 패널 열기'=`showMainPanel`로 복구). 사장님이 "가려지되 보이게(owned window)" 원하면 `SetWindowLongPtr(GWLP_HWNDPARENT)` 방식 필요(미구현·네이티브).
- **🎒 아이템 뷰 = 효과 아코디언**(overlay.js `renderItem`): 전투아이템/강철심장/시너지 각 칸을 접힘(이름+짧은효과+상태)/펼침(효과상세+액션버튼) 아코디언. 홈 `_synEffTxt`(SYN_PROC/effType) + `EMBLEM_EFFECTS`/`emblemPerLine` 이식(`synEffTxt`/`synEffShort`/`emEffLinesHtml`). `_itOpen` Set으로 펼침상태 유지.
- **팀 배정 뷰 = 세로 스택**: `.ta-teams` flex-column(1팀 위·2팀 아래). 상단 "내가 들어갈 팀 🔷 1팀" 대형 배너 + 상대팀 흐리게(`.dim`) + 내 팀 라벨.


- **데스크톱 창(desktopWin) 폐지**: `createDesktop()`는 whenReady에서 **호출 안 함**(함수·desktop.js는 레거시로 남김·미사용). 로그인/방장/팀짜기가 전부 **우측 내 정보 패널(leftWin=sidepanel)**로 이전.
- **메인 창 = 우측 내 정보 패널(leftWin)**: 클라 없으면 좌·우 **독립 창(플로팅)**으로 뜨고(`floatPanels()`·`standaloneBounds()`), 클라 켜면 도킹 스트림이 좌우로 붙임. `_floating` 플래그로 상태 관리(handleDockLine 유효=도킹/무효=플로팅). 트레이 클릭·second-instance = `showMainPanel()`(leftWin 앞으로).
- **sidepanel = 로그인 + 방장 체크 + 팀짜기 + 프로필/기록/랭킹**: 미로그인 시 `#s-login`(아이디 select→입장)·로그인 후 헤더에 `[아이디][👑방장][계정변경][✕]`. 방장 체크(`set-host`→라이브계정 가동) 시 레일 최상단 `팀짜기`(#cat-team) 노출. 레일=팀짜기(방장만)→프로필→기록→랭킹. 팀짜기 UI=desktop.js 이식(tb-*·같은 IPC tbStart/tbSkip/onTeamBuild). **⚠️ `sendTb`/`broadcast`가 leftWin 포함하도록 수정됨**(desktopWin만 향하면 팀짜기 이벤트 안 옴).
- **좌측 오버레이(overlayWin) 대기화면**: 팀 없을 때 "⚔️ 팀짜기 대기 중" + **내 LP·티어·최근폼 + 시즌 랭킹 TOP6**(`loadWaitingInfo`·getProfile/getRanking·45초 캐시·`.wi-*`).
- **📍 내 팀 마커(slotWin)**: 클라 로비 팀 컬럼(1팀=좌/2팀=우, 비율 `cw*0.455 × ch*0.50`)을 **네모 테두리**로 강조(클릭 통과). 투명창 흰박스 버그 대응(`backgroundColor:'#00000000'`·`paintWhenInitiallyHidden`·did-finish-load 후 표시·`_repaintSlot` 1px 넛지·시작 시 미리 생성). `updateSlotMarker`는 handleDockLine + pollSession(팀배정 즉시)서 호출. ⚠️컬럼 좌표는 비율 추정—실기 미세조정 여지(사장님 스샷).
- **도킹=이벤트훅**: `SetWinEventHook`(LOCATIONCHANGE/FOREGROUND/MINIMIZE)로 실시간 추종(160ms 폴링서 전환)·90ms 폴백·GetMessage 루프. `roundedCorners:false`로 각지게. 클라(또는 패널) 활성일 때만 위로(evalRaise·clientFg/panelFg).

## 현재 상태(구현됨) — ⚠️아래 "창 3종/데스크톱" 설명은 v0.1.13 이하 옛 구조(위 대개편으로 대체됨)
- **창 3종**: 오버레이(투명·항상위·프레임없음)/데스크톱(로그인·홈)/홈페이지오버레이(webview로 실제 홈 임베드·Shift+F6)
- **데스크톱 = 게임 로그인 화면**: 히어로 배경+⚔️로고(Black Han Sans)+계정 선택 입장 → 방장 체크 → 상태
- **⚔️ 아이콘**: `make-icon.mjs`로 교차검 렌더(assets/icon.png 256·icon-tray 64)
- **롤 클라 우측 '바깥' 도킹(GGQ 스타일)**: PowerShell(FindWindow/GetWindowRect·네이티브모듈無)로 'League of Legends' 창 감지→DIP변환(scaleFactor)→클라 오른쪽 바깥에 스냅(2.5초 폴링). 화면밖이면 클램프. 트레이 체크박스 on/off. ✅실기확인=클라 817,223·1280×720·배율100%
- **팀 배정 뷰**(session 기반): 좌1팀(청록)/우2팀(골드) 카드·반응형(좁으면 세로스택)·LP배지·내팀 글로우·(나) 표시. Firebase `session` 3초 폴링→새 팀(teamsFormedAt 변경) 감지시 자동 표시
- **참가자 명단 뷰**(인게임 2999): Live Client Data playerlist→이름+챔프+팀색+LP
- **내 이름(입장 ID)**: 등록 players.json에서 선택·`config.myName` 저장(userData JSON). **방장** `config.isHost`
- **미리보기**: 데스크톱 「팀 배정 미리보기」=샘플 session, 「명단 미리보기」=샘플 players (게임/내전 없이 모양 확인)
- **🖥️ 데스크톱 화면 리디자인(2026-07-06)**: ①로그인=게임 접속 화면(히어로 크레스트⚔️+큰 타이틀 Black Han Sans+계정 선택 박스+입장 버튼·#entry.entry) ②홈=창(460×640)에 압축해 **스크롤 없이 한 화면**(#home justify-center·상태 3→2줄·부가버튼 미리보기/홈오버레이 가로 2열·brand→home-top 작게). .wrap flex column·.screen height:100% 내부 center(넘칠 때만 스크롤)·teambuild는 .card(margin:auto 중앙). 검증=Edge 헤드리스 460×640 iframe 스샷(로그인·홈 둘 다 스크롤 없이 fit). 색은 shared 토큰 통일(--gold #e8c84a).
- **🎨 공통 디자인 토큰(shared.css·2026-07-06)**: 청록1팀 #38d9c0/골드2팀 #e8c84a·Black Han Sans·JetBrains Mono·공통부품(.ui-card/.ui-btn-gold/.ui-btn-ghost/.ui-badge/.ui-lp/.t-blue/.t-red/.ui-scroll). overlay.html·desktop.html이 각자 CSS보다 먼저 로드. **새 화면은 이 토큰 재사용**(기존 화면 로컬 :root가 이겨 무회귀). 
- **💰 정산 뷰(오버레이·2026-07-06)**: 홈 finalizeVotes가 lastSettlement에 publish → main.js pollSettlement(3s)가 새 정산(publishedAt·10분 신선도) 감지 시 season2/players fresh fetch(정산 반영 후 LP)와 함께 오버레이로. 오버레이는 승/패 팀·**LP 변화**(s1LpBefore.lp→lpNow.lp 델타·배치/승급전 특수표시·티어 변동 화살표)·수상자(🏆MVP=mvpWinner/⭐SVP=mvpLoser/💎매너)·확인 버튼. 확인 시 localStorage(ovSeenSettle·matchKey 50개)로 중복 차단. ⚠️골드 델타는 페이로드에 없어(itemEffects 재계산 필요) 생략—LP·수상 요약 위주(상세는 홈). 뷰 우선순위 정산>투표>팀>명단. 검증: 실 lastSettlement 필드 대조·s1LpBefore 키=normName·LP 델타 6케이스 OK.
- **🎒 아이템 사용 뷰 = 풀 로드아웃(오버레이·v0.1.3·2026-07-06)**: 방장이 팀 짜기 시작하면 `session.phase='item'`(itemPhaseEnd=단계식별자·기기별 로컬 15초 카운트) → 참가자(`config.myName`∈`session.players`) 오버레이에 자동 표시(방장 본인 포함). main.js pollSession `isItemPhase`가 `fetchMyGold`(전체 gold 노드=items/emblems/champCards/activeSynergy 다 포함)+`fetchMyLpState` 읽어 `itemphase` push. **뷰 3섹션(홈 아이템 페이즈 배너와 동일)**: ①🎒**전투 아이템** 3종(도박권60G·승급전방어권100G·승급전승리권100G — 홈 `_mipbRenderPills` id리스트와 동일·LP2배권은 릴레이전용이라 제외) = 보유면 활성화 토글(`item-toggle`), 미보유면 **구매**(`item-buy`) ②⚒️**강철심장** = `emblems_s2` 나열(성능=`Σ ticket power` stable1/precise3/overload6·등급 실버<10/골드<25/프리즘) → 클릭 장착(`emblem-equip`→`emblemEquipped_s2`) ③🃏**시너지** = `champCards_s2`로 소유·티어(3★=전원 s3≥1·2★=전원 s2||s3≥1) 판정 후 나열 → 활성화(`synergy-equip`→`activeSynergy_s2={sid,tier}`). 전부 낙관적 로컬 반영+3초 폴 확정. **구매 골드검증=`gold.js`(홈 calcPlayerGoldEarned S2 이식·`calcGoldFromMatches` S2만 matches 스캔+나머지 gold노드 필드합·matches 2분캐시·S2에서 0인 소스[뉴비/업적/릴레이/비밀퀘/결혼/S1패스]는 생략=보수적)**. 상호배제·조건은 홈 toggleItemActive와 동일(승급전권=promoActive만 등). 뷰 우선순위 아이템>정산>투표>팀>명단. 검증: gold 계산 단위테스트(A=255·B=145·S1매치 무시)·헤드리스 3섹션 렌더(secH=3·chips=7·구매/장착/★). ⚠️실기 미검증(참가자 폰에서 구매·강철심장·시너지 실제 반영 확인 필요·구매 골드계산이 홈과 일치하는지). SYN_GROUPS/멤버는 main.js(검증)+overlay.js(표시) 양쪽 임베드.
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
- **🆕 v0.1.10~17 실기 확인(1순위·이 세션)**: ①우측 패널 로그인→방장 체크→팀짜기 정상(카운트다운·발표가 우측 패널+홈페이지 둘 다) ②패널 z-레이어(다른 앱 켜면 숨고 클라 클릭 시 재표시)—숨김이 너무 과하거나 시작 시 깜빡이면 조정 ③마커 배지 위치(친구목록 상태별 어긋남—사장님 스샷 주면 비율값 튜닝) ④아이템 아코디언 효과 표시·팀 세로스택·좌패널 LP정보·도킹 실시간 추종. **다 실기 미검증**(개발환경에 롤/Firebase 없음).
- **마커 위치 한계**: 친구목록 펼침/접힘·창모드로 팀 칸 폭이 변해 고정 비율로 완벽정렬 불가. 원하면 `config.slotFrac` 같은 사용자 조정값 추가 검토.
- **패널 숨김 vs owned-window**: 현재 "다른 앱 활성=hide". "가려지되 z만 뒤로(안 사라짐)"는 `SetWindowLongPtr(GWLP_HWNDPARENT=-8)`로 클라를 owner 지정 필요(dock 스트림에 클라 HWND 실어 보내고 electron `getNativeWindowHandle`로)—네이티브라 미구현. 사장님 요청 시.
- 데스크톱 창 잔재 기능 미이전: 「미리보기·홈 오버레이(Shift+F6)」 버튼은 트레이에만(원하면 우측 패널에 추가). desktop.js/desktopWin=레거시(미사용).
- **실기 확인**: 방장 체크→팀 짜기→홈페이지 기기에서 아이템 타이머·팀 발표·관전자 배팅 정상 노출
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
