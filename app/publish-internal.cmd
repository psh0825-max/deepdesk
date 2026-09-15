@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo [1/2] Building release AAB...
call flutter build appbundle --release
if errorlevel 1 goto :fail
echo [2/2] Uploading to Google Play (internal)...
node "%~dp0..\..\_scripts\play-upload-internal.mjs" --package com.lightonpluslab.deepdesk --aab "%~dp0build\app\outputs\bundle\release\app-release.aab" --key "%~dp0..\..\momoi-flutter\.play-publisher-key.json" --track internal --notes-dir "%~dp0play-notes" %*
if errorlevel 1 goto :fail
echo.
echo DONE. Play Console ^> Testing ^> Internal testing 에서 확인하세요.
pause
exit /b 0
:fail
echo.
echo FAILED — 위 메시지를 확인하세요.
pause
exit /b 1
