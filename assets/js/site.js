// Site-wide helpers: footer year + mobile nav + field controls
(() => {
  // Footer year
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  // -----------------------
  // Mobile nav (guarded)
  // -----------------------
  const btn = document.querySelector('.navToggle');
  const nav = document.getElementById('site-nav');

  // Keep active nav state correct on every page.
  if (nav) {
    const currentPathPart = window.location.pathname.split('/').pop() || '';
    const currentPage = (currentPathPart && currentPathPart.includes('.') ? currentPathPart : 'index.html').toLowerCase();
    const navLinks = nav.querySelectorAll('a[href]');

    navLinks.forEach((link) => {
      const href = (link.getAttribute('href') || '').trim();
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;

      const linkPage = href.split('/').pop().toLowerCase();
      if (linkPage === currentPage) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  const close = () => {
    if (!nav || !btn) return;
    nav.setAttribute('data-open', 'false');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
  };

  const open = () => {
    if (!nav || !btn) return;
    nav.setAttribute('data-open', 'true');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
  };

  if (btn && nav) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = nav.getAttribute('data-open') === 'true';
      if (isOpen) close(); else open();
    });

    nav.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest('a');
      if (link && nav.contains(link)) close();
    });

    document.addEventListener('click', (e) => {
      const t = e.target;
      const isOpen = nav.getAttribute('data-open') === 'true';
      if (!isOpen) return;
      if (!(t instanceof Node)) return;
      if (nav.contains(t) || btn.contains(t)) return;
      close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) close();
    }, { passive: true });
  }

  // -----------------------
  // Field UI controls
  // -----------------------
  (function () {
    const root = document.querySelector('.fieldUI');
    if (!root) return;

    const toggleBtn = root.querySelector('.fieldUI__toggle');
    const inputs = root.querySelectorAll('input[data-field]');
    if (!toggleBtn) return;

    window.__FIELD_UI__ = window.__FIELD_UI__ || {};

    function setOpen(open) {
      root.dataset.open = open ? "true" : "false";
      toggleBtn.setAttribute('aria-expanded', open ? "true" : "false");
    }

    // Prevent global click handlers from interfering
    root.addEventListener('click', (e) => e.stopPropagation());

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = root.dataset.open === "true";
      setOpen(!open);
    });

    inputs.forEach(inp => {
      const key = inp.dataset.field;
      window.__FIELD_UI__[key] = parseFloat(inp.value);

      inp.addEventListener('input', () => {
        window.__FIELD_UI__[key] = parseFloat(inp.value);
      });
    });

    setOpen(false);
  })();
})();
