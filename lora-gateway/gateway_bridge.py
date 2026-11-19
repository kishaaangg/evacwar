"""
EvakWar 433.875 MHz LoRa Mesh Gateway Bridge (Barangay Hall Command Center)
===========================================================================
Connects Node 1 (EvakWar Hall Gateway: !d88b1a58, ESP32 + SX1278 433MHz on COM3)
to the EvakWar Express + Socket.IO Server in EBAKWAR_testing (http://localhost:8080).

Verified Hardware Nodes on 433.875 MHz (EU_433, hop_limit=3, tx_power=10):
  - Node 1 (HALL): !d88b1a58 — Barangay Hall USB Gateway
  - Node 2 (REL1): !0f778ab0 — Zone Relay 1 (Elevated Mesh Repeater)
  - Node 3 (RES1): !f4e213d4 — EvakWar Resident 1 Mobile Node

Functions:
1. Listens for inbound EVW|SOS|..., EVW|CAN|..., EVW|PNG|... packets over 433.875 MHz RF
   and forwards them immediately to POST /api/lora/rx -> Live Admin/Staff/Rescuer Map & Siren.
2. Polls GET /api/lora/tx-queue for outbound EVW|ACK|... (Rescuer Dispatched) and
   EVW|ALT|... (Typhoon/Evacuation Broadcasts) and transmits them over 433.875 MHz LoRa Mesh.
3. Syncs live Meshtastic NodeDB telemetry (RSSI, SNR, Hops, Online status) to
   POST /api/lora/nodes/heartbeat.
"""

import os
import sys
import time
import json
import base64
import urllib.request
import urllib.error
from datetime import datetime

# Guarantee UTF-8 console output on Windows to prevent UnicodeEncodeError ('charmap' crashes)
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import meshtastic
    import meshtastic.serial_interface
    from pubsub import pub
except ImportError:
    print("[ERROR] 'meshtastic' Python package is required. Run: pip install meshtastic pypubsub")
    sys.exit(1)

SERVER_URL = os.environ.get("EVAKWAR_SERVER_URL", "http://127.0.0.1:8080")
SERIAL_PORT = os.environ.get("EVAKWAR_LORA_PORT", "COM3")

# Parse command line overrides
for idx, arg in enumerate(sys.argv):
    if arg in ("--server", "-s") and idx + 1 < len(sys.argv):
        SERVER_URL = sys.argv[idx + 1]
    elif arg in ("--port", "-p") and idx + 1 < len(sys.argv):
        SERIAL_PORT = sys.argv[idx + 1]

if "localhost" in SERVER_URL:
    SERVER_URL = SERVER_URL.replace("localhost", "127.0.0.1")
POLL_INTERVAL_SEC = 1.0
HEARTBEAT_INTERVAL_SEC = 2.5

interface = None
seen_packet_ids = set()
last_sensor_post_at = 0.0
last_sensor_req_at = 0.0
last_sensor_signature = None


def extract_env_metrics(packet_or_node):
    """Extracts (temp, humidity, pressure) from a Meshtastic telemetry packet or NodeDB entry."""
    if not isinstance(packet_or_node, dict):
        return None
    env = packet_or_node.get("environmentMetrics")
    if not env:
        decoded = packet_or_node.get("decoded", {})
        tel = decoded.get("telemetry", {})
        if isinstance(tel, dict):
            env = tel.get("environmentMetrics")
    if not isinstance(env, dict):
        return None

    temp = env.get("temperature")
    hum = env.get("relativeHumidity")
    press = env.get("barometricPressure")
    if temp is None and hum is None and press is None:
        return None

    t_val = round(float(temp), 2) if temp is not None else None
    h_val = round(float(hum), 2) if hum is not None else None
    p_val = round(float(press), 2) if press is not None else None

    # Detect disconnected/loose I2C bus reads (BMP280 raw 0xFFFFFF -> 177.6C / -176.4hPa, AHT20 -> 0% RH)
    t_ok = (t_val is not None) and (-10.0 <= t_val <= 65.0)
    h_ok = (h_val is not None) and (1.0 <= h_val <= 100.0)
    p_ok = (p_val is not None) and (850.0 <= p_val <= 1100.0)
    if not t_ok and not h_ok and not p_ok:
        print(
            f"[Sensor I2C Warning] Ignored corrupted I2C read (Temp={t_val}C, Hum={h_val}%, Press={p_val}hPa). "
            "Check SDA(D21)/SCL(D22)/3V3/GND jumper wires and press EN on Relay!",
            flush=True
        )
        return None

    return {
        "temperature": t_val if t_ok else None,
        "humidity": h_val if h_ok else None,
        "pressure": p_val if p_ok else None,
    }


def push_sensor_reading(metrics, node_id="!0f778ab0", node_name="EvakWar Zone Relay 1 (REL1)", rssi=None, snr=None, hops=0, broadcast_lora=False):
    global last_sensor_post_at, last_sensor_signature
    if not metrics:
        return
    sig = (metrics.get("temperature"), metrics.get("humidity"), metrics.get("pressure"), node_id)
    now = time.time()
    # Post real sensor readings at most once every 50s (or immediately if values changed)
    if sig == last_sensor_signature and (now - last_sensor_post_at) < 50.0:
        return
    if (now - last_sensor_post_at) < 15.0:
        return

    payload = {
        "temperature": metrics.get("temperature"),
        "humidity": metrics.get("humidity"),
        "pressure": metrics.get("pressure"),
        "nodeId": node_id,
        "nodeName": node_name,
        "sensorModel": "AHT20 + BMP280 (I2C)",
        "hopsAway": hops,
        "source": "LORA_AHT20_BMP280",
        "broadcastLoRa": broadcast_lora,
        "updatedAt": datetime.now().astimezone().isoformat(),
    }
    if rssi is not None:
        payload["rssi"] = rssi
    if snr is not None:
        payload["snr"] = snr

    res = http_post("/api/lora/weather-sensor", payload)
    if res and res.get("success"):
        last_sensor_post_at = now
        last_sensor_signature = sig
        print(
            f"[Sensor AHT20+BMP280 {node_id}] Temp={metrics.get('temperature')}C "
            f"Humidity={metrics.get('humidity')}% Pressure={metrics.get('pressure')}hPa",
            flush=True
        )


def http_post(path, payload):
    url = f"{SERVER_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[Bridge HTTP POST Error] {path}: {e}", flush=True)
        return None


def http_get(path):
    url = f"{SERVER_URL}{path}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None


def extract_evw_text(packet):
    """Safely extracts ASCII/UTF-8 text containing EVW|... from raw packet, decoded text, or base64 payload."""
    decoded = packet.get("decoded", {})
    text = decoded.get("text", "")
    if text and "EVW|" in text:
        return text

    raw_payload = decoded.get("payload")
    if raw_payload:
        if isinstance(raw_payload, (bytes, bytearray)):
            try:
                s = raw_payload.decode("utf-8", errors="ignore")
                if "EVW|" in s:
                    return s
            except Exception:
                pass
        elif isinstance(raw_payload, str):
            if "EVW|" in raw_payload:
                return raw_payload
            try:
                decoded_bytes = base64.b64decode(raw_payload)
                s = decoded_bytes.decode("utf-8", errors="ignore")
                if "EVW|" in s:
                    return s
            except Exception:
                pass

    raw = packet.get("raw")
    if raw and hasattr(raw, "decoded") and hasattr(raw.decoded, "payload"):
        try:
            s = raw.decoded.payload.decode("utf-8", errors="ignore")
            if "EVW|" in s:
                return s
        except Exception:
            pass

    return text or ""


def on_receive(packet, interface):
    """Callback fired whenever Node 1 (!d88b1a58) receives a 433.875 MHz LoRa packet."""
    try:
        # Deduplicate identical packet delivery across pubsub subtopics
        pkt_id = packet.get("id")
        if pkt_id:
            if pkt_id in seen_packet_ids:
                return
            seen_packet_ids.add(pkt_id)
            if len(seen_packet_ids) > 500:
                seen_packet_ids.clear()

        decoded = packet.get("decoded", {})
        portnum = decoded.get("portnum", "")
        text = extract_evw_text(packet)
        from_id = packet.get("fromId") or f"!{packet.get('from', 0):08x}"
        to_id = packet.get("toId") or "^all"
        rssi = packet.get("rxRssi", -50)
        snr = packet.get("rxSnr", 10.75)
        hop_start = packet.get("hopStart", 3)
        hop_limit = packet.get("hopLimit", 3)
        relay_node = packet.get("relayNode", None)
        hops_used = max(0, int(hop_start) - int(hop_limit))

        env = extract_env_metrics(packet)
        if env:
            node_name = "EvakWar Zone Relay 1 (REL1)" if from_id.lower() == "!0f778ab0" else f"EvakWar Sensor Node ({from_id})"
            push_sensor_reading(env, node_id=from_id, node_name=node_name, rssi=rssi, snr=snr, hops=hops_used, broadcast_lora=False)
            return

        safe_preview = ""
        if text:
            safe_preview = "".join(c if 32 <= ord(c) <= 126 else "?" for c in text[:80])

        print(
            f"\n[433.875 MHz RX] From={from_id} To={to_id} Port={portnum} "
            f"RSSI={rssi}dBm SNR={snr}dB Hops={hops_used} Relay={relay_node} Text={safe_preview}",
            flush=True
        )

        if text and "EVW|" in text:
            evw_idx = text.find("EVW|")
            clean_text = text[evw_idx:].strip()
            print(f"  -> EvakWar Frame: {clean_text}", flush=True)
            res = http_post("/api/lora/rx", {
                "packet": clean_text,
                "fromId": from_id,
                "toId": to_id,
                "rssi": rssi,
                "snr": snr,
                "hopStart": hop_start,
                "hopLimit": hop_limit,
                "relayNode": relay_node,
                "rxTime": datetime.now().isoformat()
            })
            if res and res.get("success"):
                print(f"  -> Forwarded to EvakWar Command Center! SOS ID: {res.get('sosId', 'N/A')}", flush=True)
    except Exception as e:
        print(f"[RX Handler Error]: {e}", flush=True)


def sync_mesh_nodes(iface):
    """Push live NodeDB table from Node 1 (!d88b1a58) to EvakWar Server."""
    if not iface or not hasattr(iface, "nodes") or not iface.nodes:
        return
    nodes_list = []
    for node_id, n in iface.nodes.items():
        user = n.get("user", {})
        short_name = user.get("shortName", node_id[-4:].upper())
        long_name = user.get("longName", f"EvakWar Node {node_id}")
        role = "GATEWAY" if node_id == "!d88b1a58" else ("RELAY" if "REL" in short_name else ("RESCUER" if ("RSC" in short_name or "RESCUE" in short_name) else ("STAFF" if ("STF" in short_name or "STAFF" in short_name) else "RESIDENT")))
        nodes_list.append({
            "nodeId": node_id,
            "shortName": short_name,
            "longName": long_name,
            "role": role,
            "rssi": n.get("rssi", 0),
            "snr": n.get("snr", 10.0),
            "hopsAway": n.get("hopsAway", 0),
            "lastHeard": n.get("lastHeard", int(time.time())),
            "online": True
        })
        env = extract_env_metrics(n)
        if env:
            push_sensor_reading(
                env,
                node_id=node_id,
                node_name=long_name,
                rssi=n.get("rssi"),
                snr=n.get("snr"),
                hops=n.get("hopsAway", 0),
                broadcast_lora=False
            )
    if nodes_list:
        http_post("/api/lora/nodes/heartbeat", {"nodes": nodes_list})


def poll_relay_sensor_telemetry(iface, my_id):
    """Requests fresh AHT20+BMP280 environmentMetrics from REL1 (!0f778ab0) every 60s."""
    global last_sensor_req_at
    now = time.time()
    if (now - last_sensor_req_at) < 60.0:
        return
    last_sensor_req_at = now
    target_id = my_id if (my_id and my_id.lower() == "!0f778ab0") else "!0f778ab0"
    try:
        iface.sendTelemetry(destinationId=target_id, wantResponse=True, telemetryType="environment_metrics")
    except Exception:
        pass


def process_outbound_queue(iface):
    """Poll EvakWar server for outbound EVW|ACK or EVW|ALT frames and transmit over 433.875 MHz."""
    res = http_get("/api/lora/tx-queue")
    if not res or not res.get("success"):
        return

    queue = res.get("queue", [])
    for item in queue:
        pkt_id = item.get("id")
        pkt_text = item.get("packet")
        if not pkt_text:
            continue

        safe_tx = "".join(c if 32 <= ord(c) <= 126 else "?" for c in pkt_text[:80])
        print(f"\n[433.875 MHz TX] Broadcasting over LoRa Mesh: {safe_tx}", flush=True)
        try:
            # Broadcast on primary channel (^all) with wantAck=False
            iface.sendText(pkt_text, wantAck=False)
            http_post("/api/lora/tx-ack", {"id": pkt_id})
            print(f"  -> Transmitted & ACKed queue item {pkt_id}", flush=True)
            if pkt_text.startswith("EVW|ALT|"):
                time.sleep(2.2)
                print(f"  -> [2nd RF Burst] Re-broadcasting EVW|ALT for guaranteed mesh delivery...", flush=True)
                iface.sendText(pkt_text, wantAck=False)
            time.sleep(1.2)
        except Exception as e:
            print(f"  -> [TX Error]: {e}", flush=True)
            err_str = str(e).lower()
            if "connection" in err_str or "serial" in err_str or "timeout" in err_str:
                raise e
            else:
                http_post("/api/lora/tx-ack", {"id": pkt_id})


def main():
    global interface
    print("=" * 72)
    print("  EVAKWAR 433.875 MHz LORA MESH GATEWAY BRIDGE (BARANGAY SAN RAFAEL)")
    print(f"  Serial Port : {SERIAL_PORT}")
    print(f"  Server URL  : {SERVER_URL}")
    print("  Mesh Nodes  : !d88b1a58 (HALL), !0f778ab0 (REL1), !f4e213d4 (RES1)")
    print("=" * 72)

    for topic in ["meshtastic.receive", "meshtastic.receive.text", "meshtastic.receive.data", "meshtastic.receive.telemetry"]:
        try:
            pub.unsubscribe(on_receive, topic)
        except Exception:
            pass
        pub.subscribe(on_receive, topic)

    is_connected_state = None

    while True:
        try:
            print(f"[*] Connecting to Hall LoRa Gateway on {SERIAL_PORT}...")
            interface = meshtastic.serial_interface.SerialInterface(devPath=SERIAL_PORT)
            my_info = interface.getMyNodeInfo()
            my_id = my_info.get("user", {}).get("id", "!d88b1a58") if my_info else "!d88b1a58"
            my_name = my_info.get("user", {}).get("longName", "EvakWar Hall Gateway") if my_info else "Gateway"
            print(f"[+] Connected to {my_name} ({my_id}) at 433.875 MHz (EU_433, hop_limit=3)")

            is_connected_state = True
            http_post("/api/lora/nodes/heartbeat", {
                "connected": True,
                "port": SERIAL_PORT,
                "nodeId": my_id,
                "nodeName": my_name,
                "nodes": [
                    {"nodeId": "!d88b1a58", "online": True, "shortName": "HALL"},
                    {"nodeId": "!0f778ab0", "online": True, "shortName": "REL1"}
                ]
            })
            sync_mesh_nodes(interface)
            poll_relay_sensor_telemetry(interface, my_id)
            last_heartbeat = time.time()
            while True:
                if not getattr(interface, "isConnected", True):
                    raise Exception("Serial connection to Node 1 was disconnected")
                now = time.time()
                process_outbound_queue(interface)
                if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
                    sync_mesh_nodes(interface)
                    poll_relay_sensor_telemetry(interface, my_id)
                    last_heartbeat = now
                time.sleep(POLL_INTERVAL_SEC)

        except KeyboardInterrupt:
            print("\n[!] Shutting down LoRa Gateway Bridge.")
            break
        except Exception as e:
            if is_connected_state is not False:
                print(f"[!] Gateway Serial Disconnected ({e}). Notifying server...")
                is_connected_state = False
                http_post("/api/lora/nodes/heartbeat", {
                    "connected": False,
                    "port": SERIAL_PORT,
                    "nodeId": "!d88b1a58",
                    "nodes": [
                        {"nodeId": "!d88b1a58", "online": False, "shortName": "HALL"},
                        {"nodeId": "!0f778ab0", "online": False, "shortName": "REL1"}
                    ]
                })
            else:
                print(f"[*] Waiting for Node 1 USB connection on {SERIAL_PORT}...")

            try:
                if interface:
                    interface.close()
            except Exception:
                pass
            interface = None
            time.sleep(3.5)


if __name__ == "__main__":
    main()
