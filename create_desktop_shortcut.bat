@echo off
title Create QUANT PRO Desktop Shortcut
cd /d "%~dp0"

echo ============================================================
echo       QUANT PRO - Create Desktop Shortcut Launcher          
echo ============================================================
echo.

node -e "const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'); const p=path.join(os.homedir(),'Desktop','QUANT PRO Dashboard.lnk'); const dir=process.cwd(); const bat=path.join(dir,'run_dash.bat'); const ps=\`\$sh=New-Object -ComObject WScript.Shell;\$s=\$sh.CreateShortcut('\${p.replace(/'/g, \"''\")}');\$s.TargetPath='cmd.exe';\$s.Arguments='/c \"\${bat.replace(/\"/g, '\"\"')}\"';\$s.WorkingDirectory='\${dir.replace(/'/g, \"''\")}';\$s.WindowStyle=1;\$s.Description='Start QUANT PRO Trading Engine & Dashboard';\$s.IconLocation='shell32.dll,14';\$s.Save();\`; cp.execSync('powershell -NoProfile -Command -',{input:ps}); console.log('Shortcut created on Desktop successfully!');"

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] "QUANT PRO Dashboard" shortcut has been created on your Desktop!
    echo Double-click the desktop icon to launch the engine and open the site.
    echo.
) else (
    echo.
    echo [ERROR] Failed to create desktop shortcut.
    echo.
)
pause
