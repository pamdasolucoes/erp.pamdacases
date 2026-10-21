import { validateAssetFile } from './productAdmin';

export interface AssetDimensions { width: number; height: number }
export async function inspectAsset(source: File | string, mask: boolean): Promise<AssetDimensions> {
  if (typeof source !== 'string') {
    validateAssetFile(source, mask);
    const header = new Uint8Array(await source.slice(0, 12).arrayBuffer());
    const png = header.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => header[i] === byte);
    const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
    const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
    if (!(source.type === 'image/png' ? png : source.type === 'image/jpeg' ? jpeg : webp)) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');
  }
  const local = typeof source !== 'string';
  const url = local ? URL.createObjectURL(source) : source;
  try {
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
    await image.decode();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 32_000_000) throw new Error('Imagem incompatível: use até 32 milhões de pixels.');
    if (mask) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Não foi possível validar a transparência neste navegador.');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      let transparent = false, visible = false;
      for (let i = 3; i < pixels.length; i += 4) { transparent ||= pixels[i] < 255; visible ||= pixels[i] > 0; }
      if (!transparent || !visible) throw new Error('A máscara PNG precisa conter áreas transparentes e áreas visíveis.');
    }
    return { width, height };
  } finally { if (local) URL.revokeObjectURL(url); }
}
export async function validateAssetPair(body: File | string, mask: File | string) {
  const [a, b] = await Promise.all([inspectAsset(body, false), inspectAsset(mask, true)]);
  if (a.width !== b.width || a.height !== b.height) throw new Error('Molde e máscara devem ter as mesmas dimensões para alinhamento no editor.');
}
