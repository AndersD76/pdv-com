import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, Store, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { consignmentsApi, auxiliariesApi, productsApi, aiApi, productPhotoUrl } from '../../services/api';
import { Button, Input, MoneyInput, Select, Textarea, Modal, ModalFooter } from '../ui';
import { PhotoPicker } from './PhotoPicker';
import { PreparedPhoto, releasePhoto } from '../../utils/image';
import { ProductCondition } from '../../types';
import type { Product, ProductAnalysis, ProductChannel } from '../../types';

interface ProductFormModalProps {
  isOpen: boolean;
  listId: number;
  product: Product | null; // null = nova peça
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = {
  descricao: '',
  cor: '',
  marca: '',
  tamanho: '',
  condicao: ProductCondition.SEMI_NOVA,
  defeitos: '',
  valor_compra: '',
  valor_venda: '',
  canal: 'FISICA' as ProductChannel,
  titulo_loja: '',
  descricao_loja: '',
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function ProductFormModal({ isOpen, listId, product, onClose, onSaved }: ProductFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const { data: auxiliaries } = useQuery({
    queryKey: ['auxiliaries'],
    queryFn: auxiliariesApi.getAll,
    enabled: isOpen,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: aiApi.status,
    staleTime: Infinity,
    enabled: isOpen,
  });

  // Carrega a peça ao abrir para edição (ou limpa para uma nova)
  useEffect(() => {
    if (!isOpen) return;
    setForm(product ? {
      descricao: product.descricao,
      cor: product.cor || '',
      marca: product.marca || '',
      tamanho: product.tamanho || '',
      condicao: product.condicao,
      defeitos: product.defeitos || '',
      valor_compra: String(product.valor_compra),
      valor_venda: String(product.valor_venda),
      canal: product.canal || 'FISICA',
      titulo_loja: product.titulo_loja || '',
      descricao_loja: product.descricao_loja || '',
    } : emptyForm);
    setAiNote(null);
  }, [isOpen, product]);

  const clearPhotos = () => {
    setPhotos((current) => {
      current.forEach(releasePhoto);
      return [];
    });
  };

  const handleClose = () => {
    clearPhotos();
    setAiNote(null);
    onClose();
  };

  const applyAnalysis = (analysis: ProductAnalysis) => {
    setForm((current) => {
      const venda = analysis.valor_venda_sugerido;
      return {
        ...current,
        descricao: analysis.descricao || current.descricao,
        cor: analysis.cor ?? current.cor,
        marca: analysis.marca ?? current.marca,
        tamanho: analysis.tamanho ?? current.tamanho,
        condicao: analysis.condicao,
        defeitos: analysis.defeitos ?? '',
        valor_venda: venda ? String(venda) : current.valor_venda,
        // Mesma regra do formulário: venda = 2x compra
        valor_compra: current.valor_compra || (venda ? String(round2(venda / 2)) : ''),
        titulo_loja: analysis.titulo_loja,
        descricao_loja: analysis.descricao_loja,
      };
    });
    setAiNote(analysis.observacoes);
  };

  const analyze = useMutation({
    mutationFn: (fotos: PreparedPhoto[]) => aiApi.analisarPeca(fotos.map((photo) => photo.analysisBase64)),
    onSuccess: (analysis) => {
      applyAnalysis(analysis);
      toast.success('Campos preenchidos pela IA. Confira antes de salvar.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao analisar a peça'),
  });

  const handleAddPhoto = (photo: PreparedPhoto) => {
    const next = [...photos, photo];
    setPhotos(next);
    // Primeira foto de uma peça nova: a IA já preenche o formulário
    if (!product && photos.length === 0 && !form.descricao && aiStatus?.configurado) {
      analyze.mutate(next);
    }
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) releasePhoto(removed);
      return current.filter((photo) => photo.id !== photoId);
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const data = {
        descricao: form.descricao,
        cor: form.cor || undefined,
        marca: form.marca || undefined,
        tamanho: form.tamanho || undefined,
        condicao: form.condicao,
        defeitos: form.defeitos || undefined,
        valor_compra: Number(form.valor_compra),
        valor_venda: Number(form.valor_venda),
        canal: form.canal,
        titulo_loja: form.titulo_loja || undefined,
        descricao_loja: form.descricao_loja || undefined,
      };

      const saved = product
        ? await consignmentsApi.updateProduct(listId, product.id, data)
        : await consignmentsApi.addProduct(listId, data);

      // A foto vai depois da peça; se falhar, a peça fica salva e a foto pode ser enviada na edição
      if (photos[0]) {
        try {
          await productsApi.uploadFoto(saved.id, photos[0].storeBlob);
        } catch (error) {
          return { saved, photoError: (error as Error).message };
        }
      }
      return { saved, photoError: null };
    },
    onSuccess: ({ photoError }) => {
      if (photoError) {
        toast.error(`Peça salva, mas a foto não foi enviada: ${photoError}. Edite a peça para tentar de novo.`);
      } else {
        toast.success(product ? 'Peça atualizada!' : 'Peça adicionada!');
      }
      onSaved();
      handleClose();
    },
    onError: (error: Error) => toast.error(error.message || 'Erro ao salvar a peça'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const existingPhotoUrl = product ? productPhotoUrl(product) : null;
  const hasPhoto = photos.length > 0 || Boolean(existingPhotoUrl);
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={product ? 'Editar Peça' : 'Adicionar Peça'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          {/* Fotos e IA */}
          <div className="space-y-3">
            <PhotoPicker
              photos={photos}
              existingPhotoUrl={existingPhotoUrl}
              onAdd={handleAddPhoto}
              onRemove={handleRemovePhoto}
            />
            {aiStatus?.configurado ? (
              <Button
                type="button"
                className="w-full"
                onClick={() => analyze.mutate(photos)}
                disabled={photos.length === 0 || analyze.isPending}
              >
                {analyze.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando...</>
                  : <><Sparkles className="w-4 h-4 mr-2" /> Preencher com IA</>}
              </Button>
            ) : (
              <p className="text-xs text-gray-500">IA indisponível: configure ANTHROPIC_API_KEY no servidor.</p>
            )}
            {aiNote && (
              <p className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-2">{aiNote}</p>
            )}
          </div>

          {/* Campos */}
          <div className="grid grid-cols-2 gap-4 content-start">
            <div className="col-span-2">
              <label className="label">Descrição *</label>
              <input list="descriptions" className="input" value={form.descricao} onChange={set('descricao')} required />
              <datalist id="descriptions">
                {auxiliaries?.descriptions.map((d) => <option key={d.id} value={d.nome} />)}
              </datalist>
            </div>

            <div>
              <label className="label">Cor</label>
              <input list="colors" className="input" value={form.cor} onChange={set('cor')} />
              <datalist id="colors">
                {auxiliaries?.colors.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
            </div>

            <div>
              <label className="label">Marca</label>
              <input list="brands" className="input" value={form.marca} onChange={set('marca')} />
              <datalist id="brands">
                {auxiliaries?.brands.map((b) => <option key={b.id} value={b.nome} />)}
              </datalist>
            </div>

            <div>
              <label className="label">Tamanho</label>
              <input list="sizes" className="input" value={form.tamanho} onChange={set('tamanho')} />
              <datalist id="sizes">
                {auxiliaries?.sizes.map((s) => <option key={s.id} value={s.nome} />)}
              </datalist>
            </div>

            <Select
              label="Condição"
              options={[
                { value: 'NOVA', label: 'Nova' },
                { value: 'SEMI_NOVA', label: 'Semi Nova' },
                { value: 'USADA', label: 'Usada' },
              ]}
              value={form.condicao}
              onChange={(e) => setForm({ ...form, condicao: e.target.value as ProductCondition })}
            />

            <div className="col-span-2">
              <Input
                label="Defeitos"
                value={form.defeitos}
                onChange={set('defeitos')}
                placeholder="Descreva os defeitos se houver..."
              />
            </div>

            <MoneyInput
              label="Valor de Compra (R$) *"
              value={Number(form.valor_compra) || 0}
              onChange={(valorCompra) => {
                setForm({
                  ...form,
                  valor_compra: valorCompra ? String(valorCompra) : '',
                  // Sugerir valor de venda como 2x o valor de compra
                  valor_venda: form.valor_venda || String(valorCompra * 2),
                });
              }}
              required
            />

            <MoneyInput
              label="Valor de Venda (R$) *"
              value={Number(form.valor_venda) || 0}
              onChange={(valorVenda) => setForm({ ...form, valor_venda: valorVenda ? String(valorVenda) : '' })}
              required
            />

            {/* Canal de venda */}
            <div className="col-span-2">
              <label className="label">Onde a peça será vendida</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'FISICA', label: 'Loja física', icon: Store },
                  { value: 'DIGITAL', label: 'Loja digital (Instagram)', icon: Globe },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, canal: option.value })}
                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm transition-colors ${
                      form.canal === option.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <option.icon className="w-4 h-4" /> {option.label}
                  </button>
                ))}
              </div>
              {form.canal === 'DIGITAL' && !hasPhoto && (
                <p className="mt-1 text-xs text-orange-600">
                  Peças sem foto não aparecem na loja online nem no Instagram.
                </p>
              )}
            </div>

            {form.canal === 'DIGITAL' && (
              <>
                <div className="col-span-2">
                  <Input
                    label="Título na loja online"
                    value={form.titulo_loja}
                    onChange={set('titulo_loja')}
                    maxLength={150}
                    placeholder="Ex.: Vestido Midi Floral Farm - Tam. M"
                  />
                </div>
                <div className="col-span-2">
                  <Textarea
                    label="Descrição na loja online"
                    value={form.descricao_loja}
                    onChange={set('descricao_loja')}
                    rows={4}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={save.isPending} disabled={analyze.isPending}>
            {product ? 'Salvar' : 'Adicionar'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
