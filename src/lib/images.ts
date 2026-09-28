/** Reduz uma foto para caber bem no banco (lado maior até maxSize px, JPEG). */
export function compressImage(file: File, maxSize = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível processar a imagem.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir a imagem.'));
    };
    img.src = url;
  });
}

/** Extrai o id de um link do YouTube (youtu.be, watch?v=, shorts). */
export function youtubeId(link: string | undefined): string | null {
  if (!link) return null;
  const m =
    /youtu\.be\/([\w-]{6,})/.exec(link) ||
    /[?&]v=([\w-]{6,})/.exec(link) ||
    /youtube\.com\/shorts\/([\w-]{6,})/.exec(link) ||
    /youtube\.com\/embed\/([\w-]{6,})/.exec(link);
  return m ? m[1] : null;
}
