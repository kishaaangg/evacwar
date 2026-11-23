@echo off
cd /d "%~dp0"
python relay_live_poller.py --host 192.168.0.103 --interval 15
pause
