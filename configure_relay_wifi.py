"""
EvakWar Relay Direct Wi-Fi + MQTT Configurator
==============================================
Configures the outdoor Relay ESP32 (REL1 with AHT20 + BMP280) to connect directly
to Wi-Fi / Mobile Hotspot and publish live weather telemetry to the EvakWar Cloud
Server over MQTT — WITHOUT touching or disabling 433.875 MHz LoRa Mesh!

Once configured, ALL phones with internet (even with NO LoRa connected and NO PC
Gateway plugged in) will automatically receive live Relay weather readings.
"""

import sys
import time
import argparse

try:
    import serial
    import serial.tools.list_ports
    import meshtastic.serial_interface
    import meshtastic.stream_interface
except ImportError as e:
    print(f"[ERROR] Missing Python dependency ({e}). Run: pip install meshtastic pyserial")
    sys.exit(1)


class WinSafeSerialInterface(meshtastic.serial_interface.SerialInterface):
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
        print("  -> Waiting for Meshtastic Relay boot...")
        start_wait = time.time()
        while time.time() - start_wait < 60:
            line = s.readline()
            if not line:
                continue
            txt = line.decode("utf-8", "ignore").strip()
            if "PowerFSM init" in txt or "Init the NimBLE" in txt or "WiFi" in txt:
                time.sleep(0.4)
                break
        s.reset_input_buffer()
        self.stream = s
        meshtastic.stream_interface.StreamInterface.connect(self)


def pick_port(cli_port=None):
    ports = list(serial.tools.list_ports.comports())
    if cli_port:
        return cli_port
    if not ports:
        print("[ERROR] No USB COM ports detected. Plug in your Relay ESP32 via USB and retry.")
        sys.exit(1)
    print("\nAvailable USB COM Ports:")
    for idx, p in enumerate(ports, start=1):
        print(f"  {idx}. {p.device}  ({p.description})")
    if len(ports) == 1:
        print(f"-> Auto-selected {ports[0].device}")
        return ports[0].device
    choice = input(f"Select port number [1-{len(ports)}]: ").strip()
    try:
        return ports[int(choice) - 1].device
    except Exception:
        return ports[0].device


def main():
    parser = argparse.ArgumentParser(description="Configure EvakWar Relay Wi-Fi + MQTT Telemetry")
    parser.add_argument("--port", help="COM port (e.g. COM4)")
    parser.add_argument("--ssid", help="2.4 GHz Wi-Fi or Phone Hotspot SSID")
    parser.add_argument("--password", help="Wi-Fi or Phone Hotspot Password")
    parser.add_argument("--broker", default="broker.emqx.io", help="MQTT broker host (default: broker.emqx.io)")
    parser.add_argument("--root", default="evakwar/sanrafael", help="MQTT root topic (default: evakwar/sanrafael)")
    parser.add_argument("--interval", type=int, default=60, help="Sensor publish interval in seconds (default: 60)")
    args = parser.parse_args()

    print("===========================================================")
    print("  EvakWar Relay (REL1) Direct Wi-Fi + MQTT Setup")
    print("  * Keeps 433.875 MHz LoRa Mesh 100% active")
    print("  * Note: ESP32 requires 2.4 GHz Wi-Fi (not 5 GHz)")
    print("===========================================================")

    port = pick_port(args.port)
    ssid = (args.ssid or input("\nEnter 2.4 GHz Wi-Fi / Hotspot Name (SSID): ")).strip()
    if not ssid:
        print("[ERROR] Wi-Fi SSID cannot be empty.")
        sys.exit(1)
    psk = args.password if args.password is not None else input("Enter Wi-Fi / Hotspot Password: ").strip()

    print(f"\nConnecting to Relay on {port}...")
    iface = WinSafeSerialInterface(devPath=port)
    try:
        node = iface.localNode
        node.ensureSessionKey()

        print("  1/5 Opening settings transaction...")
        node.beginSettingsTransaction()
        time.sleep(0.4)

        print(f"  2/5 Configuring Wi-Fi (SSID: '{ssid}')...")
        node.localConfig.network.wifi_enabled = True
        node.localConfig.network.wifi_ssid = ssid
        node.localConfig.network.wifi_psk = psk
        node.writeConfig("network")
        time.sleep(0.5)

        print(f"  3/5 Configuring MQTT JSON Telemetry ({args.broker} -> {args.root}/2/json/#)...")
        node.moduleConfig.mqtt.enabled = True
        node.moduleConfig.mqtt.address = args.broker
        node.moduleConfig.mqtt.username = ""
        node.moduleConfig.mqtt.password = ""
        node.moduleConfig.mqtt.encryption_enabled = False
        node.moduleConfig.mqtt.json_enabled = True
        node.moduleConfig.mqtt.tls_enabled = False
        node.moduleConfig.mqtt.root = args.root
        node.writeConfig("mqtt")
        time.sleep(0.5)

        print("  4/5 Enabling AHT20 + BMP280 Environment Telemetry & LoRa OK-to-MQTT...")
        node.localConfig.lora.config_ok_to_mqtt = True
        node.localConfig.lora.ignore_mqtt = False
        node.writeConfig("lora")
        time.sleep(0.4)
        node.moduleConfig.telemetry.environment_measurement_enabled = True
        node.moduleConfig.telemetry.environment_update_interval = max(30, int(args.interval))
        node.moduleConfig.telemetry.device_update_interval = 120
        node.writeConfig("telemetry")
        time.sleep(0.5)

        print("  5/5 Enabling Channel 0 MQTT Uplink & committing settings...")
        ch0 = node.getChannelByChannelIndex(0)
        if ch0:
            ch0.settings.uplink_enabled = True
            node.writeChannel(0)
            time.sleep(0.4)

        node.commitSettingsTransaction()
        time.sleep(1.5)

        print("\n===========================================================")
        print("  [SUCCESS] Relay Wi-Fi + MQTT configured!")
        print("  The Relay will reboot, join Wi-Fi, and publish AHT20+BMP280")
        print(f"  readings to https://evacwar.onrender.com every {args.interval}s.")
        print("  433.875 MHz LoRa Mesh remains active simultaneously.")
        print("===========================================================")
    finally:
        try:
            iface.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
