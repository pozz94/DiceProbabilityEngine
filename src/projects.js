// ================================================================
// Projects menu — save the current editor contents under a name and
// reload/delete saved projects. Backed by localStorage (storage.js).
// ================================================================
import { toggleMenu, closeMenu } from './menu.js';
import { listProjects, saveProject, deleteProject, exportProjects, importProjects } from './storage.js';
import { runCode } from './display.js';

export function toggleProjectsMenu(getEditorValue) {
  toggleMenu('projects', (inner) => build(inner, getEditorValue));
}

function refresh(inner, getEditorValue) {
  inner.innerHTML = '';
  build(inner, getEditorValue);
  // re-measure the accordion height after content changes
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--accordion', inner.offsetHeight + 'px');
  });
}

function build(inner, getEditorValue) {
  const col = document.createElement('div');
  col.className = 'ex-col';

  const heading = document.createElement('div');
  heading.className = 'ex-col-title';
  heading.textContent = 'PROJECTS';
  col.appendChild(heading);

  // save current
  const save = document.createElement('button');
  save.className = 'ex-btn proj-save';
  save.textContent = '＋ Save current…';
  save.addEventListener('click', () => {
    const name = (window.prompt('Project name:') || '').trim();
    if (!name) return;
    saveProject(name, getEditorValue());
    refresh(inner, getEditorValue);
  });
  col.appendChild(save);

  // export / import backup
  const io = document.createElement('div');
  io.className = 'proj-io';

  const exp = document.createElement('button');
  exp.className = 'ex-btn';
  exp.textContent = '⭳ Export';
  exp.title = 'Download all projects as a JSON file';
  exp.addEventListener('click', () => {
    const blob = new Blob([exportProjects()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dicescript-projects.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  const imp = document.createElement('button');
  imp.className = 'ex-btn';
  imp.textContent = '⭱ Import';
  imp.title = 'Load projects from a JSON file (merges)';
  imp.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const n = importProjects(reader.result);
          refresh(inner, getEditorValue);
          window.alert(`Imported ${n} project${n === 1 ? '' : 's'}.`);
        } catch (e) { window.alert('Import failed: ' + e.message); }
      };
      reader.readAsText(file);
    });
    input.click();
  });

  io.appendChild(exp);
  io.appendChild(imp);
  col.appendChild(io);

  const projects = listProjects();
  const names = Object.keys(projects).sort((a, b) => a.localeCompare(b));
  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'proj-empty';
    empty.textContent = 'No saved projects yet.';
    col.appendChild(empty);
  }
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'proj-row';

    const load = document.createElement('button');
    load.className = 'ex-btn proj-load';
    load.textContent = name;
    load.title = 'Load ' + name;
    load.addEventListener('click', () => {
      if (window._editor) window._editor.setValue(projects[name]);
      closeMenu();
      runCode(getEditorValue);
    });

    const del = document.createElement('button');
    del.className = 'proj-del';
    del.textContent = '✕';
    del.title = 'Delete ' + name;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete project "${name}"?`)) return;
      deleteProject(name);
      refresh(inner, getEditorValue);
    });

    row.appendChild(load);
    row.appendChild(del);
    col.appendChild(row);
  }

  const warn = document.createElement('div');
  warn.className = 'proj-warn';
  warn.textContent = '⚠ Saved in this browser only — clearing site data erases them. Export to keep a backup.';
  col.appendChild(warn);

  inner.appendChild(col);
}
