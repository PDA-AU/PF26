export const POSTER_ASPECT_RATIOS = ['1:1', '2:1', '4:5', '5:4'];

const asString = (value) => String(value || '').trim();

export const resolvePosterUrl = (url) => {
    const value = asString(url);
    if (!value) return '';
    if (value.startsWith('http')) return value;
    const base = process.env.REACT_APP_BACKEND_URL || '';
    return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
};

export const normalizePosterAsset = (asset) => {
    if (!asset) return null;
    const url = asString(asset.url || asset.src);
    if (!url) return null;
    const aspect_ratio = asString(asset.aspect_ratio || asset.ratio);
    return {
        url,
        aspect_ratio: POSTER_ASPECT_RATIOS.includes(aspect_ratio) ? aspect_ratio : null
    };
};

export const parsePosterAssets = (rawValue) => {
    const value = asString(rawValue);
    if (!value) return [];

    if ((value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/'))) {
        return [{ url: value, aspect_ratio: null }];
    }

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizePosterAsset).filter(Boolean);
    } catch {
        return [];
    }
};

export const serializePosterAssets = (assets) => {
    const clean = (assets || []).map(normalizePosterAsset).filter(Boolean);
    return clean.length ? JSON.stringify(clean) : null;
};

export const filterPosterAssetsByRatio = (assets, allowedRatios = []) => {
    const set = new Set(allowedRatios || []);
    if (!set.size) return (assets || []).slice();
    return (assets || []).filter((asset) => asset?.aspect_ratio && set.has(asset.aspect_ratio));
};

export const pickPosterAssetByRatio = (assets, allowedRatios = []) => {
    const filtered = filterPosterAssetsByRatio(assets, allowedRatios);
    return filtered[0] || (assets || [])[0] || null;
};
