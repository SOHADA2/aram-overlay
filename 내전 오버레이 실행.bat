@echo off
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing components, please wait...
  call npm install
)

echo Starting ARAM overlay...  (keep this window open while using)
echo To quit: right-click the tray icon and choose Quit.
echo.
"node_modules\electron\dist\electron.exe" .

echo.
echo App closed. If it failed, read the messages above.
pause
