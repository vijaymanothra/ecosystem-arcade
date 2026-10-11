@echo off
rem Launches Evernorth City fullscreen in Microsoft Edge kiosk mode (exit with Alt+F4).
start "" msedge --kiosk "file:///%~dp0index.html" --edge-kiosk-type=fullscreen --no-first-run
