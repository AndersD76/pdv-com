"""Extrai da planilha antiga (APP_AD_REV_xx.xlsm) os dados para o sistema e grava carga.json para o importar.mjs.
Lê só os valores gravados no arquivo (macros não são executadas).

Uso: python extrair.py <planilha.xlsm> [--desde 2026-01-01] [--saida carga.json]

O que sai:
- listas recebidas desde a data: todas as peças (disponíveis, vendidas e devolvidas);
- listas mais antigas que tiveram vendas no período: só as peças vendidas;
- vendas da APP-VEN no período (uma venda por peça, como na planilha), com vendedora e forma de pagamento;
- fornecedores e vendedoras.

Fontes: abas de lista ("Nome.L4499", "A.877"), APP-VEN (vendas), APP-FOR (fornecedor e data das listas)
e APP-DAD (data e dados das peças de listas cuja aba já foi apagada).

Etiquetas: o modelo de etiqueta da planilha pega o código de barras da aba APP-LIS e o texto de outra
aba (APP-L). A partir de 2024, do item 6 em diante, a etiqueta física sai com o código do item seguinte
(código da lista + 1). As vendas confirmam isso lista a lista; sem vendas para conferir, vale a regra.
"""
import argparse
import hashlib
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
ABAS_DO_SISTEMA = {'PAINEL', 'APP-CAD', 'APP-PDV', 'APP-BOL', 'APP-FAT', 'CUPON', 'APP-VEN', 'APP-DAD', 'APP-FOR', 'APP-COM', 'E1', 'E2', 'E3'}
STATUS_VENDIDO = {'VENDIDO', 'VENDIDA', 'PAGO', 'ENVELOPE', 'METADE'}
STATUS_PAGO = {'PAGO', 'ENVELOPE'}
STATUS_DEVOLVIDO = {'DEVOLVIDO', 'DEVOLVIDA', 'VOLTA', 'FOI'}
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
    """Valor à direita de um rótulo do cabeçalho da lista; vazio se a célula seguinte já for outro rótulo."""
    for r in sorted(linhas):
        if r > ate:
            break
        for c, v in sorted(linhas[r].items()):
            if norm(v).startswith(rotulo):
                for c2 in range(c + 1, c + 8):
                    v2 = linhas[r].get(c2, '')
                    if v2.endswith(':'):
                        return None
                    if v2 not in ('', '0'):
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


def forma_pagamento(texto_forma):
    """Forma de pagamento do sistema a partir do texto livre da planilha (D = dinheiro, CD = débito, CC = crédito)."""
    t = norm(texto_forma)
    simples = {'PIX': 'PIX', 'CC': 'CARTAO_CREDITO', 'LINK': 'CARTAO_CREDITO', 'CD': 'CARTAO_DEBITO',
               'D': 'DINHEIRO', 'DINHEIRO': 'DINHEIRO', 'DINHEIROS': 'DINHEIRO'}
    if t in simples:
        return simples[t]
    if re.fullmatch(r'CC\b.*', t) and 'CRED' not in t:
        return 'CARTAO_CREDITO'
    if re.search(r'\bPIX\b', t) and not re.search(r'DEVE|CRED|TROCA|BONUS', t):
        return 'PIX'
    # Pagamento dividido ("117 D/13 CC"): vale a forma com o maior valor
    partes = re.findall(r'(\d+(?:[.,]\d+)?)\s*([A-Z. ]+?)(?=/|$)', t)
    if len(partes) >= 2:
        maior = max(partes, key=lambda p: float(p[0].replace(',', '.')))
        forma = simples.get(maior[1].strip().rstrip('.'))
        if forma:
            return forma
    return 'OUTRO'


def nome_fornecedor(nome, aba):
    nome = nome or re.sub(r'\.?\s*[Ll]?\s*\d+\s*$', '', aba).strip(' .')
    return re.sub(r'\s+lista\s*\d+$', '', nome, flags=re.I).strip(' .')


def codigo_lista_sistema(codigo6, aba=''):
    letra = re.match(r'([A-Za-z])\.', aba or '')
    if codigo6.startswith('3'):
        return f'L{int(codigo6[1:])}'
    if codigo6.startswith('2'):
        return f"{letra.group(1).upper() if letra else 'A'}{int(codigo6[1:])}"
    return f'P{codigo6}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('planilha')
    ap.add_argument('--desde', default='2026-01-01', help='listas recebidas e vendas a partir desta data')
    ap.add_argument('--saida', default='carga.json')
    args = ap.parse_args()
    desde = date.fromisoformat(args.desde)
    hoje = date.today()

    pl = Planilha(args.planilha)
    abas = dict(pl.abas)

    # APP-FOR: fornecedor e datas de cada lista
    fornecedor_lista = {}
    for r, v in pl.linhas(abas['APP-FOR']).items():
        cod = str(v.get(1, '')).strip()
        if r >= 4 and re.fullmatch(r'\d{6}', cod) and cod not in fornecedor_lista:
            fornecedor_lista[cod] = {'nome': texto(v.get(2)), 'recebimento': data_excel(v.get(3)), 'retirada': data_excel(v.get(4))}

    # APP-DAD: data e dados de cada código (usado quando a aba da lista não existe mais)
    dad = {}
    datas_dad = defaultdict(Counter)
    for r, v in pl.linhas(abas['APP-DAD']).items():
        cod = str(v.get(5, '')).strip()
        if r < 4 or not re.fullmatch(r'\d{12}', cod):
            continue
        dia = data_excel(v.get(1))
        if dia:
            datas_dad[cod[:6]][dia] += 1
        if texto(v.get(6)) and cod not in dad:
            dad[cod] = {'descricao': texto(v.get(6)), 'marca': texto(v.get(7)), 'valor_compra': numero(v.get(9))}

    # APP-VEN: vendas
    vendas = []
    for r, v in sorted(pl.linhas(abas['APP-VEN']).items()):
        if r < 4:
            continue
        cod = str(v.get(4, '')).strip()
        cod = cod[:12] if re.fullmatch(r'\d{13}', cod) else cod
        if not re.fullmatch(r'\d{12}', cod):
            cod = str(v.get(3, '')).strip()
        vendas.append({'codigo': cod if re.fullmatch(r'\d{12}', cod) else '', 'dia': data_excel(v.get(1)),
                       'descricao': texto(v.get(5)), 'valor': numero(v.get(6)), 'forma': texto(v.get(7)), 'vendedor': texto(v.get(8))})
    ultima_venda = max(v['dia'] for v in vendas if v['dia'] and v['dia'] <= hoje)
    vendas_por_codigo = defaultdict(list)
    for v in vendas:
        if v['codigo']:
            vendas_por_codigo[v['codigo']].append(v)
    primeira_venda = {}
    for v in vendas:
        if v['codigo'] and v['dia'] and v['dia'] <= hoje:
            p = v['codigo'][:6]
            primeira_venda[p] = min(primeira_venda.get(p, v['dia']), v['dia'])

    # Abas de lista
    por_codigo = {}
    for nome_aba, arquivo in pl.abas:
        if nome_aba in ABAS_DO_SISTEMA:
            continue
        lista = ler_lista(nome_aba, pl.linhas(arquivo))
        if not lista or not re.fullmatch(r'\d{6}', str(lista['codigo_lista'] or '')):
            continue
        # Mesma lista em duas abas (APP-LIS é a cópia de trabalho): fica a aba nomeada
        if lista['codigo_lista'] not in por_codigo or por_codigo[lista['codigo_lista']]['aba'] == 'APP-LIS':
            por_codigo[lista['codigo_lista']] = lista
    listas = list(por_codigo.values())

    # Data das listas: aba, senão APP-DAD, senão a das listas vizinhas (limitada pela 1ª venda)
    for l in listas:
        l['data_estimada'] = False
        if not l['recebimento'] and datas_dad.get(l['codigo_lista']):
            l['recebimento'] = datas_dad[l['codigo_lista']].most_common(1)[0][0]
    serie = lambda l: (re.match(r'[A-Za-z]?', l['aba']).group(0).upper(), l['codigo_lista'][0])
    datadas = defaultdict(list)
    for l in listas:
        if l['recebimento']:
            datadas[serie(l)].append((l['codigo_lista'], l['recebimento']))
    for l in listas:
        if l['recebimento']:
            continue
        vizinhas = sorted(datadas.get(serie(l), []))
        anteriores = [d for c, d in vizinhas if c < l['codigo_lista']]
        posteriores = [d for c, d in vizinhas if c > l['codigo_lista']]
        estimada = anteriores[-1] if anteriores else (posteriores[0] if posteriores else None)
        venda = primeira_venda.get(l['codigo_lista'])
        if venda and (not estimada or venda < estimada):
            estimada = venda
        l['recebimento'] = estimada
        l['data_estimada'] = True

    def confere(peca, venda):
        return (palavra(peca['descricao']) == palavra(venda['descricao'])) + (peca['valor_venda'] is not None and peca['valor_venda'] == venda['valor'])

    def no_periodo(dia):
        return dia is not None and desde <= dia <= hoje

    # Etiqueta física de cada peça (corrige o deslocamento a partir do item 6)
    resumo_desloc = Counter()
    for l in listas:
        pecas = [p for p in l['itens'] if p['descricao']]
        por_cod = {int(p['codigo']): p for p in pecas}
        evid = Counter()
        for cod, vs in vendas_por_codigo.items():
            if not cod.startswith(l['codigo_lista']):
                continue
            for v in vs:
                c = int(cod)
                p0, p1 = por_cod.get(c), por_cod.get(c - 1)
                s0 = confere(p0, v) if p0 and p0['item'] > ITENS_SEM_DESLOCAMENTO else -1
                s1 = confere(p1, v) if p1 and p1['item'] > ITENS_SEM_DESLOCAMENTO else -1
                if max(s0, s1) > 0 and s0 != s1:
                    evid[1 if s1 > s0 else 0] += 1
        desloc = 0 if evid[0] > 2 * evid[1] else 1
        if no_periodo(l['recebimento']):
            resumo_desloc['sem vendas para conferir (regra)' if not evid else ('deslocada' if desloc else 'sem deslocamento')] += 1
        for p in pecas:
            p['etiqueta'] = str(int(p['codigo']) + (desloc if p['item'] > ITENS_SEM_DESLOCAMENTO else 0))
        l['pecas'] = pecas

    abas_por_codigo = {l['codigo_lista']: l for l in listas}
    vendas_periodo = [v for v in vendas if no_periodo(v['dia'])]

    # Associa cada venda do período a uma peça (cria a peça a partir da APP-DAD/APP-VEN quando não há aba)
    saida = {}  # codigo da lista -> lista de saída
    pecas_saida = {}  # (codigo da lista, codigo de barras) -> peça

    def lista_saida(codigo6, aba=None):
        if codigo6 in saida:
            return saida[codigo6]
        compra_da_loja = codigo6.startswith('2')
        if aba:
            nome = nome_fornecedor(aba['nome'], aba['aba'])
            receb = aba['recebimento']
            prazo = aba['prazo']
            origem_aba = aba['aba']
        else:
            info = fornecedor_lista.get(codigo6, {})
            nome = info.get('nome') if info.get('nome') not in (None, '', '0') else ''
            receb = info.get('recebimento') or (datas_dad[codigo6].most_common(1)[0][0] if datas_dad.get(codigo6) else None) \
                or primeira_venda.get(codigo6)
            prazo = None
            origem_aba = None
        codigo = codigo_lista_sistema(codigo6, aba['aba'] if aba else '')
        nome = nome or f'Fornecedor da lista {codigo}'
        recente = no_periodo(receb) and aba is not None
        receb = receb or desde
        saida[codigo6] = {
            'codigo': codigo,
            'aba': origem_aba,
            'fornecedor': 'Loja' if compra_da_loja else nome,
            'compra_da_loja': compra_da_loja,
            'origem': nome,
            'data_recebimento': receb.isoformat(),
            'prazo_retirada': (prazo or receb + timedelta(days=30)).isoformat(),
            'data_estimada': bool(aba and aba.get('data_estimada')) or not aba,
            'status': 'EXPORTADA' if recente else 'FINALIZADA',
            'completa': recente,
            'pecas': [],
        }
        return saida[codigo6]

    def adicionar_peca(lista, peca):
        chave = (lista['codigo'], peca['codigo_barras'])
        if chave in pecas_saida:
            return pecas_saida[chave]
        lista['pecas'].append(peca)
        pecas_saida[chave] = peca
        return peca

    def peca_da_aba(lista_out, p, status, pago, valor=None):
        compra_da_loja = lista_out['compra_da_loja']
        venda = p['valor_venda'] or valor
        compra = p['valor_compra'] or (0 if compra_da_loja else round((venda or 0) / 2, 2))
        return adicionar_peca(lista_out, {
            'codigo_barras': p['etiqueta'], 'item': p['item'], 'descricao': p['descricao'][:255],
            'cor': p['cor'][:100] or None, 'marca': p['marca'][:100] or None, 'tamanho': p['tamanho'][:20] or None,
            'valor_compra': compra, 'valor_venda': venda, 'status': status,
            # Compra da loja não tem fornecedor a pagar; só peças vendidas contam como quitadas
            'pago_fornecedor': status == 'VENDIDO' and (pago or compra_da_loja), 'status_planilha': p['status'] or None,
        })

    vendas_saida = []
    vendidas_por_aba = defaultdict(set)  # codigo6 -> etiquetas vendidas (qualquer data)
    for cod, vs in vendas_por_codigo.items():
        vendidas_por_aba[cod[:6]].add(cod)

    ocorrencias = Counter()
    sem_codigo = 0
    for v in vendas_periodo:
        cod = v['codigo']
        aba = abas_por_codigo.get(cod[:6]) if cod else None
        peca = None
        if aba:
            lista_out = lista_saida(cod[:6], aba)
            achada = next((p for p in aba['pecas'] if p['etiqueta'] == cod), None) \
                or next((p for p in aba['pecas'] if p['codigo'] == cod), None)
            if achada:
                peca = peca_da_aba(lista_out, achada, 'VENDIDO', achada['status'] in STATUS_PAGO or bool(fornecedor_lista.get(cod[:6], {}).get('retirada')), v['valor'])
        elif cod:
            lista_out = lista_saida(cod[:6])
        else:
            lista_out = None
        if peca is None:
            if lista_out is None:
                sem_codigo += 1
                if 'HIST' not in saida:
                    saida['HIST'] = {'codigo': 'HIST', 'aba': None, 'fornecedor': 'Loja', 'compra_da_loja': True, 'origem': 'Vendas sem código na planilha',
                                     'data_recebimento': desde.isoformat(), 'prazo_retirada': desde.isoformat(), 'data_estimada': True,
                                     'status': 'FINALIZADA', 'completa': False, 'pecas': []}
                lista_out = saida['HIST']
                codigo_barras = f'SEMCOD{sem_codigo:05d}'
            else:
                codigo_barras = cod
            info = dad.get(cod, {}) if cod else {}
            valor = v['valor'] or 0
            compra = info.get('valor_compra') or (0 if lista_out['compra_da_loja'] else round(valor / 2, 2))
            peca = adicionar_peca(lista_out, {
                'codigo_barras': codigo_barras, 'item': None,
                'descricao': (info.get('descricao') or v['descricao'] or 'Peça')[:255], 'cor': None,
                'marca': (info.get('marca') or '')[:100] or None, 'tamanho': None,
                'valor_compra': compra, 'valor_venda': valor, 'status': 'VENDIDO',
                'pago_fornecedor': True, 'status_planilha': None,
            })
        if not v['valor']:
            continue
        base = f"{v['dia']}|{cod}|{v['valor']}|{norm(v['forma'])}|{norm(v['vendedor'])}"
        ocorrencias[base] += 1
        chave = 'H' + hashlib.sha1(f'{base}|{ocorrencias[base]}'.encode()).hexdigest()[:12]
        forma = forma_pagamento(v['forma'])
        vendas_saida.append({
            'codigo': chave, 'data': v['dia'].isoformat(), 'valor': v['valor'], 'forma_pagamento': forma,
            'forma_texto': v['forma'] or None, 'vendedora': norm(v['vendedor']).title() or None,
            'lista': lista_out['codigo'], 'codigo_barras': peca['codigo_barras'],
        })

    # Listas recebidas no período: todas as peças com descrição
    fora = []
    for l in listas:
        if not no_periodo(l['recebimento']):
            continue
        lista_out = lista_saida(l['codigo_lista'], l)
        retirada = bool(fornecedor_lista.get(l['codigo_lista'], {}).get('retirada'))
        for p in l['pecas']:
            if (lista_out['codigo'], p['etiqueta']) in pecas_saida:
                continue
            vendida = p['etiqueta'] in vendidas_por_aba[l['codigo_lista']] or p['status'] in STATUS_VENDIDO
            if vendida:
                if p['valor_venda']:
                    peca_da_aba(lista_out, p, 'VENDIDO', p['status'] in STATUS_PAGO or retirada)
            elif p['status'] in STATUS_DEVOLVIDO:
                if p['valor_venda']:
                    peca_da_aba(lista_out, p, 'DEVOLVIDO', False)
            elif not p['valor_venda']:
                fora.append({'lista': lista_out['codigo'], 'item': p['item'], 'etiqueta': p['etiqueta'], 'descricao': p['descricao'],
                             'status': p['status'], 'motivo': 'sem preço de venda na lista'})
            else:
                peca_da_aba(lista_out, p, 'DISPONIVEL', False)

    saida_listas = [l for l in saida.values() if l['pecas']]

    # Mesmo fornecedor escrito abreviado ("Vivi L." e "Vivi Laimer"): junta quando o nome abreviado
    # tem ao menos duas partes, o mesmo primeiro nome e combina com um único nome mais completo
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

    # Vendedoras com vendas no período
    contagem = Counter(v['vendedora'] for v in vendas_saida if v['vendedora'])
    ultima = {}
    for v in vendas_saida:
        if v['vendedora']:
            ultima[v['vendedora']] = max(ultima.get(v['vendedora'], v['data']), v['data'])
    vendedoras = [{'nome': n, 'vendas': c, 'ultima_venda': ultima[n],
                   'ativo': (ultima_venda - date.fromisoformat(ultima[n])).days <= 60}
                  for n, c in contagem.most_common() if c >= 5 and re.fullmatch(r'[A-Za-z ]+', n)]
    nomes_vendedoras = {v['nome'] for v in vendedoras}
    for v in vendas_saida:
        if v['vendedora'] not in nomes_vendedoras:
            v['vendedora'] = None

    carga = {
        'planilha': args.planilha, 'desde': args.desde, 'ultima_venda_na_planilha': ultima_venda.isoformat(),
        'vendedoras': vendedoras, 'fornecedores': fornecedores, 'listas': saida_listas, 'vendas': vendas_saida, 'fora': fora,
    }
    with open(args.saida, 'w', encoding='utf-8') as f:
        json.dump(carga, f, ensure_ascii=False, indent=1)

    pecas = [p for l in saida_listas for p in l['pecas']]
    por_status = Counter(p['status'] for p in pecas)
    estoque = [p for p in pecas if p['status'] == 'DISPONIVEL']
    a_pagar = [p for l in saida_listas if not l['compra_da_loja'] for p in l['pecas'] if p['status'] == 'VENDIDO' and not p['pago_fornecedor']]
    print(f'Planilha: {args.planilha} | última venda registrada: {ultima_venda.strftime("%d/%m/%Y")}')
    print(f"Listas: {len(saida_listas)} (recebidas no período: {sum(l['completa'] for l in saida_listas)}, "
          f"anteriores só com vendas: {sum(not l['completa'] for l in saida_listas)}, com data estimada: {sum(l['data_estimada'] for l in saida_listas)})")
    print(f'Etiquetas (item 6 em diante, listas do período): {dict(resumo_desloc)}')
    print(f'Peças: {dict(por_status)} | estoque R$ {sum(p["valor_venda"] for p in estoque):,.2f}')
    print(f'A pagar a fornecedores: {len(a_pagar)} peças, R$ {sum(p["valor_compra"] for p in a_pagar):,.2f}')
    total = sum(v['valor'] for v in vendas_saida)
    print(f'Vendas no período: {len(vendas_saida)} | R$ {total:,.2f} | formas: {dict(Counter(v["forma_pagamento"] for v in vendas_saida))}')
    print(f'Fora da carga (sem preço): {len(fora)}')
    print(f'Fornecedores: {len(fornecedores)} | nomes abreviados unidos: ' + '; '.join(f'{a} -> {b}' for a, b in sorted(unidos.items())))
    print('Vendedoras:', ', '.join(f"{v['nome']} ({v['vendas']} vendas, última {v['ultima_venda']}, {'ativa' if v['ativo'] else 'inativa'})" for v in vendedoras))
    print(f'Arquivo gerado: {args.saida}')


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    main()
