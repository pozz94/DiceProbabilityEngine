// ================================================================
// Local persistence (website-only): an autosaved draft so work is never
// lost on reload, plus named projects. All in localStorage, guarded so a
// blocked/full store degrades gracefully instead of throwing.
// ================================================================

const DRAFT = 'dicescript:draft';
const PROJECTS = 'dicescript:projects';

export function loadDraft() {
  try { return localStorage.getItem(DRAFT); } catch { return null; }
}
export function saveDraft(code) {
  try { localStorage.setItem(DRAFT, code); } catch {}
}

// projects: { [name]: code }
export function listProjects() {
  try { return JSON.parse(localStorage.getItem(PROJECTS) || '{}'); } catch { return {}; }
}
export function saveProject(name, code) {
  const all = listProjects();
  all[name] = code;
  try { localStorage.setItem(PROJECTS, JSON.stringify(all)); } catch {}
}
export function deleteProject(name) {
  const all = listProjects();
  delete all[name];
  try { localStorage.setItem(PROJECTS, JSON.stringify(all)); } catch {}
}

// ---- backup / restore (a real file, since localStorage is volatile) ----
export function exportProjects() {
  return JSON.stringify({ format: 'dicescript-projects', version: 1, projects: listProjects() }, null, 2);
}
// Merge an exported file into the store (same-named projects overwrite).
// Accepts the wrapped format or a bare { name: code } map. Returns the count.
export function importProjects(json) {
  const data = JSON.parse(json);
  const incoming = data && typeof data === 'object' && data.projects ? data.projects : data;
  if (!incoming || typeof incoming !== 'object') throw new Error('not a projects file');
  const all = listProjects();
  let n = 0;
  for (const [name, code] of Object.entries(incoming)) {
    if (typeof code === 'string') { all[name] = code; n++; }
  }
  try { localStorage.setItem(PROJECTS, JSON.stringify(all)); } catch {}
  return n;
}
