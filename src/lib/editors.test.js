import test from 'node:test';
import assert from 'node:assert/strict';
import { editorCandidates, firstPerEditor, folderOpenArgs } from './editors.js';

test('editorCandidates lists the newest PhpStorm first and keeps VS Code first', () => {
    const list = editorCandidates({ local: 'C:/L', pf: 'C:/PF', pf86: 'C:/PF86', jetbrains: ['PhpStorm 2023.3.3', 'PhpStorm 2024.1', 'Rider 2024.1'] });
    assert.equal(list[0].name, 'VS Code');
    const storms = list.filter(c => c.name === 'PhpStorm').map(c => c.path);
    assert.deepEqual(storms.slice(1), ['C:/PF/JetBrains/PhpStorm 2024.1/bin/phpstorm64.exe', 'C:/PF/JetBrains/PhpStorm 2023.3.3/bin/phpstorm64.exe']);
});

test('firstPerEditor keeps one path per editor', () => {
    const found = [{ name: 'Cursor', path: 'a' }, { name: 'Cursor', path: 'b' }, { name: 'Zed', path: 'c' }];
    assert.deepEqual(firstPerEditor(found).map(e => e.path), ['a', 'c']);
});

test('folderOpenArgs never hands a project folder to a file-only editor', () => {
    assert.equal(folderOpenArgs('C:\\Windows\\notepad.exe', 'F:\\www\\app'), null);
    assert.deepEqual(folderOpenArgs('C:/Program Files/Notepad++/notepad++.exe', 'F:\\www\\app'), ['-openFoldersAsWorkspace', 'F:\\www\\app']);
    assert.deepEqual(folderOpenArgs('C:/x/Code.exe', 'F:\\www\\app'), ['F:\\www\\app']);
});
