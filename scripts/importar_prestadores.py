#!/usr/bin/env python3
"""
importar_prestadores.py
Importa prestadores do ficheiro .xlsx

Uso:
    python importar_prestadores.py <token>             # importa
    python importar_prestadores.py <token> --dry-run   # só valida

Requer:
    pip install openpyxl
"""

import sys
import json
import re
import urllib.request
import urllib.error
import urllib.parse

API_BASE   = "https://api.condexpress.com"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
FICHEIRO   = "Prestadores.xlsx"

LOJAS = {
    "setubal": 7, "setúbal": 7,
    "amadora": 10, "barreiro": 3, "barreiro 1": 3, "barreiro 2": 4,
    "sesimbra": 1, "montijo": 2, "odivelas": 5, "oeiras": 8,
    "corroios": 11, "mem martins": 13, "torres vedras": 12,
    "algarve": 9, "lisboa": 6,
}

SERVICOS_NOVOS = ["Intercomunicadores", "Canalizadores", "Paineis Solares", "Bombas de Água"]

MAPA_SERVICOS = {
    "intercomunicadores":            "Intercomunicadores",
    "canalizadores":                 "Canalizadores",
    "canalização e desentupimentos": "Desentupimentos",
    "desentupimentos":               "Desentupimentos",
    "bombas de água":                "Bombas de Água",
    "bombas água":                   "Bombas de Água",
    "manutenção paineis solares":    "Paineis Solares",
    "paineis solares":               "Paineis Solares",
    "extintores/centrais de incendio": "Extintores",
    "extintores":                    "Extintores",
    "inspeção gás":                  "Inspeção Gás",
    "inspeção gas":                  "Inspeção Gás",
    "controlo de pragas / desinfestação": "Controlo de Pragas",
    "controlo de pragas":            "Controlo de Pragas",
    "elevadores":                    "Elevadores",
    "empreiteiro /obras":            "Obras",
    "empreiteiro / obras":           "Obras",
    "obras":                         "Obras",
    "portoões":                      "Portões",
    "portões":                       "Portões",
    "portas/fechaduras/molas":       ["Portas", "Fechaduras", "Molas"],
    "portas/fechaduras/vidros":      ["Portas", "Fechaduras", "Janelas / Vidros"],
    "limpeza":                       "Limpeza",
    "manutenção":                    "Manutenção",
    "jardinagem":                    "Jardinagem",
    "seguros":                       "Seguros",
    "piscina":                       "Piscina",
    "gestão":                        "Gestão",
    "eletricista":                   "Eletricista",
    "eletrecista":                   "Eletricista",
    "serralharia":                   "Serralharia",
    "fechaduras":                    "Fechaduras",
    "sistemas de segurança":         "Sistemas de Segurança",
    "engenharia":                    "Engenharia",
    "engenheiro":                    "Engenharia",
    "pesquisas":                     "Pesquisas",
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

        col_nome      = col(['prestador', 'nome'])
        col_contacto  = col(['pessoa de contacto', 'contacto'])
        col_servico   = col(['serviço', 'servico', 'trabalho'])
        col_tel       = col(['telefon', 'tel'])
        col_email     = col(['email', 'e-mail'])
        col_nif       = col(['nif'])
        col_iban      = col(['iban'])
        col_loja      = col(['loja'])

        print(f"   DEBUG headers: {header}")
        print(f"   DEBUG col_email={col_email}, col_tel={col_tel}")

        if col_nome is None: continue

        for row in rows[header_idx + 1:]:
            if not row or not row[col_nome]: continue
            nome = str(row[col_nome]).strip()
            if not nome or nome.lower() in ('nome', 'prestador de  serviços'): continue

            servico_raw = str(row[col_servico]).strip()   if col_servico  is not None and row[col_servico]  else ''
            contacto    = str(row[col_contacto]).strip() if col_contacto is not None and row[col_contacto] else None
            telefone    = limpar_telefone(row[col_tel]   if col_tel      is not None else None)
            email       = limpar_email(row[col_email]    if col_email    is not None else None)
            print(f"   DEBUG email raw='{row[col_email] if col_email is not None else None}' → {email}")
            nif         = limpar_nif(row[col_nif]        if col_nif      is not None else None)
            iban        = limpar_iban(row[col_iban]       if col_iban     is not None else None)
            loja_raw    = str(row[col_loja]).strip()     if col_loja     is not None and row[col_loja]     else ''
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


def lookup_prestador(email, telefone, token):
    """Verifica se já existe prestador com este email ou telefone."""
    params = []
    if email:    params.append(f"email={urllib.parse.quote(email)}")
    if telefone: params.append(f"telefone={urllib.parse.quote(telefone)}")
    if not params: return None

    path = f"/prestadores/lookup?{'&'.join(params)}"
    res  = api_call('GET', path, token=token)
    if res and res.get('found'):
        return res['prestador']
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Uso: python importar_prestadores.py <token> [--dry-run]")
        sys.exit(1)

    token   = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    print(f"\n{'🔍 MODO DRY-RUN' if dry_run else '🚀 MODO IMPORTAÇÃO'}\n")
    print(f"📂 A ler {FICHEIRO}…")
    prestadores = ler_ficheiro()
    print(f"   {len(prestadores)} prestadores únicos\n")

    print("🔗 A carregar serviços da BD…")
    data = api_call('GET', '/servicos', token=token)
    print(f"   DEBUG /servicos raw: {data}")
    servicos_bd = {s['nome']: s['id'] for s in (data.get('servicos') or [])}

    todos_necessarios = set(SERVICOS_NOVOS)
    for p in prestadores:
        for ls in p['lojas_servicos']:
            for s in ls['servicos']:
                if not s.startswith('⚠️'):
                    todos_necessarios.add(s)

    servicos_criar = [s for s in sorted(todos_necessarios) if s not in servicos_bd]

    if servicos_criar and not dry_run:
        print(f"   A criar serviços: {servicos_criar}")
        for nome_srv in servicos_criar:
            res = api_call('POST', '/servicos', {'nome': nome_srv, 'em_contrato': False, 'em_prestador': True}, token=token)
            print(f"   DEBUG lookup email={email} tel={telefone} → {res}")
            if res and res.get('ok'):
                servicos_bd[nome_srv] = res.get('id')
                print(f"   ✅ {nome_srv}")
    elif servicos_criar:
        print(f"   ⚠️  Serviços a criar: {servicos_criar}")

    print(f"   Serviços na BD: {sorted(servicos_bd.keys())}\n")

    # ── Preview ───────────────────────────────────────────────────────────────
    avisos = []
    duplicados = []
    lojas_nao_encontradas = set()
    servicos_nao_bd = set()

    print("=" * 110)
    print(f"{'NOME':<35} {'NIF':<12} {'CONTACTO':<15} {'LOJAS + SERVIÇOS'}")
    print("=" * 110)

    for p in prestadores:
        linhas_lojas = []
        tem_aviso    = False
        multi_loja   = len(p['lojas_servicos']) > 1

        for ls in p['lojas_servicos']:
            servicos_ok   = [s for s in ls['servicos'] if not s.startswith('⚠️')]
            servicos_warn = [s for s in ls['servicos'] if s.startswith('⚠️')]
            nao_na_bd     = [s for s in servicos_ok if s not in servicos_bd and s not in SERVICOS_NOVOS]

            loja_str = ls['loja_raw'] if ls['loja_raw'] else '(sem loja)'
            if ls['loja_raw'] and not ls['loja_id']:
                loja_str += ' ❌'; lojas_nao_encontradas.add(ls['loja_raw'])
            if multi_loja and (ls['telefone'] or ls['email']):
                loja_str += ' 📞'

            srv_str = ', '.join(servicos_ok) if servicos_ok else '—'
            if servicos_warn:
                srv_str += '  ⚠️ ' + ', '.join(s.replace('⚠️ ', '') for s in servicos_warn)
                tem_aviso = True
            if nao_na_bd:
                srv_str += f'  ❌ NÃO NA BD: {", ".join(nao_na_bd)}'
                servicos_nao_bd.update(nao_na_bd); tem_aviso = True

            linhas_lojas.append(f"{loja_str}: {srv_str}")

        contactos_str = ', '.join(set(ls['contacto'] for ls in p['lojas_servicos'] if ls.get('contacto')))
        linha = f"{p['nome']:<35} {(p['nif'] or '—'):<12} {(contactos_str or '—'):<15} {' | '.join(linhas_lojas)}"
        print(linha)
        if tem_aviso: avisos.append(p['nome'])

        # Verificar duplicado na BD (em dry-run e em importação)
        email_geral = next((ls['email']    for ls in p['lojas_servicos'] if ls.get('email')),    None)
        tel_geral   = next((ls['telefone'] for ls in p['lojas_servicos'] if ls.get('telefone')), None)
        if email_geral or tel_geral:
            dup = lookup_prestador(email_geral, tel_geral, token)
            if dup:
                print(f"   ↳ ⚠️  DUP: já existe id={dup['id']} ({dup['nome']}) — será associado sem criar")
                duplicados.append({'nome': p['nome'], 'existente_id': dup['id'], 'existente_nome': dup['nome']})

    print("=" * 110)
    print(f"\n📊 Resumo:")
    print(f"   Total:                  {len(prestadores)}")
    print(f"   Com avisos:             {len(avisos)}")
    print(f"   Duplicados na BD:       {len(duplicados)}")
    print(f"   Lojas não encontradas:  {sorted(lojas_nao_encontradas) or '✅'}")
    print(f"   Serviços não na BD:     {sorted(servicos_nao_bd) or '✅'}")
    if servicos_criar: print(f"   Serviços a criar:       {servicos_criar}")

    if dry_run:
        print("\n✋ Dry-run concluído.")
        return

    # ── Importação ────────────────────────────────────────────────────────────
    print("\n🚀 A importar…")
    inseridos = 0; associados = 0; contactos = 0; erros = []

    for p in prestadores:
        multi_loja  = len(p['lojas_servicos']) > 1
        primeira    = p['lojas_servicos'][0]
        tel_geral   = primeira['telefone']
        email_geral = primeira['email']

        # ── Verificar duplicado ──────────────────────────────────────────────
        existente = lookup_prestador(email_geral, tel_geral, token)
        if existente:
            print(f"   ⚠️  '{p['nome']}' já existe (id={existente['id']}, {existente['nome']}) — a associar sem criar")
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

        for ls in p['lojas_servicos']:
            if multi_loja and (ls['telefone'] or ls['email']):
                res_c = api_call('POST', f'/prestadores/{prestador_id}/contactos', {
                    'telefone': ls['telefone'], 'email': ls['email'],
                    'loja_id': ls['loja_id'], 'principal': True,
                }, token=token)
                if res_c and res_c.get('ok'): contactos += 1

            for nome_servico in [s for s in ls['servicos'] if not s.startswith('⚠️')]:
                servico_id = servicos_bd.get(nome_servico)
                if not servico_id: continue
                res2 = api_call('POST', '/prestador-servicos', {
                    'prestador_id': prestador_id,
                    'servico_id':   servico_id,
                    'loja_id':      ls['loja_id'],
                }, token=token)
                if res2 and res2.get('ok'): associados += 1

    print(f"\n✅ Concluído:")
    print(f"   Prestadores criados:    {inseridos}")
    print(f"   Prestadores associados: {len(duplicados)}")
    print(f"   Associações serviço:    {associados}")
    print(f"   Contactos:              {contactos}")
    if erros:
        print(f"\n⚠️  Erros ({len(erros)}):")
        for e in erros[:10]: print(f"   - {e['nome']}: {e['motivo']}")


if __name__ == '__main__':
    main()
