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

export const getRedisDir = (state) => {
    return `${getBinDir(state)}/redis`;
};

export const getWwwDir = (state) => {
    return state.settings?.rootPath || `${getDevDir(state)}/www`;
};
