@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==================================================
echo   원신 · 바람이 시작되는 곳 (Genshin Clone)
echo ==================================================
echo.

if not exist "node_modules" (
  echo [1/3] 패키지 설치 중...
  call npm install
  if errorlevel 1 (
    echo 패키지 설치에 실패했습니다. Node.js 설치 여부를 확인해주세요.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [2/3] 프로덕션 빌드 생성 중...
  call npm run build
  if errorlevel 1 (
    echo 빌드에 실패했습니다.
    pause
    exit /b 1
  )
)

echo [3/3] 게임 서버 시작 중... 브라우저가 자동으로 열립니다.
echo 종료하려면 이 창을 닫거나 Ctrl+C를 누르세요.
echo.
call npx vite preview --port 4173 --open
pause
