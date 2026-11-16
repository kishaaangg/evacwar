import os

content = """<%#
  EvakWar (E-BAKWAR) - 433.875 MHz LoRa Mesh Emergency Alerting Command Console
  Tactical RF disaster broadcast dispatcher operating 100% offline without internet,
  Wi-Fi, or commercial cellular SMS dependency.
%>

<style>
  /* Ensure High-Contrast Card Elements */
  .broadcast-white .card {
    background-color: #ffffff !important;
    border-color: #e2e8f0 !important;
  }
  .lora-pulse-radar {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    animation: loraRadarPulse 2s infinite;
  }
  .lora-pulse-red {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    animation: loraRadarPulseRed 1.5s infinite;
  }
  @keyframes loraRadarPulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  @keyframes loraRadarPulseRed {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  .lora-terminal-font {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }
  .severity-btn {
    transition: all 0.15s ease-in-out;
  }
</style>

<div class="flex h-screen overflow-hidden bg-slate-50">
  <%- include('../partials/sidebar', { page: 'broadcast' }) %>

  <div class="flex-1 flex flex-col min-w-0 overflow-y-auto">
    <%- include('../partials/header') %>

    <main class="app-content broadcast-white flex flex-col min-h-screen bg-slate-50 relative pb-16 lg:pb-6 overflow-x-hidden">
      <div class="max-w-[1440px] mx-auto space-y-4 flex-1 w-full p-3 sm:p-4 lg:p-5">

        <!-- 1. TOP HARDWARE & MESH TELEMETRY STATUS BANNER -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            <!-- Left: Title & Operational Scope -->
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center font-black text-xl shrink-0">
                  <i class="ph ph-broadcast"></i>
                </div>
                <h1 class="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  433.875 MHz LoRa Mesh Emergency Alert Dispatcher
                </h1>
                <% if (isBarangayCouncil) { %>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                    <i class="ph ph-buildings text-xs"></i> Barangay <%= userBarangay %> Council
                  </span>
                <% } else { %>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-400/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
                    <i class="ph ph-shield-check text-xs"></i> Municipal Operations Center
                  </span>
                <% } %>
              </div>
              <p class="text-xs text-slate-400 max-w-3xl leading-relaxed">
                Autonomous disaster broadcast dispatch operating on <strong>433.875 MHz (EU_433 / LONG_FAST)</strong>. Transmissions hop across multi-stage repeater nodes directly to resident terminals with <strong>zero dependency on internet, Wi-Fi, or cellular network towers</strong>.
              </p>
            </div>

            <!-- Right: RF Modulation & Specs Pill -->
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <div class="px-3.5 py-2 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center gap-2 text-xs font-mono shadow-inner">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-slate-300 font-bold">RF:</span>
                <span class="text-emerald-400 font-bold">433.875 MHz</span>
                <span class="text-slate-500">|</span>
                <span class="text-slate-300">SF11 / BW 250kHz</span>
                <span class="text-slate-500">|</span>
                <span class="text-blue-400 font-bold">Hop Limit: 3</span>
              </div>
            </div>

          </div>
        </div>

        <!-- SUCCESS ALERT BANNER -->
        <% if (locals.successMsg) { %>
          <div class="p-3.5 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-emerald-950">
              <i class="ph ph-broadcast text-xl text-emerald-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs text-emerald-900">LoRa Mesh Broadcast Dispatched</h4>
                <p class="text-[11px] text-emerald-800 font-medium"><%= successMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-emerald-600 hover:text-emerald-800 text-base p-1" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- WARNING ALERT BANNER -->
        <% if (locals.warningMsg) { %>
          <div class="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-amber-950">
              <i class="ph ph-warning-circle text-xl text-amber-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs text-amber-900">LoRa Mesh Notice</h4>
                <p class="text-[11px] text-amber-800 font-medium"><%= warningMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-amber-600 hover:text-amber-800 text-base p-1" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- ERROR ALERT BANNER -->
        <% if (locals.errorMsg) { %>
          <div class="p-3.5 bg-rose-50 border-l-4 border-rose-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-rose-950">
              <i class="ph ph-x-circle text-xl text-rose-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs text-rose-900">LoRa Transmission Failure</h4>
                <p class="text-[11px] text-rose-800 font-medium"><%= errorMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-rose-600 hover:text-rose-800 text-base p-1" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- MAIN 2-COLUMN GRID -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">

          <!-- =============================================================== -->
          <!-- LEFT COLUMN: LORA MESH BROADCAST COMPOSER (Cols 1-7)             -->
          <!-- =============================================================== -->
          <div class="lg:col-span-7 space-y-4">

            <div class="card p-4 sm:p-5 border-t-4 border-blue-600 shadow-sm bg-white rounded-2xl transition-all" id="composeCard">
              
              <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg shrink-0">
                    <i class="ph ph-broadcast" id="headerIcon"></i>
                  </div>
                  <div>
                    <h2 class="text-sm sm:text-base font-black text-slate-900 leading-tight">
                      Emergency LoRa Mesh Broadcaster
                    </h2>
                    <p class="text-xs text-slate-500 font-medium">Compose high-priority disaster warnings for instant RF broadcast</p>
                  </div>
                </div>

                <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 font-mono">
                  <i class="ph ph-radio"></i> EVW|ALT Protocol
                </span>
              </div>

              <form id="broadcastForm" action="<%= isBarangayCouncil ? '/staff/broadcast' : '/admin/broadcast' %>" method="POST" class="space-y-4">
                <input type="hidden" name="_csrf" value="<%= locals.csrfToken || '' %>">
                <div id="hiddenSelectedIdsContainer"></div>
                <input type="hidden" name="severity" id="severityInput" value="BLUE">
                <input type="hidden" name="target_audience" id="targetAudienceSelect" value="all">
                <input type="hidden" name="barangay" id="barangaySelect" value="all">
                <input type="hidden" name="evacCenter" id="evacCenterSelect" value="San Rafael Evacuation Center">

                <!-- 1. SOLID VIBRANT SEVERITY LEVEL SELECTOR -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      1. Emergency Severity Level *
                    </label>
                    <span class="text-[11px] text-slate-500 font-semibold">(Click level to auto-load disaster template)</span>
                  </div>
                  
                  <div class="grid grid-cols-2 sm:grid-cols-5 gap-2" id="severityButtonsGroup">
                    
                    <!-- RED (P1) -->
                    <button type="button" id="card-RED" onclick="selectSeverity('RED')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-red-300 bg-red-50 text-left cursor-pointer hover:border-red-500 shadow-xs">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-600 text-white shadow-xs">P1</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-red-600 shadow-xs"></span>
                      </div>
                      <div class="sev-title font-black text-xs text-red-950">RED</div>
                      <div class="sev-sub text-[10px] font-bold text-red-800 truncate mt-0.5">Evacuate</div>
                    </button>

                    <!-- ORANGE (P2) -->
                    <button type="button" id="card-ORANGE" onclick="selectSeverity('ORANGE')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-orange-300 bg-orange-50 text-left cursor-pointer hover:border-orange-500 shadow-xs">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-500 text-white shadow-xs">P2</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-xs"></span>
                      </div>
                      <div class="sev-title font-black text-xs text-orange-950">ORANGE</div>
                      <div class="sev-sub text-[10px] font-bold text-orange-800 truncate mt-0.5">Pre-Evac</div>
                    </button>

                    <!-- YELLOW (P3) -->
                    <button type="button" id="card-YELLOW" onclick="selectSeverity('YELLOW')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-left cursor-pointer hover:border-amber-500 shadow-xs">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-xs">P3</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs"></span>
                      </div>
                      <div class="sev-title font-black text-xs text-amber-950">YELLOW</div>
                      <div class="sev-sub text-[10px] font-bold text-amber-800 truncate mt-0.5">Flood Watch</div>
                    </button>

                    <!-- BLUE (P4 - Default Active) -->
                    <button type="button" id="card-BLUE" onclick="selectSeverity('BLUE')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-blue-600 bg-blue-600 text-white text-left cursor-pointer shadow-md ring-4 ring-blue-200">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-blue-700 shadow-xs">P4</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-white shadow-xs"></span>
                      </div>
                      <div class="sev-title font-black text-xs text-white">BLUE</div>
                      <div class="sev-sub text-[10px] font-bold text-blue-100 truncate mt-0.5">Advisory</div>
                    </button>

                    <!-- GREEN (P5) -->
                    <button type="button" id="card-GREEN" onclick="selectSeverity('GREEN')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-left cursor-pointer hover:border-emerald-500 shadow-xs">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-600 text-white shadow-xs">P5</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-emerald-600 shadow-xs"></span>
                      </div>
                      <div class="sev-title font-black text-xs text-emerald-950">GREEN</div>
                      <div class="sev-sub text-[10px] font-bold text-emerald-800 truncate mt-0.5">All Clear</div>
                    </button>

                  </div>
                </div>

                <!-- 2. QUICK DISASTER PRESET TEMPLATES -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      2. Quick Preset Disaster Templates
                    </label>
                    <button type="button" class="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer" onclick="applyTemplate('custom')">
                      <i class="ph ph-arrow-counter-clockwise"></i> Reset Content
                    </button>
                  </div>
                  <div class="relative">
                    <i class="ph ph-lightning absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-base pointer-events-none"></i>
                    <select id="templateSelect" onchange="onTemplateChange(this.value)"
                      class="form-control w-full pl-9 pr-3 py-2.5 bg-amber-50/80 font-bold border-2 border-amber-300 text-amber-950 rounded-xl text-xs focus:bg-white focus:border-blue-500 transition-colors cursor-pointer shadow-xs">
                      <option value="" selected disabled>⚡ Choose Emergency Preset Template...</option>
                      <option value="red_evac">🚨 RED ALERT: Mandatory Evacuation Order</option>
                      <option value="orange_prep">⚠️ ORANGE ALERT: Pre-Evacuation Readiness Notice</option>
                      <option value="yellow_watch">⚡ YELLOW ALERT: Heavy Rainfall & River Flood Watch</option>
                      <option value="blue_advisory">📢 BLUE ALERT: Community Disaster Preparedness Advisory</option>
                      <option value="green_clear">🟢 GREEN ALERT: Floodwaters Receded — All Clear Notice</option>
                      <option value="relief">📦 RELIEF NOTICE: Emergency Food & Aid Distribution</option>
                      <option value="center_cap">🏠 CAPACITY ALERT: Secondary Evacuation Facilities Open</option>
                    </select>
                  </div>
                </div>

                <!-- 3. ALERT TITLE & MESSAGE CONTENT TEXTAREA -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      3. Alert Headline & Tactical Instructions *
                    </label>
                    <span class="text-[11px] font-mono text-slate-500 font-bold">Max LoRa Payload: 140 Bytes</span>
                  </div>

                  <input type="text" id="alertTitleInput" name="title" oninput="updateLoraMetrics()"
                    placeholder="Alert Title (e.g., RED ALERT: Mandatory Evacuation Order)"
                    class="form-control w-full mb-2.5 font-black text-xs sm:text-sm p-3 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 shadow-xs text-slate-900">

                  <textarea id="messageBox" name="message" required oninput="updateLoraMetrics()"
                    class="form-control w-full min-h-[110px] resize-y font-sans text-xs sm:text-sm p-3 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 leading-relaxed shadow-xs text-slate-900"
                    placeholder="Type urgent instructions for residents... (e.g. Move to designated high ground immediately via Zone 1 route.)"></textarea>
                </div>

                <!-- 4. ACTION BUTTONS -->
                <div class="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                  <button type="button" onclick="clearForm()"
                    class="btn border-2 border-slate-300 text-slate-700 hover:bg-slate-100 font-extrabold rounded-xl text-xs py-2.5 px-4 transition-colors cursor-pointer">
                    <i class="ph ph-arrow-counter-clockwise"></i> Clear Content
                  </button>

                  <button type="submit" id="btnSubmitBroadcast"
                    class="btn px-6 sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer">
                    <i class="ph ph-broadcast text-base"></i> Broadcast via 433.875 MHz LoRa Mesh
                  </button>
                </div>

              </form>
            </div>

            <!-- TARGETED HOUSEHOLDS & MESH REACHABILITY TABLE -->
            <div class="card p-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm space-y-2.5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i class="ph ph-users-four text-blue-600 text-base font-black"></i>
                  <h3 class="text-xs font-black text-slate-900 uppercase tracking-wider">Household LoRa Mesh Reachability Roster</h3>
                </div>
                <span class="text-[11px] font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 shadow-2xs" id="previewSummaryBadge">
                  <%= (initialMetrics && initialMetrics.residents) ? initialMetrics.residents.length : 0 %> Households Targeted
                </span>
              </div>

              <!-- Compact Table Container -->
              <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-inner">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-100 text-slate-800 font-black sticky top-0 border-b border-slate-200 text-[10.5px] uppercase">
                    <tr>
                      <th class="py-2 px-3">Household Head</th>
                      <th class="py-2 px-3">Zone / Location</th>
                      <th class="py-2 px-3">Vulnerability</th>
                      <th class="py-2 px-3 text-right">Mesh RF Route</th>
                    </tr>
                  </thead>
                  <tbody id="recipientPreviewTableBody" class="divide-y divide-slate-100 font-medium">
                    <% if (initialMetrics && initialMetrics.residents && initialMetrics.residents.length > 0) { %>
                      <% initialMetrics.residents.forEach(r => { %>
                        <tr class="hover:bg-slate-50 transition-colors text-[11px]">
                          <td class="py-1.5 px-3 font-bold text-slate-900"><%= r.name %></td>
                          <td class="py-1.5 px-3 text-slate-600"><%= r.zone || r.barangay || 'San Rafael' %></td>
                          <td class="py-1.5 px-3">
                            <% if (r.is_pwd || r.is_senior || r.is_pregnant) { %>
                              <span class="px-2 py-0.5 bg-amber-100 text-amber-900 text-[9.5px] font-black rounded-full border border-amber-200 inline-flex items-center gap-1">
                                <i class="ph ph-shield-warning"></i> Vulnerable
                              </span>
                            <% } else { %>
                              <span class="text-slate-400 text-[10px]">Standard</span>
                            <% } %>
                          </td>
                          <td class="py-1.5 px-3 text-right font-mono text-[10px]">
                            <span class="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-black rounded-full border border-emerald-200 inline-flex items-center gap-1">
                              <i class="ph ph-broadcast"></i> 3-Hop Relay
                            </span>
                          </td>
                        </tr>
                      <% }) %>
                    <% } else { %>
                      <tr>
                        <td colspan="4" class="text-center py-4 text-slate-400 text-xs">No registered resident households found.</td>
                      </tr>
                    <% } %>
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- =============================================================== -->
          <!-- RIGHT COLUMN: MESH NODES TELEMETRY & FRAME INSPECTOR (Cols 8-12) -->
          <!-- =============================================================== -->
          <div class="lg:col-span-5 space-y-4">

            <!-- 1. LIVE LORA MESH NODES TELEMETRY & HEALTH PANEL -->
            <div class="card p-4 sm:p-5 bg-white border border-slate-200/90 shadow-sm rounded-2xl space-y-4">
              
              <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center font-bold text-lg shrink-0">
                    <i class="ph ph-tree-structure"></i>
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                      433.875 MHz LoRa Mesh Network Nodes
                    </h3>
                    <p class="text-xs text-slate-600 font-medium">Real-time hardware connectivity, relay health & terminal sync</p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button type="button" onclick="refreshNodeStatus()" title="Refresh node telemetry"
                    class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs transition-colors cursor-pointer">
                    <i class="ph ph-arrows-clockwise text-sm" id="refreshNodeIcon"></i>
                  </button>
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-mono font-black border flex items-center gap-1.5 shadow-2xs" id="globalMeshHealthPill">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> MESH ACTIVE
                  </span>
                </div>
              </div>

              <!-- NODES STACK -->
              <div class="space-y-3" id="meshNodesStack">
                
                <!-- NODE 1: HALL GATEWAY (!d88b1a58) -->
                <div class="p-3.5 rounded-2xl border transition-all" id="nodeCard-d88b1a58">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mt-0.5" id="node1-iconBox">
                        <i class="ph ph-hard-drives"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 1: Hall Gateway
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border" id="node1-idBadge">(!d88b1a58)</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5" id="node1-desc">
                          COM3 Serial Bridge &bull; TxPower: 10dBm
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>Role: Gateway</span>
                          <span>&bull;</span>
                          <span>Baud: 115200</span>
                          <span>&bull;</span>
                          <span id="node1-seen" class="font-bold text-slate-700">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node1-badge" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 lora-pulse-radar"></span> ONLINE
                    </span>
                  </div>

                  <!-- Dynamic Offline Reconnection Instruction Banner -->
                  <div id="node1-offlinePrompt" class="hidden mt-3 p-3 bg-rose-100 border-2 border-rose-400 rounded-xl text-rose-950 text-xs font-bold flex items-start gap-2.5">
                    <i class="ph ph-plugs text-xl text-rose-600 shrink-0 mt-0.5 animate-bounce"></i>
                    <div>
                      <div class="font-black text-rose-950 text-xs">⚠️ Hall LoRa Gateway Disconnected!</div>
                      <div class="text-[11px] text-rose-800 font-semibold mt-0.5 leading-normal">
                        Please connect Node 1 (!d88b1a58) via USB to this laptop (COM3). Check that the cable is firmly plugged in.
                      </div>
                    </div>
                  </div>
                </div>

                <!-- NODE 2: ZONE 1 RELAY (!0f778ab0) -->
                <div class="p-3.5 rounded-2xl border transition-all" id="nodeCard-0f778ab0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mt-0.5" id="node2-iconBox">
                        <i class="ph ph-broadcast"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 2: Zone 1 Relay
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border" id="node2-idBadge">(!0f778ab0)</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5" id="node2-desc">
                          Elevated Repeater &bull; 3-Hop Relay
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span id="node2-snr" class="font-bold text-emerald-700">SNR: +13.2 dB</span>
                          <span>&bull;</span>
                          <span>Hop: 1 (Relay)</span>
                          <span>&bull;</span>
                          <span id="node2-seen" class="font-bold text-slate-700">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node2-badge" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> REPEATING
                    </span>
                  </div>

                  <!-- Dynamic Offline Warning Banner -->
                  <div id="node2-offlinePrompt" class="hidden mt-3 p-3 bg-amber-100 border-2 border-amber-400 rounded-xl text-amber-950 text-xs font-bold flex items-start gap-2.5">
                    <i class="ph ph-warning text-xl text-amber-600 shrink-0 mt-0.5"></i>
                    <div>
                      <div class="font-black text-amber-950 text-xs">⚠️ Zone 1 Relay Unreachable!</div>
                      <div class="text-[11px] text-amber-800 font-semibold mt-0.5 leading-normal">
                        Repeater Node 2 (!0f778ab0) is not responding over 433.875 MHz RF. Check solar battery charge or repeater placement.
                      </div>
                    </div>
                  </div>
                </div>

                <!-- NODE 3: RESIDENT NODE (!f4e213d4) -->
                <div class="p-3.5 rounded-2xl border transition-all" id="nodeCard-f4e213d4">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mt-0.5" id="node3-iconBox">
                        <i class="ph ph-device-mobile"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 3: Resident Node
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border" id="node3-idBadge">(!f4e213d4)</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5" id="node3-desc">
                          BLE GATT Mobile Link &bull; RSSI: -50dBm
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span id="node3-rssi" class="font-bold text-purple-700">RSSI: -50 dBm</span>
                          <span>&bull;</span>
                          <span>Via: REL1 (!0f778ab0)</span>
                          <span>&bull;</span>
                          <span id="node3-seen" class="font-bold text-slate-700">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node3-badge" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <span class="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span> PAIRED
                    </span>
                  </div>

                  <!-- Dynamic Offline / Unpaired Warning Banner -->
                  <div id="node3-offlinePrompt" class="hidden mt-3 p-3 bg-slate-100 border-2 border-slate-300 rounded-xl text-slate-900 text-xs font-bold flex items-start gap-2.5">
                    <i class="ph ph-bluetooth-slash text-xl text-slate-600 shrink-0 mt-0.5"></i>
                    <div>
                      <div class="font-black text-slate-950 text-xs">⚠️ Resident Node Unpaired / Disconnected</div>
                      <div class="text-[11px] text-slate-700 font-semibold mt-0.5 leading-normal">
                        No active Bluetooth link. Resident must open the EvakWar App on their phone and connect to RES1 (!f4e213d4).
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <!-- BOTTOM MESH METRIC STRIP -->
              <div class="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono font-bold text-slate-700">
                <span class="flex items-center gap-1.5">
                  <i class="ph ph-radio text-emerald-600 font-black"></i>
                  <span>Carrier: 433.875 MHz (EU_433)</span>
                </span>
                <span id="nodesOnlineCounter" class="text-emerald-700 font-black">
                  3 / 3 Nodes Online
                </span>
              </div>

            </div>

            <!-- 2. REAL-TIME LORA MESH PACKET FORMATTER & AIRTIME INSPECTOR -->
            <div class="card p-4 sm:p-5 bg-white border border-slate-200/90 shadow-sm rounded-2xl space-y-3.5">
              
              <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-slate-900 text-blue-400 border border-slate-700 flex items-center justify-center font-bold text-lg shrink-0">
                    <i class="ph ph-terminal-window"></i>
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                      433.875 MHz LoRa Mesh Frame Inspector
                    </h3>
                    <p class="text-xs text-slate-600 font-medium font-mono">Real-time EVW|ALT frame encoder, airtime & MTU inspector</p>
                  </div>
                </div>

                <button type="button" onclick="copyLoraPacket()"
                  class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer">
                  <i class="ph ph-copy text-xs"></i>
                  <span id="copyFrameBtnText">Copy Frame</span>
                </button>
              </div>

              <!-- Live Raw Packet Display (Dark Terminal with Neon Green Text for extreme contrast) -->
              <div class="p-3.5 bg-slate-950 rounded-xl border-2 border-slate-800 lora-terminal-font text-xs text-emerald-400 break-all select-all leading-relaxed shadow-inner" id="rawLoraPacketDisplay">
                EVW|ALT|0712751|BLUE|ALL|BLUE ALERT: Community Disaster Advisor|San Rafael Evacuation Center|Community disaster advisory for San Rafael. Emergency operations center is active on 433.875 MH
              </div>

              <!-- Packet Airtime & MTU Metrics Bar -->
              <div class="grid grid-cols-3 gap-2.5 pt-1 text-center">
                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div class="text-[10px] uppercase font-black text-slate-500 tracking-wider">Frame Size</div>
                  <div class="text-sm sm:text-base font-black text-emerald-600 font-mono mt-0.5" id="packetBytesDisplay">188 / 140 B</div>
                </div>
                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div class="text-[10px] uppercase font-black text-slate-500 tracking-wider">Airtime (ToA)</div>
                  <div class="text-sm sm:text-base font-black text-blue-600 font-mono mt-0.5" id="airtimeEstimateDisplay">~575 ms</div>
                </div>
                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div class="text-[10px] uppercase font-black text-slate-500 tracking-wider">Relay Hops</div>
                  <div class="text-sm sm:text-base font-black text-amber-600 font-mono mt-0.5">3 Hops (Max TTL)</div>
                </div>
              </div>

              <!-- Visual Packet Segment Breakdown -->
              <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs font-mono text-slate-700">
                <div class="text-slate-900 font-black flex items-center gap-1.5 text-xs">
                  <i class="ph ph-info text-blue-600"></i>
                  <span>Frame Format:</span>
                </div>
                <div class="text-[10px] text-slate-700 leading-relaxed font-bold">
                  <span class="text-emerald-700 font-black">EVW</span>|<span class="text-amber-700 font-black">ALT</span>|<span class="text-blue-700 font-black">&lt;id&gt;</span>|<span class="text-red-700 font-black">&lt;severity&gt;</span>|<span class="text-purple-700 font-black">&lt;zone&gt;</span>|<span class="text-slate-950 font-black">&lt;title&gt;</span>|<span class="text-emerald-700 font-black">&lt;shelter&gt;</span>|<span class="text-slate-700 font-black">&lt;message&gt;</span>
                </div>
              </div>

            </div>

          </div>

        </div>

        <!-- =============================================================== -->
        <!-- 3. RECENT LORA MESH BROADCAST HISTORY LOG TABLE                  -->
        <!-- =============================================================== -->
        <div class="card p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-sm mt-3">
          <div class="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="ph ph-clock-counter-clockwise"></i>
              </div>
              <div>
                <h3 class="text-sm font-black text-slate-900 leading-tight">433.875 MHz LoRa Mesh Emergency Alerts Log</h3>
                <p class="text-xs text-slate-500 font-medium">Official log of emergency broadcasts dispatched over the 433.875 MHz LoRa mesh network.</p>
              </div>
            </div>
            <span class="text-xs font-black text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs w-max">
              <%= (history || []).length %> Total Broadcasts Dispatched
            </span>
          </div>

          <div class="max-h-[320px] overflow-y-auto overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="sticky top-0 z-10 bg-slate-100 text-slate-800 font-black uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <tr>
                  <th class="py-2.5 px-3">Date & Time</th>
                  <th class="py-2.5 px-3">Severity</th>
                  <th class="py-2.5 px-3">Alert Headline & Message</th>
                  <th class="py-2.5 px-3">Target Scope</th>
                  <th class="py-2.5 px-3">LoRa Mesh Frame</th>
                  <th class="py-2.5 px-3">RF Channel</th>
                  <th class="py-2.5 px-3">Transmission Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                <% if (!history || history.length === 0) { %>
                  <tr>
                    <td colspan="7" class="py-6 text-center text-slate-400 font-medium">
                      <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-lg mb-1">
                        <i class="ph ph-broadcast"></i>
                      </div>
                      <div class="text-xs font-bold text-slate-600">No LoRa emergency broadcasts recorded yet.</div>
                      <div class="text-[10px] text-slate-400 mt-0.5">Dispatched alerts over 433.875 MHz will appear here.</div>
                    </td>
                  </tr>
                <% } else { %>
                  <% history.forEach(item => { %>
                    <tr class="hover:bg-slate-50/80 transition-colors">
                      <td class="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap text-[11px]">
                        <%= new Date(item.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) %>
                      </td>
                      <td class="py-2 px-3 whitespace-nowrap">
                        <% const sev = (item.severity || 'BLUE').toUpperCase(); %>
                        <% if (sev === 'RED') { %>
                          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span> P1 RED
                          </span>
                        <% } else if (sev === 'ORANGE') { %>
                          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-800 border border-orange-300 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> P2 ORANGE
                          </span>
                        <% } else if (sev === 'YELLOW') { %>
                          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-yellow-100 text-yellow-900 border border-yellow-300 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> P3 YELLOW
                          </span>
                        <% } else if (sev === 'GREEN') { %>
                          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> P5 GREEN
                          </span>
                        <% } else { %>
                          <span class="px-2.5 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span> P4 BLUE
                          </span>
                        <% } %>
                      </td>
                      <td class="py-2 px-3 max-w-[280px] font-medium text-slate-900 text-[11px]" title="<%= item.message %>">
                        <div class="font-bold text-slate-900 truncate"><%= item.title || 'Emergency Warning' %></div>
                        <div class="text-slate-500 truncate text-[10px]"><%= item.message %></div>
                      </td>
                      <td class="py-2 px-3 font-medium text-slate-600 whitespace-nowrap text-[11px]">
                        <%= item.target_audience %> <%= item.barangay ? '(' + item.barangay + ')' : '(All Zones)' %>
                      </td>
                      <td class="py-2 px-3 font-mono text-[10px] text-slate-700 max-w-[200px] truncate" title="EVW|ALT|<%= item.id %>|<%= item.severity %>|<%= item.barangay || 'ALL' %>|...">
                        <span class="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold text-emerald-800">
                          EVW|ALT|<%= item.id %>|<%= item.severity %>|...
                        </span>
                      </td>
                      <td class="py-2 px-3 whitespace-nowrap font-mono text-[10px] text-slate-600">
                        433.875 MHz (EU_433)
                      </td>
                      <td class="py-2 px-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-max border border-emerald-200">
                          <i class="ph ph-broadcast"></i> TRANSMITTED (3 Hops)
                        </span>
                      </td>
                    </tr>
                  <% }) %>
                <% } %>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>

  </div>
</div>

<!-- RED CONFIRMATION MODAL -->
<div id="redConfirmationModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 hidden">
  <div class="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border-t-4 border-red-600 space-y-4 animate-scale-in">
    <div class="flex items-center gap-3 text-red-600">
      <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <i class="ph ph-warning-octagon text-2xl font-bold"></i>
      </div>
      <div>
        <h3 class="font-black text-base text-slate-900">Confirm Mandatory Red Alert</h3>
        <p class="text-xs text-slate-500">433.875 MHz LoRa Mesh Emergency Broadcast</p>
      </div>
    </div>

    <div class="p-3.5 bg-red-50 rounded-xl border-2 border-red-200 text-xs text-red-950 space-y-1.5">
      <p class="font-black text-red-900">You are about to transmit a MANDATORY EVACUATION ORDER over the 433.875 MHz LoRa mesh network.</p>
      <p class="text-[11px] text-red-800 leading-relaxed font-medium">
        This broadcast will activate emergency sirens and multi-pulse haptic vibrations on all resident terminals in San Rafael.
      </p>
    </div>

    <div class="flex items-center justify-end gap-2.5 pt-2">
      <button type="button" onclick="closeRedModal()"
        class="px-4 py-2 border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
        Cancel
      </button>
      <button type="button" onclick="confirmRedSubmit()"
        class="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-colors cursor-pointer">
        <i class="ph ph-broadcast"></i> Confirm & Broadcast Now
      </button>
    </div>
  </div>
</div>

<!-- HIDDEN SERVER DATA ELEMENT FOR JAVASCRIPT -->
<div id="broadcast-server-data"
  data-is-council="<%= isBarangayCouncil ? 'true' : 'false' %>"
  data-user-barangay="<%= userBarangay || 'San Rafael' %>"
  data-residents='<%- JSON.stringify((initialMetrics && initialMetrics.residents) ? initialMetrics.residents : []) %>'>
</div>

<script>
  (function () {
    'use strict';

    const serverData = document.getElementById('broadcast-server-data');
    const isBarangayCouncil = serverData.getAttribute('data-is-council') === 'true';
    const userBarangay = serverData.getAttribute('data-user-barangay') || 'San Rafael';
    
    let initialResidents = [];
    try {
      initialResidents = JSON.parse(serverData.getAttribute('data-residents') || '[]');
    } catch (_) { initialResidents = []; }

    const recipientCache = {};
    let currentResidentsList = initialResidents;
    let currentActiveSeverity = 'BLUE';

    // LoRa Emergency Disaster Templates
    const LORA_TEMPLATES = {
      red_evac: {
        title: "RED ALERT: Mandatory Evacuation Order",
        message: "Mandatory evacuation ordered for all hazard zones in {BARANGAY}. Proceed immediately to {CENTER_NAME} via Zone 1 safe path."
      },
      orange_prep: {
        title: "ORANGE ALERT: Pre-Evacuation Readiness",
        message: "Severe weather approaching {BARANGAY}. Prepare go-bags, secure family members, and move to designated shelters before {TIME}."
      },
      yellow_watch: {
        title: "YELLOW ALERT: Severe Weather & Flood Watch",
        message: "Heavy rainfall and river level rise detected in {BARANGAY}. Stay indoors, monitor emergency radio, and avoid riverbanks."
      },
      blue_advisory: {
        title: "BLUE ALERT: Community Disaster Advisory",
        message: "Community disaster advisory for {BARANGAY}. Emergency operations center is active on 433.875 MHz. Stay alert."
      },
      green_clear: {
        title: "GREEN ALERT: All Clear & Safe Return",
        message: "Danger has passed in {BARANGAY}. Floodwaters receded. Residents are cleared for safe return home as of {TIME}."
      },
      relief: {
        title: "RELIEF NOTICE: Aid & Supply Distribution",
        message: "Relief food packs and medical supplies distribution for {BARANGAY} is underway at {CENTER_NAME} today at {TIME}."
      },
      center_cap: {
        title: "CAPACITY NOTICE: Secondary Shelter Open",
        message: "Notice: Primary shelter reaching capacity. Secondary facilities in {BARANGAY} are now open for intake."
      }
    };

    // Solid High-Contrast Severity Theme Configurations
    const SEVERITY_THEMES = {
      RED: {
        btnSelected: 'severity-btn p-2.5 rounded-xl border-2 border-red-700 bg-red-600 text-white text-left cursor-pointer shadow-lg ring-4 ring-red-200 scale-102',
        btnUnselected: 'severity-btn p-2.5 rounded-xl border-2 border-red-300 bg-red-50 text-left cursor-pointer hover:border-red-500 shadow-xs',
        badgeSelected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-red-700 shadow-xs',
        badgeUnselected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-600 text-white shadow-xs',
        titleSelected: 'sev-title font-black text-xs text-white',
        titleUnselected: 'sev-title font-black text-xs text-red-950',
        subSelected: 'sev-sub text-[10px] font-bold text-red-100 truncate mt-0.5',
        subUnselected: 'sev-sub text-[10px] font-bold text-red-800 truncate mt-0.5',
        borderClass: 'card p-4 sm:p-5 border-t-4 border-red-600 shadow-sm bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer',
        headerIconClass: 'ph ph-siren text-red-600'
      },
      ORANGE: {
        btnSelected: 'severity-btn p-2.5 rounded-xl border-2 border-orange-600 bg-orange-500 text-white text-left cursor-pointer shadow-lg ring-4 ring-orange-200 scale-102',
        btnUnselected: 'severity-btn p-2.5 rounded-xl border-2 border-orange-300 bg-orange-50 text-left cursor-pointer hover:border-orange-500 shadow-xs',
        badgeSelected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-orange-600 shadow-xs',
        badgeUnselected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-500 text-white shadow-xs',
        titleSelected: 'sev-title font-black text-xs text-white',
        titleUnselected: 'sev-title font-black text-xs text-orange-950',
        subSelected: 'sev-sub text-[10px] font-bold text-orange-100 truncate mt-0.5',
        subUnselected: 'sev-sub text-[10px] font-bold text-orange-800 truncate mt-0.5',
        borderClass: 'card p-4 sm:p-5 border-t-4 border-orange-500 shadow-sm bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer',
        headerIconClass: 'ph ph-warning-circle text-orange-500'
      },
      YELLOW: {
        btnSelected: 'severity-btn p-2.5 rounded-xl border-2 border-amber-500 bg-amber-400 text-slate-950 text-left cursor-pointer shadow-lg ring-4 ring-amber-200 scale-102',
        btnUnselected: 'severity-btn p-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-left cursor-pointer hover:border-amber-500 shadow-xs',
        badgeSelected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-950 text-amber-300 shadow-xs',
        badgeUnselected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-xs',
        titleSelected: 'sev-title font-black text-xs text-slate-950',
        titleUnselected: 'sev-title font-black text-xs text-amber-950',
        subSelected: 'sev-sub text-[10px] font-bold text-slate-900 truncate mt-0.5',
        subUnselected: 'sev-sub text-[10px] font-bold text-amber-800 truncate mt-0.5',
        borderClass: 'card p-4 sm:p-5 border-t-4 border-amber-500 shadow-sm bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer',
        headerIconClass: 'ph ph-warning text-amber-500'
      },
      BLUE: {
        btnSelected: 'severity-btn p-2.5 rounded-xl border-2 border-blue-700 bg-blue-600 text-white text-left cursor-pointer shadow-lg ring-4 ring-blue-200 scale-102',
        btnUnselected: 'severity-btn p-2.5 rounded-xl border-2 border-blue-300 bg-blue-50 text-left cursor-pointer hover:border-blue-500 shadow-xs',
        badgeSelected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-blue-700 shadow-xs',
        badgeUnselected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-xs',
        titleSelected: 'sev-title font-black text-xs text-white',
        titleUnselected: 'sev-title font-black text-xs text-blue-950',
        subSelected: 'sev-sub text-[10px] font-bold text-blue-100 truncate mt-0.5',
        subUnselected: 'sev-sub text-[10px] font-bold text-blue-800 truncate mt-0.5',
        borderClass: 'card p-4 sm:p-5 border-t-4 border-blue-600 shadow-sm bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer',
        headerIconClass: 'ph ph-broadcast text-blue-600'
      },
      GREEN: {
        btnSelected: 'severity-btn p-2.5 rounded-xl border-2 border-emerald-700 bg-emerald-600 text-white text-left cursor-pointer shadow-lg ring-4 ring-emerald-200 scale-102',
        btnUnselected: 'severity-btn p-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-left cursor-pointer hover:border-emerald-500 shadow-xs',
        badgeSelected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-emerald-700 shadow-xs',
        badgeUnselected: 'sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-600 text-white shadow-xs',
        titleSelected: 'sev-title font-black text-xs text-white',
        titleUnselected: 'sev-title font-black text-xs text-emerald-950',
        subSelected: 'sev-sub text-[10px] font-bold text-emerald-100 truncate mt-0.5',
        subUnselected: 'sev-sub text-[10px] font-bold text-emerald-800 truncate mt-0.5',
        borderClass: 'card p-4 sm:p-5 border-t-4 border-emerald-500 shadow-sm bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer',
        headerIconClass: 'ph ph-check-circle text-emerald-600'
      }
    };

    window.selectSeverity = function (level) {
      currentActiveSeverity = level;
      document.getElementById('severityInput').value = level;

      const levels = ['RED', 'ORANGE', 'YELLOW', 'BLUE', 'GREEN'];
      levels.forEach(l => {
        const btn = document.getElementById(`card-${l}`);
        if (!btn) return;
        const theme = SEVERITY_THEMES[l];
        const isSel = (l === level);

        btn.className = isSel ? theme.btnSelected : theme.btnUnselected;
        
        const badge = btn.querySelector('.sev-badge');
        if (badge) badge.className = isSel ? theme.badgeSelected : theme.badgeUnselected;
        
        const title = btn.querySelector('.sev-title');
        if (title) title.className = isSel ? theme.titleSelected : theme.titleUnselected;
        
        const sub = btn.querySelector('.sev-sub');
        if (sub) sub.className = isSel ? theme.subSelected : theme.subUnselected;
      });

      const activeTheme = SEVERITY_THEMES[level] || SEVERITY_THEMES.BLUE;
      const composeCard = document.getElementById('composeCard');
      if (composeCard) composeCard.className = activeTheme.borderClass;

      const submitBtn = document.getElementById('btnSubmitBroadcast');
      if (submitBtn) submitBtn.className = activeTheme.submitBtnClass;

      const headerIcon = document.getElementById('headerIcon');
      if (headerIcon) headerIcon.className = activeTheme.headerIconClass;

      // Auto-load matching template
      const templateKeyMap = { RED: 'red_evac', ORANGE: 'orange_prep', YELLOW: 'yellow_watch', BLUE: 'blue_advisory', GREEN: 'green_clear' };
      applyTemplate(templateKeyMap[level] || 'blue_advisory');
    };

    window.applyTemplate = function (key) {
      if (!LORA_TEMPLATES[key]) return;
      const tpl = LORA_TEMPLATES[key];

      const brgyVal = userBarangay || 'San Rafael';
      const centerVal = 'San Rafael Evacuation Center';
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      let title = tpl.title.replace('{BARANGAY}', brgyVal).replace('{TIME}', timeStr).replace('{CENTER_NAME}', centerVal);
      let msg = tpl.message.replace('{BARANGAY}', brgyVal).replace('{TIME}', timeStr).replace('{CENTER_NAME}', centerVal);

      document.getElementById('alertTitleInput').value = title;
      document.getElementById('messageBox').value = msg;

      updateLoraMetrics();
    };

    window.onTemplateChange = function (val) {
      if (val) window.applyTemplate(val);
    };

    window.updateLoraMetrics = function () {
      const severity = currentActiveSeverity || 'BLUE';
      const zone = 'ALL';
      const title = (document.getElementById('alertTitleInput').value || 'EMERGENCY ALERT').trim().slice(0, 38);
      const shelter = 'San Rafael Evacuation Center';
      const msg = (document.getElementById('messageBox').value || '').trim().slice(0, 95);

      const alertId = Date.now().toString().slice(-7);
      const rawPacket = `EVW|ALT|${alertId}|${severity}|${zone}|${title || 'EMERGENCY'}|${shelter}|${msg || 'Proceed to nearest safe center.'}`;

      // Update Live Frame Terminal Display
      const packetEl = document.getElementById('rawLoraPacketDisplay');
      if (packetEl) packetEl.textContent = rawPacket;

      // Update Byte Count & MTU Safety
      const packetBytes = new TextEncoder().encode(rawPacket).length;
      const bytesEl = document.getElementById('packetBytesDisplay');
      if (bytesEl) {
        bytesEl.textContent = `${packetBytes} / 140 B`;
        if (packetBytes > 140) {
          bytesEl.className = 'text-sm sm:text-base font-black text-rose-600 font-mono mt-0.5';
        } else if (packetBytes > 115) {
          bytesEl.className = 'text-sm sm:text-base font-black text-amber-600 font-mono mt-0.5';
        } else {
          bytesEl.className = 'text-sm sm:text-base font-black text-emerald-600 font-mono mt-0.5';
        }
      }

      // Airtime Estimate @ EU_433 LONG_FAST (SF11, BW 250kHz)
      const estToaMs = Math.round(180 + packetBytes * 2.1);
      const toaEl = document.getElementById('airtimeEstimateDisplay');
      if (toaEl) toaEl.textContent = `~${estToaMs} ms`;
    };

    window.copyLoraPacket = function () {
      const text = document.getElementById('rawLoraPacketDisplay').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          const btnText = document.getElementById('copyFrameBtnText');
          if (btnText) {
            const orig = btnText.textContent;
            btnText.textContent = 'Copied!';
            setTimeout(() => { btnText.textContent = orig; }, 2000);
          }
        });
      }
    };

    window.clearForm = function () {
      document.getElementById('alertTitleInput').value = '';
      document.getElementById('messageBox').value = '';
      updateLoraMetrics();
    };

    // Modal Confirmation for RED alerts
    window.closeRedModal = function () {
      document.getElementById('redConfirmationModal').classList.add('hidden');
    };

    window.confirmRedSubmit = function () {
      window.closeRedModal();
      document.getElementById('broadcastForm').submit();
    };

    document.getElementById('broadcastForm').addEventListener('submit', function (e) {
      const sev = document.getElementById('severityInput').value;
      if (sev === 'RED' && document.getElementById('redConfirmationModal').classList.contains('hidden')) {
        e.preventDefault();
        document.getElementById('redConfirmationModal').classList.remove('hidden');
        return;
      }

      const submitBtn = document.getElementById('btnSubmitBroadcast');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ph ph-circle-notch animate-spin text-base"></i> Transmitting over 433.875 MHz LoRa Mesh...';
      }
    });

    // =========================================================================
    // REAL-TIME LORA MESH NODES STATUS & DISCONNECTION ALERTS MONITOR
    // =========================================================================
    window.refreshNodeStatus = async function () {
      const icon = document.getElementById('refreshNodeIcon');
      if (icon) icon.classList.add('animate-spin');

      try {
        const res = await fetch('/api/lora/status');
        const data = await res.json();
        if (data && data.success) {
          updateMeshNodesUi(data);
        }
      } catch (err) {
        console.warn('LoRa node refresh note:', err);
      } finally {
        if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 400);
      }
    };

    function updateMeshNodesUi(data) {
      if (!data) return;
      const nodes = data.nodes || [];
      const gw = data.gateway || {};
      let onlineCount = 0;

      // -----------------------------------------------------------------------
      // 1. NODE 1: HALL GATEWAY (!d88b1a58)
      // -----------------------------------------------------------------------
      const n1Card = document.getElementById('nodeCard-d88b1a58');
      const n1Badge = document.getElementById('node1-badge');
      const n1Seen = document.getElementById('node1-seen');
      const n1IconBox = document.getElementById('node1-iconBox');
      const n1IdBadge = document.getElementById('node1-idBadge');
      const n1Prompt = document.getElementById('node1-offlinePrompt');
      const gwConnected = Boolean(gw.connected);

      if (gwConnected) {
        onlineCount++;
        if (n1Card) n1Card.className = 'p-3.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 shadow-xs transition-all';
        if (n1IconBox) n1IconBox.className = 'w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n1IdBadge) n1IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-300 bg-white text-emerald-800';
        if (n1Badge) {
          n1Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n1Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white lora-pulse-radar"></span> ONLINE';
        }
        if (n1Seen) n1Seen.textContent = 'Seen: just now';
        if (n1Prompt) n1Prompt.classList.add('hidden');
      } else {
        if (n1Card) n1Card.className = 'p-3.5 rounded-2xl border-2 border-rose-400 bg-rose-50/90 shadow-sm transition-all';
        if (n1IconBox) n1IconBox.className = 'w-9 h-9 rounded-xl bg-rose-100 text-rose-700 border border-rose-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n1IdBadge) n1IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-300 bg-white text-rose-800';
        if (n1Badge) {
          n1Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n1Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white lora-pulse-red"></span> OFFLINE';
        }
        if (n1Seen) n1Seen.textContent = 'Disconnected (COM3)';
        if (n1Prompt) n1Prompt.classList.remove('hidden');
      }

      // -----------------------------------------------------------------------
      // 2. NODE 2: ZONE 1 RELAY (!0f778ab0)
      // -----------------------------------------------------------------------
      const relNode = nodes.find(n => n.nodeId === '!0f778ab0' || (n.shortName && n.shortName.includes('REL')));
      const n2Card = document.getElementById('nodeCard-0f778ab0');
      const n2Badge = document.getElementById('node2-badge');
      const n2Seen = document.getElementById('node2-seen');
      const n2Snr = document.getElementById('node2-snr');
      const n2IconBox = document.getElementById('node2-iconBox');
      const n2IdBadge = document.getElementById('node2-idBadge');
      const n2Prompt = document.getElementById('node2-offlinePrompt');

      const isRelayOnline = Boolean(gwConnected && relNode && relNode.online !== false);

      if (isRelayOnline) {
        onlineCount++;
        if (n2Card) n2Card.className = 'p-3.5 rounded-2xl border-2 border-blue-300 bg-blue-50/50 shadow-xs transition-all';
        if (n2IconBox) n2IconBox.className = 'w-9 h-9 rounded-xl bg-blue-100 text-blue-700 border border-blue-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n2IdBadge) n2IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300 bg-white text-blue-800';
        if (n2Badge) {
          n2Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n2Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white animate-pulse"></span> REPEATING';
        }
        if (n2Seen) n2Seen.textContent = 'Seen: ' + (relNode.lastSeen ? formatTimeAgo(relNode.lastSeen) : 'just now');
        if (n2Snr) n2Snr.textContent = `SNR: +${relNode.snr || 13.2} dB`;
        if (n2Prompt) n2Prompt.classList.add('hidden');
      } else {
        if (n2Card) n2Card.className = 'p-3.5 rounded-2xl border-2 border-amber-400 bg-amber-50/90 shadow-sm transition-all';
        if (n2IconBox) n2IconBox.className = 'w-9 h-9 rounded-xl bg-amber-100 text-amber-700 border border-amber-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n2IdBadge) n2IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-white text-amber-800';
        if (n2Badge) {
          n2Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n2Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span> OFFLINE';
        }
        if (n2Seen) n2Seen.textContent = 'Last heard: ' + (relNode && relNode.lastSeen ? formatTimeAgo(relNode.lastSeen) : 'unreachable');
        if (n2Prompt) n2Prompt.classList.remove('hidden');
      }

      // -----------------------------------------------------------------------
      // 3. NODE 3: RESIDENT NODE (!f4e213d4)
      // -----------------------------------------------------------------------
      const resNode = nodes.find(n => n.nodeId === '!f4e213d4' || (n.shortName && n.shortName.includes('RES')));
      const n3Card = document.getElementById('nodeCard-f4e213d4');
      const n3Badge = document.getElementById('node3-badge');
      const n3Seen = document.getElementById('node3-seen');
      const n3Rssi = document.getElementById('node3-rssi');
      const n3IconBox = document.getElementById('node3-iconBox');
      const n3IdBadge = document.getElementById('node3-idBadge');
      const n3Prompt = document.getElementById('node3-offlinePrompt');

      const isResOnline = Boolean(resNode && resNode.online !== false && resNode.paired !== false);

      if (isResOnline) {
        onlineCount++;
        if (n3Card) n3Card.className = 'p-3.5 rounded-2xl border-2 border-purple-300 bg-purple-50/50 shadow-xs transition-all';
        if (n3IconBox) n3IconBox.className = 'w-9 h-9 rounded-xl bg-purple-100 text-purple-700 border border-purple-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n3IdBadge) n3IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-purple-300 bg-white text-purple-800';
        if (n3Badge) {
          n3Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-purple-600 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n3Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white animate-pulse"></span> PAIRED';
        }
        if (n3Seen) n3Seen.textContent = 'Seen: ' + (resNode.lastSeen ? formatTimeAgo(resNode.lastSeen) : 'just now');
        if (n3Rssi) n3Rssi.textContent = `RSSI: ${resNode.rssi || -50} dBm`;
        if (n3Prompt) n3Prompt.classList.add('hidden');
      } else {
        if (n3Card) n3Card.className = 'p-3.5 rounded-2xl border-2 border-slate-300 bg-slate-50 shadow-sm transition-all';
        if (n3IconBox) n3IconBox.className = 'w-9 h-9 rounded-xl bg-slate-200 text-slate-700 border border-slate-300 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5';
        if (n3IdBadge) n3IdBadge.className = 'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-700';
        if (n3Badge) {
          n3Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-500 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
          n3Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span> NOT PAIRED';
        }
        if (n3Seen) n3Seen.textContent = 'Last heard: ' + (resNode && resNode.lastSeen ? formatTimeAgo(resNode.lastSeen) : 'unpaired');
        if (n3Prompt) n3Prompt.classList.remove('hidden');
      }

      // -----------------------------------------------------------------------
      // Global Mesh Health Pill & Counter
      // -----------------------------------------------------------------------
      const healthPill = document.getElementById('globalMeshHealthPill');
      const countEl = document.getElementById('nodesOnlineCounter');
      if (countEl) countEl.textContent = `${onlineCount} / 3 Nodes Online`;

      if (healthPill) {
        if (onlineCount >= 3) {
          healthPill.className = 'px-2.5 py-1 rounded-full text-[10px] font-mono font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs';
          healthPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span> MESH ACTIVE';
        } else if (onlineCount > 0) {
          healthPill.className = 'px-2.5 py-1 rounded-full text-[10px] font-mono font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-2xs';
          healthPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> PARTIAL MESH';
        } else {
          healthPill.className = 'px-2.5 py-1 rounded-full text-[10px] font-mono font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 shadow-2xs';
          healthPill.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-600 lora-pulse-red"></span> MESH DOWN';
        }
      }
    }

    function formatTimeAgo(isoString) {
      if (!isoString) return 'never';
      const sec = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));
      if (sec < 4) return 'just now';
      if (sec < 60) return `${sec}s ago`;
      const min = Math.floor(sec / 60);
      return `${min}m ago`;
    }

    // Connect to Socket.IO for instant real-time telemetry push
    if (typeof io !== 'undefined') {
      try {
        const socket = io();
        socket.on('lora:nodes_updated', (nodes) => {
          updateMeshNodesUi({ nodes, gateway: { connected: true } });
        });
        socket.on('lora:status', (status) => {
          updateMeshNodesUi({ gateway: status });
        });
      } catch (_) {}
    }

    // Auto-poll node telemetry every 2.0 seconds for instantaneous offline/online state
    setInterval(window.refreshNodeStatus, 2000);

    // Auto-init on load
    window.addEventListener('DOMContentLoaded', () => {
      window.selectSeverity('BLUE');
      updateLoraMetrics();
      window.refreshNodeStatus();
    });

  })();
</script>
"""

with open('views/admin/broadcast.ejs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated views/admin/broadcast.ejs successfully!")
