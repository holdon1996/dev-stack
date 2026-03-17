import { Command } from '@tauri-apps/plugin-shell';

/**
 * Base64 encodes a PowerShell script to be used with -EncodedCommand
 * This avoids issues with special characters and quotes.
 */
export const encodePS = (script) => {
    // PowerShell expects UTF-16LE encoding for -EncodedCommand
    const bytes = new TextEncoder().encode(script);
    // We actually need to convert to UTF-16LE first
    // However, modern PowerShell also accepts simple base64 of UTF-8 in some environments,
    // but the most reliable way is UTF-16LE.
    // For simplicity in JS, we use a buffer approach if possible or a simple base64.
    // Actually, Tauri Command handles arguments well, but EncodedCommand is safest.

    // Clean up the script: remove comments and extra whitespace to keep it small
    let cleanScript = script.replace(/#.*$/gm, '').trim();

    // Suppress progress output which causes CLIXML errors in Tauri stderr
    cleanScript = `$ProgressPreference = 'SilentlyContinue'; ${cleanScript}`;

    // Convert to UTF-16LE Base64
    const utf16le = new Uint16Array(cleanScript.length);
    for (let i = 0; i < cleanScript.length; i++) {
        utf16le[i] = cleanScript.charCodeAt(i);
    }
    return btoa(String.fromCharCode.apply(null, new Uint8Array(utf16le.buffer)));
};

/**
 * Executes a PowerShell script and returns the result.
 */
export const runPS = async (script) => {
    try {
        const encoded = encodePS(script);
        const result = await Command.create('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            encoded
        ]).execute();

        if (result.code !== 0 && result.stderr.trim()) {
            console.error('PowerShell error:', result.stderr);
            // We return null only if there's an actual error message
            return null;
        }

        return result.stdout?.trim();
    } catch (err) {
        console.error('runPS failed:', err);
        return null;
    }
};

/**
 * Returns a Command instance for spawning/listening.
 */
export const runPSSpawn = (script) => {
    const encoded = encodePS(script);
    return Command.create('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encoded
    ]);
};
