@echo off
rem Double-click to stop a running HiPHI Motion Viewer.
rem
rem Closing the viewer's terminal window does not reliably stop it on Windows,
rem so this finds the HiPHI viewer listening on the port and ends it.
rem
rem Pass a port number to stop a viewer started with --port, e.g.
rem     stop-viewer.bat 9000

cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8666"

set "PYTHON="
where py >nul 2>nul && set "PYTHON=py"
if not defined PYTHON where python >nul 2>nul && set "PYTHON=python"
if not defined PYTHON where python3 >nul 2>nul && set "PYTHON=python3"

if not defined PYTHON (
    echo Python was not found on this computer.
    set "STOP_RESULT=1"
    goto done
)

%PYTHON% -m hiphi_motion_viewer.stop "%PORT%"
set "STOP_RESULT=%ERRORLEVEL%"

:done
rem pause rather than timeout: `timeout` is missing or shadowed in some shells,
rem and on a double-click the window would close before the message is read.
pause
exit /b %STOP_RESULT%
