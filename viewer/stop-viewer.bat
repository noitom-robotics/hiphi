@echo off
rem Double-click to stop a running HiPHI Motion Viewer.
rem
rem Closing the viewer's terminal window does not reliably stop it on Windows,
rem so this finds whatever is listening on the port and ends it.
rem
rem Pass a port number to stop a viewer started with --port, e.g.
rem     stop-viewer.bat 9000

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8666"

set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    set "FOUND=1"
    echo Stopping process %%p on port %PORT%
    taskkill /F /PID %%p >nul 2>nul
)

if not defined FOUND (
    echo Nothing is listening on port %PORT% - the viewer is not running.
) else (
    echo Viewer stopped.
)

rem pause rather than timeout: `timeout` is missing or shadowed in some shells,
rem and on a double-click the window would close before the message is read.
pause
