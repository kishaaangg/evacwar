import sys
import time
import serial
import subprocess

PORT = 'COM4'
BAUD = 115200

print("=" * 65)
print(" EVAKWAR LIVE LORA RADIO HARDWARE DETECTOR")
print(f" Monitoring {PORT} for SX1278 SPI handshake...")
print("=" * 65)
print(">>> TIP: Tap the 'EN' (or 'RST') button on your ESP32 to trigger boot check! <<<\n")

def configure_stf3():
    print("\n" + "#" * 65)
    print(" 🎉 SX1278 RADIO DETECTED! APPLYING STAFF PROFILE NOW...")
    print("#" * 65)
    time.sleep(2)
    cmd = [
        sys.executable, "-m", "meshtastic",
        "--port", PORT,
        "--set", "lora.region", "EU_433",
        "--set", "lora.tx_power", "10",
        "--set", "lora.hop_limit", "3",
        "--set", "position.gps_mode", "NOT_PRESENT",
        "--set-owner", "Staff Sinfuego",
        "--set-owner-short", "STF3"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)
    if "Setting device owner" in res.stdout or res.returncode == 0:
        print("\n🎉🎉🎉 CONGRATULATIONS! STAFF NODE CONFIGURED AS STF3_ca70!")
        print("You can now pair via Bluetooth in EvakWar!")
    else:
        print("Config output:", res.stdout, res.stderr)

try:
    with serial.Serial(PORT, BAUD, timeout=1) as ser:
        ser.dtr = False
        ser.rts = False
        start_time = time.time()
        while True:
            line = ser.readline()
            if line:
                try:
                    text = line.decode('utf-8', errors='replace').strip()
                except Exception:
                    continue
                if not text:
                    continue
                
                # Check for Radio Handshake
                if "RF95 init result" in text or "No RF95 radio" in text or "RF95Interface" in text:
                    print(f"  [HARDWARE LOG]: {text}")
                    if "RF95 init result 0" in text:
                        print("\n>>> MATCH! SX1278 responded with STATUS 0 (SUCCESS)! <<<")
                        ser.close()
                        configure_stf3()
                        break
                    elif "RF95 init result -2" in text or "No RF95 radio" in text:
                        print("  ❌ STATUS: Chip Not Detected (-2). Wiggle/check NSS(D18), MOSI(D27), MISO(D19), SCK(D5), 3V3, GND.")
                elif "Booted" in text or "reboots:" in text.lower():
                    print(f"  [BOOT]: {text}")
except KeyboardInterrupt:
    print("\nExited detector.")
except Exception as e:
    print(f"\n[ERROR] Port error on {PORT}: {e}")
