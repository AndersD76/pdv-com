// Preparação das fotos das peças no navegador, antes do envio

export interface PreparedPhoto {
  id: string;
  previewUrl: string;     // URL local (blob:) para pré-visualização
  storeBlob: Blob;        // JPEG de até 1080 px: foto salva na peça, na loja online e no Instagram
  analysisBase64: string; // JPEG de até 1568 px: enviado à IA (resolução boa para ler etiquetas)
}

const STORE_MAX_SIZE = 1080;
const ANALYSIS_MAX_SIZE = 1568;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir a imagem. Use uma foto JPEG ou PNG.'));
    };
    img.src = url;
  });
}

function resize(source: CanvasImageSource, width: number, height: number, maxSize: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d')!;
  // Fundo branco: PNG com transparência ficaria preto ao virar JPEG
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível converter a foto'))),
      'image/jpeg',
      quality
    );
  });
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const img = await loadImage(file);
  const storeBlob = await toJpegBlob(resize(img, img.naturalWidth, img.naturalHeight, STORE_MAX_SIZE), 0.82);
  const analysisBase64 = resize(img, img.naturalWidth, img.naturalHeight, ANALYSIS_MAX_SIZE)
    .toDataURL('image/jpeg', 0.85)
    .split(',')[1];

  return { id: newId(), previewUrl: URL.createObjectURL(storeBlob), storeBlob, analysisBase64 };
}

// Captura o quadro atual da câmera (vídeo ao vivo) como JPEG
export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = resize(video, video.videoWidth, video.videoHeight, Math.max(video.videoWidth, video.videoHeight));
  return toJpegBlob(canvas, 0.92);
}

export function releasePhoto(photo: PreparedPhoto) {
  URL.revokeObjectURL(photo.previewUrl);
}
