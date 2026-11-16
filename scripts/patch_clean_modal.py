import os

header_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs'
with open(header_path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Target modal innerHTML and replace with clean alert + severity + time + GPS router
target_modal = '''                              <!-- Sleek Top HUD Header -->
                              <div style="padding: 12px 16px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                  <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 9999px; background: ${badgeBg}; border: 1px solid ${themeColor}; font-size: 11px; font-weight: 900; letter-spacing: 0.05em; color: ${themeColor}; text-transform: uppercase;">
                                    <i class="ph ${iconClass}" style="font-size: 13px;"></i>
                                    <span>${badgeText}</span>
                                  </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; font-weight: 600;">
                                  <span>📻 LoRa Mesh</span>
                                  <span>•</span>
                                  <span>${sentTime}</span>
                                </div>
                              </div>

                              <!-- Minimalist Alert Content -->
                              <div style="padding: 20px 20px 16px 20px; display: flex; flex-direction: column; gap: 12px;">
                                <!-- Alert Headline -->
                                <h2 style="font-size: 20px; font-weight: 900; line-height: 1.25; margin: 0; color: #ffffff; letter-spacing: -0.01em;">
                                  ${cleanTitle}
                                </h2>

                                <!-- Alert Core Instruction (Clean & High Contrast) -->
                                <div style="font-size: 13.5px; line-height: 1.5; color: #f1f5f9; background: rgba(15, 23, 42, 0.65); padding: 12px 14px; border-radius: 12px; border-left: 3px solid ${themeColor};">
                                  ${cleanMessage}
                                </div>

                                <!-- Shelter & Target Grid (Compact) -->
                                <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 2px;">
                                  <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 9px 12px; display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                      <i class="ph ph-map-pin" style="font-size: 16px; color: #34d399;"></i>
                                      <span style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Safe Shelter:</span>
                                    </div>
                                    <strong style="font-size: 12.5px; color: #ffffff; font-weight: 800;">${evacCenter}</strong>
                                  </div>

                                  <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #94a3b8;">
                                    <span>Coverage Area:</span>
                                    <span style="color: #cbd5e1; font-weight: 600;">${targetArea}</span>
                                  </div>
                                </div>
                              </div>

                              <!-- Action Buttons (High Impact, Minimalist) -->
                              <div style="padding: 12px 20px 18px 20px; background: rgba(8, 13, 26, 0.95); border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px;">
                                <a href="${(window.Capacitor && window.Capacitor.isNativePlatform()) ? '/resident/evacuation/index.html' : '/resident/evacuation'}?target=${encodeURIComponent(evacCenter)}"'''

replacement_modal = '''                              <!-- Sleek Top HUD Header -->
                              <div style="padding: 12px 16px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                  <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 9999px; background: ${badgeBg}; border: 1px solid ${themeColor}; font-size: 11px; font-weight: 900; letter-spacing: 0.05em; color: ${themeColor}; text-transform: uppercase;">
                                    <i class="ph ${iconClass}" style="font-size: 13px;"></i>
                                    <span>${badgeText}</span>
                                  </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #cbd5e1; font-weight: 700;">
                                  <span>⏰ Broadcast Time:</span>
                                  <span style="color: #ffffff; font-weight: 900;">${sentTime}</span>
                                </div>
                              </div>

                              <!-- Minimalist Alert Content Focusing on Urgency & Instructions -->
                              <div style="padding: 20px 20px 16px 20px; display: flex; flex-direction: column; gap: 12px;">
                                <!-- Alert Headline -->
                                <h2 style="font-size: 20px; font-weight: 900; line-height: 1.25; margin: 0; color: #ffffff; letter-spacing: -0.01em;">
                                  ${cleanTitle}
                                </h2>

                                <!-- Alert Core Instruction (Clean & High Contrast) -->
                                <div style="font-size: 13.5px; line-height: 1.5; color: #f1f5f9; background: rgba(15, 23, 42, 0.65); padding: 12px 14px; border-radius: 12px; border-left: 3px solid ${themeColor};">
                                  ${cleanMessage}
                                </div>

                                <!-- Dynamic Safe Route Guidance Strip -->
                                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.28); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #cbd5e1;">
                                  <div style="display: flex; align-items: center; gap: 8px;">
                                    <i class="ph ph-navigation-arrow" style="font-size: 16px; color: #34d399;"></i>
                                    <span style="font-weight: 700;">Nearest Evacuation Route:</span>
                                  </div>
                                  <strong style="color: #34d399; font-weight: 800; font-size: 11px; text-transform: uppercase;">Auto-Detects Nearest by GPS</strong>
                                </div>
                              </div>

                              <!-- Action Buttons -->
                              <div style="padding: 12px 20px 18px 20px; background: rgba(8, 13, 26, 0.95); border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px;">
                                <a href="${(window.Capacitor && window.Capacitor.isNativePlatform()) ? '/resident/evacuation/index.html' : '/resident/evacuation'}?auto_route=nearest"'''

if target_modal in c:
    c = c.replace(target_modal, replacement_modal, 1)
    print("Replaced modal innerHTML successfully!")
else:
    print("Failed to find target_modal in header.ejs")

# 2. Add triggerEmergencyModal alias and pending notification launcher
target_close = 'window.closeGlobalEmergencyModal = function () {'
addition = '''window.triggerEmergencyModal = function (title, msg, sev, alertId) {
                          if (typeof window.openGlobalEmergencyModal === 'function') {
                            window.openGlobalEmergencyModal({
                              title: title || 'EMERGENCY EVACUATION ORDER',
                              message: msg || 'Proceed immediately to your nearest designated evacuation facility.',
                              severity: sev || 'RED',
                              alertId: alertId || '',
                              sent_at: new Date().toISOString()
                            });
                          }
                        };

                        // Auto-pop modal if app was opened via notification tap
                        try {
                          if (window.__pendingNotificationAlert && typeof window.openGlobalEmergencyModal === 'function') {
                            window.openGlobalEmergencyModal(window.__pendingNotificationAlert);
                            window.__pendingNotificationAlert = null;
                          }
                        } catch (_) {}

                        ''' + target_close

if target_close in c and 'window.triggerEmergencyModal = function' not in c:
    c = c.replace(target_close, addition, 1)
    print("Added triggerEmergencyModal and pending check successfully!")

with open(header_path, 'w', encoding='utf-8') as f:
    f.write(c)
print("Updated header.ejs completely!")
