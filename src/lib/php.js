/**
 * Official Windows build (thread-safe, x64) of a PHP release. The compiler changed over
 * time: VC15 for 7.x, VS16 for 8.0-8.3, VS17 from 8.4. Releases older than the current
 * ones live under `archives/`; install_binary retries that path by itself.
 */
export function phpDownloadUrl(version) {
    const [major, minor] = version.split('.').map(Number);
    const compiler = major < 8 ? 'vc15' : major === 8 && minor < 4 ? 'vs16' : 'vs17';
    return `https://downloads.php.net/~windows/releases/php-${version}-Win32-${compiler}-x64.zip`;
}
