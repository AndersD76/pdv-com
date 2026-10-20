"""Extrai da planilha antiga (APP_AD_REV_xx.xlsm) o estoque atual, fornecedores e vendedoras
e grava carga.json para o importar.mjs. Lê só os valores gravados no arquivo (macros não são executadas).

Uso: python extrair.py <planilha.xlsm> [--desde 2026-01-01] [--saida carga.json]

Fontes:
- abas de lista ("Nome.L4499", "A.877", "APP-LIS"): peças com descrição, cor, marca, tamanho e preços;
- APP-VEN: vendas, para saber o que já foi vendido e quem vendeu.

Etiquetas: o modelo de etiqueta da planilha pega o código de barras da aba APP-LIS e o texto de outra
aba (APP-L). A partir de 2024, do item 6 em diante, a etiqueta física sai com o código do item seguinte
(código da lista + 1). As vendas confirmam isso lista a lista; sem vendas para conferir, vale a regra.
"""
import argparse
import io
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
STATUS_FORA = {'VENDIDO', 'VENDIDA', 'DEVOLVIDO', 'DEVOLVIDA', 'PAGO', 'ENVELOPE', 'FOI', 'VOLTA', 'METADE', 'ERRO'}
ITENS_SEM_DESLOCAMENTO = 5


def norm(s):
    return unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper().strip()


def palavra(s):
    return re.split(r'[\s.+/]', norm(s))[0]


def numero(v):
    try:
        n = round(float(str(v).replace(',', '.')), 2)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def texto(v):
    v = re.sub(r'\s+', ' ', str(v or '')).strip()
    return '' if v in ('0', '#N/A', '#REF!', '#VALUE!', '#DIV/0!') else v


def data_excel(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return date(1899, 12, 30) + timedelta(days=int(n)) if 30000 < n < 60000 else None


class Planilha:
    def __init__(self, caminho):
        self.z = zipfile.ZipFile(caminho)
        self.textos = []
        with self.z.open('xl/sharedStrings.xml') as f:
            for _, el in ET.iterparse(f):
                if el.tag == NS + 'si':
                    self.textos.append(''.join(t.text or '' for t in el.iter(NS + 't')))
                    el.clear()
        wb = self.z.read('xl/workbook.xml').decode('utf-8')
        rels = self.z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
        alvo = {}
        for attrs in re.findall(r'<Relationship\b([^>]*)/>', rels):
            rid = re.search(r'Id="([^"]*)"', attrs).group(1)
            destino = re.search(r'Target="([^"]*)"', attrs).group(1)
            alvo[rid] = 'xl/' + destino.lstrip('/').replace('xl/', '')
        self.abas = []
        for attrs in re.findall(r'<sheet\b([^>]*)/>', wb):
            nome = re.search(r'name="([^"]*)"', attrs).group(1)
            rid = re.search(r'r:id="([^"]*)"', attrs).group(1)
            self.abas.append((nome, alvo[rid]))

    @staticmethod
    def _coluna(ref):
        n = 0
        for ch in re.match(r'[A-Z]+', ref).group(0):
            n = n * 26 + ord(ch) - 64
        return n - 1

    def linhas(self, arquivo):
        """Devolve {número da linha: {índice da coluna (A=0): valor}} só com células preenchidas."""
        linhas = {}
        with self.z.open(arquivo) as f:
            for _, el in ET.iterparse(f):
                if el.tag != NS + 'row':
                    continue
                valores = {}
                for c in el.findall(NS + 'c'):
                    t = c.get('t')
                    v = c.find(NS + 'v')
                    if t == 's' and v is not None:
                        val = self.textos[int(v.text)]
                    elif t == 'inlineStr':
                        val = ''.join(x.text or '' for x in c.iter(NS + 't'))
                    else:
                        val = v.text if v is not None else None
                    if val not in (None, ''):
                        valores[self._coluna(c.get('r'))] = val.strip()
                if valores:
                    linhas[int(el.get('r'))] = valores
                el.clear()
        return linhas


def ao_lado(linhas, rotulo, ate=12):
    for r in sorted(linhas):
        if r > ate:
            break
        for c, v in sorted(linhas[r].items()):
            if norm(v).startswith(rotulo):
                for c2 in range(c + 1, c + 8):
                    v2 = linhas[r].get(c2, '')
                    if v2 not in ('', '0') and not v2.endswith(':'):
                        return v2
                return None
    return None


def ler_lista(nome_aba, linhas):
    cab = next((r for r in sorted(linhas) if r < 30 and norm(linhas[r].get(1, '')) == 'ITEM'), None)
    if cab is None:
        return None
    colunas = {}
    for c, v in linhas[cab].items():
        v = norm(v)
        for chave, prefixo in (('item', 'ITEM'), ('codigo', 'CODIGO'), ('descricao', 'DESCRI'), ('cor', 'COR'), ('marca', 'MARCA'),
                               ('tamanho', 'TAMANHO'), ('compra', 'VALOR COMPRA'), ('venda', 'VALOR VENDA'), ('status', 'STATUS')):
            if v.startswith(prefixo) and chave not in colunas:
                colunas[chave] = c
    itens = []
    for r in sorted(linhas):
        if r <= cab:
            continue
        valores = linhas[r]
        codigo = str(valores.get(colunas.get('codigo'), '')).strip()
        if not re.fullmatch(r'\d{12}', codigo):
            continue
        try:
            item = int(float(valores.get(colunas.get('item'), 0)))
        except ValueError:
            item = 0
        itens.append({
            'item': item,
            'codigo': codigo,
            'descricao': texto(valores.get(colunas.get('descricao'))),
            'cor': texto(valores.get(colunas.get('cor'))),
            'marca': texto(valores.get(colunas.get('marca'))),
            'tamanho': texto(valores.get(colunas.get('tamanho'))),
            'valor_compra': numero(valores.get(colunas.get('compra'))),
            'valor_venda': numero(valores.get(colunas.get('venda'))),
            'status': norm(texto(valores.get(colunas.get('status')))),
        })
    return {
        'aba': nome_aba,
        'codigo_lista': ao_lado(linhas, 'CODIGO DE BARRAS'),
        'nome': texto(ao_lado(linhas, 'CPF')),
        'recebimento': data_excel(ao_lado(linhas, 'DATA DO RECEBIMENTO')),
        'prazo': data_excel(ao_lado(linhas, 'PRAZO PARA RETIRADA')),
        'itens': itens,
    }


def nome_fornecedor(lista):
    nome = lista['nome'] or re.sub(r'\.?\s*[Ll]?\s*\d+\s*$', '', lista['aba']).strip(' .')
    nome = re.sub(r'\s+lista\s*\d+$', '', nome, flags=re.I).strip(' .')
    return nome


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('planilha')
    ap.add_argument('--desde', default='2026-01-01', help='listas recebidas a partir desta data')
    ap.add_argument('--saida', default='carga.json')
    args = ap.parse_args()
    desde = date.fromisoformat(args.desde)

    pl = Planilha(args.planilha)
    abas = dict(pl.abas)

    # Vendas
    vendas = []
    for r, v in pl.linhas(abas['APP-VEN']).items():
        if r < 4:
            continue
        cod = str(v.get(4, '')).strip()
        cod = cod[:12] if re.fullmatch(r'\d{13}', cod) else cod
        if not re.fullmatch(r'\d{12}', cod):
            cod = str(v.get(3, '')).strip()
        vendas.append({'codigo': cod, 'dia': data_excel(v.get(1)), 'descricao': texto(v.get(5)),
                       'valor': numero(v.get(6)), 'vendedor': texto(v.get(8))})
    ultima_venda = max(v['dia'] for v in vendas if v['dia'] and v['dia'] <= date.today())
    vendas_por_codigo = defaultdict(list)
    for v in vendas:
        if re.fullmatch(r'\d{12}', v['codigo']):
            vendas_por_codigo[v['codigo']].append(v)

    # Listas do período
    listas = []
    for nome_aba, arquivo in pl.abas:
        if nome_aba in ('PAINEL', 'APP-CAD', 'APP-PDV', 'APP-BOL', 'APP-FAT', 'CUPON', 'APP-VEN', 'APP-DAD', 'APP-FOR', 'APP-COM', 'E1', 'E2', 'E3'):
            continue
        lista = ler_lista(nome_aba, pl.linhas(arquivo))
        if lista and lista['recebimento'] and desde <= lista['recebimento'] <= date.today() and re.fullmatch(r'\d{6}', str(lista['codigo_lista'] or '')):
            listas.append(lista)
    # Mesma lista em duas abas (ex.: APP-LIS é a cópia de trabalho): fica a aba nomeada
    por_codigo = defaultdict(list)
    for lista in listas:
        por_codigo[lista['codigo_lista']].append(lista)
    listas = [sorted(ls, key=lambda l: l['aba'] == 'APP-LIS')[0] for ls in por_codigo.values()]

    def confere(peca, venda):
        return (palavra(peca['descricao']) == palavra(venda['descricao'])) + (peca['valor_venda'] is not None and peca['valor_venda'] == venda['valor'])

    saida_listas, fora, resumo_desloc, conferencia = [], [], Counter(), Counter()
    for lista in listas:
        pecas = [p for p in lista['itens'] if p['descricao']]
        por_cod = {int(p['codigo']): p for p in pecas}
        # Evidência de deslocamento nas vendas de etiquetas do item 6 em diante
        evid = Counter()
        prefixo = lista['codigo_lista']
        for cod, vs in vendas_por_codigo.items():
            if not cod.startswith(prefixo):
                continue
            for v in vs:
                c = int(cod)
                p0, p1 = por_cod.get(c), por_cod.get(c - 1)
                s0 = confere(p0, v) if p0 and p0['item'] > ITENS_SEM_DESLOCAMENTO else -1
                s1 = confere(p1, v) if p1 and p1['item'] > ITENS_SEM_DESLOCAMENTO else -1
                if max(s0, s1) > 0 and s0 != s1:
                    evid[1 if s1 > s0 else 0] += 1
        desloc = 0 if evid[0] > 2 * evid[1] else 1
        resumo_desloc['sem vendas para conferir (regra)' if not evid else ('deslocada' if desloc else 'sem deslocamento')] += 1

        compra_da_loja = prefixo.startswith('2')
        itens = []
        for p in pecas:
            etiqueta = str(int(p['codigo']) + (desloc if p['item'] > ITENS_SEM_DESLOCAMENTO else 0))
            vendas_peca = vendas_por_codigo.get(etiqueta, [])
            if vendas_peca:
                conferencia['venda confere com a peça' if any(confere(p, v) for v in vendas_peca) else 'venda não confere'] += 1
            if vendas_peca or p['status'] in STATUS_FORA:
                continue
            if not p['valor_venda']:
                fora.append({'aba': lista['aba'], 'item': p['item'], 'etiqueta': etiqueta, 'descricao': p['descricao'],
                             'status': p['status'], 'motivo': 'sem preço de venda na lista'})
                continue
            compra = p['valor_compra'] or (0 if compra_da_loja else round(p['valor_venda'] / 2, 2))
            itens.append({
                'codigo_barras': etiqueta, 'item': p['item'], 'descricao': p['descricao'][:255], 'cor': p['cor'][:100] or None,
                'marca': p['marca'][:100] or None, 'tamanho': p['tamanho'][:20] or None,
                'valor_compra': compra, 'valor_venda': p['valor_venda'], 'status_planilha': p['status'] or None,
            })
        if not itens:
            continue
        numero_lista = int(prefixo[1:])
        nome = nome_fornecedor(lista)
        saida_listas.append({
            'codigo': f"{'A' if compra_da_loja else 'L'}{numero_lista}",
            'aba': lista['aba'],
            'fornecedor': 'Loja' if compra_da_loja else nome,
            'compra_da_loja': compra_da_loja,
            'origem': nome,
            'data_recebimento': lista['recebimento'].isoformat(),
            'prazo_retirada': (lista['prazo'] or lista['recebimento'] + timedelta(days=30)).isoformat(),
            'etiquetas_deslocadas': bool(desloc),
            'pecas': itens,
        })

    # Vendedoras com vendas no período
    contagem = Counter()
    ultima = {}
    for v in vendas:
        nome = norm(v['vendedor'])
        if v['dia'] and desde <= v['dia'] <= date.today() and re.fullmatch(r'[A-Z ]{2,}', nome):
            contagem[nome] += 1
            ultima[nome] = max(ultima.get(nome, v['dia']), v['dia'])
    vendedoras = [{'nome': n.title(), 'vendas': c, 'ultima_venda': ultima[n].isoformat(),
                   'ativo': (ultima_venda - ultima[n]).days <= 60}
                  for n, c in contagem.most_common() if c >= 5]

    # Mesmo fornecedor escrito abreviado ("Vivi L." e "Vivi Laimer"): junta quando o nome abreviado
    # tem ao menos duas partes e combina com um único nome mais completo
    nomes = {l['fornecedor'] for l in saida_listas if not l['compra_da_loja']}
    unidos = {}
    for curto in nomes:
        partes = norm(curto).replace('.', ' ').split()
        if len(partes) < 2:
            continue
        candidatos = [longo for longo in nomes if longo != curto
                      and len(norm(longo).split()) >= len(partes)
                      and norm(longo).split()[0] == partes[0]
                      and all(b.startswith(a) for a, b in zip(partes, norm(longo).replace('.', ' ').split()))
                      and len(norm(longo)) > len(norm(curto))]
        if len(candidatos) == 1:
            unidos[curto] = candidatos[0]
    for l in saida_listas:
        while l['fornecedor'] in unidos:
            l['fornecedor'] = unidos[l['fornecedor']]
    fornecedores = sorted({l['fornecedor'] for l in saida_listas if not l['compra_da_loja']}, key=norm)
    carga = {
        'planilha': args.planilha, 'desde': args.desde, 'ultima_venda_na_planilha': ultima_venda.isoformat(),
        'vendedoras': vendedoras, 'fornecedores': fornecedores, 'listas': saida_listas, 'fora': fora,
    }
    with open(args.saida, 'w', encoding='utf-8') as f:
        json.dump(carga, f, ensure_ascii=False, indent=1)

    pecas = [p for l in saida_listas for p in l['pecas']]
    print(f'Planilha: {args.planilha} | última venda registrada: {ultima_venda.strftime("%d/%m/%Y")}')
    print(f'Listas recebidas desde {desde.strftime("%d/%m/%Y")}: {len(listas)} | com peças em estoque: {len(saida_listas)}'
          f" (consignação {sum(not l['compra_da_loja'] for l in saida_listas)}, compras da loja {sum(l['compra_da_loja'] for l in saida_listas)})")
    print(f'Etiquetas (item 6 em diante): {dict(resumo_desloc)}')
    print(f'Conferência das vendas com a regra das etiquetas: {dict(conferencia)}')
    print(f'Peças em estoque: {len(pecas)} | valor de venda R$ {sum(p["valor_venda"] for p in pecas):,.2f}')
    print(f'Fora da carga (sem preço): {len(fora)}')
    print(f'Fornecedores: {len(fornecedores)} | nomes abreviados unidos: ' + '; '.join(f'{a} -> {b}' for a, b in sorted(unidos.items())))
    print('Vendedoras:', ', '.join(f"{v['nome']} ({v['vendas']} vendas, última {v['ultima_venda']}, {'ativa' if v['ativo'] else 'inativa'})" for v in vendedoras))
    print(f'Arquivo gerado: {args.saida}')


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
