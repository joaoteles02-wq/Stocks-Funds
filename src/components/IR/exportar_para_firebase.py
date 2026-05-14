"""
exportar_para_firebase.py
=========================
Lê o CSV da tabela de ações e faz upload das operações
para o Firebase Firestore, na coleção 'operacoes'.
"""

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import os
import sys
from datetime import datetime

# ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

CSV_PATH        = "operacoes.csv"          # caminho do seu CSV exportado
KEY_PATH        = "firebase_key.json"      # chave de serviço do Firebase
COLLECTION_NAME = "operacoes"              # nome da coleção no Firestore
SEPARATOR       = ";"                      # separador do CSV (use "\t" para TSV)
DECIMAL         = ","                      # separador decimal do CSV

# ETFs conhecidos — sem isenção de R$ 20k
ETF_LIST = [
    "IVVB11","BOVA11","SMAL11","HASH11","GOLD11",
    "SPXI11","XFIX11","KFOF11","DIVO11","FIND11",
]

# ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────

def init_firebase():
    if not os.path.exists(KEY_PATH):
        print(f"[ERRO] Arquivo de chave não encontrado: {KEY_PATH}")
        sys.exit(1)
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
    return firestore.client()

# ─── LEITURA DO CSV ───────────────────────────────────────────────────────────

def ler_csv(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        print(f"[ERRO] CSV não encontrado: {path}")
        sys.exit(1)

    df = pd.read_csv(
        path,
        sep=SEPARATOR,
        decimal=DECIMAL,
        encoding="utf-8-sig",
        dtype=str,
    )

    df.columns = [c.strip().upper() for c in df.columns]
    df.dropna(how="all", inplace=True)
    return df

# ─── CONVERSÃO ───────────────────────────────────────────────────────────────

def parse_float(val) -> float:
    if pd.isna(val) or str(val).strip() in ("", "-"):
        return 0.0
    return float(
        str(val)
        .replace("R$", "")
        .replace(" ", "")
        .replace(".", "")
        .replace(",", ".")
    )

def parse_date_script(val) -> str:
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s

def converter_linha(row: pd.Series) -> dict:
    papel = str(row.get("PAPEL", "")).strip().upper()
    tipo  = str(row.get("OP", "")).strip().upper()

    return {
        "data":      parse_date_script(row.get("DATA", "")),
        "papel":     papel,
        "tipo":      tipo,
        "qtd":       parse_float(row.get("QTD")),
        "preco":     parse_float(row.get("PREÇO") or row.get("PRECO")),
        "custo":     parse_float(row.get("CUS.T.") or row.get("CUSTO")),
        "rateio":    parse_float(row.get("RAT.") or row.get("RATEIO")),
        "totalOp":   parse_float(row.get("TOTAL OP")),
        "vLiquido":  parse_float(row.get("V. LIQUIDO") or row.get("VLIQUIDO")),
        "estoque":   parse_float(row.get("ESTOQUE")),
        "pmedio":    parse_float(row.get("PMEDIO") or row.get("PREÇO MÉDIO")),
        "ganhoPerda":parse_float(row.get("GAN/PER")),
        "irMes":     parse_float(row.get("IR MÊS") or row.get("IR MES")),
        "etf":       papel in ETF_LIST,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }

# ─── UPLOAD ───────────────────────────────────────────────────────────────────

def upload(db, registros: list[dict]):
    colecao = db.collection(COLLECTION_NAME)
    batch   = db.batch()
    count   = 0

    for i, reg in enumerate(registros):
        doc_id = f"{reg['data']}_{reg['papel']}_{reg['tipo']}_{i:04d}"
        ref    = colecao.document(doc_id)
        batch.set(ref, reg)
        count += 1
        if count % 500 == 0:
            batch.commit()
            batch = db.batch()

    batch.commit()
    print(f"[OK] {count} registros salvos")

def main():
    db = init_firebase()
    df = ler_csv(CSV_PATH)
    registros = [converter_linha(row) for _, row in df.iterrows()]
    registros = [r for r in registros if r["papel"] and r["tipo"] in ("C", "V", "D")]
    upload(db, registros)

if __name__ == "__main__":
    main()
