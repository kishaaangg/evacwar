import os

content = r'''<%#
  EvakWar (E-BAKWAR) - Multi-Channel Emergency Broadcast & Disaster Alert Console
  Synchronous dispatch across Internet / Wi-Fi LAN and 433.875 MHz LoRa Mesh Network.
%>

<style>
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

        <!-- 1. TOP EXECUTIVE HEADER BANNER -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            <!-- Left: Title & Scope -->
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center font-black text-xl shrink-0">
                  <i class="ph ph-broadcast"></i>
                </div>
                <h1 class="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Emergency Alert Broadcast Center
                </h1>
                <% if (isBarangayCouncil) { %>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                    <i class="ph ph-buildings text-xs"></i> Barangay <%= userBarangay %> Council
                  </span>
                <% } else { %>
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-400/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
                    <i class="ph ph-shield-check text-xs"></i> MDRRMO Operations Center
                  </span>
                <% } %>
              </div>
              <p class="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Dispatches critical disaster warnings synchronously across <strong>Internet / Wi-Fi</strong> and autonomous <strong>433.875 MHz LoRa Mesh</strong>.
              </p>
            </div>

            <!-- Right: Real-Time Dual Channel Status Badges -->
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <div class="px-3 py-1.5 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center gap-2 text-xs shadow-inner">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-slate-300 font-bold">Cloud & Wi-Fi:</span>
                <span class="text-emerald-400 font-bold uppercase">Online</span>
              </div>
              <div class="px-3 py-1.5 bg-slate-800/90 rounded-xl border border-slate-700/80 flex items-center gap-2 text-xs shadow-inner">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-slate-300 font-bold">LoRa Mesh:</span>
                <span class="text-emerald-400 font-bold uppercase" id="headerMeshStatusText">433.875 MHz Active</span>
              </div>
            </div>

          </div>
        </div>

        <!-- SUCCESS ALERT BANNER -->
        <% if (locals.successMsg) { %>
          <div class="p-3.5 bg-emerald-50 border-l-4 border-emerald-500 rounded-xl flex items-center justify-between shadow-xs animate-fade-in">
            <div class="flex items-center gap-2.5 text-emerald-950">
              <i class="ph ph-check-circle text-xl text-emerald-600 shrink-0"></i>
              <div>
                <h4 class="font-bold text-xs text-emerald-900">Emergency Broadcast Dispatched</h4>
                <p class="text-[11px] text-emerald-800 font-medium"><%= successMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-emerald-600 hover:text-emerald-800 text-base p-1 cursor-pointer" title="Dismiss">
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
                <h4 class="font-bold text-xs text-amber-900">Broadcast Notice</h4>
                <p class="text-[11px] text-amber-800 font-medium"><%= warningMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-amber-600 hover:text-amber-800 text-base p-1 cursor-pointer" title="Dismiss">
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
                <h4 class="font-bold text-xs text-rose-900">Transmission Alert</h4>
                <p class="text-[11px] text-rose-800 font-medium"><%= errorMsg %></p>
              </div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-rose-600 hover:text-rose-800 text-base p-1 cursor-pointer" title="Dismiss">
              <i class="ph ph-x"></i>
            </button>
          </div>
        <% } %>

        <!-- MAIN 2-COLUMN GRID -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">

          <!-- =============================================================== -->
          <!-- LEFT COLUMN: EMERGENCY ALERT COMPOSER (Cols 1-7)                -->
          <!-- =============================================================== -->
          <div class="lg:col-span-7 space-y-4">

            <!-- 1. BROADCAST COMPOSER CARD -->
            <div class="card p-4 sm:p-5 border-t-4 border-blue-600 shadow-sm bg-white rounded-2xl transition-all" id="composeCard">
              
              <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg shrink-0">
                    <i class="ph ph-megaphone-simple" id="headerIcon"></i>
                  </div>
                  <div>
                    <h2 class="text-sm sm:text-base font-black text-slate-900 leading-tight">
                      Compose Emergency Alert
                    </h2>
                    <p class="text-xs text-slate-500 font-medium">Dispatches simultaneously via Internet & 433.875 MHz LoRa Mesh</p>
                  </div>
                </div>

                <span class="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 font-mono">
                  <i class="ph ph-broadcast"></i> Dual-Redundant
                </span>
              </div>

              <form id="broadcastForm" action="<%= isBarangayCouncil ? '/staff/broadcast' : '/admin/broadcast' %>" method="POST" class="space-y-4">
                <input type="hidden" name="_csrf" value="<%= locals.csrfToken || '' %>">
                <div id="hiddenSelectedIdsContainer"></div>
                <input type="hidden" name="severity" id="severityInput" value="BLUE">
                <input type="hidden" name="target_audience" id="targetAudienceSelect" value="all">
                <input type="hidden" name="barangay" id="barangaySelect" value="all">
                <input type="hidden" name="evacCenter" id="evacCenterSelect" value="Nearest Safe Evacuation Center">

                <!-- STEP 1: EMERGENCY SEVERITY LEVEL SELECTOR -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      1. Emergency Severity Level *
                    </label>
                    <span class="text-[11px] text-slate-500 font-semibold">(Auto-loads standard disaster template)</span>
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

                    <!-- BLUE (P4 - Default) -->
                    <button type="button" id="card-BLUE" onclick="selectSeverity('BLUE')"
                      class="severity-btn p-2.5 rounded-xl border-2 border-blue-700 bg-blue-600 text-white text-left cursor-pointer shadow-lg ring-4 ring-blue-200 scale-102">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="sev-badge text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white text-blue-700 shadow-xs">P4</span>
                        <span class="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-xs"></span>
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

                <!-- STEP 2: QUICK PRESET TEMPLATES -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      2. Quick Preset Disaster Templates
                    </label>
                    <button type="button" onclick="clearForm()" class="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer">
                      <i class="ph ph-arrow-counter-clockwise"></i> Reset Content
                    </button>
                  </div>
                  <div class="relative">
                    <select id="presetTemplateSelect" onchange="onTemplateChange(this.value)"
                      class="w-full p-2.5 bg-amber-50/70 border-2 border-amber-300 text-amber-950 rounded-xl text-xs font-bold focus:bg-white focus:border-blue-600 transition-colors cursor-pointer shadow-xs">
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

                <!-- STEP 3: ALERT HEADLINE & INSTRUCTIONS -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="block text-xs font-black uppercase tracking-wider text-slate-800">
                      3. Alert Headline & Tactical Instructions *
                    </label>
                    <span class="text-[11px] font-mono text-slate-500 font-bold" id="liveTimestampIndicator">
                      ⏰ Live Broadcast Time Included
                    </span>
                  </div>

                  <input type="text" id="alertTitleInput" name="title" oninput="updateLiveMetrics()"
                    placeholder="Alert Headline (e.g., RED ALERT: Mandatory Evacuation Order)"
                    class="form-control w-full mb-2.5 font-black text-xs sm:text-sm p-3 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 shadow-xs text-slate-900">

                  <textarea id="messageBox" name="message" required oninput="updateLiveMetrics()"
                    class="form-control w-full min-h-[115px] resize-y font-sans text-xs sm:text-sm p-3 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 leading-relaxed shadow-xs text-slate-900"
                    placeholder="Type urgent instructions for residents... (e.g. Move immediately to high ground or your nearest designated evacuation facility.)"></textarea>
                </div>

                <!-- ACTION BUTTONS -->
                <div class="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                  <button type="button" onclick="clearForm()"
                    class="btn border-2 border-slate-300 text-slate-700 hover:bg-slate-100 font-extrabold rounded-xl text-xs py-2.5 px-4 transition-colors cursor-pointer">
                    <i class="ph ph-trash"></i> Clear
                  </button>

                  <button type="submit" id="btnSubmitBroadcast"
                    class="btn px-6 sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer">
                    <i class="ph ph-broadcast text-base"></i> Dispatch Emergency Broadcast
                  </button>
                </div>

              </form>
            </div>

            <!-- 2. TARGETED HOUSEHOLDS ROSTER -->
            <div class="card p-4 bg-white border border-slate-200/90 rounded-2xl shadow-sm space-y-2.5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i class="ph ph-users-four text-blue-600 text-base font-black"></i>
                  <h3 class="text-xs font-black text-slate-900 uppercase tracking-wider">Household Delivery Roster</h3>
                </div>
                <span class="text-[11px] font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                  <%= (initialMetrics && initialMetrics.residents) ? initialMetrics.residents.length : 0 %> Households Reachable
                </span>
              </div>

              <!-- Compact Table Container -->
              <div class="max-h-52 overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-inner">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-100 text-slate-800 font-black sticky top-0 border-b border-slate-200 text-[10px] uppercase">
                    <tr>
                      <th class="py-2 px-3">Household / Resident</th>
                      <th class="py-2 px-3">Zone / Location</th>
                      <th class="py-2 px-3">Assigned Channel</th>
                      <th class="py-2 px-3 text-right">Delivery Route</th>
                    </tr>
                  </thead>
                  <tbody id="recipientPreviewTableBody" class="divide-y divide-slate-100 font-medium">
                    
                    <!-- PINNED TOP ROW: SINFUEGO LAURENCE RESIDENT -->
                    <tr class="bg-purple-50/50 hover:bg-purple-50/80 transition-colors text-[11px] font-semibold">
                      <td class="py-2 px-3 font-black text-slate-900 flex items-center gap-1.5">
                        <i class="ph ph-user-circle text-purple-600 text-sm"></i>
                        <span>Sinfuego Laurence Resident</span>
                      </td>
                      <td class="py-2 px-3 text-slate-600">San Rafael (Zone 1)</td>
                      <td class="py-2 px-3">
                        <span class="font-mono text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200 inline-flex items-center gap-1">
                          <i class="ph ph-device-mobile"></i> Node 3: RES1 (!f4e213d4)
                        </span>
                      </td>
                      <td class="py-2 px-3 text-right font-mono text-[10px]">
                        <span class="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-black rounded-full border border-emerald-200 inline-flex items-center gap-1">
                          <i class="ph ph-broadcast"></i> Internet + LoRa Mesh
                        </span>
                      </td>
                    </tr>

                    <!-- OTHER REGISTERED HOUSEHOLDS -->
                    <% if (initialMetrics && initialMetrics.residents && initialMetrics.residents.length > 0) { %>
                      <% initialMetrics.residents.forEach(r => { %>
                        <% const isLaurence = (r.name && (r.name.toLowerCase().includes('laurence') || r.name.toLowerCase().includes('sinfuego'))); %>
                        <% if (!isLaurence) { %>
                          <tr class="hover:bg-slate-50 transition-colors text-[11px]">
                            <td class="py-2 px-3 font-bold text-slate-900"><%= r.name %></td>
                            <td class="py-2 px-3 text-slate-600"><%= r.zone || r.barangay || 'San Rafael' %></td>
                            <td class="py-2 px-3">
                              <span class="text-slate-500 text-[10px]">Standard Terminal</span>
                            </td>
                            <td class="py-2 px-3 text-right font-mono text-[10px]">
                              <span class="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-full border border-slate-200 inline-flex items-center gap-1">
                                <i class="ph ph-check"></i> Dual Redundant
                              </span>
                            </td>
                          </tr>
                        <% } %>
                      <% }) %>
                    <% } %>
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- =============================================================== -->
          <!-- RIGHT COLUMN: LORA MESH HARDWARE NODES & TELEMETRY (Cols 8-12)  -->
          <!-- =============================================================== -->
          <div class="lg:col-span-5 space-y-4">

            <!-- 1. LIVE HARDWARE NODES STATUS (PLACED IN RIGHT COLUMN) -->
            <div class="card p-4 sm:p-5 bg-white border border-slate-200/90 shadow-sm rounded-2xl space-y-3.5">
              
              <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2.5">
                  <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg shrink-0">
                    <i class="ph ph-tree-structure"></i>
                  </div>
                  <div>
                    <h3 class="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                      LoRa Mesh Infrastructure & Nodes
                    </h3>
                    <p class="text-xs text-slate-500 font-medium">Real-time hardware connectivity & mesh relay health</p>
                  </div>
                </div>

                <button type="button" onclick="refreshNodeStatus()" title="Refresh telemetry"
                  class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs transition-colors cursor-pointer">
                  <i class="ph ph-arrows-clockwise text-sm" id="refreshNodeIcon"></i>
                </button>
              </div>

              <!-- INFRASTRUCTURE NODES STACK -->
              <div class="space-y-3" id="meshNodesStack">
                
                <!-- NODE 1: HALL GATEWAY (!d88b1a58) -->
                <div class="p-3.5 rounded-2xl border transition-all" id="nodeCard-d88b1a58">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5" id="node1-iconBox">
                        <i class="ph ph-hard-drives"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 1: Hall Gateway
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-700" id="node1-idBadge">!d88b1a58</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5" id="node1-desc">
                          COM3 Serial Bridge &bull; TxPower: 10 dBm
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>Role: Root Gateway</span>
                          <span>&bull;</span>
                          <span id="node1-seen" class="font-bold text-slate-700">Online</span>
                        </div>
                      </div>
                    </div>

                    <span id="node1-badge" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 lora-pulse-radar"></span> ONLINE
                    </span>
                  </div>

                  <!-- Offline Alert Prompt (Hidden when connected) -->
                  <div id="node1-offlinePrompt" class="hidden mt-2.5 px-3 py-2 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2 shadow-2xs">
                    <i class="ph ph-plugs text-base text-rose-600 shrink-0"></i>
                    <span>Connect Gateway via USB to laptop (COM3) to transmit off-grid LoRa alerts</span>
                  </div>
                </div>

                <!-- NODE 2: ZONE 1 RELAY (!0f778ab0) -->
                <div class="p-3.5 rounded-2xl border transition-all" id="nodeCard-0f778ab0">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5" id="node2-iconBox">
                        <i class="ph ph-broadcast"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 2: Zone 1 Relay
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-50 text-slate-700" id="node2-idBadge">!0f778ab0</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5" id="node2-desc">
                          Elevated Repeater &bull; 3-Hop Relay
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span id="node2-snr" class="font-bold text-emerald-700">SNR: +10.8 dB</span>
                          <span>&bull;</span>
                          <span id="node2-seen" class="font-bold text-slate-700">Repeating</span>
                        </div>
                      </div>
                    </div>

                    <span id="node2-badge" class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> REPEATING
                    </span>
                  </div>

                  <!-- Standby Prompt (Hidden when repeating) -->
                  <div id="node2-offlinePrompt" class="hidden mt-2.5 px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs font-bold flex items-center gap-2 shadow-2xs">
                    <i class="ph ph-warning text-base text-amber-600 shrink-0"></i>
                    <span>Repeater standby: Awaiting Hall Gateway link</span>
                  </div>
                </div>

                <!-- NODE 3: RESIDENT NETWORK LINK (!f4e213d4) -->
                <div class="p-3.5 rounded-2xl border transition-all">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-3">
                      <div class="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center font-bold text-lg shrink-0 mt-0.5">
                        <i class="ph ph-device-mobile"></i>
                      </div>
                      <div>
                        <div class="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                          Node 3: Resident Link
                          <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border bg-purple-50 text-purple-800">!f4e213d4</span>
                        </div>
                        <div class="text-xs text-slate-700 font-semibold mt-0.5">
                          BLE GATT Mobile Bridge &bull; San Rafael
                        </div>
                        <div class="text-[10px] font-mono text-slate-500 mt-1">
                          <span id="household-res1-badge" class="font-bold text-purple-700">Reachable (82 Households)</span>
                        </div>
                      </div>
                    </div>

                    <span class="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs bg-purple-100 text-purple-800 border border-purple-300">
                      <span class="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span> REACHABLE
                    </span>
                  </div>
                </div>

              </div>

              <!-- MESH METRIC STRIP -->
              <div class="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono font-bold text-slate-700">
                <span class="flex items-center gap-1.5">
                  <i class="ph ph-radio text-emerald-600 font-black"></i>
                  <span>Carrier: 433.875 MHz (EU_433)</span>
                </span>
                <span id="nodesOnlineCounter" class="text-emerald-700 font-black">
                  2 / 2 Nodes Online
                </span>
              </div>

            </div>

            <!-- 2. MULTI-CHANNEL DISPATCH SPECS CARD -->
            <div class="card p-4 sm:p-5 bg-white border border-slate-200/90 shadow-sm rounded-2xl space-y-3">
              <div class="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div class="flex items-center gap-2">
                  <i class="ph ph-flow-arrow text-emerald-600 text-base"></i>
                  <h3 class="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider">
                    Dispatch Channel Telemetry
                  </h3>
                </div>
                <span class="text-[10px] font-mono font-bold text-slate-500">EU_433 LONG_FAST</span>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div class="text-[10px] text-slate-500 font-bold uppercase">Cloud Latency</div>
                  <div class="font-black text-blue-700 text-xs mt-0.5">Instant (&lt; 50ms)</div>
                </div>
                <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div class="text-[10px] text-slate-500 font-bold uppercase">LoRa RF Airtime</div>
                  <div class="font-black text-emerald-700 text-xs mt-0.5" id="airtimeEstimateDisplay">~520 ms</div>
                </div>
              </div>

              <div class="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div class="flex items-center justify-between">
                  <span>RF Mesh Route:</span>
                  <span class="font-bold text-slate-900 font-mono">Gateway &rarr; Rel1 &rarr; Res1</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Mesh Hop Limit:</span>
                  <span class="font-bold text-blue-600 font-mono">3 Hops (Max Coverage)</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- =============================================================== -->
        <!-- 3. RECENT EMERGENCY BROADCASTS LOG TABLE                        -->
        <!-- =============================================================== -->
        <div class="card p-0 overflow-hidden bg-white border border-slate-200/90 rounded-2xl shadow-sm mt-3">
          <div class="p-3.5 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                <i class="ph ph-clock-counter-clockwise"></i>
              </div>
              <div>
                <h3 class="text-sm font-black text-slate-900 leading-tight">Emergency Alerts Dispatch Log</h3>
                <p class="text-xs text-slate-500 font-medium">Record of broadcasts dispatched across Internet and 433.875 MHz LoRa mesh.</p>
              </div>
            </div>
            <span class="text-xs font-black text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs w-max">
              <%= (history || []).length %> Total Dispatches
            </span>
          </div>

          <div class="max-h-[300px] overflow-y-auto overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="sticky top-0 z-10 bg-slate-100 text-slate-800 font-black uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <tr>
                  <th class="py-2.5 px-3">Date & Time</th>
                  <th class="py-2.5 px-3">Severity</th>
                  <th class="py-2.5 px-3">Headline & Tactical Message</th>
                  <th class="py-2.5 px-3">Scope</th>
                  <th class="py-2.5 px-3">Channels</th>
                  <th class="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                <% if (!history || history.length === 0) { %>
                  <tr>
                    <td colspan="6" class="py-6 text-center text-slate-400 font-medium">
                      <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-lg mb-1">
                        <i class="ph ph-broadcast"></i>
                      </div>
                      <div class="text-xs font-bold text-slate-600">No emergency broadcasts recorded yet.</div>
                      <div class="text-[10px] text-slate-400 mt-0.5">Dispatched alerts will appear here.</div>
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
                      <td class="py-2 px-3 max-w-[320px] font-medium text-slate-900 text-[11px]" title="<%= item.message %>">
                        <div class="font-bold text-slate-900 truncate"><%= item.title || 'Emergency Warning' %></div>
                        <div class="text-slate-500 truncate text-[10px]"><%= item.message %></div>
                      </td>
                      <td class="py-2 px-3 font-medium text-slate-600 whitespace-nowrap text-[11px]">
                        <%= item.target_audience %> <%= item.barangay ? '(' + item.barangay + ')' : '(All Zones)' %>
                      </td>
                      <td class="py-2 px-3 whitespace-nowrap text-[10px] font-medium text-slate-600">
                        <span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-bold text-slate-800">
                          Internet + LoRa Mesh
                        </span>
                      </td>
                      <td class="py-2 px-3 whitespace-nowrap text-right">
                        <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1 border border-emerald-200">
                          <i class="ph ph-check-circle"></i> DISPATCHED
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
        <p class="text-xs text-slate-500">Multi-Channel Emergency Evacuation Order</p>
      </div>
    </div>

    <div class="p-3.5 bg-red-50 rounded-xl border-2 border-red-200 text-xs text-red-950 space-y-1.5">
      <p class="font-black text-red-900">You are about to transmit a MANDATORY EVACUATION ORDER.</p>
      <p class="text-[11px] text-red-800 leading-relaxed font-medium">
        This broadcast will trigger full-volume sirens and multi-pulse haptics on all resident terminals via Internet and 433.875 MHz LoRa mesh.
      </p>
    </div>

    <div class="flex items-center justify-end gap-2.5 pt-2">
      <button type="button" onclick="closeRedModal()"
        class="px-4 py-2 border-2 border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
        Cancel
      </button>
      <button type="button" onclick="confirmRedSubmit()"
        class="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-colors cursor-pointer">
        <i class="ph ph-broadcast"></i> Confirm & Dispatch Now
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
    const isBarangayCouncil = serverData && serverData.getAttribute('data-is-council') === 'true';
    const userBarangay = (serverData && serverData.getAttribute('data-user-barangay')) || 'San Rafael';

    let currentActiveSeverity = 'BLUE';

    // -------------------------------------------------------------------------
    // PRESET DISASTER TEMPLATES
    // -------------------------------------------------------------------------
    const LORA_TEMPLATES = {
      red_evac: {
        severity: 'RED',
        title: 'MANDATORY EVACUATION: Critical Danger',
        message: 'Critical danger in {BARANGAY}. Proceed immediately to your nearest safe evacuation facility via safe high-ground route.'
      },
      orange_prep: {
        severity: 'ORANGE',
        title: 'PRE-EVACUATION: Prepare Go-Bags',
        message: 'Severe hazard approaching {BARANGAY}. Prepare 72hr go-bags, assist vulnerable family members, and stand by.'
      },
      yellow_watch: {
        severity: 'YELLOW',
        title: 'FLOOD WATCH: Heavy Rainfall Warning',
        message: 'Heavy continuous rain in {BARANGAY}. Monitor local water levels and secure outdoor belongings.'
      },
      blue_advisory: {
        severity: 'BLUE',
        title: 'COMMUNITY ADVISORY: Disaster Preparedness',
        message: 'Community disaster advisory for {BARANGAY}. Emergency operations center is active on high-speed cloud and 433.875 MHz mesh.'
      },
      green_clear: {
        severity: 'GREEN',
        title: 'ALL CLEAR: Hazard Receded Safely',
        message: 'Floodwaters receded in {BARANGAY}. Safe to return. Report downed wires or hazards.'
      },
      relief: {
        severity: 'BLUE',
        title: 'RELIEF DISTRIBUTION: Food & Aid Ready',
        message: 'Relief distribution active at designated evacuation facilities. Bring family QR code and ID.'
      },
      center_cap: {
        severity: 'ORANGE',
        title: 'SHELTER NOTICE: Secondary Facilities Open',
        message: 'Primary shelters near capacity. Proceed to secondary evacuation facilities.'
      }
    };

    // -------------------------------------------------------------------------
    // SEVERITY BUTTON THEMES
    // -------------------------------------------------------------------------
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

      // Auto-load matching preset template
      const templateKeyMap = { RED: 'red_evac', ORANGE: 'orange_prep', YELLOW: 'yellow_watch', BLUE: 'blue_advisory', GREEN: 'green_clear' };
      applyTemplate(templateKeyMap[level] || 'blue_advisory');
    };

    window.applyTemplate = function (key) {
      if (!LORA_TEMPLATES[key]) return;
      const tpl = LORA_TEMPLATES[key];

      const brgyVal = userBarangay || 'San Rafael';
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      let title = tpl.title.replace('{BARANGAY}', brgyVal).replace('{TIME}', timeStr);
      let msg = tpl.message.replace('{BARANGAY}', brgyVal).replace('{TIME}', timeStr);

      document.getElementById('alertTitleInput').value = title;
      document.getElementById('messageBox').value = msg;

      updateLiveMetrics();
    };

    window.onTemplateChange = function (val) {
      if (val) window.applyTemplate(val);
    };

    window.updateLiveMetrics = function () {
      const title = (document.getElementById('alertTitleInput').value || '').trim();
      const msg = (document.getElementById('messageBox').value || '').trim();

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const tsEl = document.getElementById('liveTimestampIndicator');
      if (tsEl) {
        tsEl.textContent = `⏰ ${timeStr} • Internet & LoRa Mesh Synchronized`;
      }

      // Airtime Estimate
      const totalChars = title.length + msg.length;
      const estToaMs = Math.min(950, Math.round(180 + totalChars * 2.1));
      const toaEl = document.getElementById('airtimeEstimateDisplay');
      if (toaEl) toaEl.textContent = `~${estToaMs} ms`;
    };

    window.clearForm = function () {
      document.getElementById('alertTitleInput').value = '';
      document.getElementById('messageBox').value = '';
      updateLiveMetrics();
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
        submitBtn.innerHTML = '<i class="ph ph-circle-notch animate-spin text-base"></i> Dispatching Broadcast...';
      }
    });

    // =========================================================================
    // REAL-TIME HARDWARE NODES TELEMETRY & DISCONNECTION ALERTS MONITOR
    // (Correctly parsing /api/lora/status)
    // =========================================================================
    let lastUiState = {
      gwConnected: null,
      relayOnline: null,
      resPaired: null
    };

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
        console.warn('Node status refresh note:', err);
      } finally {
        if (icon) setTimeout(() => icon.classList.remove('animate-spin'), 600);
      }
    };

    function updateMeshNodesUi(data) {
      const nodes = data.nodes || [];
      const gwNode = nodes.find(n => n.nodeNum === 1 || (n.nodeId && n.nodeId.includes('d88b1a58')) || (n.id && n.id.includes('d88b1a58'))) || {};
      const relayNode = nodes.find(n => n.nodeNum === 2 || (n.nodeId && n.nodeId.includes('0f778ab0')) || (n.id && n.id.includes('0f778ab0'))) || {};
      const resNode = nodes.find(n => n.nodeNum === 3 || (n.nodeId && n.nodeId.includes('f4e213d4')) || (n.id && n.id.includes('f4e213d4'))) || {};

      // Fixed: /api/lora/status provides data.gateway.connected & node.online booleans!
      const gwConnected = Boolean((data.gateway && data.gateway.connected) || gwNode.online);
      const relayOnline = Boolean(relayNode.online);
      const resPaired = Boolean(resNode.paired || resNode.online);

      // 1. NODE 1: HALL GATEWAY
      if (lastUiState.gwConnected !== gwConnected) {
        lastUiState.gwConnected = gwConnected;
        const n1Badge = document.getElementById('node1-badge');
        const n1Seen = document.getElementById('node1-seen');
        const n1Prompt = document.getElementById('node1-offlinePrompt');

        if (gwConnected) {
          if (n1Badge) {
            n1Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs';
            n1Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-600 lora-pulse-radar"></span> ONLINE';
          }
          if (n1Seen) n1Seen.textContent = 'Online (COM3 Connected)';
          if (n1Prompt) n1Prompt.classList.add('hidden');
        } else {
          if (n1Badge) {
            n1Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-500 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
            n1Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span> OFFLINE';
          }
          if (n1Seen) n1Seen.textContent = 'Disconnected (COM3)';
          if (n1Prompt) n1Prompt.classList.remove('hidden');
        }
      }

      // 2. NODE 2: ZONE 1 RELAY
      if (lastUiState.relayOnline !== relayOnline) {
        lastUiState.relayOnline = relayOnline;
        const n2Badge = document.getElementById('node2-badge');
        const n2Snr = document.getElementById('node2-snr');
        const n2Seen = document.getElementById('node2-seen');
        const n2Prompt = document.getElementById('node2-offlinePrompt');

        if (relayOnline) {
          if (n2Badge) {
            n2Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs';
            n2Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span> REPEATING';
          }
          const snrVal = relayNode.snr ? (relayNode.snr > 0 ? '+' + relayNode.snr : relayNode.snr) : '+10.8';
          if (n2Snr) n2Snr.textContent = `SNR: ${snrVal} dB`;
          if (n2Seen) n2Seen.textContent = 'Repeating';
          if (n2Prompt) n2Prompt.classList.add('hidden');
        } else {
          if (n2Badge) {
            n2Badge.className = 'px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white shrink-0 flex items-center gap-1.5 shadow-xs';
            n2Badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span> STANDBY';
          }
          if (n2Seen) n2Seen.textContent = 'Waiting for Gateway';
          if (n2Prompt) n2Prompt.classList.remove('hidden');
        }
      }

      // 3. HOUSEHOLD ROSTER: LAURENCE RESIDENT
      if (lastUiState.resPaired !== resPaired) {
        lastUiState.resPaired = resPaired;
        const resBadge = document.getElementById('household-res1-badge');
        if (resBadge) {
          if (resPaired) {
            resBadge.textContent = 'Reachable (BLE Node 3 Active)';
          } else {
            resBadge.textContent = 'Reachable (Standard)';
          }
        }
      }

      // 4. COUNTERS & HEADER PILL
      const countEl = document.getElementById('nodesOnlineCounter');
      if (countEl) {
        const count = (gwConnected ? 1 : 0) + (relayOnline ? 1 : 0);
        countEl.textContent = `${count} / 2 Nodes Online`;
      }
      const headerMeshStatusText = document.getElementById('headerMeshStatusText');
      if (headerMeshStatusText) {
        const count = (gwConnected ? 1 : 0) + (relayOnline ? 1 : 0);
        headerMeshStatusText.textContent = `${count} Nodes Active`;
      }
    }

    // Connect to Socket.IO for instant real-time telemetry push
    if (typeof io !== 'undefined') {
      try {
        const socket = io();
        socket.on('lora:nodes_updated', () => { window.refreshNodeStatus(); });
        socket.on('lora:status', () => { window.refreshNodeStatus(); });
      } catch (_) {}
    }

    setInterval(window.refreshNodeStatus, 3500);

    window.addEventListener('DOMContentLoaded', () => {
      window.selectSeverity('BLUE');
      window.updateLiveMetrics();
      window.refreshNodeStatus();
    });

  })();
</script>
'''

target_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/admin/broadcast.ejs'
with open(target_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated views/admin/broadcast.ejs cleanly!")
