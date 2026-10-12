/**
 * Centralized path management for DevStack services.
 */

export const getDevDir = (state) => {
    const dir = state.settings?.devStackDir || 'C:/devstack';
    return dir.replace(/[\/\\]+$/, '');
};

export const getBinDir = (state) => `${getDevDir(state)}/bin`;

export const getPhpDir = (state, versionObj) => {
    const base = `${getBinDir(state)}/php`;
    const folder = versionObj.folderName || `php-${versionObj.version}`;
    return `${base}/${folder}`;
};

export const getMysqlDir = (state, version) => {
    const ver = typeof version === 'object' ? version.version : version;
    return `${getBinDir(state)}/mysql/mysql-${ver}`;
};

export const getApacheDir = (state, version) => {
    const ver = typeof version === 'object' ? version.version : version;
    return `${getBinDir(state)}/apache/apache-${ver}`;
};

export const getMailpitExe = (state) => `${getBinDir(state)}/mail/mailpit/mailpit.exe`.replace(/\//g, '\\');

export const getWwwDir = (state) => {
    return state.settings?.rootPath || `${getDevDir(state)}/www`;
};

export const getCertDir = (state) => `${getBinDir(state)}/apache/certs`;

export const getLogDir = (state) => `${getDevDir(state)}/logs`;

export const toWinPath = (p) => p.replace(/\//g, '\\');

/**
 * Version of an install folder named exactly `<prefix>-x.y.z`; null for anything else,
 * such as `php-8.3.30.tmp_extract` (an install in progress) or `php-8.3.30.old`.
 */
export const versionFromFolder = (name, prefix) => name.match(new RegExp(`^${prefix}-(\\d+\\.\\d+\\.\\d+)$`, 'i'))?.[1] || null;

/** Versions installed under `base`: exact folder names that also contain `exe` (not half-deleted). */
export async function installedVersionFolders(invoke, base, prefix, exe) {
    const folders = await invoke('list_subdirs', { path: base });
    const checks = folders.map(async folder => {
        const version = versionFromFolder(folder, prefix);
        return version && (await invoke('path_exists', { path: `${base}/${folder}/${exe}` })) ? version : null;
    });
    return (await Promise.all(checks)).filter(Boolean);
}
