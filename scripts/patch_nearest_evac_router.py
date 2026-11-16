import os

evac_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/resident/evacuation.ejs'
with open(evac_path, 'r', encoding='utf-8') as f:
    c = f.read()

target = '''        const distEl = document.getElementById(`distance-${center.id}`);
        if (distEl) distEl.innerText = d.toFixed(1) + ' km';
      });
    }
    window.updateLiveDistancesToCenters = updateLiveDistancesToCenters;'''

replacement = '''        const distEl = document.getElementById(`distance-${center.id}`);
        if (distEl) distEl.innerText = d.toFixed(1) + ' km';

        if (d < minDistance) {
          minDistance = d;
          nearestCenter = { ...center, distanceKm: d };
        }
      });

      // Nearest shelter router suggestion banner (Router management based on resident location)
      if (nearestCenter) {
        window._nearestEvacCenter = nearestCenter;
        let routeBanner = document.getElementById('nearestEvacRouteBanner');
        if (!routeBanner) {
          routeBanner = document.createElement('div');
          routeBanner.id = 'nearestEvacRouteBanner';
          routeBanner.style.cssText = 'position: fixed; top: 70px; left: 16px; right: 16px; z-index: 999; max-width: 440px; margin: 0 auto; background: #0f172a; color: #ffffff; border: 2px solid #10b981; border-radius: 14px; padding: 10px 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer;';
          document.body.appendChild(routeBanner);
        }
        routeBanner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); color: #34d399; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
              <i class="ph ph-navigation-arrow"></i>
            </div>
            <div style="min-width: 0;">
              <div style="font-size: 10px; text-transform: uppercase; font-weight: 800; color: #34d399;">Nearest Evacuation Center (${nearestCenter.distanceKm.toFixed(1)} km)</div>
              <div style="font-size: 12.5px; font-weight: 900; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nearestCenter.name || 'San Rafael Evacuation Center'}</div>
            </div>
          </div>
          <button type="button" style="padding: 6px 12px; border-radius: 8px; background: #10b981; color: #022c22; font-weight: 900; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer; flex-shrink: 0;">
            Navigate
          </button>
        `;
        routeBanner.onclick = () => {
          if (typeof flyToCenter === 'function') {
            flyToCenter(parseFloat(nearestCenter.longitude), parseFloat(nearestCenter.latitude), nearestCenter.id);
          }
        };

        // If URL has auto_route=nearest, immediately fly to nearest center on first fix
        if (!window._hasAutoRoutedNearest && new URLSearchParams(window.location.search).get('auto_route') === 'nearest') {
          window._hasAutoRoutedNearest = true;
          if (typeof flyToCenter === 'function') {
            setTimeout(() => {
              flyToCenter(parseFloat(nearestCenter.longitude), parseFloat(nearestCenter.latitude), nearestCenter.id);
            }, 800);
          }
        }
      }
    }
    window.updateLiveDistancesToCenters = updateLiveDistancesToCenters;'''

# Target start of function to add nearestCenter variable
target_fn_start = '''    function updateLiveDistancesToCenters(userLat, userLng) {
      if (typeof userLat !== 'number' || typeof userLng !== 'number') return;'''

replacement_fn_start = '''    function updateLiveDistancesToCenters(userLat, userLng) {
      if (typeof userLat !== 'number' || typeof userLng !== 'number') return;
      let nearestCenter = null;
      let minDistance = Infinity;'''

if target_fn_start in c:
    c = c.replace(target_fn_start, replacement_fn_start, 1)
if target in c:
    c = c.replace(target, replacement, 1)
    with open(evac_path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Patched nearest evacuation router in evacuation.ejs successfully!")
else:
    print("Failed to find target in evacuation.ejs")
