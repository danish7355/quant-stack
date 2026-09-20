@echo off
title Create QUANT PRO Desktop Shortcut
cd /d "%~dp0"

echo ============================================================
echo       QUANT PRO - Create Desktop Shortcut Launcher          
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut([System.IO.Path]::Combine($desktop, 'QUANT PRO Dashboard.lnk')); $s.TargetPath = [System.IO.Path]::Combine('%~dp0', 'run_dash.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Start QUANT PRO Trading Dashboard & Engine'; $s.Save(); Write-Host 'Shortcut created at:' $desktop"

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] "QUANT PRO Dashboard" shortcut has been created on your Desktop!
    echo You can now double-click the icon directly from your Windows Desktop.
    echo.
) else (
    echo.
    echo [ERROR] Failed to create desktop shortcut.
    echo.
)
pause
