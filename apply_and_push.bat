@echo off
setlocal
set "REPO=D:\AI Tools\jubeidanci"
set "BASE=%~dp0"

echo =========================================================
echo  Repo : %REPO%
echo  This script is in: %BASE%
echo  IMPORTANT: put a2-writing-final.zip in the SAME folder
echo             as this .bat file, then double-click.
echo =========================================================

cd /d "%REPO%"
if errorlevel 1 (
  echo [ERROR] Repo not found at %REPO%
  echo         Fix the REPO path at the top of this .bat.
  pause
  exit /b 1
)

echo === git pull --rebase ===
git pull --rebase
if errorlevel 1 (
  echo [ERROR] git pull failed - check network / run 'gh auth login'
  pause
  exit /b 1
)

if not exist "%BASE%a2-writing-final.zip" (
  echo [ERROR] a2-writing-final.zip NOT found in: %BASE%
  echo         Download a2-writing-final.zip and place it NEXT TO this .bat.
  pause
  exit /b 1
)

echo === unzip (from same folder as .bat) ===
powershell -NoProfile -Command "Expand-Archive -Force '%BASE%a2-writing-final.zip' '%BASE%a2-writing-final'"
if errorlevel 1 (
  echo [ERROR] unzip failed.
  pause
  exit /b 1
)

echo === copy A2 writing files into repo ===
xcopy /Y /I "%BASE%a2-writing-final\a2-writing-course.md" "%REPO%\content\"
xcopy /Y /I "%BASE%a2-writing-final\a2-writing-unit-*.md" "%REPO%\content\"
xcopy /Y /I "%BASE%a2-writing-final\scripts\*.py" "%REPO%\scripts\"

echo === git add + status ===
cd /d "%REPO%"
git add -A
git status

echo.
choice /M "Commit and push the A2 writing course now? (Y/N)"
if errorlevel 2 goto :skip

echo === git commit ===
git commit -m "feat(content): add A2 writing course (10 units, 80-100 words per answer/acceptAlso)"
echo === git push ===
git push
if errorlevel 1 (
  echo [ERROR] push failed - run 'gh auth login' then double-click this .bat again.
  pause
  exit /b 1
)
echo === DONE: A2 writing course pushed to GitHub ===

:skip
echo.
echo Finished. You can close this window.
pause
