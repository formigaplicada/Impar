#!/usr/bin/env python3
"""
importar_prestadores.py
Importa prestadores de um ficheiro Excel para o Condexpress.

Uso:
    python importar_prestadores.py <token> --bd=prestadores.csv --servicos=servicos.csv
    python importar_prestadores.py <token> --bd=prestadores.csv --servicos=servicos.csv --dry-run

Requer:
    pip install openpyxl
"""

import sys
import json
import re
import csv
import urllib.request
import urllib.error

API_BASE   = "https://api.condexpress.com"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
FICHEIRO   = "1.xlsx"

LOJAS = {
    "setubal": 7, "setúbal": 7,
    "amadora": 10, "barreiro": 3, "barreiro 1": 3, "barreiro 2": 4,
    "sesimbra": 1, "montijo": 2, "odivelas": 5, "oeiras": 8,
    "corroios": 11, "mem martins": 13, "torres vedras": 12,
    "algarve": 9, "lisboa": 6,
}

MAPA_SERVICOS = {
    "intercomunicadores":               "Intercomunicadores",
    "canalizadores":                    "Canalizadores",
    "canalizações":                     "Canalizadores",
    "canalização e desentupimentos":    "Desentupimentos",
    "desentupimentos":                  "Desentupimentos",
    "bombas de água":                   "Bombas de Água",
    "bombas água":                      "Bombas de Água",
    "manutenção paineis solares":       "Paineis Solares",
    "paineis solares":                  "Paineis Solares",
    "extintores/centrais de incendio":  "Extintores",
    "extintores":                       "Extintores",
    "inspeção gás":                     "Inspeção Gás",
    "inspeção gas":                     "Inspeção Gás",
    "controlo de pragas / desinfestação": "Controlo de Pragas",
    "controlo de pragas":               "Controlo de Pragas",
    "elevadores":                       "Elevadores",
    "empreiteiro /obras":               "Obras",
    "empreiteiro / obras":              "Obras",
    "obras":                            "Obras",
    "portoões":                         "Portões",
    "portões":                          "Portões",
    "portas/fechaduras/molas":          ["Portas", "Fechaduras", "Molas"],
    "portas/fechaduras/vidros":         ["Portas", "Fechaduras", "Janelas / Vidros"],
    "limpeza":                          "Limpeza",
    "manutenção":                       "Manutenção",
    "jardinagem":                       "Jardinagem",
    "seguros":                          "Seguros",
    "piscina":                          "Piscina",
    "gestão":                           "Gestão",
    "eletricista":                      "Eletricista",
    "eletrecista":                      "Eletricista",
    "serralharia":                      "Serralharia",
    "fechaduras":                       "Fechaduras",
    "sistemas de segurança":            "Sistemas de Segurança",
    "engenharia":                       "Engenharia",
    "engenheiro":                       "Engenharia",
    "pesquisas":                        "Pesquisas",
    "video porteiro":                   "Vídeo Porteiro",
    "vídeo porteiro":                   "Vídeo Porteiro",
}


# ── Helpers de limpeza ────────────────────────────────────────────────────────

def normalizar_servicos(texto):
    if not texto or texto.strip().lower() in ('limpeza impar',):
        return []
    chave = texto.strip().lower()
    if chave in MAPA_SERVICOS:
        val = MAPA_SERVICOS[chave]
        return val if isinstance(val, list) else [val]
    partes = [p.strip() for p in re.split(r'\s*/\s*', texto)]
    resultado = []
    for parte in partes:
        c = parte.lower().strip()
        val = MAPA_SERVICOS.get(c)
        if not val:
            for k, v in MAPA_SERVICOS.items():
                if k in c:
                    val = v
                    break
        if val:
            if isinstance(val, list):
                resultado.extend(val)
            else:
                resultado.append(val)
        else:
            resultado.append(f'⚠️ {parte}')
    return list(dict.fromkeys(resultado))


def limpar_telefone(tel):
    if not tel: return None
    tel = str(tel).strip().replace('\xa0', '').replace(' ', '')
    tel = re.sub(r'[^\d+/]', '', tel)
    if '/' in tel:
        tel = tel.split('/')[0].strip()
    return tel or None


def limpar_email(email):
    if not email: return None
    email = str(email).strip().lower()
    return None if email in ('não têm', 'nao têm', 'n/a', '-', '', 'none') else email


def limpar_nif(nif):
    if not nif: return None
    nif = str(nif).strip().replace(' ', '')
    return nif if re.match(r'^\d{9}$', nif) else None


def limpar_iban(iban):
    if not iban: return None
    iban = str(iban).strip().replace(' ', '')
    return iban if iban.startswith('PT') else None


# ── Leitura de CSVs ───────────────────────────────────────────────────────────

def carregar_prestadores_csv(ficheiro_csv):
    """Carrega prestadores existentes — índice por email, telefone e nome."""
    by_email = {}
    by_tel   = {}
    by_nome  = {}
    try:
        with open(ficheiro_csv, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = (row.get('email') or '').strip().lower()
                tel   = (row.get('telefone') or '').strip()
                pid   = row.get('id')
                nome  = (row.get('nome') or '').strip()
                entry = {'id': pid, 'nome': nome, 'email': email, 'telefone': tel}
                if email: by_email[email]       = entry
                if tel:   by_tel[tel]           = entry
                if nome:  by_nome[nome.lower()] = entry
    except FileNotFoundError:
        print(f"❌ Ficheiro de prestadores não encontrado: {ficheiro_csv}")
        sys.exit(1)
    return by_email, by_tel, by_nome


def carregar_servicos_csv(ficheiro_csv):
    """Carrega serviços existentes — índice por nome (lowercase)."""
    servicos = {}
    try:
        with open(ficheiro_csv, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                nome = (row.get('nome') or '').strip()
                sid  = (row.get('id') or '').strip()
                if nome and sid:
                    servicos[nome.lower()] = {'id': sid, 'nome': nome}
    except FileNotFoundError:
        print(f"❌ Ficheiro de serviços não encontrado: {ficheiro_csv}")
        sys.exit(1)
    return servicos


def carregar_contactos_csv(ficheiro_csv):
    """Carrega contactos existentes — índice por (prestador_id, loja_id, email, telefone)."""
    contactos = {}
    try:
        with open(ficheiro_csv, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid    = str(row.get('prestador_id') or '').strip()
                loja   = str(row.get('loja_id') or '').strip()
                email  = (row.get('email') or '').strip().lower()
                tel    = (row.get('telefone') or '').strip()
                if pid:
                    contactos.setdefault(pid, []).append({
                        'loja_id':  loja,
                        'email':    email,
                        'telefone': tel,
                    })
    except FileNotFoundError:
        print(f"❌ Ficheiro de contactos não encontrado: {ficheiro_csv}")
        sys.exit(1)
    return contactos


def contacto_existe(prestador_id, loja_id, email, telefone, contactos_bd):
    """Verifica se já existe um contacto para este prestador+loja com este email ou telefone."""
    existentes = contactos_bd.get(str(prestador_id), [])
    loja_str   = str(loja_id) if loja_id else ''
    for c in existentes:
        if c['loja_id'] != loja_str:
            continue
        if email    and email.lower() == c['email']:    return True
        if telefone and telefone      == c['telefone']: return True
    return False


def lookup_prestador(email, telefone, nome, by_email, by_tel, by_nome):
    """Verifica duplicado localmente por email, telefone ou nome exato."""
    if email and email.lower() in by_email:
        return by_email[email.lower()]
    if telefone and telefone in by_tel:
        return by_tel[telefone]
    if nome and nome.lower() in by_nome:
        return by_nome[nome.lower()]
    return None


def resolver_servico(nome_servico, servicos_csv):
    """Devolve o registo do serviço ou None se não existir no CSV."""
    return servicos_csv.get(nome_servico.lower())


# ── Leitura do Excel ──────────────────────────────────────────────────────────

def ler_ficheiro():
    try:
        import openpyxl
    except ImportError:
        print("❌ openpyxl não instalado. Corre: pip install openpyxl")
        sys.exit(1)

    try:
        wb = openpyxl.load_workbook(FICHEIRO, read_only=True, data_only=True)
    except FileNotFoundError:
        print(f"❌ Ficheiro não encontrado: {FICHEIRO}")
        sys.exit(1)

    prestadores = {}

    for sheet in wb.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        if not rows: continue

        header_idx = None
        for i, row in enumerate(rows):
            row_text = ' '.join(str(c).lower() for c in row if c)
            if ('prestador' in row_text or 'nome' in row_text) and 'serviço' in row_text:
                header_idx = i
                break
        if header_idx is None: continue

        header = [str(c).lower().strip() if c else '' for c in rows[header_idx]]

        def col(keywords):
            for kw in keywords:
                for i, h in enumerate(header):
                    if h == kw: return i
            matches = []
            for kw in keywords:
                for i, h in enumerate(header):
                    if kw in h: matches.append((len(h), i))
            return sorted(matches)[0][1] if matches else None

        col_nome     = col(['prestador', 'nome'])
        col_contacto = col(['pessoa de contacto', 'contacto'])
        col_servico  = col(['serviço', 'servico', 'trabalho'])
        col_tel      = col(['telefon', 'tel'])
        col_email    = col(['email', 'e-mail'])
        col_nif      = col(['nif'])
        col_iban     = col(['iban'])
        col_loja     = col(['loja'])

        if col_nome is None: continue

        for row in rows[header_idx + 1:]:
            if not row or not row[col_nome]: continue
            nome = str(row[col_nome]).strip()
            if not nome or nome.lower() in ('nome', 'prestador de  serviços'): continue

            servico_raw = str(row[col_servico]).strip()  if col_servico  is not None and row[col_servico]  else ''
            contacto    = str(row[col_contacto]).strip() if col_contacto is not None and row[col_contacto] else None
            telefone    = limpar_telefone(row[col_tel]   if col_tel   is not None else None)
            email       = limpar_email(row[col_email]    if col_email is not None else None)
            nif         = limpar_nif(row[col_nif]        if col_nif   is not None else None)
            iban        = limpar_iban(row[col_iban]      if col_iban  is not None else None)
            loja_raw    = str(row[col_loja]).strip()     if col_loja  is not None and row[col_loja] else ''
            loja_id     = LOJAS.get(loja_raw.lower().strip())
            servicos    = normalizar_servicos(servico_raw)

            chave = nome.lower().strip()
            entrada_loja = {
                'loja_id': loja_id, 'loja_raw': loja_raw,
                'servicos': servicos, 'telefone': telefone,
                'email': email, 'contacto': contacto,
            }

            if chave in prestadores:
                prestadores[chave]['lojas_servicos'].append(entrada_loja)
                if not prestadores[chave]['nif']  and nif:  prestadores[chave]['nif']  = nif
                if not prestadores[chave]['iban'] and iban: prestadores[chave]['iban'] = iban
            else:
                prestadores[chave] = {
                    'nome': nome, 'nif': nif, 'iban': iban,
                    'servico_raw': servico_raw,
                    'lojas_servicos': [entrada_loja],
                }

    wb.close()
    return list(prestadores.values())


# ── API ───────────────────────────────────────────────────────────────────────

def api_call(method, path, body=None, token=None):
    url     = f"{API_BASE}{path}"
    payload = json.dumps(body).encode('utf-8') if body else None
    req     = urllib.request.Request(
        url, data=payload, method=method,
        headers={
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {token}',
            'User-Agent':    USER_AGENT,
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode('utf-8')}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Uso: python importar_prestadores.py <token> --bd=prestadores.csv --servicos=servicos.csv [--dry-run]")
        sys.exit(1)

    token   = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    ficheiro_bd        = None
    ficheiro_servicos  = None
    ficheiro_contactos = None
    for arg in sys.argv[2:]:
        if arg.startswith('--bd='):         ficheiro_bd        = arg[5:]
        if arg.startswith('--servicos='):   ficheiro_servicos  = arg[11:]
        if arg.startswith('--contactos='):  ficheiro_contactos = arg[12:]

    if not ficheiro_bd or not ficheiro_servicos:
        print("❌ É obrigatório indicar --bd=prestadores.csv e --servicos=servicos.csv")
        sys.exit(1)

    print(f"\n{'🔍 MODO DRY-RUN' if dry_run else '🚀 MODO IMPORTAÇÃO'}\n")

    print(f"📋 A carregar prestadores existentes de {ficheiro_bd}…")
    by_email, by_tel, by_nome = carregar_prestadores_csv(ficheiro_bd)
    print(f"   {len(by_email)} emails, {len(by_tel)} telefones, {len(by_nome)} nomes indexados")

    print(f"📋 A carregar serviços de {ficheiro_servicos}…")
    servicos_csv = carregar_servicos_csv(ficheiro_servicos)
    print(f"   {len(servicos_csv)} serviços: {', '.join(s['nome'] for s in servicos_csv.values())}")

    contactos_bd = {}
    if ficheiro_contactos:
        print(f"📋 A carregar contactos de {ficheiro_contactos}…")
        contactos_bd = carregar_contactos_csv(ficheiro_contactos)
        total_c = sum(len(v) for v in contactos_bd.values())
        print(f"   {total_c} contactos para {len(contactos_bd)} prestadores")
    else:
        print("⚠️  Sem --contactos= — contactos duplicados não serão detetados")
    print()

    print(f"📂 A ler {FICHEIRO}…")
    prestadores = ler_ficheiro()
    print(f"   {len(prestadores)} prestadores únicos\n")

    # ── Validação de serviços — bloqueia se houver algum não mapeado ──────────
    servicos_nao_mapeados = {}
    for p in prestadores:
        for ls in p['lojas_servicos']:
            for s in ls['servicos']:
                if s.startswith('⚠️'):
                    raw = s.replace('⚠️ ', '')
                    servicos_nao_mapeados.setdefault(raw, []).append(p['nome'])
                elif not resolver_servico(s, servicos_csv):
                    servicos_nao_mapeados.setdefault(s, []).append(p['nome'])

    if servicos_nao_mapeados:
        print("❌ SERVIÇOS NÃO ENCONTRADOS — corrige o Excel antes de importar:\n")
        for srv, afetados in sorted(servicos_nao_mapeados.items()):
            print(f"   '{srv}' → usado por: {', '.join(afetados)}")
        print(f"\n   Serviços disponíveis: {', '.join(s['nome'] for s in servicos_csv.values())}")
        print("\n✋ Importação cancelada.")
        sys.exit(1)

    # ── Preview ───────────────────────────────────────────────────────────────
    duplicados            = []
    sem_contacto          = []
    lojas_nao_encontradas = set()
    preview_contactos_novos   = 0
    preview_contactos_existentes = 0

    print("=" * 115)
    print(f"{'NOME':<35} {'NIF':<12} {'CONTACTO':<20} {'ESTADO':<20} {'LOJAS + SERVIÇOS'}")
    print("=" * 115)

    for p in prestadores:
        linhas_lojas = []
        multi_loja   = len(p['lojas_servicos']) > 1

        email_geral = next((ls['email']    for ls in p['lojas_servicos'] if ls.get('email')),    None)
        tel_geral   = next((ls['telefone'] for ls in p['lojas_servicos'] if ls.get('telefone')), None)
        dup         = lookup_prestador(email_geral, tel_geral, p['nome'], by_email, by_tel, by_nome)

        for ls in p['lojas_servicos']:
            loja_str = ls['loja_raw'] if ls['loja_raw'] else '(sem loja)'
            if ls['loja_raw'] and not ls['loja_id']:
                loja_str += ' ❌'
                lojas_nao_encontradas.add(ls['loja_raw'])
            if multi_loja and (ls['telefone'] or ls['email']):
                loja_str += ' 📞'
            servicos_ok = [s for s in ls['servicos'] if not s.startswith('⚠️')]
            srv_str = ', '.join(servicos_ok) if servicos_ok else '—'

            # Contagem de contactos no preview (só para prestadores existentes)
            if dup and ficheiro_contactos and (ls['email'] or ls['telefone']):
                if contacto_existe(dup['id'], ls['loja_id'], ls['email'], ls['telefone'], contactos_bd):
                    preview_contactos_existentes += 1
                else:
                    preview_contactos_novos += 1

            linhas_lojas.append(f"{loja_str}: {srv_str}")

        contactos_str = ', '.join(set(ls['contacto'] for ls in p['lojas_servicos'] if ls.get('contacto')))

        if dup:
            estado = f"ASSOCIAR (id={dup['id']})"
            duplicados.append({'nome': p['nome'], 'existente_id': dup['id'], 'existente_nome': dup['nome']})
        else:
            estado = 'CRIAR'
            # Prestadores novos — todos os contactos são novos
            if ficheiro_contactos:
                for ls in p['lojas_servicos']:
                    if ls['email'] or ls['telefone']:
                        preview_contactos_novos += 1

        if not email_geral and not tel_geral:
            sem_contacto.append(p['nome'])

        linha = f"{p['nome']:<35} {(p['nif'] or '—'):<12} {(contactos_str or '—'):<20} {estado:<20} {' | '.join(linhas_lojas)}"
        print(linha)

    print("=" * 115)
    print(f"\n📊 Resumo:")
    print(f"   Total no Excel:              {len(prestadores)}")
    print(f"   A criar (novos):             {len(prestadores) - len(duplicados)}")
    print(f"   A associar (já existentes):  {len(duplicados)}")
    if ficheiro_contactos:
        print(f"   Contactos a criar:           {preview_contactos_novos}")
        print(f"   Contactos já existentes:     {preview_contactos_existentes}")
    print(f"   Sem email/tel (atenção):     {len(sem_contacto)}{' ⚠️  ' + ', '.join(sem_contacto) if sem_contacto else ' ✅'}")
    print(f"   Lojas não encontradas:       {sorted(lojas_nao_encontradas) or '✅'}")

    if dry_run:
        print("\n✋ Dry-run concluído.")
        return

    # ── Importação ────────────────────────────────────────────────────────────
    print("\n🚀 A importar…")
    inseridos = 0; associados_srv = 0; contactos_criados = 0; erros = []

    for p in prestadores:
        multi_loja  = len(p['lojas_servicos']) > 1
        primeira    = p['lojas_servicos'][0]
        tel_geral   = primeira['telefone']
        email_geral = primeira['email']

        existente = lookup_prestador(email_geral, tel_geral, p['nome'], by_email, by_tel, by_nome)

        if existente:
            print(f"   ↳ '{p['nome']}' → existente id={existente['id']} ({existente['nome']})")
            prestador_id = existente['id']
        else:
            res = api_call('POST', '/prestadores', {
                'nome': p['nome'], 'nif': p['nif'], 'iban': p['iban'],
                'telefone': tel_geral, 'email': email_geral, 'ativo': True,
            }, token=token)

            if not res or not res.get('ok'):
                erros.append({'nome': p['nome'], 'motivo': str(res)}); continue

            prestador_id = res.get('id')
            inseridos += 1
            print(f"   ✅ '{p['nome']}' criado id={prestador_id}")

        for ls in p['lojas_servicos']:
            # Criar contacto se não existir para este prestador+loja+email/tel
            if ls['telefone'] or ls['email']:
                ja_existe = contacto_existe(
                    prestador_id, ls['loja_id'],
                    ls['email'], ls['telefone'],
                    contactos_bd
                )
                if not ja_existe:
                    res_c = api_call('POST', f'/prestadores/{prestador_id}/contactos', {
                        'telefone': ls['telefone'], 'email': ls['email'],
                        'loja_id': ls['loja_id'], 'principal': True,
                    }, token=token)
                    if res_c and res_c.get('ok'): contactos_criados += 1

            for nome_servico in [s for s in ls['servicos'] if not s.startswith('⚠️')]:
                srv = resolver_servico(nome_servico, servicos_csv)
                if not srv: continue
                res2 = api_call('POST', '/prestador-servicos', {
                    'prestador_id': prestador_id,
                    'servico_id':   srv['id'],
                    'loja_id':      ls['loja_id'],
                }, token=token)
                if res2 and res2.get('ok'): associados_srv += 1

    print(f"\n✅ Concluído:")
    print(f"   Prestadores criados:         {inseridos}")
    print(f"   Prestadores associados:      {len(duplicados)}")
    print(f"   Associações serviço:         {associados_srv}")
    print(f"   Contactos adicionais:        {contactos_criados}")
    if erros:
        print(f"\n⚠️  Erros ({len(erros)}):")
        for e in erros[:10]: print(f"   - {e['nome']}: {e['motivo']}")


if __name__ == '__main__':
    main()
