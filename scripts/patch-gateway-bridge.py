with open('lora-gateway/gateway_bridge.py', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace('POLL_INTERVAL_SEC = 1.5\nHEARTBEAT_INTERVAL_SEC = 10.0', 'POLL_INTERVAL_SEC = 1.0\nHEARTBEAT_INTERVAL_SEC = 2.5')

target_connect = """            print(f"[+] Connected to {my_name} ({my_id}) at 433.875 MHz (EU_433, hop_limit=3)")

            last_heartbeat = 0"""

replacement_connect = """            print(f"[+] Connected to {my_name} ({my_id}) at 433.875 MHz (EU_433, hop_limit=3)")
            # Immediately notify server of active connection
            http_post("/api/lora/nodes/heartbeat", {
                "connected": True,
                "port": SERIAL_PORT,
                "nodeId": my_id,
                "nodeName": my_name
            })
            sync_mesh_nodes(interface)
            last_heartbeat = time.time()"""

code = code.replace(target_connect, replacement_connect)

target_except = """        except Exception as e:
            print(f"[!] Gateway Serial Disconnected or Busy ({e}). Retrying in 5s...")
            try:
                if interface:
                    interface.close()
            except Exception:
                pass
            interface = None
            time.sleep(5)"""

replacement_except = """        except Exception as e:
            print(f"[!] Gateway Serial Disconnected or Busy ({e}). Notifying server...")
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

code = code.replace(target_except, replacement_except)

with open('lora-gateway/gateway_bridge.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated gateway_bridge.py with instant disconnect reporting!")
