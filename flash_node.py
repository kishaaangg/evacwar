import subprocess
import sys
import time

port = "COM5"
baud = "460800"

print(f"=== Flashing Meshtastic DIY_V1 onto {port} ===")

cmd_erase = [
    sys.executable, "-m", "esptool",
    "--port", port,
    "--baud", baud,
    "erase_flash"
]

print("1. Erasing flash...")
r1 = subprocess.run(cmd_erase, capture_output=True, text=True)
print(r1.stdout)
if r1.returncode != 0:
    print("Erase failed:", r1.stderr)
    # try 115200 baud
    print("Retrying erase with 115200...")
    cmd_erase[4] = "115200"
    r1 = subprocess.run(cmd_erase, capture_output=True, text=True)
    print(r1.stdout)
    if r1.returncode != 0:
        print("Fatal error during erase:", r1.stderr)
        sys.exit(1)
    baud = "115200"

print("2. Writing firmware binaries...")
cmd_write = [
    sys.executable, "-m", "esptool",
    "--port", port,
    "--baud", baud,
    "write_flash",
    "--flash_mode", "dio",
    "--flash_freq", "40m",
    "--flash_size", "4MB",
    "0x0", r"firmware_esp32_bin\firmware-meshtastic-diy-v1-2.7.26.54e0d8d.factory.bin",
    "0x260000", r"firmware_esp32_bin\mt-esp32-ota.bin",
    "0x300000", r"firmware_esp32_bin\littlefs-meshtastic-diy-v1-2.7.26.54e0d8d.bin"
]

r2 = subprocess.run(cmd_write, capture_output=True, text=True)
print(r2.stdout)
if r2.returncode != 0:
    print("Flash failed:", r2.stderr)
    sys.exit(1)

print("Flash SUCCESSFUL!")
