@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo Promoting the latest internal build to closed testing (alpha)...
node "%~dp0...._scriptsplay-promote.mjs" --package com.lightonpluslab.deepdesk --key "%~dp0....momoi-flutter.play-publisher-key.json" --from-track internal --to-track alpha --notes-dir "%~dp0play-notes" %*
if errorlevel 1 goto :fail
echo.
echo DONE. Play Console ^> 게시 개요 에서 검토 상태를 확인하세요.
pause
exit /b 0
:fail
echo.
echo FAILED — 위 메시지를 확인하세요.
pause
exit /b 1
