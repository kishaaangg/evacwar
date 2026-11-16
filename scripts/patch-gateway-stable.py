with open('lora-gateway/gateway_bridge.py', 'r', encoding='utf-8') as f:
    text = f.read()

old_loop = """    while True:
        try:
            print(f"[*] Connecting to Hall LoRa Gateway on {SERIAL_PORT}...")
            interface = meshtastic.serial_interface.SerialInterface(devPath=SERIAL_PORT)
            my_info = interface.getMyNodeInfo()
            my_id = my_info.get("user", {}).get("id", "!d88b1a58") if my_info else "!d88b1a58"
            my_name = my_info.get("user", {}).get("longName", "EvakWar Hall Gateway") if my_info else "Gateway"
            print(f"[+] Connected to {my_name} ({my_id}) at 433.875 MHz (EU_433, hop_limit=3)")
            # Immediately notify server of active connection
            http_post("/api/lora/nodes/heartbeat", {
                "connected": True,
                "port": SERIAL_PORT,
                "nodeId": my_id,
                "nodeName": my_name
            })
            sync_mesh_nodes(interface)
            last_heartbeat = time.time()
            while True:
                if not getattr(interface, "isConnected", True):
                    raise Exception("Serial connection to Node 1 was disconnected")
                now = time.time()
                process_outbound_queue(interface)
                if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
                    sync_mesh_nodes(interface)
                    last_heartbeat = now
                time.sleep(POLL_INTERVAL_SEC)

        except KeyboardInterrupt:
            print("\\n[!] Shutting down LoRa Gateway Bridge.")
            break
        except Exception as e:
            print(f"[!] Gateway Serial Disconnected or Busy ({e}). Retrying in 5s...")
            # Immediately notify server that Hall Gateway is disconnected
            http_post("/api/lora/nodes/heartbeat", {
                "connected": False,
                "port": SERIAL_PORT,
                "nodeId": "!d88b1a58",
                "nodes": [
                    {"nodeId": "!d88b1a58", "online": False, "shortName": "HALL"},
                    {"nodeId": "!0f778ab0", "online": False, "shortName": "REL1"}
                ]
            })
            try:
                if interface:
                    interface.close()
            except Exception:
                pass
            interface = None
            time.sleep(2)"""

new_loop = """    is_connected_state = None

    while True:
        try:
            print(f"[*] Connecting to Hall LoRa Gateway on {SERIAL_PORT}...")
            interface = meshtastic.serial_interface.SerialInterface(devPath=SERIAL_PORT)
            my_info = interface.getMyNodeInfo()
            my_id = my_info.get("user", {}).get("id", "!d88b1a58") if my_info else "!d88b1a58"
            my_name = my_info.get("user", {}).get("longName", "EvakWar Hall Gateway") if my_info else "Gateway"
            print(f"[+] Connected to {my_name} ({my_id}) at 433.875 MHz (EU_433, hop_limit=3)")

            # Notify server once on state transition to CONNECTED
            is_connected_state = True
            http_post("/api/lora/nodes/heartbeat", {
                "connected": True,
                "port": SERIAL_PORT,
                "nodeId": my_id,
                "nodeName": my_name
            })
            sync_mesh_nodes(interface)
            last_heartbeat = time.time()

            while True:
                if not getattr(interface, "isConnected", True):
                    raise Exception("Serial connection to Node 1 was disconnected")
                now = time.time()
                process_outbound_queue(interface)
                if now - last_heartbeat >= HEARTBEAT_INTERVAL_SEC:
                    sync_mesh_nodes(interface)
                    last_heartbeat = now
                time.sleep(POLL_INTERVAL_SEC)

        except KeyboardInterrupt:
            print("\\n[!] Shutting down LoRa Gateway Bridge.")
            break
        except Exception as e:
            # Only notify server once when state changes from connected to disconnected
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
            try:
                if interface:
                    interface.close()
            except Exception:
                pass
            interface = None
            time.sleep(4)"""

text = text.replace(old_loop.replace('\\n', '\n'), new_loop.replace('\\n', '\n'))
with open('lora-gateway/gateway_bridge.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated gateway_bridge.py with stable state transitions!")
