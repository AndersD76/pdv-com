import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../ui';
import { PreparedPhoto, preparePhoto, captureVideoFrame } from '../../utils/image';

interface PhotoPickerProps {
  photos: PreparedPhoto[];
  existingPhotoUrl?: string | null;
  onAdd: (photo: PreparedPhoto) => void;
  onRemove: (id: string) => void;
  max?: number;
}

// Fotos da peça: a primeira é a principal (salva e publicada); as demais (ex.: etiqueta) ajudam a IA
export function PhotoPicker({ photos, existingPhotoUrl, onAdd, onRemove, max = 3 }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const canAdd = photos.length < max && !processing;

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  // Desliga a câmera ao sair da tela
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Este navegador não permite usar a câmera. Use "Escolher foto".');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // O <video> só existe depois do render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      toast.error('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
    }
  };

  const addFromBlob = async (blob: Blob) => {
    setProcessing(true);
    try {
      onAdd(await preparePhoto(blob));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const blob = await captureVideoFrame(video);
    stopCamera();
    await addFromBlob(blob);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, max - photos.length)) {
      await addFromBlob(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {cameraOpen ? (
        <div className="space-y-2">
          <video ref={videoRef} playsInline muted className="w-full rounded-lg bg-black aspect-[4/3] object-cover" />
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={capture}>
              <Camera className="w-4 h-4 mr-2" /> Capturar
            </Button>
            <Button type="button" variant="secondary" onClick={stopCamera}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <div key={photo.id} className="relative">
                <img src={photo.previewUrl} alt={`Foto ${index + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white">
                  {index === 0 ? 'Principal' : 'Detalhe'}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(photo.id)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-white/90 text-red-600 hover:bg-white"
                  title="Remover foto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {photos.length === 0 && existingPhotoUrl && (
              <div className="relative">
                <img src={existingPhotoUrl} alt="Foto atual" className="w-full aspect-square object-cover rounded-lg border" />
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white">Atual</span>
              </div>
            )}
            {processing && (
              <div className="aspect-square rounded-lg border border-dashed flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={openCamera} disabled={!canAdd}>
              <Camera className="w-4 h-4 mr-1" /> Câmera
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAdd}
            >
              <ImagePlus className="w-4 h-4 mr-1" /> Escolher foto
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-xs text-gray-500">
            Até {max} fotos. A primeira é a principal; inclua uma da etiqueta para a IA ler marca e tamanho.
          </p>
        </>
      )}
    </div>
  );
}
