@echo off
title EvakWar 433.875 MHz LoRa USB Live Diagnostic
cd /d "%~dp0"
python scripts\test-lora-usb.py %*
pause
