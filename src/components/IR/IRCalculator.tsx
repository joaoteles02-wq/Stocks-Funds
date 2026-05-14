/**
 * IRCalculator.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo de cálculo de IR sobre ações — integrado ao Firebase Firestore.
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  where,
} from "firebase/firestore";
import { db, auth } from "../../lib/firebase"; 
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Plus,
  Trash2,
  Upload,
  BarChart2,
  Briefcase,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type OpTipo = "C" | "V" | "D";
type Atividade = "Swing Trade" | "Day Trade";
type ClasseAtivo = "Ação" | "ETF" | "FII" | "BDR";

interface Operacao {
  id?: string;
  data: string;
  papel: string;
  tipo: OpTipo;
  atividade: Atividade;
  classe: ClasseAtivo;
  qtd: number;
  preco: number;
  custo: number;
  rateio: number;
  // calculados
  totalOp?: number;
  vLiquido?: number;
  estoque?: number;
  pmedio?: number;
  ganhoPerda?: number | null;
  userId?: string;
  updatedAt?: unknown;
}

interface ResumoMes {
  mesKey: string;
  label: string;
  vendasAcoesST: number;
  etfVendas: number;
  totalVendas: number;
  
  ganhoST: number;
  perdaST: number;
  ganhos: number;
  perdas: number;
  etfGanhos: number;
  etfPerdas: number;
  
  ganhoDT: number;
  perdaDT: number;
  ganhoFII: number;
  perdaFII: number;
  
  prejCompensadoST: number;
  prejCompensadoDT: number;
  prejCompensadoFII: number;
  prejCompensado: number;
  
  saldoPrejuizoST: number;
  saldoPrejuizoDT: number;
  saldoPrejuizoFII: number;
  saldoPrejuizo: number;
  
  irAcoesST: number;
  irEtfST: number;
  irDT: number;
  irFII: number;
  irTotal: number;
  isentoST: boolean;
}

interface Posicao {
  papel: string;
  qtd: number;
  pmedio: number;
  custoTotal: number;
  classe: ClasseAtivo;
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────

const ETF_LIST = [
  "IVVB11","BOVA11","SMAL11","HASH11","GOLD11",
  "SPXI11","XFIX11","KFOF11","DIVO11","FIND11",
];

const COLECAO = "operacoes";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const parseDateText = (s: string | undefined | null) => {
  if (!s) return new Date();
  const clean = String(s).trim();
  if (clean.includes("/")) {
    const [d, m, y] = clean.split("/");
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  if (clean.includes("-")) {
    return new Date(clean + "T00:00:00");
  }
  return new Date();
};

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (mk: string) => {
  const [y, m] = mk.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
};

// ─── LÓGICA DE CÁLCULO ───────────────────────────────────────────────────────

function processarOperacoes(raw: Operacao[]): Operacao[] {
  const sorted = [...raw].sort(
    (a, b) => parseDateText(a.data).getTime() - parseDateText(b.data).getTime()
  );

  const stock: Record<string, number> = {};
  const pmedio: Record<string, number> = {};

  return sorted.map((op) => {
    const p = op.papel.toUpperCase();
    if (!stock[p]) { stock[p] = 0; pmedio[p] = 0; }

    let classe = op.classe || "Ação";
    if (ETF_LIST.includes(p)) classe = "ETF";
    else if (p.endsWith("11") && !ETF_LIST.includes(p)) classe = "FII";

    if (op.tipo === "C") {
      const totalCost = op.qtd * op.preco + op.custo + op.rateio;
      const newQtd = stock[p] + op.qtd;
      pmedio[p] = (stock[p] * pmedio[p] + totalCost) / newQtd;
      stock[p] = newQtd;
      return {
        ...op,
        classe,
        totalOp: op.qtd * op.preco,
        vLiquido: -(op.qtd * op.preco + op.custo + op.rateio),
        estoque: stock[p],
        pmedio: pmedio[p],
        ganhoPerda: null,
      };
    }

    if (op.tipo === "V") {
      const receita = op.qtd * op.preco - op.custo - op.rateio;
      const custo = op.qtd * pmedio[p];
      const ganho = receita - custo;
      stock[p] = Math.max(0, stock[p] - op.qtd);
      const pm = pmedio[p];
      if (stock[p] === 0) pmedio[p] = 0;
      return {
        ...op,
        classe,
        totalOp: op.qtd * op.preco,
        vLiquido: receita,
        estoque: stock[p],
        pmedio: pm,
        ganhoPerda: ganho,
      };
    }

    // Dividendo
    return {
      ...op,
      classe,
      totalOp: op.preco,
      vLiquido: op.preco,
      estoque: stock[p] || 0,
      pmedio: pmedio[p] || 0,
      ganhoPerda: op.preco,
    };
  });
}

function calcularResumo(ops: Operacao[], prejInicialAnterior: { st: number; dt: number; fii: number }): ResumoMes[] {
  const months: Record<string, {
    vendasAcoesST: number;
    ganhosST: number; perdasST: number;
    ganhosDT: number; perdasDT: number;
    ganhosFII: number; perdasFII: number;
    vendasEtfST: number;
    ganhosEtfST: number; perdasEtfST: number;
  }> = {};

  ops.filter((o) => o.tipo === "V").forEach((op) => {
    const mk = monthKey(parseDateText(op.data));
    if (!months[mk]) {
      months[mk] = { 
        vendasAcoesST: 0, 
        ganhosST: 0, perdasST: 0, 
        ganhosDT: 0, perdasDT: 0,
        ganhosFII: 0, perdasFII: 0,
        vendasEtfST: 0,
        ganhosEtfST: 0, perdasEtfST: 0,
      };
    }
    
    const g = op.ganhoPerda || 0;
    const isDT = op.atividade === "Day Trade";

    if (op.classe === "FII") {
      if (g > 0) months[mk].ganhosFII += g;
      else months[mk].perdasFII += g;
    } else if (isDT) {
      if (g > 0) months[mk].ganhosDT += g;
      else months[mk].perdasDT += g;
    } else if (op.classe === "ETF") {
      months[mk].vendasEtfST += op.totalOp || 0;
      if (g > 0) months[mk].ganhosEtfST += g;
      else months[mk].perdasEtfST += g;
    } else {
      months[mk].vendasAcoesST += op.totalOp || 0;
      if (g > 0) months[mk].ganhosST += g;
      else months[mk].perdasST += g;
    }
  });

  let cumLossST = -Math.abs(prejInicialAnterior.st); 
  let cumLossDT = -Math.abs(prejInicialAnterior.dt);
  let cumLossFII = -Math.abs(prejInicialAnterior.fii);

  return Object.keys(months).sort().map((mk) => {
    const m = months[mk];
    
    // 1. SWING TRADE
    const lucroAcoesST = m.ganhosST + m.perdasST;
    const lucroEtfST = m.ganhosEtfST + m.perdasEtfST;
    const lucroTotalST = lucroAcoesST + lucroEtfST;

    const isentoST = m.vendasAcoesST <= 20000;
    let compensadoST = 0;
    let irST = 0;

    if (lucroTotalST > 0) {
      const lucroCompensado = Math.max(0, lucroTotalST + cumLossST);
      compensadoST = Math.min(lucroTotalST, Math.abs(cumLossST));
      cumLossST = Math.min(0, lucroTotalST + cumLossST);
      
      if (lucroCompensado > 0) {
        if (isentoST) {
          if (lucroEtfST > 0) {
            const baseEtf = Math.min(lucroCompensado, lucroEtfST);
            irST = Math.max(0, baseEtf) * 0.15;
          }
        } else {
          irST = lucroCompensado * 0.15;
        }
      }
    } else {
      cumLossST += lucroTotalST;
    }

    // 2. DAY TRADE
    const lucroMesDT = m.ganhosDT + m.perdasDT;
    let compensadoDT = 0;
    let irDT = 0;
    if (lucroMesDT > 0) {
      const lucroCompensado = Math.max(0, lucroMesDT + cumLossDT);
      compensadoDT = Math.min(lucroMesDT, Math.abs(cumLossDT));
      cumLossDT = Math.min(0, lucroMesDT + cumLossDT);
      irDT = lucroCompensado * 0.20;
    } else {
      cumLossDT += lucroMesDT;
    }

    // 3. FIIs
    const lucroMesFII = m.ganhosFII + m.perdasFII;
    let compensadoFII = 0;
    let irFII = 0;
    if (lucroMesFII > 0) {
      const lucroCompensado = Math.max(0, lucroMesFII + cumLossFII);
      compensadoFII = Math.min(lucroMesFII, Math.abs(cumLossFII));
      cumLossFII = Math.min(0, lucroMesFII + cumLossFII);
      irFII = lucroCompensado * 0.20;
    } else {
      cumLossFII += lucroMesFII;
    }

    return {
      mesKey: mk, label: monthLabel(mk),
      vendasAcoesST: m.vendasAcoesST,
      ganhoST: m.ganhosST + m.ganhosEtfST, 
      perdaST: m.perdasST + m.perdasEtfST,
      ganhoDT: m.ganhosDT, 
      perdaDT: m.perdasDT,
      ganhoFII: m.ganhosFII, 
      perdaFII: m.perdasFII,
      etfVendas: m.vendasEtfST,
      etfGanhos: m.ganhosEtfST, 
      etfPerdas: m.perdasEtfST,
      totalVendas: m.vendasAcoesST + m.vendasEtfST,
      ganhos: m.ganhosST + m.ganhosEtfST, 
      perdas: m.perdasST + m.perdasEtfST,

      prejCompensadoST: compensadoST,
      prejCompensadoDT: compensadoDT,
      prejCompensadoFII: compensadoFII,
      prejCompensado: compensadoST + compensadoDT + compensadoFII,

      saldoPrejuizoST: Math.abs(cumLossST),
      saldoPrejuizoDT: Math.abs(cumLossDT),
      saldoPrejuizoFII: Math.abs(cumLossFII),
      saldoPrejuizo: Math.abs(cumLossST + cumLossDT + cumLossFII),

      irAcoesST: irST, // irST já contempla ETF se necessário
      irEtfST: 0, // simplificado acima
      irDT, irFII,
      irTotal: irST + irDT + irFII,
      isentoST,
    };
  });
}

function calcularPosicao(ops: Operacao[]): Posicao[] {
  const stock: Record<string, number> = {};
  const pmedio: Record<string, number> = {};
  const classeMap: Record<string, ClasseAtivo> = {};
  ops.forEach((op) => {
    const p = op.papel;
    if (!stock[p]) { stock[p] = 0; pmedio[p] = 0; }
    classeMap[p] = op.classe;
    if (op.tipo === "C") {
      const newQtd = stock[p] + op.qtd;
      pmedio[p] = (stock[p] * pmedio[p] + op.qtd * op.preco + op.custo + op.rateio) / newQtd;
      stock[p] = newQtd;
    } else if (op.tipo === "V" || op.tipo === "D") {
      stock[p] = Math.max(0, stock[p] - op.qtd);
      if (stock[p] === 0) pmedio[p] = 0;
    }
  });
  return Object.entries(stock)
    .filter(([, q]) => q > 0)
    .map(([papel, qtd]) => ({
      papel, qtd, pmedio: pmedio[papel],
      custoTotal: qtd * pmedio[papel], classe: classeMap[papel] || "Ação",
    }));
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

type Tab = "lancamentos" | "resumo" | "posicao" | "importar";

interface IRCalculatorProps {
  mainRows: any[] | null;
  userId: string | null | undefined;
}

export default function IRCalculator({ mainRows, userId }: IRCalculatorProps) {
  const [rawOps, setRawOps] = useState<Operacao[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("lancamentos");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Filtros
  const [filterTicker, setFilterTicker] = useState("");
  const [filterYear, setFilterYear] = useState("");

  // Prejuízo anterior
  const [prejInicial, setPrejInicial] = useState({ st: 0, dt: 0, fii: 0 });

  // CSV import
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const parseMoneyLocal = (val: any) => {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === 'number') return val;
    let str = String(val).replace(/US\$\s?/gi, "").replace(/R\$\s?/gi, "").replace(/\$\s?/g, "").trim();
    if (str === "" || str.toLowerCase() === "nan") return 0;
    const isNegative = str.includes('(') || str.startsWith('-');
    str = str.replace(/[()\-]/g, "").trim();
    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        str = str.replace(/\./g, "").replace(",", ".");
      } else {
        str = str.replace(/,/g, "");
      }
    } else if (str.includes(',')) {
      str = str.replace(",", ".");
    }
    const num = parseFloat(str);
    return isNegative ? -num : num;
  };

  async function syncFromMain() {
    console.log("Iniciando sincronização. Dados recebidos do App.tsx:", mainRows);
    
    if (!mainRows || mainRows.length === 0) {
      setImportMsg("⚠️ Histórico principal vazio. Importe um arquivo primeiro.");
      return;
    }

    setSyncing(true);
    setImportMsg("Analisando dados do histórico...");
    
    try {
      // 1. Limpar registros antigos de IR
      let batch = writeBatch(db);
      let deleteCount = 0;
      for (const op of rawOps) {
        if (op.id) {
          batch.delete(doc(db, COLECAO, op.id));
          deleteCount++;
          if (deleteCount % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
      }
      if (deleteCount % 400 !== 0) await batch.commit();

      // 2. Sincronizar novos
      batch = writeBatch(db);
      let syncCount = 0;
      let ignoredCount = 0;

      for (const row of mainRows) {
        // Mapeamento flexível de colunas
        const transRaw = String(row["Transação"] || row["OP"] || row["Operação"] || "").trim().toUpperCase();
        const papel = String(row["Ticker"] || row["Papel"] || row["Ativo"] || row["Ações"] || "").trim().toUpperCase();
        
        // Identificar tipo
        let tipo: OpTipo | null = null;
        if (transRaw.includes("COMPRA") || transRaw.includes("BUY") || transRaw === "C") tipo = "C";
        else if (transRaw.includes("VENDA") || transRaw.includes("SELL") || transRaw === "V") tipo = "V";

        // Identificar Atividade
        const ativRaw = String(row["Tipo/Atividade"] || row["Atividade"] || "").trim().toUpperCase();
        let atividade: Atividade = "Swing Trade";
        if (ativRaw.includes("DAY TRADE") || ativRaw.includes("DAYTRADE")) atividade = "Day Trade";

        if (!tipo || !papel) {
          ignoredCount++;
          continue;
        }

        const qtd = Math.abs(parseMoneyLocal(row["UN"] || row["Qtd"] || row["Quantidade"] || row["Quantity"]));
        const preco = Math.abs(parseMoneyLocal(row["Preço Un de Custo"] || row["Preço"] || row["Valor Unitário"] || row["Price"]));
        const explicitCusto = row["Custos"] ? Math.abs(parseMoneyLocal(row["Custos"])) : 0;
        const explicitRateio = row["Rateio"] ? Math.abs(parseMoneyLocal(row["Rateio"])) : 0;

        let custo = 0;
        if (explicitCusto > 0) {
          custo = explicitCusto;
        } else {
          const total = Math.abs(parseMoneyLocal(row["Total do Custo"] || row["Total"] || row["Valor Total"] || row["Amount"]));
          custo = Math.max(0, total - (qtd * preco));
        }
        
        const rateio = explicitRateio;

        let data = String(row["Data"] || "").trim();
        if (data.includes("/")) {
          const parts = data.split("/");
          if (parts.length === 3) {
            data = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
          }
        }

        const newDocRef = doc(collection(db, COLECAO));
        batch.set(newDocRef, {
          userId,
          data,
          papel,
          tipo,
          atividade,
          qtd,
          preco,
          custo,
          rateio,
          updatedAt: serverTimestamp(),
        });
        
        syncCount++;
        if (syncCount % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      
      if (syncCount % 400 !== 0) await batch.commit();
      
      setImportMsg(`✓ Sincronizado: ${syncCount} itens. (Ignorados: ${ignoredCount})`);
    } catch (e: any) {
      console.error("Erro na sincronização:", e);
      setImportMsg("Erro: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  // ── Firebase listener ──
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, COLECAO),
      where("userId", "==", userId),
      orderBy("data", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setRawOps(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Operacao)));
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  // ── Dados calculados ──
  const ops      = useMemo(() => processarOperacoes(rawOps), [rawOps]);
  
  const filteredOps = useMemo(() => {
    return ops.filter(op => {
      const matchTicker = !filterTicker || op.papel.toUpperCase().includes(filterTicker.toUpperCase());
      const matchYear = !filterYear || op.data.startsWith(filterYear);
      return matchTicker && matchYear;
    });
  }, [ops, filterTicker, filterYear]);

  const resumo   = useMemo(() => calcularResumo(ops, prejInicial), [ops, prejInicial]);
  const posicao  = useMemo(() => calcularPosicao(ops), [ops]);

  const totalGanho = resumo.reduce((a, m) => a + m.ganhoST + m.ganhoDT + m.ganhoFII, 0);
  const totalPerda = resumo.reduce((a, m) => a + m.perdaST + m.perdaDT + m.perdaFII, 0);
  const totalIR    = resumo.reduce((a, m) => a + m.irTotal, 0);
  const saldoNet   = totalGanho + totalPerda;

  // ── Remover operação ──
  async function removeOp(id: string) {
    if (!id) return;
    await deleteDoc(doc(db, COLECAO, id));
  }

  // ── Importar CSV ──
  async function importCSV() {
    if (!csvText.trim()) { setImportMsg("Cole os dados primeiro."); return; }
    const lines = csvText.trim().split("\n").filter((l) => l.trim());
    const sep = lines[0].includes("\t") ? "\t" : ";";
    const header = lines[0].split(sep).map((h) => h.trim().toUpperCase());
    const idx = {
      data:  header.findIndex((h) => h.includes("DATA")),
      papel: header.findIndex((h) => h.includes("PAPEL")),
      op:    header.findIndex((h) => h === "OP"),
      qtd:   header.findIndex((h) => h === "QTD"),
      preco: header.findIndex((h) => h.includes("PRE")),
      custo: header.findIndex((h) => h.includes("CUS")),
      rat:   header.findIndex((h) => h.includes("RAT")),
    };

    const pf = (v: string) => parseFloat(v.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
    let count = 0;

    for (const line of lines.slice(1)) {
      const cols = line.split(sep).map((c) => c.trim());
      const tipo = (cols[idx.op] || "").toUpperCase() as OpTipo;
      const papel = (cols[idx.papel] || "").toUpperCase().trim();
      if (!papel || !["C", "V", "D"].includes(tipo)) continue;

      // Normalizar data para ISO
      let data = (cols[idx.data] || "").trim();
      if (data.includes("/")) {
        const [d, m, y] = data.split("/");
        data = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
      }

      await addDoc(collection(db, COLECAO), {
        userId,
        data, papel, tipo,
        qtd:    pf(cols[idx.qtd]  || "0"),
        preco:  pf(cols[idx.preco] || "0"),
        custo:  pf(cols[idx.custo] || "0"),
        rateio: pf(cols[idx.rat]  || "0"),
        etf: ETF_LIST.includes(papel),
        updatedAt: serverTimestamp(),
      });
      count++;
    }
    setImportMsg(`✓ ${count} operações importadas com sucesso!`);
    setCsvText("");
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "lancamentos", label: "Sincronizados",  icon: <FileText size={14} /> },
    { id: "resumo",      label: "Resumo IR",    icon: <BarChart2 size={14} /> },
    { id: "posicao",     label: "Posição",      icon: <Briefcase size={14} /> },
    { id: "importar",    label: "Importar CSV", icon: <Upload size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-6 font-sans">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Calculadora de IR — B3
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Sincronizado com Firebase · {rawOps.length} operações
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Ganhos Brutos",    value: fmt(totalGanho), color: "text-emerald-400" },
            { label: "Perdas Brutas",    value: fmt(totalPerda), color: "text-red-400" },
            { label: "Ganho / Perda",    value: fmt(saldoNet),   color: saldoNet >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Prej. Acumulado",  value: fmt(resumo.length ? resumo[resumo.length-1].saldoPrejuizo : 0), color: "text-amber-400" },
            { label: "IR Total Devido",  value: fmt(totalIR),    color: "text-white" },
          ].map((c) => (
            <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-lg font-medium ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-800 pb-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-t-lg transition-colors
                ${activeTab === t.id
                  ? "bg-gray-900 text-white border border-b-gray-900 border-gray-800 -mb-px"
                  : "text-gray-500 hover:text-gray-300"}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >

            {/* ── LANÇAMENTOS ── */}
            {activeTab === "lancamentos" && (
              <div className="space-y-4">
                {/* Filtros em linha */}
                <div className="flex flex-wrap gap-3 mb-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <input
                      type="text"
                      placeholder="Filtrar por Ticker (ex: PETR4)"
                      value={filterTicker}
                      onChange={(e) => setFilterTicker(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="relative w-32">
                    <input
                      type="text"
                      placeholder="Ano (ex: 2024)"
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2 px-3 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                    {loading ? (
                      <div className="flex items-center justify-center p-8 text-gray-500 gap-2">
                        <RefreshCw size={14} className="animate-spin" /> Carregando...
                      </div>
                    ) : filteredOps.length === 0 ? (
                      <div className="text-center text-gray-600 py-12 text-sm">
                        Nenhum lançamento corresponde ao filtro
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-30">
                          <tr className="border-b border-gray-800">
                            <th className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap sticky top-0 left-0 bg-gray-900 z-40 w-[90px] min-w-[90px]">Data</th>
                            <th className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap sticky top-0 left-[90px] bg-gray-900 z-40 w-[80px] min-w-[80px] shadow-[1px_0_0_0_#1f2937]">Ticker</th>
                            {["Classe","Ativ.","Op","Qtd","Preço","Custo","Total Op","Rateio","V.Líquido","Estoque","PM","G/P",""].map((h) => (
                              <th key={h} className="text-left px-3 py-3 text-gray-500 font-medium whitespace-nowrap bg-gray-900 shadow-[0_1px_0_0_#1f2937]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOps.map((op, i) => (
                            <motion.tr
                              key={op.id || i}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="group border-b border-gray-800/50 hover:bg-gray-800/30"
                            >
                              <td className="px-3 py-2 text-gray-400 sticky left-0 bg-gray-900 z-10 w-[90px] min-w-[90px] group-hover:bg-[#1a202c]">{op.data}</td>
                              <td className="px-3 py-2 font-medium text-white sticky left-[90px] bg-gray-900 z-10 w-[80px] min-w-[80px] shadow-[1px_0_0_0_#1f2937] group-hover:bg-[#1a202c]">
                                {op.papel}
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-[10px] text-gray-500">{op.classe}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[9px] px-1 rounded uppercase min-w-[70px] text-center ${op.atividade === 'Day Trade' ? 'text-orange-400 bg-orange-900/20' : 'text-blue-400 bg-blue-900/20'}`}>
                                  {op.atividade === 'Day Trade' ? 'Day Trade' : 'Swing Trade'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium
                                  ${op.tipo==="C"?"bg-emerald-900/50 text-emerald-400":
                                    op.tipo==="V"?"bg-red-900/50 text-red-400":
                                    "bg-blue-900/50 text-blue-400"}`}>
                                  {op.tipo}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-300">{op.tipo==="D"?"—":num(op.qtd, 0)}</td>
                              <td className="px-3 py-2 text-gray-300">{op.tipo==="D"?"—":num(op.preco)}</td>
                              <td className="px-3 py-2 text-gray-400">{num(op.custo)}</td>
                              <td className="px-3 py-2 text-gray-300">{num(op.totalOp||0)}</td>
                              <td className="px-3 py-2 text-gray-400">{num(op.rateio)}</td>
                              <td className={`px-3 py-2 ${(op.vLiquido||0)>=0?"text-emerald-400":"text-red-400"}`}>
                                {num(op.vLiquido||0)}
                              </td>
                              <td className="px-3 py-2 text-gray-300">{op.tipo==="D"?"—":num(op.estoque||0, 0)}</td>
                              <td className="px-3 py-2 text-gray-400">{op.pmedio?num(op.pmedio, 3):"—"}</td>
                              <td className="px-3 py-2">
                                {op.ganhoPerda != null ? (
                                  <span className={op.ganhoPerda >= 0 ? "text-emerald-400" : "text-red-400"}>
                                    {op.ganhoPerda >= 0 ? "+" : ""}{num(op.ganhoPerda)}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => op.id && removeOp(op.id)}
                                  className="text-gray-600 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── RESUMO IR ── */}
            {activeTab === "resumo" && (
              <div className="space-y-3">
                {resumo.length === 0 ? (
                  <div className="text-center text-gray-600 py-16 text-sm">Nenhuma venda registrada ainda</div>
                ) : resumo.map((m) => (
                  <div key={m.mesKey} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <button
                      onClick={() => setExpandedMonth(expandedMonth === m.mesKey ? null : m.mesKey)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-white capitalize">{m.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium
                          ${m.irTotal > 0
                            ? "bg-red-900/50 text-red-400"
                            : "bg-emerald-900/50 text-emerald-400"}`}>
                          {m.irTotal > 0 ? `DARF ${fmt(m.irTotal)}` : "Isento"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Vendas {fmt(m.totalVendas)}</span>
                        {expandedMonth === m.mesKey ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedMonth === m.mesKey && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-gray-800"
                        >
                          <div className="px-5 py-4 space-y-2">
                            {[
                              ["Total de vendas (Ações ST)", fmt(m.vendasAcoesST), ""],
                              ["Total de vendas (ETF ST)", fmt(m.etfVendas), ""],
                              ["Resultado Swing Trade", fmt(m.ganhoST + m.perdaST), (m.ganhoST + m.perdaST) >= 0 ? "text-emerald-400" : "text-red-400"],
                              ["Resultado Day Trade", fmt(m.ganhoDT + m.perdaDT), (m.ganhoDT + m.perdaDT) >= 0 ? "text-emerald-400" : "text-red-400"],
                              ["Resultado FII", fmt(m.ganhoFII + m.perdaFII), (m.ganhoFII + m.perdaFII) >= 0 ? "text-emerald-400" : "text-red-400"],
                              
                              ["Prejuízo Compensado (Mês)", fmt(m.prejCompensado), "text-amber-400"],
                              ["Saldo de Prejuízo (Acumulado)", fmt(m.saldoPrejuizo), "text-gray-500 italic"],
                              
                              ["IR Swing Trade (Ações/ETF)", fmt(m.irAcoesST + m.irEtfST), ""],
                              ["IR Day Trade (20%)", fmt(m.irDT), ""],
                              ["IR FII (20%)", fmt(m.irFII), ""],
                              
                              m.isentoST
                                ? ["Isenção Ações ST", "Sim (Vendas ≤ 20k)", "text-emerald-400"]
                                : ["Isenção Ações ST", "Não", "text-red-400"],
                            ].map(([label, value, cls], i, arr) => (
                              <div key={label} className={`flex justify-between text-sm
                                ${i === arr.length - 1 ? "pt-2 border-t border-gray-800 font-medium text-white" : "text-white"}`}>
                                <span className="text-gray-400">{label}</span>
                                <span className={cls || ""}>{value}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}

            {/* ── POSIÇÃO ── */}
            {activeTab === "posicao" && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                {posicao.length === 0 ? (
                  <div className="text-center text-gray-600 py-16 text-sm">Sem posição aberta</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {["Ticker","Estoque","PM (R$)","Custo total (R$)","Tipo"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {posicao.map((p) => (
                        <tr key={p.papel} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="px-4 py-3 font-medium text-white">{p.papel}</td>
                          <td className="px-4 py-3 text-gray-300">{num(p.qtd, 0)}</td>
                          <td className="px-4 py-3 text-gray-300">{num(p.pmedio, 3)}</td>
                          <td className="px-4 py-3 text-gray-300">{fmt(p.custoTotal)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium
                              ${p.classe === "ETF" ? "bg-amber-900/50 text-amber-400" : 
                                p.classe === "FII" ? "bg-purple-900/50 text-purple-400" :
                                "bg-blue-900/50 text-blue-400"}`}>
                              {p.classe}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── IMPORTAR / CONFIGS ── */}
            {activeTab === "importar" && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  {/* Configurações de Prejuízo */}
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <AlertCircle size={14} /> Saldos de Anos Anteriores
                    </h2>
                    <p className="text-[10px] text-gray-500 mb-4">
                      Insira o prejuízo acumulado (valor positivo) que você terminou o ano passado.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Prejuízo ST (Ações/ETF)</label>
                        <input
                          type="number"
                          value={prejInicial.st}
                          onChange={(e) => setPrejInicial(p => ({ ...p, st: Number(e.target.value) }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Prejuízo Day Trade</label>
                        <input
                          type="number"
                          value={prejInicial.dt}
                          onChange={(e) => setPrejInicial(p => ({ ...p, dt: Number(e.target.value) }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase">Prejuízo FIIs</label>
                        <input
                          type="number"
                          value={prejInicial.fii}
                          onChange={(e) => setPrejInicial(p => ({ ...p, fii: Number(e.target.value) }))}
                          className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sincronização */}
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <RefreshCw size={14} /> Sincronizar Histórico
                    </h2>
                    <button
                      onClick={syncFromMain}
                      disabled={syncing}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "Sincronizando..." : "Atualizar Calculadora"}
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* CSV */}
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-full">
                    <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <Upload size={14} /> Importar CSV Individual
                    </h2>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder="DATA; PAPEL; OP; QTD; PREÇO; CUSTO..."
                      className="w-full h-80 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-gray-500 resize-none"
                    />
                    <button
                      onClick={importCSV}
                      className="w-full mt-3 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
                    >
                      Processar Dados Colados
                    </button>
                    {importMsg && <p className="mt-3 text-center text-xs text-emerald-400">{importMsg}</p>}
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
