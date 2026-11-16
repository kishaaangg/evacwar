(function () {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("sidebarToggle");
  const closeBtn = document.getElementById("sidebarClose");

  function openSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add("open");
    overlay.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function closeSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove("open");
    overlay.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }

  toggle && toggle.addEventListener("click", openSidebar);
  closeBtn && closeBtn.addEventListener("click", closeSidebar);
  overlay && overlay.addEventListener("click", closeSidebar);

  // Light UI-only actions (toasts)
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  let toastTimer = null;
  window.EvacWarToast = function (message) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  };

  document.querySelectorAll("[data-ui-click]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const msg = el.getAttribute("data-ui-click") || "UI-only action.";
      window.EvacWarToast(msg);
    });
  });

  // Global CSRF helper for same-origin fetch and AJAX operations
  window.getCsrfToken = function () {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  // Intercept fetch to automatically include X-CSRF-Token header on same-origin mutating requests
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function (resource, options = {}) {
      const opts = Object.assign({}, options);
      const method = (opts.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const urlStr = (typeof resource === 'string') ? resource : (resource && resource.url ? resource.url : '');
        const isSameOrigin = !urlStr || urlStr.startsWith('/') || urlStr.startsWith(window.location.origin);
        if (isSameOrigin) {
          const token = window.getCsrfToken();
          if (token) {
            if (opts.headers instanceof Headers) {
              if (!opts.headers.has('X-CSRF-Token')) opts.headers.set('X-CSRF-Token', token);
            } else if (Array.isArray(opts.headers)) {
              const hasToken = opts.headers.some(([k]) => k.toLowerCase() === 'x-csrf-token');
              if (!hasToken) opts.headers.push(['X-CSRF-Token', token]);
            } else {
              opts.headers = Object.assign({}, opts.headers);
              if (!opts.headers['X-CSRF-Token'] && !opts.headers['x-csrf-token']) {
                opts.headers['X-CSRF-Token'] = token;
              }
            }
          }
        }
      }
      return originalFetch.call(this, resource, opts);
    };
  }

  // Ensure all existing forms in the DOM have the valid CSRF token in an input[name="_csrf"]
  function syncFormCsrfTokens() {
    const token = window.getCsrfToken();
    if (!token) return;
    document.querySelectorAll('form').forEach(form => {
      let input = form.querySelector('input[name="_csrf"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        form.prepend(input);
      }
      if (!input.value) {
        input.value = token;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncFormCsrfTokens);
  } else {
    syncFormCsrfTokens();
  }
})();


