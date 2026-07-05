# ARAM 내전 오버레이 (Electron) — v0.1.0

칼바람 내전 홈페이지(https://sohada2.github.io/aram/)의 **인게임 오버레이** 데스크톱 앱.
롤 게임 위에 **참가자 명단 + 각자 티어/LP**(홈페이지와 같은 Firebase)를 띄운다.

- **가입·로그인·설치 관문 없음** — `npm start` 또는 exe 실행 하나로 끝 (Overwolf 같은 계정/승인 불필요)
- 데이터는 **Live Client Data API(127.0.0.1:2999)** 를 직접 읽어서 표시 → 브릿지(aram-bridge) 없이도 오버레이 단독 동작
- ⚠️ **borderless(테두리없는창) 모드**에서 오버레이가 뜬다. exclusive(독점) 전체화면은 미지원(대부분 borderless 씀)

## 실행 (개발/테스트)
```bash
cd C:\Users\so\aram-overlay
npm install      # 최초 1회 (electron 내려받음)
npm start        # 앱 실행
```
- 실행하면 **데스크톱 창** + **트레이 아이콘**이 뜬다.
- 롤 게임에 들어가면(로딩 완료) **오버레이가 자동 표시**된다. **Shift+F5** 로 토글, 헤더 드래그로 이동.
- 트레이 아이콘 우클릭 → 토글 / 홈페이지 열기 / 종료.

## 배포 (팀원 나눠주기) — 나중에
```bash
npx @electron/packager . "ARAM내전오버레이" --platform=win32 --arch=x64 --icon=assets/icon.png --overwrite
```
→ 폴더 통째로(또는 zip) 전달하면 팀원은 그 안의 exe만 실행. (인스톨러가 필요하면 electron-builder로 전환)

## 동작 원리
- **게임 감지**: `https://127.0.0.1:2999/liveclientdata/playerlist` 응답 여부(게임 중에만 응답). 메인 프로세스가 2.5초마다 폴링.
- **참가자 이름**: playerlist의 `riotIdGameName || summonerName || riotId`.
- **LP/티어**: Firebase `season2/players`(공개 read)에서 이름 매칭(정규화=공백제거+소문자). 매칭 안 되면 `—`.
- 창/트레이/단축키는 Electron이 담당. HTTPS(자체서명 2999 포함)는 메인 프로세스에서 처리(렌더러 CORS 회피).

## 구조
```
aram-overlay/
  main.js            # Electron 메인: 창·트레이·단축키 + 데이터 폴링
  preload.js         # 렌더러에 안전 API 노출(contextBridge)
  overlay/           # 인게임 오버레이(투명·항상위·명단+LP)
  desktop/           # 데스크톱 창(상태·홈페이지 열기)
  assets/icon.png    # 아이콘(플레이스홀더 — 나중에 로고로)
```

## 실사용 검증 포인트 (실게임 필요)
- 게임 로딩 후 오버레이에 명단이 뜨는지 / 팀색 맞는지
- LP 배지: **롤 인게임 이름 == 홈페이지 등록 닉네임** 이어야 매칭됨(다르면 `—`). 이름 매핑 개선이 다음 우선순위.
- 오버레이가 게임 위로 올라오는지(borderless 권장). 안 뜨면 롤 설정 → 그래픽 → 창모드를 "테두리 없음"으로.

## 로드맵
- [ ] 이름 매칭 개선(riotId ↔ 홈페이지 닉네임 매핑)
- [ ] 정산·투표 오버레이(게임 끝나면 알트탭 없이)
- [ ] 이 앱이 브릿지 역할 겸함(LCU/게임데이터 → Firebase 전송까지) = 프로그램 하나로 통합
- [ ] 오버레이에 홈페이지 컴팩트 뷰(`index.html?overlay`) 재사용
- [ ] electron-builder 인스톨러 + 자동 업데이트

## 홈페이지·브릿지와의 관계
- **홈페이지(aram)** · **브릿지(aram-bridge)** 는 그대로. 이 앱은 별개이며 **같은 Firebase 공유**로 연동.
- 모바일/다른 PC는 홈페이지로 접속하면 됨.
