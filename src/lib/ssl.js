import { invoke } from '@tauri-apps/api/core';

const MKCERT_URL = 'https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-windows-amd64.exe';

function getMkcertPath(settings) {
    const devDir = settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
    return `${devDir}/bin/tools/mkcert.exe`.replace(/\//g, '\\');
}

/**
 * Checks if mkcert is installed.
 */
export async function checkMkcert(settings) {
    return await invoke('path_exists', { path: getMkcertPath(settings) });
}

/**
 * Auto-downloads mkcert.exe from GitHub if not already installed.
 * Returns true on success, throws on failure.
 */
export async function installMkcert(settings) {
    const destPath = getMkcertPath(settings);
    await invoke('download_file', { url: MKCERT_URL, destPath });
    return true;
}

/**
 * Generates SSL certificates for a domain using mkcert via native Rust command.
 * Returns {cert, key} paths on success.
 */
export async function generateCert(settings, domain) {
    const mkcertExe = getMkcertPath(settings);
    const devDir = settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const certDir = `${devDir}/bin/apache/certs`.replace(/\//g, '\\');

    const result = await invoke('run_mkcert', { mkcertExe, certDir, domain });
    return result; // { cert, key }
}
