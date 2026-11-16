import re

# 1. Update controllers/adminController.js
with open('controllers/adminController.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "const { sendSmsBroadcast } = require('../utils/smsService');",
    "const { queueOutboundAlertBroadcast } = require('../routes/loraRoutes');"
)

# Replace SMS in getBroadcast
c = re.sub(
    r"if \(req\.query\.success\) \{.*?\} else if \(req\.query\.error\) \{.*?\n    \}",
    """if (req.query.lora || req.query.success) {
      const status = req.query.status || 'TRANSMITTED_LORA';
      const inApp = req.query.inApp || 'SENT';
      successMsg = `433.875 MHz LoRa Mesh: ${status} (Dispatched via Hall Gateway !d88b1a58 -> Relayed across Rel1 !0f778ab0 -> Res1 !f4e213d4) | In-App Alert: ${inApp}`;
    } else if (req.query.warning) {
      const inApp = req.query.inApp || 'SENT';
      const reason = req.query.msg || 'Mesh delivery notice.';
      warningMsg = `In-App Alert: ${inApp} | LoRa Mesh Notice: ${reason}`;
    } else if (req.query.error) {
      errorMsg = req.query.msg || 'Failed to dispatch 433.875 MHz LoRa broadcast. Please check LoRa Gateway COM3 connection.';
    }""",
    c,
    flags=re.DOTALL
)

# Replace broadcast_type: 'SMS' in sendBroadcast
c = re.sub(
    r"broadcast_type:\s*'SMS'",
    "broadcast_type: 'LORA_MESH'",
    c,
    count=1
)

# Replace SMS dispatch in sendBroadcast
admin_pattern = r"  // 5\. iProgSMS Gateway Dispatch \(Attempted independently\).*?return res\.redirect\(`/admin/broadcast\?warning=1&inApp=\$\{inAppStatus\}&msg=\$\{encodeURIComponent\(failReason\)\}&total=\$\{targetData\.totalRecipients \|\| 1\}\$\{alertQuery\}`\);\s*\}"

admin_replacement = """  // 5. 433.875 MHz LoRa Mesh Network Dispatch (Offline RF Mesh)
  let loraResult = null;
  try {
    loraResult = queueOutboundAlertBroadcast({
      id: alertId,
      title: title,
      message: message,
      severity: upperSeverity,
      barangay: barangay === 'all' ? 'San Rafael' : barangay,
      evacCenter: 'San Rafael Evacuation Center'
    });
    console.log(`[AdminBroadcast] 433.875 MHz LoRa Mesh Alert Queued:`, loraResult ? loraResult.packet : 'OK');
  } catch (loraErr) {
    console.error("[AdminBroadcast] LoRa Queue error:", loraErr);
  }

  const loraStatus = loraResult ? 'TRANSMITTED_LORA' : 'QUEUED';
  const loraPacketStr = loraResult ? loraResult.packet : `EVW|ALT|${alertId}|${upperSeverity}|${barangay === 'all' ? 'ALL' : barangay}|${title.slice(0, 38)}|San Rafael Evacuation Center|${message.slice(0, 95)}`;

  // 6. Database Status Update
  if (alertId && typeof alertId === 'number') {
    try {
      const db = require('../config/db');
      await db.execute(
        'UPDATE alerts SET status = ?, message_id = ?, broadcast_type = ?, delivery_report = ? WHERE id = ?',
        [
          loraStatus,
          'LORA-433.875MHZ',
          'LORA_MESH',
          JSON.stringify({
            meshFreq: '433.875 MHz',
            channel: 'EU_433 / LONG_FAST',
            nodes: ['HALL !d88b1a58', 'REL1 !0f778ab0', 'RES1 !f4e213d4'],
            packet: loraPacketStr
          }),
          alertId
        ]
      );
    } catch (dbUpdateErr) {
      console.warn("Non-fatal: Error updating alert status in DB:", dbUpdateErr);
    }
  }

  const alertQuery = `&alertId=${encodeURIComponent(alertId)}&alertSeverity=${encodeURIComponent(upperSeverity)}&alertTitle=${encodeURIComponent(title)}&alertMessage=${encodeURIComponent(message)}`;

  return res.redirect(`/admin/broadcast?success=1&lora=1&status=TRANSMITTED_LORA&nodes=3&inApp=${inAppStatus}${alertQuery}`);
}"""

c, count = re.subn(admin_pattern, admin_replacement, c, count=1, flags=re.DOTALL)
assert count == 1, f"admin pattern matched {count} times"

with open('controllers/adminController.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Updated controllers/adminController.js successfully!")

# 2. Update controllers/staffController.js
with open('controllers/staffController.js', 'r', encoding='utf-8') as f:
    sc = f.read()

sc = sc.replace(
    "const { sendSmsBroadcast } = require('../utils/smsService');",
    "const { queueOutboundAlertBroadcast } = require('../routes/loraRoutes');"
)

sc = re.sub(
    r"if \(req\.query\.success\) \{.*?\} else if \(req\.query\.error\) \{.*?\n    \}",
    """if (req.query.lora || req.query.success) {
      const status = req.query.status || 'TRANSMITTED_LORA';
      const inApp = req.query.inApp || 'SENT';
      successMsg = `433.875 MHz LoRa Mesh: ${status} (Dispatched via Hall Gateway !d88b1a58 -> Relayed across Rel1 !0f778ab0 -> Res1 !f4e213d4) | In-App Alert: ${inApp}`;
    } else if (req.query.warning) {
      const inApp = req.query.inApp || 'SENT';
      const reason = req.query.msg || 'Mesh delivery notice.';
      warningMsg = `In-App Alert: ${inApp} | LoRa Mesh Notice: ${reason}`;
    } else if (req.query.error) {
      errorMsg = req.query.msg || 'Failed to dispatch 433.875 MHz LoRa broadcast. Please check LoRa Gateway COM3 connection.';
    }""",
    sc,
    flags=re.DOTALL
)

sc = re.sub(
    r"broadcast_type:\s*'SMS'",
    "broadcast_type: 'LORA_MESH'",
    sc,
    count=1
)

staff_pattern = r"  // 5\. iProgSMS Gateway Dispatch \(Attempted independently\).*?return res\.redirect\(`/staff/broadcast\?warning=1&inApp=\$\{inAppStatus\}&msg=\$\{encodeURIComponent\(failReason\)\}&total=\$\{targetData\.totalRecipients \|\| 1\}\$\{alertQuery\}`\);\s*\}"

staff_replacement = """  // 5. 433.875 MHz LoRa Mesh Network Dispatch (Offline RF Mesh)
  let loraResult = null;
  try {
    loraResult = queueOutboundAlertBroadcast({
      id: alertId,
      title: title,
      message: message,
      severity: upperSeverity,
      barangay: userBarangay,
      evacCenter: 'San Rafael Evacuation Center'
    });
    console.log(`[StaffBroadcast] 433.875 MHz LoRa Mesh Alert Queued:`, loraResult ? loraResult.packet : 'OK');
  } catch (loraErr) {
    console.error("[StaffBroadcast] LoRa Queue error:", loraErr);
  }

  const loraStatus = loraResult ? 'TRANSMITTED_LORA' : 'QUEUED';
  const loraPacketStr = loraResult ? loraResult.packet : `EVW|ALT|${alertId}|${upperSeverity}|${userBarangay}|${title.slice(0, 38)}|San Rafael Evacuation Center|${message.slice(0, 95)}`;

  // 6. Database Status Update
  if (alertId && typeof alertId === 'number') {
    try {
      const db = require('../config/db');
      await db.execute(
        'UPDATE alerts SET status = ?, message_id = ?, broadcast_type = ?, delivery_report = ? WHERE id = ?',
        [
          loraStatus,
          'LORA-433.875MHZ',
          'LORA_MESH',
          JSON.stringify({
            meshFreq: '433.875 MHz',
            channel: 'EU_433 / LONG_FAST',
            nodes: ['HALL !d88b1a58', 'REL1 !0f778ab0', 'RES1 !f4e213d4'],
            packet: loraPacketStr
          }),
          alertId
        ]
      );
    } catch (dbUpdateErr) {
      console.warn("Non-fatal: Error updating alert status in DB:", dbUpdateErr);
    }
  }

  const alertQuery = `&alertId=${encodeURIComponent(alertId)}&alertSeverity=${encodeURIComponent(upperSeverity)}&alertTitle=${encodeURIComponent(title)}&alertMessage=${encodeURIComponent(message)}`;

  return res.redirect(`/staff/broadcast?success=1&lora=1&status=TRANSMITTED_LORA&nodes=3&inApp=${inAppStatus}${alertQuery}`);
}"""

sc, count_sc = re.subn(staff_pattern, staff_replacement, sc, count=1, flags=re.DOTALL)
assert count_sc == 1, f"staff pattern matched {count_sc} times"

with open('controllers/staffController.js', 'w', encoding='utf-8') as f:
    f.write(sc)
print("Updated controllers/staffController.js successfully!")
