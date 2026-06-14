// ================================================================
// Shared top-bar dropdown (the accordion under the bar). EXAMPLES and
// PROJECTS reuse one container and are mutually exclusive.
// ================================================================

const LABELS = { examples: 'EXAMPLES', projects: 'PROJECTS' };
let current = null;

export function toggleMenu(kind, populate) {
  if (current === kind) { closeMenu(); return; }
  current = kind;
  const inner = document.getElementById('menu-inner');
  inner.innerHTML = '';
  populate(inner);
  document.getElementById('menu-accordion').classList.add('open');
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--accordion', inner.offsetHeight + 'px');
  });
  syncButtons();
}

export function closeMenu() {
  current = null;
  document.getElementById('menu-accordion').classList.remove('open');
  document.documentElement.style.setProperty('--accordion', '0px');
  syncButtons();
}

function syncButtons() {
  for (const k of Object.keys(LABELS)) {
    const btn = document.getElementById(k + '-btn');
    if (btn) btn.textContent = LABELS[k] + (current === k ? ' ▴' : ' ▾');
  }
}
