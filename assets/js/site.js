// Site-wide helpers: mobile nav toggle + footer year
(() => {
  // Footer year
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  // Mobile nav
  const btn = document.querySelector('.navToggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;

  const close = () => {
    nav.setAttribute('data-open', 'false');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
  };

  const open = () => {
    nav.setAttribute('data-open', 'true');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
  };

  const toggle = () => {
    const isOpen = nav.getAttribute('data-open') === 'true';
    if (isOpen) close(); else open();
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggle();
  });

  // Close when clicking a nav link
  nav.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.tagName === 'A') close();
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    const isOpen = nav.getAttribute('data-open') === 'true';
    if (!isOpen) return;
    if (nav.contains(t) || btn.contains(t)) return;
    close();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
// Field UI controls -> updates window.__FIELD_UI__ for field.js
(function(){
  const root = document.querySelector('.fieldUI');
  if(!root) return;

  const toggle = root.querySelector('.fieldUI__toggle');
  const panel = root.querySelector('.fieldUI__panel');
  const inputs = root.querySelectorAll('input[data-field]');

  window.__FIELD_UI__ = window.__FIELD_UI__ || {};

  function setOpen(open){
    root.dataset.open = open ? "true" : "false";
    toggle.setAttribute('aria-expanded', open ? "true" : "false");
  }

  toggle.addEventListener('click', () => {
    const open = root.dataset.open === "true";
    setOpen(!open);
  });

  inputs.forEach(inp => {
    const key = inp.dataset.field;
    const val = parseFloat(inp.value);
    window.__FIELD_UI__[key] = val;

    inp.addEventListener('input', () => {
      window.__FIELD_UI__[key] = parseFloat(inp.value);
    });
  });

  // start collapsed by default
  setOpen(false);
})();

  // Ensure nav is closed when resizing from desktop to mobile or back
  window.addEventListener('resize', () => {
    // If we enter desktop layout, keep data-open false so it doesn't accidentally overlay
    if (window.innerWidth > 860) close();
  }, { passive: true });
})();
