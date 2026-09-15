// Apply before styles load to prevent a light flash when reopening dark mode.
(() => {
  const key = 'qa-projects-theme';
  function apply(value) {
    const mode = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = mode;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-checked', String(mode === 'dark'));
    });
  }
  try { apply(localStorage.getItem(key)); } catch { apply('light'); }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(mode);
    try { localStorage.setItem(key, mode); } catch { /* Session-only when storage is unavailable. */ }
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
