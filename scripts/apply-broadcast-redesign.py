import os

content = """<%#
  EvakWar (E-BAKWAR) - 433.875 MHz LoRa Mesh Emergency Alerting Command Console
  Tactical RF disaster broadcast dispatcher operating 100% offline without internet,
  Wi-Fi, or commercial cellular SMS dependency.
%>

<style>
  /* High-Contrast Tactical LoRa Console Theme */
  html.dark main.broadcast-white,
  html.dark .broadcast-white {
    background-color: #f8fafc !important;
    color: #0f172a !important;
  }
  html.dark .broadcast-white .card,
  html.dark .broadcast-white .bg-white {
    background-color: #ffffff !important;
    border-color: #e2e8f0 !important;
    color: #0f172a !important;
  }
  html.dark .broadcast-white input,
  html.dark .broadcast-white select,
  html.dark .broadcast-white textarea {
    background-color: #ffffff !important;
    border-color: #cbd5e1 !important;
    color: #0f172a !important;
  }
  .lora-pulse-radar {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    animation: loraRadarPulse 2s infinite;
  }
  .lora-pulse-red {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
    animation: loraRadarPulseRed 2s infinite;
  }
  @keyframes loraRadarPulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  @keyframes loraRadarPulseRed {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  .lora-terminal-font {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }
</style>

<div class="flex h-screen overflow-hidden bg-slate-50">
  <%- include('../partials/sidebar', { page: 'broadcast' }) %>

  <div class="flex-1 flex flex-col min-w-0 overflow-y-auto">
    <%- include('../partials/header') %>

    <main class="app-content broadcast-white flex flex-col min-h-screen bg-slate-50 relative pb-16 lg:pb-6 overflow-x-hidden">
      <div class="max-w-[1440px] mx-auto space-y-4 flex-1 w-full p-3 sm:p-4 lg:p-5">

        <!-- 1. TOP HARDWARE & MESH TELEMETRY STATUS BANNER -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            <!-- Left: Title & Operational Scope -->
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black text-xl shrink-0">
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

            <!-- Right: RF Modulation & Network Health Indicator -->
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <div class="px-3 py-1.5 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center gap-2 text-[11px] font-mono">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-slate-300 font-bold">RF:</span>
                <span class="text-emerald-400 font-bold">433.875 MHz</span>
                <span class="text-slate-500">|</span>
                <span class="text-slate-400">SF11 / BW 250kHz</span>
                <span class="text-slate-500">|</span>
                <span class="text-blue-400 font-bold">Hop Limit: 3</span>
              </div>
            </div>

          </div>
        </div>

        <!-- SUCCESS ALERT BANNER -->
        <% if (locals.successMsg) { %>
          <div class="p-3 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-emerald-900">
              <i class="ph ph-broadcast text-xl text-emerald-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs">LoRa Mesh Broadcast Dispatched</h4>
                <p class="text-[11px] text-emerald-700 font-medium"><%= successMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-emerald-500 hover:text-emerald-700 text-base p-1" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- WARNING ALERT BANNER -->
        <% if (locals.warningMsg) { %>
          <div class="p-3 bg-amber-50 border-l-4 border-amber-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-amber-900">
              <i class="ph ph-warning-circle text-xl text-amber-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs">LoRa Mesh Notice</h4>
                <p class="text-[11px] text-amber-700 font-medium"><%= warningMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-amber-500 hover:text-amber-700 text-base p-1" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- ERROR ALERT BANNER -->
        <% if (locals.errorMsg) { %>
          <div class="p-3 bg-rose-50 border-l-4 border-rose-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-rose-900">
              <i class="ph ph-x-circle text-xl text-rose-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs">LoRa Transmission Failure</h4>
                <p class="text-[11px] text-rose-700 font-medium"><%= errorMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-rose-500 hover:text-rose-700 text-base p-1" title="Dismiss">
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

            <div class="card p-4 sm:p-5 border-t-4 border-blue-600 shadow-soft bg-white rounded-2xl transition-all" id="composeCard">
              
              <div class="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
                <h2 class="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <i class="ph ph-broadcast text-blue-600 text-lg" id="headerIcon"></i> Emergency LoRa Mesh Broadcaster
                </h2>
                <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 font-mono">
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

                <!-- 1. SEVERITY LEVEL SELECTOR -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      1. Emergency Severity Level *
                    </label>
                    <span class="text-[10px] text-slate-400 font-semibold">(Auto-loads disaster instruction template)</span>
                  </div>
                  
                  <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2">
                    <!-- RED -->
                    <button type="button" id="card-RED" onclick="selectSeverity('RED')" class="severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-red-500 bg-red-50/90 text-red-900 text-left transition-all hover:bg-red-100 focus:outline-hidden cursor-pointer">
                      <div class="flex items-center justify-between mb-1">
                        <span class="sev-dot w-2.5 h-2.5 rounded-full bg-red-600 inline-block shadow-2xs"></span>
                        <span class="sev-badge text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">P1</span>
                      </div>
                      <div class="sev-title font-extrabold text-xs leading-none">RED</div>
                      <div class="sev-sub text-[9px] text-red-600 leading-tight mt-0.5 truncate font-semibold">Evacuate</div>
                    </button>

                    <!-- ORANGE -->
                    <button type="button" id="card-ORANGE" onclick="selectSeverity('ORANGE')" class="severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-orange-500 bg-orange-50/90 text-orange-900 text-left transition-all hover:bg-orange-100 focus:outline-hidden cursor-pointer">
                      <div class="flex items-center justify-between mb-1">
                        <span class="sev-dot w-2.5 h-2.5 rounded-full bg-orange-500 inline-block shadow-2xs"></span>
                        <span class="sev-badge text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300">P2</span>
                      </div>
                      <div class="sev-title font-extrabold text-xs leading-none">ORANGE</div>
                      <div class="sev-sub text-[9px] text-orange-600 leading-tight mt-0.5 truncate font-semibold">Pre-Evac</div>
                    </button>

                    <!-- YELLOW -->
                    <button type="button" id="card-YELLOW" onclick="selectSeverity('YELLOW')" class="severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-yellow-500 bg-yellow-50 text-yellow-950 text-left transition-all hover:bg-yellow-100 focus:outline-hidden cursor-pointer">
                      <div class="flex items-center justify-between mb-1">
                        <span class="sev-dot w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-2xs"></span>
                        <span class="sev-badge text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-300">P3</span>
                      </div>
                      <div class="sev-title font-extrabold text-xs leading-none">YELLOW</div>
                      <div class="sev-sub text-[9px] text-yellow-700 leading-tight mt-0.5 truncate font-semibold">Flood Watch</div>
                    </button>

                    <!-- BLUE (Default Active) -->
                    <button type="button" id="card-BLUE" onclick="selectSeverity('BLUE')" class="severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-blue-800 bg-blue-600 text-white text-left transition-all ring-3 ring-blue-400 shadow-md focus:outline-hidden cursor-pointer">
                      <div class="flex items-center justify-between mb-1">
                        <span class="sev-dot w-2.5 h-2.5 rounded-full bg-white inline-block shadow-2xs"></span>
                        <span class="sev-badge text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-800 text-white">P4</span>
                      </div>
                      <div class="sev-title font-extrabold text-xs leading-none">BLUE</div>
                      <div class="sev-sub text-[9px] text-blue-100 leading-tight mt-0.5 truncate font-semibold">Advisory</div>
                    </button>

                    <!-- GREEN -->
                    <button type="button" id="card-GREEN" onclick="selectSeverity('GREEN')" class="severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-emerald-500 bg-emerald-50/90 text-emerald-900 text-left transition-all hover:bg-emerald-100 focus:outline-hidden cursor-pointer">
                      <div class="flex items-center justify-between mb-1">
                        <span class="sev-dot w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-2xs"></span>
                        <span class="sev-badge text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">P5</span>
                      </div>
                      <div class="sev-title font-extrabold text-xs leading-none">GREEN</div>
                      <div class="sev-sub text-[9px] text-emerald-600 leading-tight mt-0.5 truncate font-semibold">All Clear</div>
                    </button>
                  </div>
                </div>

                <!-- 2. QUICK DISASTER PRESET TEMPLATES -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      2. Quick Preset Disaster Templates
                    </label>
                    <button type="button" class="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1" onclick="applyTemplate('custom')">
                      <i class="ph ph-arrow-counter-clockwise"></i> Reset Content
                    </button>
                  </div>
                  <div class="relative">
                    <i class="ph ph-lightning absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-base"></i>
                    <select id="templateSelect" onchange="onTemplateChange(this.value)"
                      class="form-control w-full pl-9 py-2 bg-amber-50/70 font-semibold border-amber-200 text-amber-950 rounded-xl text-xs focus:bg-white transition-colors">
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
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      3. Alert Headline & Tactical Instructions *
                    </label>
                    <span class="text-[10px] font-mono text-slate-400">Target LoRa MTU: &le; 140 Bytes</span>
                  </div>

                  <input type="text" id="alertTitleInput" name="title" oninput="updateLoraMetrics()"
                    placeholder="Alert Title (e.g., RED ALERT: Mandatory Evacuation Order)"
                    class="form-control w-full mb-2 font-bold text-xs p-2.5 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500">

                  <textarea id="messageBox" name="message" required oninput="updateLoraMetrics()"
                    class="form-control w-full min-h-[100px] resize-y font-sans text-xs p-2.5 border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 leading-normal"
                    placeholder="Type urgent instructions for residents... (e.g. Move to designated high ground immediately via Zone 1 route.)"></textarea>
                </div>

                <!-- 4. ACTION BUTTONS -->
                <div class="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                  <button type="button" onclick="clearForm()"
                    class="btn border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs py-2.5 px-4 transition-colors">
                    <i class="ph ph-arrow-counter-clockwise"></i> Clear Content
                  </button>

                  <button type="submit" id="btnSubmitBroadcast"
                    class="btn px-6 sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all">
                    <i class="ph ph-broadcast text-base"></i> Broadcast via 433.875 MHz LoRa Mesh
                  </button>
                </div>

              </form>
            </div>

            <!-- TARGETED HOUSEHOLDS & MESH REACHABILITY TABLE -->
            <div class="card p-3.5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <i class="ph ph-users-four text-blue-600 text-sm font-bold"></i>
                  <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider">Household LoRa Mesh Reachability Roster</h3>
                </div>
                <span class="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-2xs" id="previewSummaryBadge">
                  <%= (initialMetrics && initialMetrics.residents) ? initialMetrics.residents.length : 0 %> Households Targeted
                </span>
              </div>

              <!-- Compact Table Container -->
              <div class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-inner">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th class="py-1.5 px-2.5">Household Head</th>
                      <th class="py-1.5 px-2.5">Zone / Location</th>
                      <th class="py-1.5 px-2.5">Vulnerability</th>
                      <th class="py-1.5 px-2.5 text-right">Mesh RF Route</th>
                    </tr>
                  </thead>
                  <tbody id="recipientPreviewTableBody" class="divide-y divide-slate-100 font-medium">
                    <% if (initialMetrics && initialMetrics.residents && initialMetrics.residents.length > 0) { %>
                      <% initialMetrics.residents.forEach(r => { %>
                        <tr class="hover:bg-slate-50 transition-colors text-[11px]">
                          <td class="py-1 px-2.5 font-bold text-slate-900"><%= r.name %></td>
                          <td class="py-1 px-2.5 text-slate-600"><%= r.zone || r.barangay || 'San Rafael' %></td>
                          <td class="py-1 px-2.5">
                            <% if (r.is_pwd || r.is_senior || r.is_pregnant) { %>
                              <span class="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded-full border border-amber-200 inline-flex items-center gap-1">
                                <i class="ph ph-shield-warning"></i> Vulnerable
                              </span>
                            <% } else { %>
                              <span class="text-slate-400 text-[10px]">Standard</span>
                            <% } %>
                          </td>
                          <td class="py-1 px-2.5 text-right font-mono text-[10px]">
                            <span class="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 font-bold rounded-full border border-emerald-200 inline-flex items-center gap-1">
                              <i class="ph ph-broadcast"></i> 3-Hop Relay
                            </span>
                          </td>
                        </tr>
                      <% }) %>
                    <% } else { %>
                      <tr>
                        <td colspan="4" class="text-center py-3 text-slate-400 text-xs">No registered resident households found.</td>
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
            <div class="card p-4 sm:p-5 bg-slate-950 border border-slate-800 shadow-xl rounded-2xl text-white space-y-3.5">
              
              <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center text-lg shrink-0">
                    <i class="ph ph-tree-structure"></i>
                  </div>
                  <div>
                    <h3 class="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                      433.875 MHz LoRa Mesh Network Nodes
                    </h3>
                    <p class="text-[10px] text-slate-400">Real-time hardware connectivity & relay health</p>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button type="button" onclick="refreshNodeStatus()" title="Refresh telemetry"
                    class="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition-colors">
                    <i class="ph ph-arrows-clockwise" id="refreshNodeIcon"></i>
                  </button>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1" id="globalMeshHealthPill">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> MESH ACTIVE
                  </span>
                </div>
              </div>

              <!-- NODES STACK -->
              <div class="space-y-2.5" id="meshNodesStack">
                
                <!-- NODE 1: HALL GATEWAY (!d88b1a58) -->
                <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 hover:border-slate-700 transition-all" id="nodeCard-d88b1a58">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5">
                      <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                        <i class="ph ph-hard-drives text-base"></i>
                      </div>
                      <div>
                        <div class="font-extrabold text-xs text-white flex items-center gap-1.5">
                          Node 1: Hall Gateway
                          <span class="font-mono text-[10px] text-blue-400 bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-900">(!d88b1a58)</span>
                        </div>
                        <div class="text-[11px] text-slate-300 font-medium mt-0.5">
                          COM3 Serial Bridge &bull; TxPower: 10dBm
                        </div>
                        <div class="text-[9.5px] font-mono text-slate-400 mt-1 flex items-center gap-2">
                          <span>Role: Gateway</span>
                          <span>&bull;</span>
                          <span>Baud: 115200</span>
                          <span>&bull;</span>
                          <span id="node1-seen" class="text-slate-400">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node1-badge" class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 lora-pulse-radar"></span> ONLINE
                    </span>
                  </div>
                </div>

                <!-- NODE 2: ZONE 1 RELAY (!0f778ab0) -->
                <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 hover:border-slate-700 transition-all" id="nodeCard-0f778ab0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5">
                      <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                        <i class="ph ph-broadcast text-base"></i>
                      </div>
                      <div>
                        <div class="font-extrabold text-xs text-white flex items-center gap-1.5">
                          Node 2: Zone 1 Relay
                          <span class="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-900">(!0f778ab0)</span>
                        </div>
                        <div class="text-[11px] text-slate-300 font-medium mt-0.5">
                          Elevated Repeater &bull; 3-Hop Relay
                        </div>
                        <div class="text-[9.5px] font-mono text-slate-400 mt-1 flex items-center gap-2">
                          <span id="node2-snr" class="text-emerald-400 font-bold">SNR: +13.2 dB</span>
                          <span>&bull;</span>
                          <span>Hop: 1 (Relay)</span>
                          <span>&bull;</span>
                          <span id="node2-seen" class="text-slate-400">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node2-badge" class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> REPEATING
                    </span>
                  </div>
                </div>

                <!-- NODE 3: RESIDENT NODE (!f4e213d4) -->
                <div class="p-3 bg-slate-900/90 rounded-xl border border-slate-800 hover:border-slate-700 transition-all" id="nodeCard-f4e213d4">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5">
                      <div class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                        <i class="ph ph-device-mobile text-base"></i>
                      </div>
                      <div>
                        <div class="font-extrabold text-xs text-white flex items-center gap-1.5">
                          Node 3: Resident Node
                          <span class="font-mono text-[10px] text-purple-400 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-900">(!f4e213d4)</span>
                        </div>
                        <div class="text-[11px] text-slate-300 font-medium mt-0.5">
                          BLE GATT Mobile Link &bull; RSSI: -50dBm
                        </div>
                        <div class="text-[9.5px] font-mono text-slate-400 mt-1 flex items-center gap-2">
                          <span id="node3-rssi" class="text-purple-400 font-bold">RSSI: -50 dBm</span>
                          <span>&bull;</span>
                          <span>Via: REL1 (!0f778ab0)</span>
                          <span>&bull;</span>
                          <span id="node3-seen" class="text-slate-400">Seen: just now</span>
                        </div>
                      </div>
                    </div>

                    <span id="node3-badge" class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span> PAIRED
                    </span>
                  </div>
                </div>

              </div>

              <!-- BOTTOM MESH METRIC STRIP -->
              <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span class="flex items-center gap-1">
                  <i class="ph ph-radio text-emerald-400"></i>
                  <span>Carrier: 433.875 MHz (EU_433)</span>
                </span>
                <span id="nodesOnlineCounter" class="text-emerald-400 font-bold">
                  3 / 3 Nodes Online
                </span>
              </div>

            </div>

            <!-- 2. REAL-TIME LORA MESH PACKET FORMATTER & AIRTIME INSPECTOR (Moved here from left) -->
            <div class="card p-4 sm:p-5 bg-slate-950 border border-slate-800 shadow-xl rounded-2xl text-white space-y-3">
              
              <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-base shrink-0">
                    <i class="ph ph-terminal-window"></i>
                  </div>
                  <div>
                    <h3 class="font-bold text-xs text-slate-100">433.875 MHz LoRa Mesh Frame Inspector</h3>
                    <p class="text-[10px] text-slate-400 font-mono">Real-time EVW|ALT packet & airtime encoder</p>
                  </div>
                </div>

                <button type="button" onclick="copyLoraPacket()"
                  class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-bold flex items-center gap-1.5 transition-colors">
                  <i class="ph ph-copy text-xs"></i>
                  <span id="copyFrameBtnText">Copy Frame</span>
                </button>
              </div>

              <!-- Live Raw Packet Display -->
              <div class="p-3 bg-slate-900 rounded-xl border border-slate-800 lora-terminal-font text-xs text-emerald-400 break-all select-all leading-relaxed shadow-inner" id="rawLoraPacketDisplay">
                EVW|ALT|0712751|BLUE|ALL|BLUE ALERT: Community Disaster Advisor|San Rafael Evacuation Center|Community disaster advisory for San Rafael. Emergency operations center is active on 433.875 MH
              </div>

              <!-- Packet Airtime & MTU Metrics Bar -->
              <div class="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-center text-xs">
                <div class="p-2 bg-slate-900/70 rounded-xl border border-slate-800">
                  <div class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Frame Size</div>
                  <div class="text-xs sm:text-sm font-black text-emerald-400 font-mono mt-0.5" id="packetBytesDisplay">188 / 140 B</div>
                </div>
                <div class="p-2 bg-slate-900/70 rounded-xl border border-slate-800">
                  <div class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Airtime (ToA)</div>
                  <div class="text-xs sm:text-sm font-black text-blue-400 font-mono mt-0.5" id="airtimeEstimateDisplay">~575 ms</div>
                </div>
                <div class="p-2 bg-slate-900/70 rounded-xl border border-slate-800">
                  <div class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Relay Hops</div>
                  <div class="text-xs sm:text-sm font-black text-amber-400 font-mono mt-0.5">3 Hops (Max TTL)</div>
                </div>
              </div>

              <!-- Visual Packet Segment Breakdown -->
              <div class="p-2.5 bg-slate-900/40 rounded-xl border border-slate-800/80 space-y-1 text-[10px] font-mono text-slate-400">
                <div class="text-slate-300 font-bold flex items-center gap-1 text-[10.5px]">
                  <i class="ph ph-info text-blue-400"></i>
                  <span>Frame Format:</span>
                </div>
                <div class="text-[9.5px] text-slate-400 leading-relaxed">
                  <span class="text-emerald-400 font-bold">EVW</span>|<span class="text-amber-400 font-bold">ALT</span>|<span class="text-blue-300 font-bold">&lt;id&gt;</span>|<span class="text-red-400 font-bold">&lt;severity&gt;</span>|<span class="text-purple-300 font-bold">&lt;zone&gt;</span>|<span class="text-white font-bold">&lt;title&gt;</span>|<span class="text-emerald-300 font-bold">&lt;shelter&gt;</span>|<span class="text-slate-300 font-bold">&lt;message&gt;</span>
                </div>
              </div>

            </div>

          </div>

        </div>

        <!-- =============================================================== -->
        <!-- 3. RECENT LORA MESH BROADCAST HISTORY LOG TABLE                  -->
        <!-- =============================================================== -->
        <div class="card p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-xs mt-3">
          <div class="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/60">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="ph ph-clock-counter-clockwise"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-900 leading-tight">433.875 MHz LoRa Mesh Emergency Alerts Log</h3>
                <p class="text-[11px] text-slate-500">Official log of emergency broadcasts dispatched over the 433.875 MHz LoRa mesh network.</p>
              </div>
            </div>
            <span class="text-[10px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs w-max">
              <%= (history || []).length %> Total Broadcasts Dispatched
            </span>
          </div>

          <div class="max-h-[320px] overflow-y-auto overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
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
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-700 border border-red-200 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span> P1 RED
                          </span>
                        <% } else if (sev === 'ORANGE') { %>
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-700 border border-orange-200 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> P2 ORANGE
                          </span>
                        <% } else if (sev === 'YELLOW') { %>
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-yellow-100 text-yellow-800 border border-yellow-200 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> P3 YELLOW
                          </span>
                        <% } else if (sev === 'GREEN') { %>
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> P5 GREEN
                          </span>
                        <% } else { %>
                          <span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
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
        <h3 class="font-extrabold text-base text-slate-900">Confirm Mandatory Red Alert</h3>
        <p class="text-xs text-slate-500">433.875 MHz LoRa Mesh Emergency Broadcast</p>
      </div>
    </div>

    <div class="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-950 space-y-1.5">
      <p class="font-bold">You are about to transmit a MANDATORY EVACUATION ORDER over the 433.875 MHz LoRa mesh network.</p>
      <p class="text-[11px] text-red-800 leading-relaxed">
        This broadcast will activate emergency sirens and multi-pulse haptic vibrations on all resident terminals in San Rafael.
      </p>
    </div>

    <div class="flex items-center justify-end gap-2.5 pt-2">
      <button type="button" onclick="closeRedModal()"
        class="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
        Cancel
      </button>
      <button type="button" onclick="confirmRedSubmit()"
        class="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-colors">
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

    const SEVERITY_CONFIG = {
      RED: {
        borderClass: 'card p-4 sm:p-5 border-t-4 border-red-600 shadow-soft bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all',
        headerIconClass: 'ph ph-siren text-red-600 text-lg'
      },
      ORANGE: {
        borderClass: 'card p-4 sm:p-5 border-t-4 border-orange-500 shadow-soft bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all',
        headerIconClass: 'ph ph-warning-circle text-orange-500 text-lg'
      },
      YELLOW: {
        borderClass: 'card p-4 sm:p-5 border-t-4 border-amber-500 shadow-soft bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all',
        headerIconClass: 'ph ph-warning text-amber-500 text-lg'
      },
      BLUE: {
        borderClass: 'card p-4 sm:p-5 border-t-4 border-blue-600 shadow-soft bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all',
        headerIconClass: 'ph ph-broadcast text-blue-600 text-lg'
      },
      GREEN: {
        borderClass: 'card p-4 sm:p-5 border-t-4 border-emerald-500 shadow-soft bg-white rounded-2xl transition-all',
        submitBtnClass: 'btn px-6 sm:px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all',
        headerIconClass: 'ph ph-check-circle text-emerald-600 text-lg'
      }
    };

    window.selectSeverity = function (level) {
      currentActiveSeverity = level;
      document.getElementById('severityInput').value = level;

      const levels = ['RED', 'ORANGE', 'YELLOW', 'BLUE', 'GREEN'];
      levels.forEach(l => {
        const btn = document.getElementById(`card-${l}`);
        if (!btn) return;
        if (l === level) {
          btn.className = `severity-btn p-2 sm:p-2.5 rounded-xl border-2 border-slate-900 bg-slate-900 text-white text-left transition-all ring-3 ring-blue-400 shadow-md focus:outline-hidden cursor-pointer`;
        } else {
          btn.className = `severity-btn p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-left transition-all hover:bg-slate-100 focus:outline-hidden cursor-pointer`;
        }
      });

      const cfg = SEVERITY_CONFIG[level] || SEVERITY_CONFIG.BLUE;
      const composeCard = document.getElementById('composeCard');
      if (composeCard) composeCard.className = cfg.borderClass;

      const submitBtn = document.getElementById('btnSubmitBroadcast');
      if (submitBtn) submitBtn.className = cfg.submitBtnClass;

      const headerIcon = document.getElementById('headerIcon');
      if (headerIcon) headerIcon.className = cfg.headerIconClass;

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
          bytesEl.className = 'text-xs sm:text-sm font-black text-rose-500 font-mono mt-0.5';
        } else if (packetBytes > 115) {
          bytesEl.className = 'text-xs sm:text-sm font-black text-amber-400 font-mono mt-0.5';
        } else {
          bytesEl.className = 'text-xs sm:text-sm font-black text-emerald-400 font-mono mt-0.5';
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
    // REAL-TIME LORA MESH NODES STATUS & TELEMETRY MONITOR
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
        if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 600);
      }
    };

    function updateMeshNodesUi(data) {
      if (!data) return;
      const nodes = data.nodes || [];
      const gw = data.gateway || {};
      let onlineCount = 0;

      // 1. Node 1: Hall Gateway (!d88b1a58)
      const n1Badge = document.getElementById('node1-badge');
      const n1Seen = document.getElementById('node1-seen');
      const gwConnected = Boolean(gw.connected);

      if (gwConnected) {
        onlineCount++;
        if (n1Badge) {
          n1Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1';
          n1Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 lora-pulse-radar"></span> ONLINE';
        }
        if (n1Seen) n1Seen.textContent = 'Seen: just now';
      } else {
        if (n1Badge) {
          n1Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1';
          n1Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400 lora-pulse-red"></span> OFFLINE';
        }
        if (n1Seen) n1Seen.textContent = 'Disconnected';
      }

      // 2. Node 2: Zone 1 Relay (!0f778ab0)
      const relNode = nodes.find(n => n.nodeId === '!0f778ab0' || (n.shortName && n.shortName.includes('REL')));
      const n2Badge = document.getElementById('node2-badge');
      const n2Seen = document.getElementById('node2-seen');
      const n2Snr = document.getElementById('node2-snr');

      if (relNode && relNode.online !== false) {
        onlineCount++;
        if (n2Badge) {
          n2Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1';
          n2Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> REPEATING';
        }
        if (n2Seen) n2Seen.textContent = 'Seen: ' + (relNode.lastSeen ? formatTimeAgo(relNode.lastSeen) : 'just now');
        if (n2Snr && relNode.snr) n2Snr.textContent = `SNR: +${relNode.snr} dB`;
      } else {
        if (n2Badge) {
          n2Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1';
          n2Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400 lora-pulse-red"></span> OFFLINE';
        }
        if (n2Seen) n2Seen.textContent = 'Last heard: ' + (relNode && relNode.lastSeen ? formatTimeAgo(relNode.lastSeen) : 'offline');
      }

      // 3. Node 3: Resident Node (!f4e213d4)
      const resNode = nodes.find(n => n.nodeId === '!f4e213d4' || (n.shortName && n.shortName.includes('RES')));
      const n3Badge = document.getElementById('node3-badge');
      const n3Seen = document.getElementById('node3-seen');
      const n3Rssi = document.getElementById('node3-rssi');

      if (resNode && resNode.online !== false) {
        onlineCount++;
        if (n3Badge) {
          n3Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0 flex items-center gap-1';
          n3Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span> PAIRED';
        }
        if (n3Seen) n3Seen.textContent = 'Seen: ' + (resNode.lastSeen ? formatTimeAgo(resNode.lastSeen) : 'just now');
        if (n3Rssi && resNode.rssi) n3Rssi.textContent = `RSSI: ${resNode.rssi} dBm`;
      } else {
        if (n3Badge) {
          n3Badge.className = 'px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 flex items-center gap-1';
          n3Badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400 lora-pulse-red"></span> OFFLINE';
        }
        if (n3Seen) n3Seen.textContent = 'Last heard: ' + (resNode && resNode.lastSeen ? formatTimeAgo(resNode.lastSeen) : 'unpaired');
      }

      // Global Mesh Health Pill
      const healthPill = document.getElementById('globalMeshHealthPill');
      const countEl = document.getElementById('nodesOnlineCounter');
      if (countEl) countEl.textContent = `${onlineCount} / 3 Nodes Online`;

      if (healthPill) {
        if (onlineCount >= 3) {
          healthPill.className = 'px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1';
          healthPill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> MESH ACTIVE';
        } else if (onlineCount > 0) {
          healthPill.className = 'px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1';
          healthPill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> PARTIAL MESH';
        } else {
          healthPill.className = 'px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1';
          healthPill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-400 lora-pulse-red"></span> MESH DOWN';
        }
      }
    }

    function formatTimeAgo(isoString) {
      if (!isoString) return 'never';
      const sec = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 1000));
      if (sec < 5) return 'just now';
      if (sec < 60) return `${sec}s ago`;
      const min = Math.floor(sec / 60);
      return `${min}m ago`;
    }

    // Connect to Socket.IO for real-time node telemetry push
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

    // Auto-poll node telemetry every 3.5 seconds
    setInterval(window.refreshNodeStatus, 3500);

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
