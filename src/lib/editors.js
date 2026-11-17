// Editors DevStack can find without the user browsing for an .exe.
// ponytail: fixed install locations only; a portable or custom-folder install is still picked with "Browse".

/**
 * Candidate executables in preference order.
 * dirs: { local: %LOCALAPPDATA%, pf: Program Files, pf86: Program Files (x86), jetbrains: folder names under pf/JetBrains }
 */
export const editorCandidates = ({ local, pf, pf86, jetbrains = [] }) => {
    const phpStorms = jetbrains
        .filter(d => /^phpstorm/i.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map(d => `${pf}/JetBrains/${d}/bin/phpstorm64.exe`);
    const list = [
        ['VS Code', `${local}/Programs/Microsoft VS Code/Code.exe`],
        ['VS Code', `${pf}/Microsoft VS Code/Code.exe`],
        ['Cursor', `${local}/Programs/cursor/Cursor.exe`],
        ['Cursor', `${pf}/cursor/Cursor.exe`],
        ['Antigravity', `${local}/Programs/Antigravity IDE/Antigravity IDE.exe`],
        ['Antigravity', `${local}/Programs/Antigravity/Antigravity.exe`],
        ['Windsurf', `${local}/Programs/Windsurf/Windsurf.exe`],
        ['Zed', `${local}/Programs/Zed/Zed.exe`],
        ['PhpStorm', `${local}/Programs/PhpStorm/bin/phpstorm64.exe`],
        ...phpStorms.map(p => ['PhpStorm', p]),
        ['Sublime Text', `${pf}/Sublime Text/sublime_text.exe`],
        ['Notepad++', `${pf}/Notepad++/notepad++.exe`],
        ['Notepad++', `${pf86}/Notepad++/notepad++.exe`],
    ];
    return list.map(([name, path]) => ({ name, path: path.replace(/\\/g, '/') }));
};

/** Keeps the first existing path of each editor name. */
export const firstPerEditor = (found) => {
    const seen = new Set();
    return found.filter(e => !seen.has(e.name) && seen.add(e.name));
};

/**
 * How to open a project folder with an editor.
 * File editors open every file under a folder argument (Notepad++ asked about 161k files
 * from node_modules/vendor), so Notepad++ gets its workspace flag and Notepad is refused.
 */
export const folderOpenArgs = (editorPath, folder) => {
    const exe = editorPath.split(/[\\/]/).pop().toLowerCase();
    if (exe === 'notepad.exe' || exe === 'wordpad.exe') return null;
    // -multiInst: a running single-instance Notepad++ (often elevated) receives the
    // folder but drops the workspace flag, so nothing opens; a new window handles it.
    // -nosession keeps that window from reopening (and later overwriting) the saved tabs.
    if (exe === 'notepad++.exe') return ['-multiInst', '-nosession', '-openFoldersAsWorkspace', folder];
    return [folder];
};

