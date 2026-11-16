"""
EvakWar Node Setup & Flasher Tool
=================================
Automates flashing and configuring any ESP32 + SX1278 node for the EvakWar LoRa Mesh.
Compatible with unlimited Resident, Rescuer, Staff, Relay, and Gateway nodes.
"""

import sys
import os
import time
import subprocess
import argparse

try:
    import serial.tools.list_ports
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "pyserial"])
    import serial.tools.list_ports

def get_available_ports():
    ports = list(serial.tools.list_ports.comports())
    return [p.device for p in ports]

def find_default_port():
    ports = get_available_ports()
    if not ports:
        return None
    # Prefer COM ports other than COM3 (COM3 is typically Hall Gateway) if multiple exist
    for p in ports:
        if p != "COM3":
            return p
    return ports[0]

def run_command_live(cmd, timeout=90):
    """
    Runs a subprocess while streaming its stdout/stderr in real-time to the console,
    with an enforceable timeout so it never hangs indefinitely.
    """
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        start_time = time.time()
        while True:
            line = proc.stdout.readline()
            if line:
                sys.stdout.write(line)
                sys.stdout.flush()
            elif proc.poll() is not None:
                break
            
            if time.time() - start_time > timeout:
                proc.kill()
                print(f"\n[ERROR] Command timed out after {timeout} seconds.")
                return 1
        return proc.returncode
    except Exception as e:
        print(f"\n[ERROR] Exception executing command: {e}")
        return 1

def flash_firmware(port):
    print(f"\n=======================================================")
    print(f" [1/2] FLASHING MESHTASTIC DIY_V1 FIRMWARE ON {port}")
    print(f"=======================================================")
    
    bin_dir = os.path.join(os.path.dirname(__file__), "firmware_esp32_bin")
    factory_bin = os.path.join(bin_dir, "firmware-meshtastic-diy-v1-2.7.26.54e0d8d.factory.bin")
    ota_bin = os.path.join(bin_dir, "mt-esp32-ota.bin")
    littlefs_bin = os.path.join(bin_dir, "littlefs-meshtastic-diy-v1-2.7.26.54e0d8d.bin")

    if not os.path.exists(factory_bin):
        print(f"[ERROR] Firmware binary not found at {factory_bin}")
        return False

    print("\n[HARDWARE CONNECTION NOTE]")
    print("If your ESP32 displays 'Connecting........':")
    print(">>> PRESS AND HOLD THE 'BOOT' (or 'IO0') BUTTON ON YOUR ESP32! <<<")
    print(">>> Release 'BOOT' as soon as erasing starts! <<<\n")

    print(f"-> Erasing existing flash on {port} (460800 baud)...")
    cmd_erase = [sys.executable, "-m", "esptool", "--port", port, "--baud", "460800", "--connect-attempts", "7", "erase_flash"]
    ret = run_command_live(cmd_erase, timeout=40)

    if ret != 0:
        print(f"\n-> Erase at 460800 baud did not complete. Retrying at 115200 baud...")
        print(">>> HOLD DOWN THE 'BOOT' BUTTON ON YOUR ESP32 NOW! <<<")
        cmd_erase_115 = [sys.executable, "-m", "esptool", "--port", port, "--baud", "115200", "--connect-attempts", "10", "erase_flash"]
        ret = run_command_live(cmd_erase_115, timeout=45)

        if ret != 0:
            print("\n=======================================================")
            print(" [HOW TO FIX FLASH CONNECTION]")
            print("=======================================================")
            print("1. Unplug the ESP32 USB cable from your computer, then plug it back in.")
            print("2. HOLD DOWN the 'BOOT' (IO0) button on your ESP32 board.")
            print("3. While holding 'BOOT', run flash_node.bat again.")
            print("4. Release 'BOOT' as soon as erasing starts!")
            print("=======================================================")
            return False

    print(f"\n-> Writing Meshtastic DIY_V1 firmware (4MB, 433MHz compatible)...")
    cmd_write = [
        sys.executable, "-m", "esptool",
        "--port", port,
        "--baud", "460800",
        "write_flash",
        "--flash_mode", "dio",
        "--flash_freq", "40m",
        "--flash_size", "4MB",
        "0x0", factory_bin,
        "0x260000", ota_bin,
        "0x300000", littlefs_bin
    ]
    ret_write = run_command_live(cmd_write, timeout=120)

    if ret_write != 0:
        print(f"\n-> Retrying firmware write at 115200 baud for maximum signal reliability...")
        cmd_write_115 = [
            sys.executable, "-m", "esptool",
            "--port", port,
            "--baud", "115200",
            "write_flash",
            "--flash_mode", "dio",
            "--flash_freq", "40m",
            "--flash_size", "4MB",
            "0x0", factory_bin,
            "0x260000", ota_bin,
            "0x300000", littlefs_bin
        ]
        ret_write = run_command_live(cmd_write_115, timeout=180)
        if ret_write != 0:
            print("[ERROR] Writing firmware binary failed.")
            return False

    print("\n=======================================================")
    print(" 🎉 [SUCCESS] FIRMWARE FLASHED SUCCESSFULLY!")
    print("=======================================================")
    print(">>> IMPORTANT HARDWARE STEP:")
    print(">>> TAP THE 'EN' (or 'RST') BUTTON ON YOUR ESP32 ONCE! <<<")
    print(">>> (Or unplug and re-plug the USB cable)")
    print(">>> This restarts the chip into normal Meshtastic mode.")
    print("=======================================================")
    print("Waiting 15 seconds for ESP32 LittleFS initialization...")
    time.sleep(15)
    return True

def configure_node(port, long_name, short_name, role_name):
    print(f"\n=======================================================")
    print(f" [2/2] CONFIGURING LORA MESH SETTINGS ON {port}")
    print(f"=======================================================")
    print(f"  Long Name  : {long_name}")
    print(f"  Short Code : {short_name}")
    print(f"  Role       : {role_name}")
    print(f"  Frequency  : 433.875 MHz (EU_433)")
    print(f"  Preset     : LONG_FAST (SF11 / BW 250kHz)")
    print(f"  Hop Limit  : 3")
    print(f"-------------------------------------------------------")

    print("\n-> Connecting to ESP32 and saving mesh settings directly to Flash...")
    print("[TIP] If connection times out, TAP the 'EN' (or 'RST') button on the ESP32 once!\n")

    try:
        import serial
        import meshtastic.serial_interface
        import meshtastic.stream_interface
        from meshtastic.protobuf import admin_pb2, config_pb2

        class WinSafeSerialInterface(meshtastic.serial_interface.SerialInterface):
            """Opens the serial port once and waits for Meshtastic boot completion before starting protobuf handshake."""
            def connect(self):
                s = serial.Serial()
                s.port = self.devPath
                s.baudrate = 115200
                s.timeout = 0.5
                s.write_timeout = 0
                s.dtr = False
                s.rts = True
                s.open()
                time.sleep(0.1)
                s.rts = False
                print("  -> Waking ESP32 and waiting for Meshtastic radio initialization...")
                start_wait = time.time()
                saw_no_llcc68 = False
                while time.time() - start_wait < 85:
                    line = s.readline()
                    if not line:
                        continue
                    txt = line.decode('utf-8', 'ignore').strip()
                    if any(k in txt for k in ['Booted, wake cause', 'MESHTASTIC', 'SetCpuFrequencyMhz']):
                        saw_no_llcc68 = False
                    if 'RF95 init result 0' in txt or 'RF95 init success' in txt:
                        print("     [OK] SX1278 (RF95) 433MHz radio initialized!")
                    elif 'RF95 init result -2' in txt:
                        print("     [WAIT] Radio probe in progress (waiting ~60s for auto-soft-reboot)...")
                    elif 'No LLCC68 radio' in txt:
                        saw_no_llcc68 = True
                    if 'PowerFSM init' in txt and not saw_no_llcc68:
                        time.sleep(0.5)
                        break
                    if 'Init the NimBLE' in txt or ' battery hardware ' in txt:
                        time.sleep(0.3)
                        break
                s.reset_input_buffer()
                self.stream = s
                meshtastic.stream_interface.StreamInterface.connect(self)

        iface = WinSafeSerialInterface(devPath=port)
        node = iface.localNode
        node.ensureSessionKey()

        print("  1/4 Opening settings transaction...")
        node.beginSettingsTransaction()
        time.sleep(0.5)

        print(f"  2/4 Setting Owner Profile: '{long_name}' ({short_name})...")
        node.setOwner(long_name=long_name, short_name=short_name)
        time.sleep(0.5)

        print("  3/4 Setting LoRa Region EU_433 (433.875 MHz, LONG_FAST) & GPS profile...")
        node.localConfig.lora.region = config_pb2.Config.LoRaConfig.RegionCode.EU_433
        node.localConfig.lora.use_preset = True
        node.localConfig.lora.modem_preset = config_pb2.Config.LoRaConfig.ModemPreset.LONG_FAST
        node.localConfig.lora.hop_limit = 3
        node.localConfig.lora.tx_power = 10
        node.writeConfig('lora')
        time.sleep(0.5)

        node.localConfig.position.gps_mode = config_pb2.Config.PositionConfig.GpsMode.NOT_PRESENT
        node.writeConfig('position')
        time.sleep(0.5)

        # Prevent floating GPIO35 battery ADC from triggering false low-voltage deep sleep on bare ESP32 boards
        node.localConfig.power.adc_multiplier_override = 4.0
        node.writeConfig('power')
        time.sleep(0.5)

        # Ensure Bluetooth is enabled so the node always advertises over BLE
        node.localConfig.bluetooth.enabled = True
        node.writeConfig('bluetooth')
        time.sleep(0.5)

        # Move button_gpio off floating input-only GPIO39 (which lacks internal pullup and causes 30s phantom shutdown)
        node.localConfig.device.button_gpio = 13
        node.localConfig.device.disable_triple_click = True
        if role_name == "RELAY":
            node.localConfig.device.role = config_pb2.Config.DeviceConfig.Role.ROUTER_CLIENT
        node.writeConfig('device')
        time.sleep(0.5)

        print("  4/4 Flushing preferences directly to LittleFS Flash (/prefs/device.proto & /prefs/config.proto)...")
        p_backup = admin_pb2.AdminMessage()
        p_backup.backup_preferences = admin_pb2.AdminMessage.BackupLocation.FLASH
        node._sendAdmin(p_backup)
        time.sleep(1.5)

        p_restore = admin_pb2.AdminMessage()
        p_restore.restore_preferences = admin_pb2.AdminMessage.BackupLocation.FLASH
        node._sendAdmin(p_restore)
        time.sleep(1.5)

        # AdminModule::restore_preferences calls reboot(1000) (1000 seconds!) after disabling Bluetooth.
        # Override rebootAtMsec to 1 second so the ESP32 reboots immediately and turns Bluetooth back on!
        p_reboot = admin_pb2.AdminMessage()
        p_reboot.reboot_seconds = 1
        node._sendAdmin(p_reboot)
        print("  -> Waiting 6 seconds for ESP32 soft-reboot and NimBLE Bluetooth startup...")
        iface.debugOut = sys.stdout
        time.sleep(6.5)
        iface.debugOut = None
        iface.close()

        print("\n=======================================================")
        print(f" 🎉 [SUCCESS] NODE CONFIGURED AND READY!")
        print(f"=======================================================")
        print(f"  Role       : {role_name}")
        print(f"  Short Name : {short_name}")
        print(f"  Long Name  : {long_name}")
        print(f"  LoRa Freq  : 433.875 MHz (EU_433)")
        print(f"=======================================================")
        print(f" You can now use this ESP32 node as your {role_name} node!")
        return True
    except Exception as e:
        print(f"\n[ERROR] Failed to configure node on {port}: {e}")
        print("[NOTICE] Please tap 'EN' on your ESP32 and run '3) Configure Mesh Only' again.")
        return False

def monitor_serial(port):
    print(f"\n=======================================================")
    print(f" [DIAGNOSTIC] LIVE SERIAL MONITOR ON {port} (115200 baud)")
    print(f"=======================================================")
    print("-> Reading live ESP32 serial logs...")
    print("-> Press Ctrl+C to exit monitor.\n")
    print(">>> TIP: Tap the 'EN' (or 'RST') button on your ESP32 to view its boot sequence! <<<\n")
    try:
        import serial
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = 115200
        ser.timeout = 1
        ser.dtr = False
        ser.rts = False
        ser.open()
        with ser:
            while True:
                line = ser.readline()
                if line:
                    try:
                        print(line.decode('utf-8', errors='replace'), end='')
                    except Exception:
                        pass
    except KeyboardInterrupt:
        print("\n\nExited serial monitor.")
    except Exception as e:
        print(f"\n[ERROR] Could not open {port}: {e}")

def main():
    parser = argparse.ArgumentParser(description="EvakWar Multi-Node Flasher & Configurator")
    parser.add_argument("--port", help="Serial COM Port (e.g. COM5)")
    parser.add_argument("--flash", action="store_true", help="Flash firmware")
    parser.add_argument("--config", action="store_true", help="Configure mesh settings")
    parser.add_argument("--role", choices=["RESIDENT", "RESCUER", "STAFF", "RELAY"], default="RESIDENT")
    parser.add_argument("--name", help="Long name (e.g. 'Resident Juan Dela Cruz')")
    parser.add_argument("--short", help="Short name (e.g. 'RES2')")

    args = parser.parse_args()
    port = args.port or find_default_port()

    if not port:
        print("[ERROR] No ESP32 serial port detected! Please plug in an ESP32 via USB and try again.")
        sys.exit(1)

    print(f"Target serial port: {port}")

    # Interactive mode if no flags given
    if not args.flash and not args.config:
        print("\nWhat would you like to do?")
        print("  1) Flash Firmware + Configure Mesh (Full Setup)")
        print("  2) Flash Firmware Only")
        print("  3) Configure Mesh Only (Already flashed)")
        print("  4) Live Serial Monitor (Diagnose ESP32 boot & check error messages)")
        choice = input("Select [1/2/3/4] (default: 1): ").strip() or "1"
        
        if choice == "4":
            monitor_serial(port)
            return

        do_flash = (choice in ["1", "2"])
        do_config = (choice in ["1", "3"])

        if do_config:
            print("\nSelect Node Role:")
            print("  1) RESIDENT (For community members & households)")
            print("  2) RESCUER  (For disaster response rescue teams)")
            print("  3) STAFF    (For evacuation center management)")
            print("  4) RELAY    (Mesh repeater / router client)")
            r_choice = input("Select role [1/2/3/4] (default: 1): ").strip() or "1"
            roles = {"1": "RESIDENT", "2": "RESCUER", "3": "STAFF", "4": "RELAY"}
            role_name = roles.get(r_choice, "RESIDENT")

            def_short = {"RESIDENT": "RES2", "RESCUER": "RSC1", "STAFF": "STF1", "RELAY": "REL2"}[role_name]
            def_name = {"RESIDENT": "Resident User", "RESCUER": "EvakWar Rescuer", "STAFF": "EvakWar Staff", "RELAY": "Zone Repeater"}[role_name]

            long_name = input(f"Enter Long Name (default: '{def_name}'): ").strip() or def_name
            raw_short = input(f"Enter Short Code (max 4 chars, default: '{def_short}'): ").strip() or def_short
            short_name = raw_short.replace('_', '').replace('-', '')[:4].upper()
            if len(short_name) < 2:
                short_name = def_short
        else:
            role_name = args.role
            long_name = args.name or "EvakWar Node"
            short_name = args.short or "NODE"
    else:
        do_flash = args.flash
        do_config = args.config
        role_name = args.role
        long_name = args.name or f"EvakWar {role_name.capitalize()}"
        short_name = args.short or role_name[:3] + "1"

    if do_flash:
        ok = flash_firmware(port)
        if not ok:
            print("[ERROR] Flashing failed. Please check cable or hold BOOT button.")
            sys.exit(1)

    if do_config:
        configure_node(port, long_name, short_name, role_name)

if __name__ == "__main__":
    main()
