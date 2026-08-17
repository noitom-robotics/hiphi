@echo off
rem Double-click to start the HiPHI Motion Viewer.
rem You can also drag an extracted HiPHI folder (or a .bvh file) onto this file
rem to open it directly.

cd /d "%~dp0"

rem Detected with && rather than a nested if: %errorlevel% inside a
rem parenthesised block expands when the block is parsed, not when it runs,
rem which would read the previous command's code.
set "PYTHON="
where py >nul 2>nul && set "PYTHON=py"
if not defined PYTHON where python >nul 2>nul && set "PYTHON=python"
if not defined PYTHON where python3 >nul 2>nul && set "PYTHON=python3"

if not defined PYTHON (
    echo.
    echo Python was not found on this computer.
    echo.
    echo Install Python 3.9 or newer from https://www.python.org/downloads/
    echo During installation, tick "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

rem %* forwards a dragged-on path as well as any options such as --port.
%PYTHON% -m hiphi_motion_viewer %*

rem Keep the window open if it stopped because of an error.
if errorlevel 1 pause
