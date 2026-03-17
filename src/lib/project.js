/**
 * Heuristic framework detection for a given project path.
 */

export async function detectFramework(path) {
    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const winPath = path.replace(/\//g, '\\');

        // Native check is 100x faster than PowerShell Test-Path
        const isLaravel = await invoke('path_exists', { path: `${winPath}\\artisan` });
        const isWordpress = await invoke('path_exists', { path: `${winPath}\\wp-config.php` });
        const isNode = await invoke('path_exists', { path: `${winPath}\\package.json` });

        if (isLaravel) return 'Laravel';
        if (isWordpress) return 'WordPress';
        if (isNode) return 'Node.js';

        return 'Standard';
    } catch (e) {
        console.error('Framework detection failed:', e);
        return 'Standard';
    }
}

/**
 * Suggest PHP version based on detected framework.
 */
export function suggestPhpVersion(framework) {
    if (framework === 'Laravel') return '8.2';
    if (framework === 'WordPress') return '8.1';
    return '8.2';
}
