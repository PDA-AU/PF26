export const compressImageToWebp = async (file, options = {}) => {
    const { maxDimension = 1600, quality = 0.82 } = options;
    if (!file || !file.type?.startsWith('image/')) return file;

    let image = null;
    if (window.createImageBitmap) {
        image = await createImageBitmap(file);
    } else {
        image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
};
