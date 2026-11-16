import re

# =========================================================================
# 1. UPDATE controllers/adminController.js & controllers/staffController.js
# =========================================================================
for cpath in ['controllers/adminController.js', 'controllers/staffController.js']:
    with open(cpath, 'r', encoding='utf-8') as f:
        c = f.read()
    
    # Ensure evacCenter is in alertPayload
    if 'evacCenter:' not in c:
        c = c.replace(
            "sent_at: new Date().toISOString()",
            "evacCenter: 'San Rafael Evacuation Center',\n        sent_at: new Date().toISOString()"
        )
        with open(cpath, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f"Added evacCenter to alertPayload in {cpath}")
    else:
        print(f"evacCenter already in {cpath}")


# =========================================================================
# 2. UPDATE views/resident/dashboard.ejs
# =========================================================================
with open('views/resident/dashboard.ejs', 'r', encoding='utf-8') as f:
    dash = f.read()

# Add dashboard active alert restorer script right before </main> or at end
dash_script = """
<!-- EVAKWAR REAL-TIME DASHBOARD ADVISORY STATUS SYNC SCRIPT -->
<script>
  (function () {
    function syncDashboardAlert() {
      try {
        const saved = localStorage.getItem('evw_active_alert') || localStorage.getItem('evw_last_lora_alert');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof window.updateSystemAlertBanner === 'function') {
            window.updateSystemAlertBanner(parsed);
          }
        }
      } catch (_) {}
    }

    window.addEventListener('evw:alert-updated', (e) => {
      if (e.detail && typeof window.updateSystemAlertBanner === 'function') {
        window.updateSystemAlertBanner(e.detail);
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncDashboardAlert);
    } else {
      syncDashboardAlert();
    }
  })();
</script>
"""

if 'EVAKWAR REAL-TIME DASHBOARD ADVISORY STATUS SYNC SCRIPT' not in dash:
    dash = dash + "\n" + dash_script
    with open('views/resident/dashboard.ejs', 'w', encoding='utf-8') as f:
        f.write(dash)
    print("Added alert sync script to views/resident/dashboard.ejs")
else:
    print("Dashboard script already present")

