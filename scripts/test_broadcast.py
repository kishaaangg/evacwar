import urllib.request
import json
import time

url = "http://localhost:8080/api/lora/test-broadcast"
payload = {
    "title": "RED ALERT: Mandatory Evacuation Order",
    "message": "Floodwaters rising rapidly in Zone 1 San Rafael. Evacuate immediately to San Rafael Evacuation Center.",
    "severity": "RED",
    "barangay": "San Rafael",
    "evacCenter": "San Rafael Evacuation Center"
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        print("Test Broadcast Result:", res)
except Exception as e:
    print("Error:", e)
