"""
EvakWar Relay Live Sensor Poller (Wi-Fi -> Cloud Real-Time Telemetry)
=====================================================================
Polls the battery-powered Relay ESP32 (REL1, AHT20 + BMP280) over Wi-Fi every
15 seconds (bypassing Meshtastic's 30-minute automatic broadcast floor) and
pushes live Temperature, Humidity, and Barometric Pressure readings straight to
https://evacwar.onrender.com/api/lora/weather-sensor.

No USB cable needed! Cover or warm up the sensor and watch the Typhoon page
react live in real time on all phones and PCs.
"""

import sys
import time
import json
import argparse
import urllib.request
from pubsub import pub
import meshtastic.tcp_interface


def post_to_render(server_url, node_id, env_metrics):
    temp = env_metrics.get("temperature")
    hum = env_metrics.get("relativeHumidity")
    press = env_metrics.get("barometricPressure")
    if temp is None and hum is None and press is None:
        return

    payload = json.dumps({
        "temperature": round(float(temp), 2) if temp is not None else None,
        "humidity": round(float(hum), 2) if hum is not None else None,
        "pressure": round(float(press), 2) if press is not None else None,
        "nodeId": node_id,
        "nodeName": "EvakWar Zone Relay 1 (REL1)",
        "sensorModel": "AHT20 + BMP280 (I2C)",
        "source": "RELAY_WIFI_LIVE",
        "hopsAway": 0
    }).encode("utf-8")

    url = server_url.rstrip("/") + "/api/lora/weather-sensor"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
        ts = time.strftime("%I:%M:%S %p")
        print(
            f"[{ts}] LIVE -> Temp: {temp:.2f}°C | Hum: {hum:.1f}% | Press: {press:.1f} hPa "
            f"(Cloud HTTP {status})",
            flush=True
        )
    except Exception as err:
        print(f"[WARN] Cloud push failed: {err}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="EvakWar Live Relay Wi-Fi Sensor Poller")
    parser.add_argument("--host", default="192.168.0.103", help="Relay ESP32 Wi-Fi IP (default: 192.168.0.103)")
    parser.add_argument("--server", default="https://evacwar.onrender.com", help="EvakWar Cloud URL")
    parser.add_argument("--interval", type=int, default=15, help="Poll interval in seconds (default: 15)")
    parser.add_argument("--once", action="store_true", help="Fetch & push one live reading then exit")
    args = parser.parse_args()

    print("===========================================================")
    print("  EvakWar Relay Live Wi-Fi Sensor Poller")
    print(f"  Relay IP : {args.host}")
    print(f"  Cloud URL: {args.server}")
    print(f"  Interval : every {args.interval}s (real-time reaction!)")
    print("  Press Ctrl+C to stop.")
    print("===========================================================", flush=True)

    got_one = {"done": False}
    state = {"node_id": "!0f778ab0"}

    def on_rx(packet, interface):
        try:
            dec = packet.get("decoded", {})
            if dec.get("portnum") == "TELEMETRY_APP":
                env = dec.get("telemetry", {}).get("environmentMetrics")
                if env and (env.get("temperature") is not None or env.get("relativeHumidity") is not None):
                    post_to_render(args.server, state["node_id"], env)
                    got_one["done"] = True
        except Exception as err:
            print(f"[WARN] Packet handler error: {err}", flush=True)

    pub.subscribe(on_rx, "meshtastic.receive")

    while True:
        iface = None
        try:
            print(f"\nConnecting to Relay at {args.host}...", flush=True)
            iface = meshtastic.tcp_interface.TCPInterface(args.host)
            my_num = iface.myInfo.my_node_num
            state["node_id"] = f"!{my_num:08x}"
            print(f"[CONNECTED] Relay {state['node_id']} ready! Polling live sensor...", flush=True)

            while True:
                iface.sendTelemetry(
                    destinationId=my_num,
                    wantResponse=True,
                    telemetryType="environment_metrics"
                )
                if args.once:
                    for _ in range(16):
                        if got_one["done"]:
                            return
                        time.sleep(0.5)
                    return
                time.sleep(max(5, int(args.interval)))
        except KeyboardInterrupt:
            print("\nStopped by user.")
            return
        except Exception as err:
            print(f"[RECONNECTING] Connection notice: {err} — retrying in 5s...", flush=True)
            time.sleep(5)
        finally:
            if iface is not None:
                try:
                    iface.close()
                except Exception:
                    pass


if __name__ == "__main__":
    main()
