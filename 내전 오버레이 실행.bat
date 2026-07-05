@echo off
chcp 65001 >nul
title ARAM 내전 오버레이
cd /d "%~dp0"

echo ===============================================
echo   ARAM 내전 오버레이 실행 중...
echo   (이 검은 창은 켜져 있는 동안 그대로 두세요)
echo   끄려면: 트레이 아이콘 우클릭 - 종료
echo ===============================================
echo.

if not exist "node_modules\electron\dist\electron.exe" (
  echo [준비] 최초 1회 구성 요소를 내려받는 중... 잠시만요.
  call npm install
)

"node_modules\electron\dist\electron.exe" .

echo.
echo 앱이 종료되었습니다. 문제가 있었다면 위 메시지를 확인하세요.
pause
