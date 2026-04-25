import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Upload, 
  Wallet, 
  Activity,
  Plus,
  Coins,
  FileSpreadsheet,
  Filter,
  LayoutDashboard,
  PlusSquare,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  LogIn,
  LogOut,
  Download,
  Cloud,
  Zap,
  Loader2,
  Settings,
  Link,
  CheckCircle2,
  Table,
  RefreshCw,
  Trash2,
  FileSearch,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer, 
  Tooltip,
  XAxis,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  YAxis,
  Legend,
  LabelList
} from 'recharts';
import Papa from 'papaparse';
import { auth, db, googleProvider } from './lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  writeBatch,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc
} from 'firebase/firestore';

// Mock data for the chart to look nice before CSV upload
const mockChartData = [
  { name: '1', value: 2400 },
  { name: '2', value: 1398 },
  { name: '3', value: 5800 },
  { name: '4', value: 3908 },
  { name: '5', value: 4800 },
  { name: '6', value: 3800 },
  { name: '7', value: 6300 },
];

const REQUIRED_COLUMNS = [
  "Data",
  "Ticker",
  "Transação",
  "Yields",
  "UN",
  "Saldo de Un",
  "Preço Un de Custo",
  "Total do Custo",
  "Saldo Custo",
  "Preço Médio",
  "B3 Preço Un",
  "B3 Preço total",
  "Tipo Atividade",
  "Banco/Corretora",
  "CNPJ",
  "IR",
  "Dollar"
];

const normalizeHeader = (header: string) => {
  // Remove BOM and invisible characters, then trim and normalize spaces
  const norm = header.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  
  if (norm.includes('dollar') || norm.includes('dolar') || norm.includes('dólar')) return 'Dollar';
  if (norm === 'date' || norm === 'data' || norm.startsWith('data') || norm.includes('negôcio') || norm.includes('negócio') || norm.includes('negocio') || norm.includes('pregao') || norm.includes('pregão') || norm === 'dia' || norm.includes('liquidação') || norm.includes('liquidacao') || norm.includes('movimentação')) return 'Data';
  if (norm === 'ticker' || norm === 'ativo' || norm === 'papel' || norm.includes('código') || norm.includes('codigo') || norm.includes('símbolo') || norm.includes('simbolo')) return 'Ticker';
  if (norm.includes('transation') || norm.includes('transaction') || norm.includes('transação') || norm.includes('transacao') || norm.includes('operação') || norm.includes('operacao') || norm.includes('tipo de ordem') || norm === 'tipo' || norm === 'movimentacao') return 'Transação';
  if (norm.includes('stock proceeds') || norm.includes('stockproceeds') || norm.includes('yields') || norm.includes('rendimentos') || norm.includes('proventos') || norm.includes('dividendos') || norm.includes('juros') || norm.includes('jcp') || norm === 'valor bruto' || norm === 'rendimento') return 'Yields';
  if (norm === 'units' || norm === 'un' || norm === 'unit' || norm.includes('quantidade') || norm.includes('qtd') || norm === 'volume' || norm === 'quantidade (un)') return 'UN';
  if (norm.includes('balance units') || norm.includes('saldo de un') || norm.includes('saldo un') || norm.includes('quantidade acumulada') || norm.includes('saldo de un.')) return 'Saldo de Un';
  if (norm.includes('b3') && (norm.includes('unit') || norm.includes('un'))) return 'B3 Preço Un';
  if (norm.includes('b3') && (norm.includes('total') || norm.includes('val'))) return 'B3 Preço total';
  if (norm.includes('cost unit') || norm.includes('preço un') || norm.includes('preco un') || norm.includes('valor unitário') || norm.includes('preco unitario') || norm.includes('preço unitário') || norm === 'preço' || norm === 'preco' || norm === 'custo un') return 'Preço Un de Custo';
  if ((norm.includes('total cost') || norm.includes('custo total') || norm.includes('balance total cost')) && !norm.includes('saldo')) return 'Total do Custo';
  if (norm.includes('balance total cost') || norm.includes('saldo custo') || norm.includes('custo total acumulado') || norm.includes('saldo de custo')) return 'Saldo Custo';
  
  if (norm.includes('avarage price') || norm.includes('average price') || norm.includes('preço médio') || norm.includes('preco medio') || norm === 'pm' || norm === 'preço medio') return 'Preço Médio';
  
  if (norm.includes('instrument type') || norm.includes('tipo atividade') || norm.includes('categoria') || norm.includes('tipo de ativo') || norm.includes('mercado') || norm.includes('especificação') || norm === 'classe') return 'Tipo Atividade';
  
  if (norm.includes('investment broker') || norm.includes('banco/corretora') || norm.includes('corretora') || norm.includes('instituição') || norm.includes('instituicao') || norm.includes('agente') || norm === 'banco') return 'Banco/Corretora';
  
  if (norm === 'cnpj') return 'CNPJ';
  
  if (norm === 'ir' || norm.includes('imposto') || norm.includes('irrf') || norm === 'taxa' || norm === 'imposto de renda') return 'IR';
  
  if (norm.includes('overall month')) return 'OverAll Month';
  
  return header.trim();
};

const parseMoney = (val: any) => {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === 'number') return val;
  
  // Remove currency symbols and common spacing
  let str = String(val).replace(/R\$\s?/gi, "").replace(/\$\s?/g, "").trim();
  if (str === "" || str.toLowerCase() === "nan") return 0;

  // Detect negative values (handles (1.234,56) or -1.234,56)
  const isNegative = str.includes('(') || str.startsWith('-');
  str = str.replace(/[()\-]/g, "").trim();

  // Handle BR vs US decimals
  // Logic: if there's both '.' and ',', the last one is the decimal separator
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(',')) {
    // Single separator found: assume comma is decimal (BR default)
    str = str.replace(",", ".");
  }
  
  const num = parseFloat(str);
  const finalNum = isNaN(num) ? 0 : num;
  return isNegative ? -finalNum : finalNum;
};

const normalizeYear = (y: any) => {
  if (!y) return "";
  let raw = String(y).trim();
  // Se conter espaço (ex "2026 10:45:00"), pegar apenas a data
  if (raw.includes(' ')) {
    raw = raw.split(' ')[0];
  }
  return raw.length === 2 ? `20${raw}` : raw;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entrada' | 'historico' | 'swing-trade'>('dashboard');
  const [tableColumns, setTableColumns] = useState<string[]>([]);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState<string>("0.0 MB");

  // 1. Initial Load
  const [allData, setAllData] = useState<any[] | null>(null);

  // Google Sheets Integration State
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetsTokens, setSheetsTokens] = useState<any>(null);
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Dark Mode Style Override State 
  const [useImageChart07, setUseImageChart07] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<any | null>(null);
  const [isFetchingMarket, setIsFetchingMarket] = useState(false);
  const [swingTradeData, setSwingTradeData] = useState<Record<string, { 
    currentPrice: number, 
    perfWeek: number | string,
    perfMonth: number | string,
    perfYear: number | string,
    perfYTD: number | string
  }>>({});
  const [isFetchingSwing, setIsFetchingSwing] = useState(false);
  const [hasAttemptedSwingFetch, setHasAttemptedSwingFetch] = useState(false);
  
  // Filter States
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  const [filterTicker, setFilterTicker] = useState<string>("All");
  const [filterYear, setFilterYear] = useState<string>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [filterTipoAtividade, setFilterTipoAtividade] = useState<string>("All");
  const [pieViewMode, setPieViewMode] = useState<'Ticker' | 'Tipo Atividade' | 'Banco/Corretora'>('Ticker');
  const [selectedYieldYear, setSelectedYieldYear] = useState<string>(currentYear);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploadingRef = useRef(false);

  // Form States
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [formDate, setFormDate] = useState(todayStr);
  const [formTicker, setFormTicker] = useState("");
  const [formNewTicker, setFormNewTicker] = useState("");
  const [formTransacao, setFormTransacao] = useState("Compra");
  const [formTipoAtividade, setFormTipoAtividade] = useState("");
  const [formNewTipoAtividade, setFormNewTipoAtividade] = useState("");
  const [formUn, setFormUn] = useState("");
  const [formPrecoUn, setFormPrecoUn] = useState("");
  const [formYields, setFormYields] = useState("");
  const [formIr, setFormIr] = useState("");
  const [formCorretora, setFormCorretora] = useState("");
  const [formCnpj, setFormCnpj] = useState("");

  const isTrade = formTransacao === "Compra" || formTransacao === "Venda";

  const handleCurrencyChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, ""); // remove all non-digits
    if (value === "") { setter(""); return; }
    
    let numValue = (parseInt(value, 10) / 100).toFixed(2);
    let formatted = numValue.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    setter(`R$ ${formatted}`);
  };

  const parseFormattedNumber = (val: string) => {
    if (!val) return 0;
    const cleanVal = val.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanVal) || 0;
  };

  const fetchFinancialMarketInfo = async (ticker: string, date: string) => {
    try {
      let cleanTicker = ticker.trim().toUpperCase().replace(".SA", "");
      if (cleanTicker.startsWith("BVMF:")) cleanTicker = cleanTicker.substring(5);
      const isBrazilian = /^[A-Z]{4}[0-9]{1,2}$/.test(cleanTicker) || cleanTicker === "BOVA11" || cleanTicker === "SMAL11";
      
      const fetchDollar = async () => {
        try {
          const signal = AbortSignal.timeout(8000);
          const res = await fetch('https://brapi.dev/api/v2/currency?currency=USD-BRL', { signal });
          if (res.ok) {
            const data = await res.json();
            const bid = parseFloat(data.currency?.[0]?.bidPrice);
            if (!isNaN(bid)) return bid;
          }
        } catch (e) {
          console.error("Dollar fetch fallback", e);
        }
        
        try {
          const signal2 = AbortSignal.timeout(8000);
          const res2 = await fetch('/api/finance/quote', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ tickers: ["USDBRL=X"] }),
             signal: signal2
          });
          if (res2.ok) {
             const data2 = await res2.json();
             const q = data2.quotes?.["USDBRL=X"];
             if (q?.price) return parseFloat(q.price);
          }
        } catch (e) {}
        return 5.0;
      };

      const fetchAsset = async () => {
        const signal = AbortSignal.timeout(8000);
        if (isBrazilian) {
          // @ts-ignore
          const token = (typeof process !== 'undefined' && process.env?.REACT_APP_BRAPI_TOKEN) || import.meta.env?.VITE_BRAPI_TOKEN || "";
          const url = `https://brapi.dev/api/quote/${cleanTicker}?token=${token}&range=1y&interval=1d&fundamental=false&dividends=false`;
          
          const res = await fetch(url, { signal });
          if (!res.ok) return null;
          
          const data = await res.json();
          const result = data.results?.[0];
          if (!result) return null;
          
          let varWeek = 0;
          let varMonth = 0;
          let var12m = 0;
          const currPrice = result.regularMarketPrice;
          
          const history = result.historicalDataPrice;
          if (history && history.length > 0) {
              const now = Date.now() / 1000;
              const getPriceAtDaysAgo = (days: number) => {
                 const targetTime = now - (days * 24 * 60 * 60);
                 let closest = history[0].close;
                 let minDiff = Infinity;
                 for (const h of history) {
                    const diff = Math.abs(h.date - targetTime);
                    if (diff < minDiff) { minDiff = diff; closest = h.close; }
                 }
                 return closest;
              };
              
              const weekPrice = getPriceAtDaysAgo(7);
              const monthPrice = getPriceAtDaysAgo(30);
              const yearPrice = history[0].close;
              
              if (weekPrice) varWeek = ((currPrice - weekPrice) / weekPrice) * 100;
              if (monthPrice) varMonth = ((currPrice - monthPrice) / monthPrice) * 100;
              if (yearPrice) var12m = ((currPrice - yearPrice) / yearPrice) * 100;
          }
          
          return {
             price: currPrice,
             varWeek,
             varMonth,
             var12m
          };
        } else {
          // Yahoo Finance fetch via Backend for US Stocks
          const res = await fetch('/api/finance/quote', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ tickers: [cleanTicker] }),
             signal
          });
          if (!res.ok) return null;
          const data = await res.json();
          const q = data.quotes?.[cleanTicker];
          if (!q) return null;
          return {
             price: q.price,
             varWeek: 0,
             varMonth: 0,
             var12m: 0
          };
        }
      };

      const results = await Promise.allSettled([fetchAsset(), fetchDollar()]);
      
      const assetInfo = results[0].status === 'fulfilled' ? results[0].value : null;
      const dollarVal = results[1].status === 'fulfilled' ? results[1].value : 5.0;

      if (!assetInfo) return null;

      return {
        price: assetInfo.price,
        dollar: dollarVal,
        varWeek: assetInfo.varWeek,
        varMonth: assetInfo.varMonth,
        var12m: assetInfo.var12m
      };

    } catch (e) {
      console.error("Market fetch failed", e);
      return null;
    }
  };

  const fetchSwingTradeBatch = async (tickersToFetch: string[]) => {
    console.log("DEBUG: fetchSwingTradeBatch called with tickers:", tickersToFetch);
    if (tickersToFetch.length === 0) {
      console.log("DEBUG: No tickers to fetch, returning.");
      return;
    }
    setIsFetchingSwing(true);
    console.log("Fetching Swing Data from Local API:", tickersToFetch);
    try {
      const response = await fetch('/api/finance/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: tickersToFetch })
      });

      console.log("DEBUG: API response status:", response.status);
      if (!response.ok) {
        console.error('DEBUG: Fetch failed with status', response.status);
        throw new Error('Failed to fetch from API');
      }

      const raw = await response.json();
      const updatedData = { ...swingTradeData };
      const normalizedRaw = raw.quotes || {};

      tickersToFetch.forEach(t => {
        const cleanT = t.trim().toUpperCase();
        const quoteInfo = normalizedRaw[cleanT];
        if (quoteInfo && typeof quoteInfo.price === 'number' && quoteInfo.price > 0) {
          updatedData[t] = { 
            currentPrice: quoteInfo.price,
            perfWeek: quoteInfo.variWeek != null ? `${quoteInfo.variWeek.toFixed(2)}%` : "-",
            perfMonth: quoteInfo.variMonth != null ? `${quoteInfo.variMonth.toFixed(2)}%` : "-",
            perfYear: quoteInfo.vari12Month != null ? `${quoteInfo.vari12Month.toFixed(2)}%` : "-",
            perfYTD: quoteInfo.variYTD != null ? `${quoteInfo.variYTD.toFixed(2)}%` : "-"
          };
        } else {
          updatedData[t] = {
            currentPrice: 0,
            perfWeek: "NOT FOUND",
            perfMonth: "NOT FOUND",
            perfYear: "NOT FOUND",
            perfYTD: "NOT FOUND"
          };
        }
      });
      setSwingTradeData(updatedData);
    } catch (e) {
      console.error("Swing fetch failed", e);
    } finally {
      setIsFetchingSwing(false);
    }
  };

  const handleSubmitOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSyncing(true);
    setIsFetchingMarket(true);
    
    try {
      const parts = formDate.split('-');
      const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      const ticker = formTicker === "NEW" ? formNewTicker.toUpperCase() : formTicker.toUpperCase();
      
      // Fetch market prices automatically
      const marketInfo = await fetchFinancialMarketInfo(ticker, formattedDate);
      
      const b3PrecoUn = marketInfo?.price || 0;
      const dollar = marketInfo?.dollar || 5.0; // Fallback se falhar
      
      const unNum = parseFormattedNumber(formUn);
      const precoUnNum = parseFormattedNumber(formPrecoUn);
      const bancoCorretora = formCorretora;
      
      // B3 Preço total = IFERROR(IF(Banco/Corretora ="Nomad";Saldo de Un*B3 Preço Un*Dollar;Saldo de Un*B3 Preço Un);"")
      // Aqui usamos UN da transação para o registro individual
      let b3PrecoTotal = 0;
      if (bancoCorretora === "Nomad") {
        b3PrecoTotal = unNum * b3PrecoUn * dollar;
      } else {
        b3PrecoTotal = unNum * b3PrecoUn;
      }

      const newRecord = {
        "Data": formattedDate,
        "Ticker": ticker,
        "Transação": formTransacao.toUpperCase(),
        "Tipo Atividade": formTipoAtividade === "NEW" ? formNewTipoAtividade : formTipoAtividade,
        "UN": isTrade ? formUn : "",
        "Preço Un de Custo": isTrade ? formPrecoUn : "",
        "Yields": !isTrade ? formYields : "",
        "IR": formIr,
        "Banco/Corretora": bancoCorretora,
        "CNPJ": formCnpj,
        "B3 Preço Un": b3PrecoUn.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        "B3 Preço total": b3PrecoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        "Dollar": dollar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        "Saldo de Un": unNum, // Para compatibilidade com a fórmula do usuário no futuro
        userId: user.uid,
        createdAt: serverTimestamp()
      };

      // 1. Save to Firestore
      const docRef = await addDoc(collection(db, "investments"), newRecord);
      
      // 2. Append to Google Sheets if connected
      if (sheetsConnected && spreadsheetId) {
        await handleAppendToSheets(newRecord);
      }

      // 3. Clear form
      setFormTicker("");
      setFormNewTicker("");
      setFormUn("");
      setFormPrecoUn("");
      setFormYields("");
      setFormIr("");
      
      alert("Operação registrada com sucesso!");
    } catch (error) {
      console.error("Submit failed", error);
      alert("Erro ao registrar operação.");
    } finally {
      setSyncing(false);
      setIsFetchingMarket(false);
    }
  };

  const handleRefresh = () => {
    // Refresh both Firestore and local data
    setSyncing(true);
    if (sheetsConnected && spreadsheetId) {
       handleFetchFromSheets().finally(() => {
         setTimeout(() => { setSyncing(false); }, 1000);
       });
    } else {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  const handleFetchFromSheets = async () => {
    if (!sheetsTokens || !spreadsheetId) {
      alert("Configuração incompleta: Verifique se o Google Sheets está conectado e se o ID da planilha foi informado.");
      return;
    }

    setSyncing(true);
    try {
      const cleanId = spreadsheetId.includes('/d/') 
        ? spreadsheetId.split('/d/')[1].split('/')[0] 
        : spreadsheetId.trim();

      const resp = await fetch('/api/sheets/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: cleanId,
          tokens: sheetsTokens
        })
      });
      
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Falha na resposta do servidor");
      }

      const data = await resp.json();
      
      if (data.values && data.values.length > 1) {
        const headers = data.values[0].map((h: string) => normalizeHeader(h));
        const rows = data.values.slice(1).map((row: any[]) => {
          const obj: any = {};
          headers.forEach((h: string, index: number) => {
            obj[h] = row[index] || "";
          });
          return obj;
        });

        // Merge and process
        setAllData(prev => {
          const current = prev || [];
          return processDataPure([...current, ...rows]);
        });
        
        alert(`Sincronizado! ${rows.length} registros encontrados na planilha.`);
      } else {
        alert("A planilha parece estar vazia ou não contém o cabeçalho correto.");
      }
    } catch (error) {
      console.error("Error fetching from sheets:", error);
      alert(error instanceof Error ? `Erro: ${error.message}` : "Erro desconhecido ao carregar dados da planilha.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!rowToDelete) return;

    try {
      setSyncing(true);
      // Delete from Sheets first if connected
      if (sheetsConnected && spreadsheetId && sheetsTokens) {
        try {
          const cleanId = spreadsheetId.includes('/d/') 
            ? spreadsheetId.split('/d/')[1].split('/')[0] 
            : spreadsheetId.trim();
            
          await fetch('/api/sheets/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tokens: sheetsTokens,
              spreadsheetId: cleanId,
              rowData: rowToDelete
            })
          });
        } catch (sheetsErr) {
          console.error("Error deleting from sheets:", sheetsErr);
          // Decidimos continuar e excluir localmente mesmo se falhar na planilha
        }
      }

      let targetDocId = rowToDelete.id;
      
      if (!targetDocId && user && allData) {
        // Try to find the document ID from our loaded data
        const match = allData.find(r => 
          r.Ticker === rowToDelete.Ticker && 
          r.Data === rowToDelete.Data && 
          String(r.UN) === String(rowToDelete.UN) &&
          r.id
        );
        if (match) {
          targetDocId = match.id;
        }
      }

      if (targetDocId) {
        console.log(`[Debug] Deleting document ID: ${targetDocId}`);
        await deleteDoc(doc(db, "investments", targetDocId));
      } else {
        console.log(`[Debug] Document not found in Firestore. Deleting purely locally...`);
      }

      // Local fallback for CSV (saved_csv_data)
      const saved = localStorage.getItem('saved_csv_data');
      if (saved) {
        const results = Papa.parse(saved, { header: true, skipEmptyLines: true });
        const newData = results.data.filter((r: any) => {
          return !(r.Ticker === rowToDelete.Ticker && r.Data === rowToDelete.Data && r.UN === String(rowToDelete.UN));
        });
        const newCsv = Papa.unparse(newData);
        localStorage.setItem('saved_csv_data', newCsv);
      }
      
      // Update state
      setAllData(prev => prev ? prev.filter(r => r !== rowToDelete) : null);
      setSyncing(false);
      setRowToDelete(null);
    } catch (error) {
      console.error("Delete failed", error);
      setSyncing(false);
      alert("Erro ao excluir registro.");
    }
  };

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load User Config & Data from Firestore
  useEffect(() => {
    if (user) {
      // Load Config
      const configDoc = doc(db, 'users', user.uid, 'config', 'sheets');
      getDoc(configDoc).then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSpreadsheetId(data.spreadsheetId || '');
          setSheetsTokens(data.sheetsTokens || null);
          setSheetsConnected(!!data.sheetsConnected);
        }
      });

      // Load Data
      const q = query(collection(db, "investments"), where("userId", "==", user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (isUploadingRef.current) return; // ignora durante upload

        const cloudData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setAllData(prev => {
          // Fallback: se 'prev' for vazio, tentamos recuperar do localStorage 
          // para garantir que o merge aconteça mesmo se o estado foi resetado
          let currentLocal = prev ? prev.filter(r => !r.id) : [];
          
          if (currentLocal.length === 0) {
            const saved = localStorage.getItem('saved_csv_data');
            if (saved) {
              const results = Papa.parse(saved, {
                header: true,
                skipEmptyLines: true,
                transformHeader: normalizeHeader,
                transform: (value) => value.trim(),
              });
              currentLocal = results.data || [];
            }
          }

          const combined = [...cloudData, ...currentLocal];
          return processDataPure(combined);
        });
        
        setTableColumns(REQUIRED_COLUMNS);
      });
      return () => unsubscribe();
    } else {
      // Se deslogar, mantemos o local pra visualização offline (opcional)
      loadLocalCSV();
    }
  }, [user]);

  const checkMemoryUsage = () => {
    try {
      const savedCsv = localStorage.getItem('saved_csv_data') || "";
      const size = (new Blob([savedCsv]).size / (1024 * 1024)).toFixed(2);
      setMemoryUsage(`${size} MB`);
    } catch (e) {
      setMemoryUsage("Erro");
    }
  };

  const loadLocalCSV = () => {
    const savedCsv = localStorage.getItem('saved_csv_data');
    if (savedCsv) {
      Papa.parse(savedCsv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        transform: (value) => value.trim(),
        complete: (results) => {
          setTableColumns(results.meta.fields || []);
          processData(results.data as any[]);
          checkMemoryUsage();
        },
      });
    }
  };

  const handleLoadPublicFile = async () => {
    setSyncing(true);
    try {
      // Nome exato do arquivo que o usuário disse ter enviado
      const fileName = "/App_Stocks Sheets - Dividends_List .csv";
      const response = await fetch(fileName);
      if (!response.ok) throw new Error("Arquivo não encontrado na pasta pública.");
      
      const text = await response.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            processData(results.data as any[]);
            alert("Dados importados da pasta pública com sucesso!");
            localStorage.setItem('saved_csv_data', text);
            checkMemoryUsage();
          }
        }
      });
    } catch (e) {
      console.error(e);
      alert("Não foi possível carregar o arquivo da pasta pública. Verifique se o nome está correto: 'App_Stocks Sheets - Dividends_List .csv'");
    } finally {
      setSyncing(false);
    }
  };

  // Tenta carregar e PROCESSAR dados locais imediatamente no início
  useEffect(() => {
    loadLocalCSV();
  }, []);

  const processData = (data: any[]) => {
    setAllData(prev => {
      const current = prev || [];
      const newItems = processDataPure(data);
      if (current.length === 0) return newItems;
      // Mescla e passa novamente pelo Pure para reordenar e desduplicar
      return processDataPure([...current, ...newItems]);
    });
    setTableColumns(REQUIRED_COLUMNS);
  };

  const handleConnectSheets = async () => {
    try {
      const resp = await fetch('/api/auth/google/url');
      const { url } = await resp.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      
      const authWindow = window.open(url, 'google_sheets_auth', `width=${width},height=${height},left=${left},top=${top}`);
      
      if (!authWindow) {
        alert('Por favor, habilite popups para conectar com o Google Sheets.');
        return;
      }

      alert('Uma janela de autorização foi aberta. Por favor, faça o login e conceda as permissões necessárias.');

      const messageHandler = async (event: MessageEvent) => {
        if (event.data.type === 'GOOGLE_SHEETS_AUTH_SUCCESS' && user) {
          const tokens = event.data.tokens;
          setSheetsTokens(tokens);
          setSheetsConnected(true);
          
          // Save to Firestore
          await setDoc(doc(db, 'users', user.uid, 'config', 'sheets'), {
            sheetsTokens: tokens,
            sheetsConnected: true,
            spreadsheetId: spreadsheetId 
          }, { merge: true });
          
          window.removeEventListener('message', messageHandler);
        }
      };

      window.addEventListener('message', messageHandler);
    } catch (error) {
      console.error("Error connecting to Sheets:", error);
    }
  };

  const saveSpreadsheetId = async () => {
    if (!user) {
      alert("Você precisa estar logado para salvar configurações.");
      return;
    }
    
    try {
      setSyncing(true);
      const cleanId = spreadsheetId.includes('/d/') 
        ? spreadsheetId.split('/d/')[1].split('/')[0] 
        : spreadsheetId.trim();

      await setDoc(doc(db, 'users', user.uid, 'config', 'sheets'), {
        spreadsheetId: cleanId
      }, { merge: true });
      
      setSpreadsheetId(cleanId);
      alert('ID da planilha salvo com sucesso!');
    } catch (e) {
      console.error("Save config failed", e);
      alert("Erro ao salvar configuração na nuvem.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectSheets = async () => {
    if (!user) return;
    
    if (confirm("Tem certeza que deseja desconectar o Google Sheets?")) {
      try {
        setSyncing(true);
        // Remove from UI state
        setSheetsConnected(false);
        setSheetsTokens(null);
        
        // Remove from Firestore config 
        await setDoc(doc(db, 'users', user.uid, 'config', 'sheets'), {
          sheetsConnected: false,
          sheetsTokens: null
        }, { merge: true });
        
        alert("Google Sheets desconectado com sucesso.");
      } catch (error) {
        console.error("Error disconnecting:", error);
        alert("Erro ao desconectar Google Sheets.");
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleAppendToSheets = async (record: any) => {
    if (!sheetsTokens || !spreadsheetId) return;

    const cleanId = spreadsheetId.includes('/d/') 
      ? spreadsheetId.split('/d/')[1].split('/')[0] 
      : spreadsheetId.trim();

    const rowDataArr = new Array(24).fill("");
    rowDataArr[3] = record["Data"] || "";
    rowDataArr[4] = record["Ticker"] || "";
    rowDataArr[5] = String(record["Transação"] || "").toUpperCase();
    rowDataArr[6] = record["Yields"] || "";
    rowDataArr[7] = record["UN"] || "";
    rowDataArr[8] = record["Saldo de Un"] || "";
    rowDataArr[9] = record["Preço Un de Custo"] || "";
    rowDataArr[10] = record["Total do Custo"] || "";
    rowDataArr[11] = record["Saldo do Custo"] || "";
    rowDataArr[12] = record["Preço Médio"] || "";
    rowDataArr[13] = record["B3 Preço Un"] || "";
    rowDataArr[14] = record["B3 Preço total"] || "";
    rowDataArr[19] = record["Tipo Atividade"] || "";
    rowDataArr[20] = record["Banco/Corretora"] || "";
    rowDataArr[21] = record["CNPJ"] || "";
    rowDataArr[22] = record["IR"] || "";
    rowDataArr[23] = record["Dollar"] || "";

    try {
      const resp = await fetch('/api/sheets/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: sheetsTokens,
          spreadsheetId: cleanId,
          rowData: rowDataArr
        })
      });
      
      if (!resp.ok) {
        const err = await resp.json();
        console.error("Sheets Append Error:", err);
        const errorMsg = err.details || err.error || "Erro desconhecido";
        
        let userAction = "";
        if (errorMsg.includes("Google Sheets API has not been used")) {
          userAction = "\\n\\nImportante: Você precisa habilitar a 'Google Sheets API' no seu Google Cloud Console.";
        } else if (errorMsg.includes("Requested entity was not found")) {
          userAction = "\\n\\nImportante: O ID da planilha está incorreto ou a planilha não existe.";
        }
        
        alert(`Aviso: O registro foi salvo no App, mas não pôde ser enviado para o Google Sheets.\\nDetalhes do erro: ${errorMsg}${userAction}`);
      } else {
        console.log("Successfully appended to Sheets");
      }
    } catch (error) {
      console.error("Error writing to Sheets API:", error);
    }
  };

  // Firestore Sync Effect - REMOVED AS IT WAS DUPLICATE AND CAUSING DATA OVERWRITES

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleResetData = () => {
    if (window.confirm("Isso apagará TODOS os dados locais salvos no navegador. Os dados na nuvem (Firebase) não serão afetados. Deseja continuar?")) {
      localStorage.removeItem('saved_csv_data');
      setAllData(null);
      setTableColumns([]);
      window.location.reload();
    }
  };

  const handleSyncToCloud = async () => {
    if (!user || !allData || syncing) return;
    setSyncing(true);
    try {
      let batch = writeBatch(db);
      
      let count = 0;
      for (const row of allData) {
        if (!row.id) {
          const newDocRef = doc(collection(db, "investments"));
          
          // Firebase rejeita undefined. Precisamos remover campos undef ou transformá-los em strings
          const cleanRow = Object.fromEntries(
            Object.entries(row).filter(([_, v]) => v !== undefined)
          );

          batch.set(newDocRef, {
            ...cleanRow,
            userId: user.uid,
            createdAt: serverTimestamp()
          });
          count++;
          if (count >= 400) { // Firestore batch limit is 500
             try {
                await batch.commit();
             } catch (err) {
                console.error("Batch limit errored: ", err);
             }
             batch = writeBatch(db); // Create a new batch after commit
             count = 0;
          }
        }
      }
      if (count > 0) {
        try {
          await batch.commit();
        } catch (err) {
          console.error("Final batch limit errored: ", err);
        }
      }

      // Optionally sync all to Sheets if connected
      if (sheetsConnected && spreadsheetId) {
        for (const row of allData) {
          if (!row.id) {
            await handleAppendToSheets(row);
          }
        }
      }

      alert("Sincronização concluída!");
    } catch (error) {
      console.error("Sync failed", error);
      alert("Erro ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  };

  const handleClearLocalCache = () => {
    if (confirm("Isso apagará os dados temporários salvos no seu navegador. Seu arquivo original no PC continuará seguro. Deseja continuar?")) {
      localStorage.removeItem('saved_csv_data');
      setAllData(null);
      alert("Memória limpa com sucesso!");
      window.location.reload();
    }
  };

  const handleExportCSV = () => {
    if (!allData || allData.length === 0) return;
    
    // Clean data for export: only include exactly the required columns in the correct order
    const exportData = allData.map(row => {
      const cleanRow: any = {};
      REQUIRED_COLUMNS.forEach(col => {
        cleanRow[col] = row[col] !== undefined ? row[col] : "";
      });
      return cleanRow;
    });

    const csv = Papa.unparse(exportData, {
      columns: REQUIRED_COLUMNS,
      delimiter: ";"
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = 'none';
    link.href = url;
    link.setAttribute("download", `investimentos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    
    // In an iframe without 'allow-downloads', link.click() fails silently.
    // We try to trigger it, and if the user complains, it's mostly due to this iframe restriction.
    setTimeout(() => {
      try {
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error(err);
      }
      
      // If we're inside an iframe (like AI Studio preview), warn the user
      if (window.self !== window.top) {
        alert("Aviso: O download de arquivos pode estar bloqueado dentro desta janela de visualização.\n\nPor favor, clique no ícone de abrir em 'Nova Guia' (canto superior direito) e tente baixar novamente lá!");
      }
    }, 100);
  };

  // Auto-save local data to localStorage so manual updates are preserved immediately
  useEffect(() => {
    if (allData && allData.length > 0) {
      try {
        const exportData = allData.map(row => {
          const cleanRow: any = {};
          REQUIRED_COLUMNS.forEach(col => {
            cleanRow[col] = row[col] || "";
          });
          return cleanRow;
        });
        const csv = Papa.unparse(exportData, {
          columns: REQUIRED_COLUMNS
        });
        localStorage.setItem('saved_csv_data', csv);
        checkMemoryUsage();
      } catch (err) {
        console.error("Auto-save failed - likely iframe quota restricted", err);
      }
    }
  }, [allData]);

  // Auto-preenchimento ao selecionar o Ticker
  useEffect(() => {
    if (formTicker && formTicker !== "NEW" && allData && allData.length > 0) {
      // Find the last entry (assuming sequential load or chronological)
      let match = null;
      // We search from latest to earliest if possible, or just the whole array since processing pushes them
      for (let i = allData.length - 1; i >= 0; i--) {
        if (allData[i]["Ticker"] === formTicker) {
          match = allData[i];
          break;
        }
      }
      if (match) {
        if (match["Tipo Atividade"]) setFormTipoAtividade(String(match["Tipo Atividade"]));
        if (match["Banco/Corretora"]) setFormCorretora(String(match["Banco/Corretora"]));
        if (match["CNPJ"]) setFormCnpj(String(match["CNPJ"]));
      }
    } else if (formTicker === "NEW") {
      setFormTipoAtividade("NEW");
      setFormCorretora("");
      setFormCnpj("");
    }
  }, [formTicker, allData]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      const cleanCsv = text.replace(/,\s+"/g, ',"').replace(/"\s+,/g, '",');
      localStorage.setItem('saved_csv_data', cleanCsv);
      
      Papa.parse(cleanCsv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        transform: (value) => value.trim(),
        complete: async (results) => {
          isUploadingRef.current = true; // ADICIONAR ESTA LINHA
          setTableColumns(results.meta.fields || []);
          
          const processed = processDataPure(results.data as any[]);
          
          // Atualiza estado local imediatamente (não espera Firestore)
          setAllData(processed);
          setTableColumns(REQUIRED_COLUMNS);
          if (fileInputRef.current) fileInputRef.current.value = "";

          if (user) {
            setSyncing(true);
            
            // PASSO 1: Tenta deletar antigos (falha silenciosa)
            try {
              const oldQuery = query(
                collection(db, "investments"),
                where("userId", "==", user.uid)
              );
              const oldSnapshot = await getDocs(oldQuery);
              
              if (oldSnapshot.docs.length > 0) {
                let deleteBatch = writeBatch(db);
                let deleteCount = 0;
                oldSnapshot.docs.forEach((docSnap) => {
                  deleteBatch.delete(docSnap.ref);
                  deleteCount++;
                });
                await deleteBatch.commit();
                console.log(`${deleteCount} documentos antigos deletados.`);
              }
            } catch (err) {
              // Se delete falhar, continua mesmo assim
              console.warn("Aviso: não foi possível limpar dados antigos.", err);
            }

            // PASSO 2: Salva novos dados (independente do passo 1)
            try {
              let batch = writeBatch(db);
              let count = 0;

              for (const row of processed) {
                if (!row.id) {
                  const newDocRef = doc(collection(db, "investments"));
                  const { _yields_fixed, _un_fixed, _preco_fixed, ...cleanRow } = row;
                  const safeRow = Object.fromEntries(
                    Object.entries(cleanRow).filter(([_, v]) => v !== undefined)
                  );
                  batch.set(newDocRef, {
                    ...safeRow,
                    userId: user.uid,
                    createdAt: serverTimestamp()
                  });
                  count++;
                  if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                  }
                }
              }
              if (count > 0) await batch.commit();
              alert(`${processed.length} registros salvos na nuvem com sucesso!`);
            } catch (err) {
              console.error("Erro ao salvar novos dados:", err);
              alert("Erro ao salvar na nuvem, mas seus dados estão visíveis localmente.");
            } finally {
              setSyncing(false);
              // Aguarda 3 segundos e então reativa o listener
              setTimeout(() => {
                isUploadingRef.current = false;
              }, 3000);
            }
          }
        },
      });
    };
    reader.readAsText(file);
  };

  function processDataPure(data: any[]) {
    if (!data) return [];
    
    const parseNum = (val: any) => {
      if (!val) return 0;
      let str = String(val).replace(/R\$\s?/gi, "").replace(/\$\s?/g, "").trim();
      if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, "").replace(",", ".");
        else str = str.replace(/,/g, "");
      } else if (str.includes(',')) str = str.replace(",", ".");
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    };

    // 1. Normalização Inicial e Limpeza (Cores, Espaços, Datas)
    const normalizeDate = (dateStr: any) => {
      let s = String(dateStr || "").trim();
      if (!s) return "01/01/2000";
      
      // Handle formatting DD.MM.YYYY
      s = s.replace(/\./g, '/');

      // Checagem extra: Excel as vezes exporta a data como número serial (ex: 45750)
      if (!s.includes('/') && !s.includes('-') && !isNaN(Number(s))) {
        const serial = Number(s);
        // Considerando epoca do Excel 30/12/1899
        const excelEpoch = new Date(1899, 11, 30);
        excelEpoch.setDate(excelEpoch.getDate() + serial);
        return `${String(excelEpoch.getDate()).padStart(2, '0')}/${String(excelEpoch.getMonth() + 1).padStart(2, '0')}/${excelEpoch.getFullYear()}`;
      }
      
      // Limpeza de horas se houver (ex: 19/04/26 10:00:00)
      s = s.split(' ')[0];

      let d, m, y;
      let p: string[] = [];
      
      if (s.includes('/')) p = s.split('/');
      else if (s.includes('-')) p = s.split('-');
      
      if (p.length === 3) {
        if (p[0].length === 4) { // YYYY-MM-DD
          y = p[0]; m = p[1]; d = p[2];
        } else { // DD-MM-YYYY or DD-MM-YY
          d = p[0]; m = p[1]; y = p[2];
        }
        if (y && y.length === 2) {
           // Safe fallback to 2000s
           y = "20" + y;
        }
      }
      
      if (d && m && y) {
        return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
      }
      return s;
    };

    const cleanRows = data
      .filter(r => r && typeof r === 'object')
      .map(r => {
        const newRow = { ...r };
        // Normaliza campos chave
        newRow["Data"] = normalizeDate(newRow["Data"]);
        newRow["Ticker"] = String(newRow["Ticker"] || "").trim().toUpperCase();
        newRow["Transação"] = String(newRow["Transação"] || "").trim().toUpperCase();
        
        // Convertemos para número antes de voltar para string na fingerprint 
        // para garantir que 58.10 == 58.1
        const yieldsNum = parseNum(newRow["Yields"]);
        const unNum = parseNum(newRow["UN"]);
        const precoNum = parseNum(newRow["Preço Un de Custo"]);
        
        newRow["_yields_fixed"] = yieldsNum.toFixed(4);
        newRow["_un_fixed"] = unNum.toFixed(4);
        newRow["_preco_fixed"] = precoNum.toFixed(4);
        
        return newRow;
      })
      .filter(r => {
        const t = String(r["Ticker"] || "").trim();
        // Não removemos Ticker vazio imediatamente para permitir que o usuário veja
        // Mas removemos linhas claramente de TOTAL ou vazias de objeto
        return t !== "TOTAL" && r && typeof r === 'object';
      });

    // 2. Desduplicação por Assinatura (Fingerprint)
    const uniqueMap = new Map<string, any>();
    cleanRows.forEach(row => {
      let parts: string[] = [];
      const tipoAtiv = String(row["Tipo Atividade"] || "").trim().toUpperCase();
      const transacao = String(row["Transação"] || "").trim().toUpperCase();
      
      // Para rendimentos, quantidade e preço muitas vezes vêm zerados de formas diferentes
      // na mesma corretora, o que quebra a desduplicação e soma duas vezes
      const isYield = tipoAtiv.includes("RENDIMENTO") || tipoAtiv.includes("JURO") || tipoAtiv.includes("DIVIDEND") || tipoAtiv.includes("STOCK PROCEEDS") || tipoAtiv.includes("PROCEEDS") ||
                      transacao.includes("RENDIMENTO") || transacao.includes("JURO") || transacao.includes("DIVIDEND") || transacao.includes("STOCK PROCEEDS") || transacao.includes("PROCEEDS") || transacao.includes("JCP");
                      
      if (isYield) {
        parts = [
          row["Data"],
          row["Ticker"],
          row["Banco/Corretora"],
          row["_yields_fixed"],
          row["UN"] // Adicionamos UN para diferenciar se houver dois rendimentos iguais no mesmo dia
        ];
      } else {
        parts = [
          row["Data"],
          row["Ticker"],
          row["Transação"],
          row["Banco/Corretora"],
          tipoAtiv,
          row["_un_fixed"],
          row["_yields_fixed"],
          row["_preco_fixed"]
        ];
      }
      
      const fingerprint = parts.join('|');
      
      const existing = uniqueMap.get(fingerprint);
      // Prioriza registros que já possuem ID do Firestore
      if (!existing || (!existing.id && row.id)) {
        uniqueMap.set(fingerprint, row);
      }
    });

    const dedupedData = Array.from(uniqueMap.values());

    // 3. Ordenação Cronológica (Robust parse for sorting)
    dedupedData.sort((a, b) => {
      const getComparable = (dateStr: string) => {
        if (!dateStr || typeof dateStr !== 'string') return 0;
        const s = dateStr.trim();
        let d = 0, m = 0, y = 0;
        
        if (s.includes('/')) {
          const p = s.split('/');
          if (p.length === 3) {
            d = parseInt(p[0]); m = parseInt(p[1]); y = parseInt(normalizeYear(p[2]));
          }
        } else if (s.includes('-')) {
          const p = s.split('-');
          if (p.length === 3) {
            if (p[0].length === 4) { // YYYY-MM-DD
              y = parseInt(p[0]); m = parseInt(p[1]); d = parseInt(p[2]);
            } else { // DD-MM-YYYY
              d = parseInt(p[0]); m = parseInt(p[1]); y = parseInt(normalizeYear(p[2]));
            }
          }
        }
        return (y * 10000) + (m * 100) + d;
      };
      return getComparable(a["Data"]) - getComparable(b["Data"]);
    });

    // 4. Cálculos de Saldo e Preço Médio
    const tickerState = new Map<string, { saldoUn: number, saldoCusto: number }>();

    dedupedData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker === "MONTH CLOSING") return;

      if (!tickerState.has(ticker)) tickerState.set(ticker, { saldoUn: 0, saldoCusto: 0 });
      const state = tickerState.get(ticker)!;

      let currentUn = parseNum(row["UN"]);
      const isVenda = row["Transação"].includes("VENDA") || row["Transação"].includes("SELL");
      if (isVenda && currentUn > 0) currentUn = -currentUn;

      const precoUn = parseNum(row["Preço Un de Custo"]);
      const totalCusto = currentUn * precoUn;
      
      state.saldoUn += currentUn;
      state.saldoCusto += totalCusto;
      
      const precoMedio = state.saldoUn !== 0 ? (Math.abs(state.saldoCusto) / Math.abs(state.saldoUn)) : 0;

      // Formatação para Display
      row["Total do Custo"] = totalCusto !== 0 ? `R$ ${totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "";
      row["Saldo de Un"] = state.saldoUn.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
      row["Saldo Custo"] = `R$ ${state.saldoCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      row["Preço Médio"] = precoMedio > 0 ? `R$ ${precoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "";
      
      // B3 Pricing (Só recalcula se o CSV não trouxe o valor já calculado)
      const b3Un = parseNum(row["B3 Preço Un"]);
      const b3TotalExistente = String(row["B3 Preço total"] || "").trim();
      const jaTemB3Total = b3TotalExistente !== "" && 
                           b3TotalExistente !== "NOT FOUND" && 
                           b3TotalExistente !== "0";
      
      if (b3Un > 0 && !jaTemB3Total) {
        const dollar = parseNum(row["Dollar"] || 1);
        const corretora = String(row["Banco/Corretora"] || "").toUpperCase();
        let b3Total = state.saldoUn * b3Un;
        if (corretora.includes("NOMAD")) b3Total *= dollar;
        row["B3 Preço total"] = `R$ ${b3Total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      }
    });

    return dedupedData;
  };

  // ----- Memos for Filtering and Computed Data -----

  const tickers = useMemo(() => {
    if (!allData) return [];

    const validTickers = new Set<string>();
    const tickerLastBalance = new Map<string, number>();
    
    allData.forEach(r => {
        const t = String(r["Ticker"]).trim().toUpperCase();
        if (!t || t === "" || t === "MONTH CLOSING" || t === "TOTAL") return;
        
        validTickers.add(t);

        // Obtém e guarda o último saldo atualizado do ticker.
        // A lista allData é processada em ordem cronológica, então 
        // tickerLastBalance vai sempre guardar a posição FINAL mais recente.
        const b3Raw = String(r["B3 Preço total"] || "").trim();
        const scRaw = String(r["Saldo Custo"] || "").trim();
        
        let val = 0;
        if (b3Raw !== "" && b3Raw !== "NOT FOUND") {
            val = parseMoney(b3Raw);
        } else {
            val = parseMoney(scRaw);
        }
        tickerLastBalance.set(t, val);
    });

    // Pega a lista apenas com os que NÃO estão zerados no final
    return Array.from(validTickers).filter(t => {
        const finalVal = tickerLastBalance.get(t) || 0;
        return Math.abs(finalVal) > 0.01;
    }).sort();
  }, [allData]);

  // Auto-fetch Swing Trade Data when tab is selected
  useEffect(() => {
    if (activeTab === 'swing-trade' && tickers.length > 0 && !hasAttemptedSwingFetch && !isFetchingSwing) {
      setHasAttemptedSwingFetch(true);
      fetchSwingTradeBatch(tickers);
    }
  }, [activeTab, tickers, hasAttemptedSwingFetch, isFetchingSwing]);

  const atividades = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => String(r["Tipo Atividade"] || "").trim()).filter(Boolean))).sort();
  }, [allData]);

  const corretoras = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => String(r["Banco/Corretora"] || "").trim()).filter(Boolean))).sort();
  }, [allData]);

  const years = useMemo(() => {
    const currentYear = String(new Date().getFullYear());
    if (!allData || allData.length === 0) return [currentYear];
    
    const yearsSet = new Set<string>();
    allData.forEach(r => {
      const d = r["Data"];
      if (!d) return;
      let p: string[] = [];
      if (d.includes('/')) p = d.split('/');
      else if (d.includes('-')) p = d.split('-');
      
      if (p.length === 3) {
        if (p[0].length === 4) yearsSet.add(p[0]);
        else if (p[2].length === 4) yearsSet.add(p[2]);
        else if (p[2].length === 2) yearsSet.add("20" + p[2]);
      }
    });
    
    // Garantir que o ano atual sempre esteja disponível para seleção
    yearsSet.add(currentYear);
    
    return Array.from(yearsSet).sort().reverse();
  }, [allData]);

  const months = useMemo(() => {
    if (!allData) return [];
    const monthsSet = new Set<string>();
    allData.forEach(r => {
      const d = r["Data"];
      if (!d) return;
      if (d.includes('/')) {
        const p = d.split('/');
        if (p.length === 3) monthsSet.add(p[1]);
      } else if (d.includes('-')) {
        const p = d.split('-');
        if (p.length === 3) {
          // No formato YYYY-MM-DD o mês é o do meio
          monthsSet.add(p[1]);
        }
      }
    });
    return Array.from(monthsSet).sort();
  }, [allData]);

  const monthNames: Record<string, string> = {
    "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
    "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez"
  };

  const filteredData = useMemo(() => {
    if (!allData) return null;
    return allData.filter(row => {
      const d = String(row["Data"] || "").trim();
      let month = "";
      let year = "";
      
      if (d.includes('/')) {
        const p = d.split('/');
        if (p.length === 3) { month = p[1].trim(); year = p[2].trim(); }
      } else if (d.includes('-')) {
        const p = d.split('-');
        if (p.length === 3) {
          month = p[1].trim();
          year = p[0].length === 4 ? p[0].trim() : p[2].trim();
        }
      }
      
      const matchYear = filterYear === "All" || normalizeYear(year) === filterYear;
      const matchMonth = filterMonth === "All" || month === filterMonth;
      const matchTicker = filterTicker === "All" || row["Ticker"] === filterTicker;
      return matchYear && matchMonth && matchTicker;
    });
  }, [allData, filterTicker, filterYear, filterMonth]);

  const getPatrimonioFor = (t: string, y: string, m: string, tp: string = "All", c: string = "All") => {
    if (!allData) return 0;
    
    // Convert target year/month to a comparable string YYYYMM
    const targetYM = (y === "All" || m === "All") ? "999999" : y + m.padStart(2, '0');
    
    // Group by Ticker and find the last row that is <= targetYM
    const latestValues = new Map<string, number>();
    
    // Important: allData must be sorted by date (already handled in processData)
    allData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING" || ticker.toUpperCase() === "TOTAL") return;
      
      const matchTicker = t === "All" || ticker === t;
      if (!matchTicker) return;

      const tipoAtiv = String(row["Tipo Atividade"] || "").trim();
      const matchTipo = tp === "All" || tipoAtiv === tp;
      if (!matchTipo) return;

      const corr = String(row["Banco/Corretora"] || "").trim();
      const matchCorretora = c === "All" || corr === c;
      if (!matchCorretora) return;

      const dStr = String(row["Data"] || "").trim();
      let rowYM = "";
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts.length === 3) rowYM = normalizeYear(parts[2]) + parts[1].padStart(2, '0');
      } else if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          const yearPart = parts[0].length === 4 ? parts[0] : parts[2];
          rowYM = normalizeYear(yearPart) + parts[1].padStart(2, '0');
        }
      }
      
      if (rowYM && rowYM <= targetYM) {
        // Obter o valor de mercado (B3 Preço total) ou custo como último recurso
        const b3TotalStr = row["B3 Preço total"];
        const saldoCustoStr = row["Saldo Custo"];
        
        if (b3TotalStr && b3TotalStr.trim() !== "" && b3TotalStr !== "NOT FOUND") {
          // Quando encontramos um preço de mercado, ele reflete o valor REAL do saldo naquele momento
          latestValues.set(ticker, parseMoney(b3TotalStr));
        } else if (saldoCustoStr && saldoCustoStr.trim() !== "" && !latestValues.has(ticker)) {
          // Só usamos custo se ainda não tivermos nenhum valor registrado para esse ticker
          latestValues.set(ticker, parseMoney(saldoCustoStr));
        }
      }
    });

    let sum = 0;
    latestValues.forEach(val => sum += val);
    return sum;
  };

  const computedPatrimonioVarMes = useMemo(() => {
    if (filterYear === "All" || filterMonth === "All") return null;
    
    const mNum = parseInt(filterMonth, 10);
    const yNum = parseInt(filterYear, 10);
    
    let prevM = mNum === 1 ? "12" : String(mNum - 1).padStart(2, '0');
    let prevY = mNum === 1 ? String(yNum - 1) : String(yNum);
    
    const curVal = getPatrimonioFor(filterTicker, filterYear, filterMonth);
    const prevVal = getPatrimonioFor(filterTicker, prevY, prevM);
    
    if (prevVal === 0) return 0;
    return ((curVal / prevVal) - 1) * 100;
  }, [allData, filterTicker, filterYear, filterMonth]);

  const computedPatrimonioVarYtd = useMemo(() => {
    if (filterYear === "All" || filterMonth === "All") return null;
    
    const curVal = getPatrimonioFor(filterTicker, filterYear, filterMonth);
    const janVal = getPatrimonioFor(filterTicker, filterYear, "01");
    
    if (janVal === 0) return 0;
    return ((curVal / janVal) - 1) * 100;
  }, [allData, filterTicker, filterYear, filterMonth]);

  const computedPatrimonio = useMemo(() => {
    if (!allData || allData.length === 0) return "R$ 0,00";
    const tickerMap = new Map<string, number>();
    
    // allData is chronological (sorted in processData)
    allData.forEach(row => {
      const ticker = String(row["Ticker"] || "").trim().toUpperCase();
      if (!ticker || ticker === "MONTH CLOSING" || ticker === "TOTAL") return;
      
      // If we are looking for a specific ticker, skip others.
      if (filterTicker !== "All" && ticker !== filterTicker.toUpperCase()) return;

      const b3Raw = String(row["B3 Preço total"] || "").trim();
      const scRaw = String(row["Saldo Custo"] || "").trim();
      
      // We look for the latest occurrence of a non-empty B3 total.
      if (b3Raw !== "" && b3Raw !== "NOT FOUND" && b3Raw !== "0" && b3Raw !== "0,00") {
        tickerMap.set(ticker, parseMoney(b3Raw));
      } else if (scRaw !== "" && scRaw !== "0" && scRaw !== "0,00" && !tickerMap.has(ticker)) {
        // Fallback to Cost only if we haven't seen a B3 value yet.
        tickerMap.set(ticker, parseMoney(scRaw));
      }
    });

    let total = 0;
    tickerMap.forEach(v => total += v);
    return `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [allData, filterTicker]);

  const computedYields = useMemo(() => {
    if (!allData || allData.length === 0) return "R$ 0,00";
    let sumYields = 0;
    
    // Pad target month to ensure '4' matches '04'
    const targetM = filterMonth === "All" ? "All" : filterMonth.padStart(2, '0');
    const targetY = filterYear;

    allData.forEach(row => {
      const ticker = String(row["Ticker"] || "").trim().toUpperCase();
      if (!ticker || ticker === "MONTH CLOSING" || ticker === "TOTAL") return;
      if (filterTicker !== "All" && ticker !== filterTicker.toUpperCase()) return;

      const d = String(row["Data"] || "").trim();
      let rM = "";
      let rY = "";
      
      if (d.includes('/')) {
        const p = d.split('/');
        if (p.length === 3) {
          rM = p[1].padStart(2, '0');
          rY = normalizeYear(p[2]);
        }
      } else if (d.includes('-')) {
        const p = d.split('-');
        if (p.length === 3) {
          rY = p[0].length === 4 ? p[0] : normalizeYear(p[2]);
          rM = p[1].padStart(2, '0');
        }
      }
      
      const matchYear = targetY === "All" || rY === targetY;
      const matchMonth = targetM === "All" || rM === targetM;
      
      if (matchYear && matchMonth && row["Yields"]) {
        sumYields += parseMoney(row["Yields"]);
      }
    });
    return `R$ ${sumYields.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [allData, filterTicker, filterYear, filterMonth]);

  const computedYieldChartData = useMemo(() => {
    if (!allData) return { data: [], types: [] };

    const grouped = new Map<string, Record<string, number>>();
    const foundTypes = new Set<string>();
    const latestB3Total = new Map<string, number>();

    allData.forEach(row => {
      const t = String(row["Ticker"] || "").trim().toUpperCase();
      if (!t || t === "MONTH CLOSING" || t === "TOTAL") return;

      const b3TotalStr = row["B3 Preço total"];
      if (b3TotalStr && b3TotalStr !== "NOT FOUND") {
         const val = parseMoney(b3TotalStr);
         if (val > 0) latestB3Total.set(t, val); 
      }

      const dStr = String(row["Data"] || "").trim();
      let y = "";
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        y = parts.length === 3 ? parts[2] : "";
      } else if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) y = parts[0].length === 4 ? parts[0] : parts[2];
      }
      const normY = normalizeYear(y);

      if (normY === selectedYieldYear || selectedYieldYear === "All") {
        const val = parseMoney(row["Yields"]);
        if (val !== 0) {
          const text = (row["Transação"] || "").toUpperCase();
          let type = "RENDIMENTOS";
          if (text.includes("DIVIDEND")) type = "DIVIDENDOS";
          else if (text.includes("CLIENTE")) type = "JUROS S/ CAPITAL DE CLIENTES";
          else if (text.includes("JCP") || text.includes("CAPITAL PRÓPRIO") || text.includes("JURO")) type = "JUROS S/ CAPITAL PRÓPRIO";
          else if (text.includes("FRAÇÃO") || text.includes("FRACOES") || text.includes("FRACAO")) type = "FRAÇÕES DE AÇÕES";

          foundTypes.add(type);
          if (!grouped.has(t)) grouped.set(t, {});
          grouped.get(t)![type] = (grouped.get(t)![type] || 0) + val;
        }
      }
    });

    const data = Array.from(grouped.entries()).map(([t, values]) => {
      let total = 0;
      Object.values(values).forEach(v => total += v);
      
      const b3Total = latestB3Total.get(t) || 0;
      const percentage = b3Total > 0 ? (total / b3Total) * 100 : 0;

      const percValues: any = {};
      Object.entries(values).forEach(([k, v]) => {
          percValues[k] = b3Total > 0 ? (v / b3Total) * 100 : 0;
          percValues[`${k}_monetary`] = v; 
      });

      return {
        ticker: t,
        total,
        b3Total,
        percentage,
        ...percValues
      };
    }).filter(item => item.total > 0).sort((a,b) => b.percentage - a.percentage);

    return {
      data,
      types: Array.from(foundTypes)
    };
  }, [allData, selectedYieldYear]);

  const YIELD_COLORS: Record<string, string> = {
    'DIVIDENDOS': '#3B82F6',
    'JUROS S/ CAPITAL PRÓPRIO': '#F59E0B',
    'JUROS S/ CAPITAL DE CLIENTES': '#A855F7',
    'FRAÇÕES DE AÇÕES': '#10B981',
    'RENDIMENTOS': '#EC4899'
  };

  const computedAllocationData = useMemo(() => {
    if (!allData) return [];
    const targetYM = (filterYear === "All" || filterMonth === "All") ? "999999" : filterYear + filterMonth;
    
    // Para alocação, pegamos o último valor de cada ticker até a data alvo
    const latestTickerInfo = new Map<string, { value: number, type: string, broker: string }>();
    
    allData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING" || ticker.toUpperCase() === "TOTAL") return;
      
      const dStr = String(row["Data"] || "").trim();
      let rowYM = "";
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts.length === 3) rowYM = normalizeYear(parts[2]) + parts[1].padStart(2, '0');
      } else if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          const y = parts[0].length === 4 ? parts[0] : parts[2];
          rowYM = normalizeYear(y) + parts[1].padStart(2, '0');
        }
      }
      
      if (rowYM && rowYM <= targetYM) {
        const b3TotalStr = row["B3 Preço total"];
        if (b3TotalStr && b3TotalStr !== "NOT FOUND") {
          latestTickerInfo.set(ticker, {
            value: parseMoney(b3TotalStr),
            type: String(row["Tipo Atividade"] || "Não Especificado"),
            broker: String(row["Banco/Corretora"] || "Não Especificado")
          });
        }
      }
    });

    const aggregated = new Map<string, number>();
    latestTickerInfo.forEach((info, ticker) => {
      let key = ticker;
      if (pieViewMode === 'Tipo Atividade') key = info.type;
      if (pieViewMode === 'Banco/Corretora') key = info.broker;
      
      if (key && key.toLowerCase() !== "outros") {
         aggregated.set(key, (aggregated.get(key) || 0) + info.value);
      }
    });

    return Array.from(aggregated.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a,b) => b.value - a.value);
  }, [allData, filterYear, filterMonth, pieViewMode]);
  
  const COLORS = ['#2dd4bf', '#a78bfa', '#38bdf8', '#fbbf24', '#f472b6', '#34d399', '#f87171', '#818cf8'];

  const computedChartData = useMemo(() => {
    if (!allData) return [];
    
    // Obter datas únicas considerando o filtro global de Ticker
    const relevantData = allData.filter(row => {
        return filterTicker === "All" || row["Ticker"] === filterTicker;
    });

    const uniqueDates = Array.from(new Set(relevantData.map(row => row["Data"]))).filter(Boolean) as string[];
    
    // Ordenar cronologicamente para o gráfico
    uniqueDates.sort((a, b) => {
      const partsA = a.split('/');
      const partsB = b.split('/');
      if (partsA.length !== 3 || partsB.length !== 3) return 0;
      return new Date(`${partsA[2]}-${partsA[1]}-${partsA[0]}`).getTime() - new Date(`${partsB[2]}-${partsB[1]}-${partsB[0]}`).getTime();
    });

    return uniqueDates.map(dateStr => {
      const parts = dateStr.split('/');
      const targetDateStr = parts.length === 3 ? `${parts[2]}${parts[1]}${parts[0]}` : "";
      
      const latestValues = new Map<string, number>();
      
      allData.forEach(row => {
        const ticker = row["Ticker"];
        if (!ticker || ticker.toUpperCase() === "MONTH CLOSING") return;
        
        // Se houver um ticker selecionado, só computamos ele
        const matchTicker = filterTicker === "All" || ticker === filterTicker;
        if (!matchTicker) return;

        const rParts = row["Data"] ? String(row["Data"]).split('/') : [];
        if (rParts.length === 3) {
          const rowDateStr = `${rParts[2]}${rParts[1]}${rParts[0]}`;
          if (rowDateStr <= targetDateStr) {
             const b3TotalStr = row["B3 Preço total"];
             if (b3TotalStr && String(b3TotalStr).trim() !== "" && b3TotalStr !== "NOT FOUND") {
               latestValues.set(ticker, parseMoney(b3TotalStr));
             }
          }
        }
      });
      
      let sum = 0;
      latestValues.forEach(val => sum += val);
      return { Data: dateStr, "B3 Preço Total": sum };
    });
  }, [allData, filterTicker]);

  return (
    <div className="relative min-h-screen text-slate-100 flex justify-center bg-transparent">
      {/* Background conditionally changes based on user toggle */}
      <div 
        className="bg-blobs"
        style={useImageChart07 ? {
           backgroundImage: `linear-gradient(to bottom, rgba(10, 15, 30, 0.1), rgba(10, 15, 30, 0.3)), url('/Image chart-07.jpg')`,
           backgroundSize: `100% 100%`,
           backgroundRepeat: `no-repeat`,
           backgroundPosition: `center`,
           filter: `brightness(1.15)`
        } : {}}
      ></div>
      
      {/* Top Floating Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-5xl z-50 glass-panel px-6 py-4 rounded-[2rem] flex justify-between items-center shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 backdrop-blur-2xl"
      >
        <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--color-accent-violet)] to-[var(--color-accent-cyan)]">
          Stocks <span className="font-normal italic">Funds</span>
        </h1>
        
        <div className="flex gap-3 items-center">
          {user ? (
            <>
              <button 
                onClick={handleRefresh}
                className="p-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-500 rounded-xl transition-all flex items-center justify-center group"
                title="Atualizar Dados"
              >
                <RefreshCw className={`w-5 h-5 group-hover:rotate-180 transition-transform duration-700 ${syncing ? 'animate-spin' : ''}`} />
              </button>
              <button 
                onClick={() => setUseImageChart07(!useImageChart07)}
                className="flex p-2.5 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/30 text-slate-300 rounded-xl transition-all items-center justify-center group"
                title="Alternar Modo Escuro"
              >
                {useImageChart07 ? (
                  <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2.5 bg-violet-600/30 hover:bg-violet-500/40 border border-violet-400 text-violet-100 rounded-xl transition-all flex items-center justify-center group shadow-[0_0_20px_rgba(167,139,250,0.6)] backdrop-blur-md"
                title="Configurações e Ações"
              >
                <Settings className={`w-5 h-5 transition-transform duration-500 ${showSettings ? 'rotate-90' : 'group-hover:rotate-45'}`} />
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogin}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
            >
              <LogIn className="w-4 h-4" />
              Entrar
            </button>
          )}
          
          {/* Always rendered hidden file input so buttons across all tabs can trigger it */}
          <input 
            type="file" 
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
        </div>
      </motion.header>

      {/* Bottom Floating Navigation (Cirene Style) */}
      <motion.nav 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-panel p-2 rounded-full flex items-center shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-white/10 backdrop-blur-3xl"
      >
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'dashboard' 
              ? 'bg-[var(--color-accent-cyan)]/20 text-[var(--color-accent-teal)] shadow-[inset_0_0_12px_rgba(45,212,191,0.2)] border border-[var(--color-accent-cyan)]/30' 
              : 'text-[var(--color-accent-teal)] hover:bg-white/5 border border-transparent'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 text-[var(--color-accent-teal)]" />
          <span className="hidden sm:inline text-[var(--color-accent-teal)]">Dashboard</span>
        </button>
        <div className="w-px h-6 bg-[var(--color-accent-teal)]/20 mx-1"></div>
        <button 
          onClick={() => setActiveTab('historico')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'historico' 
              ? 'bg-[var(--color-accent-teal)]/20 text-[var(--color-accent-teal)] shadow-[inset_0_0_12px_rgba(45,212,191,0.2)] border border-[var(--color-accent-teal)]/30' 
              : 'text-[var(--color-accent-teal)] hover:bg-white/5 border border-transparent'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 text-[var(--color-accent-teal)]" />
          <span className="hidden sm:inline text-[var(--color-accent-teal)]">Histórico</span>
        </button>
        <div className="w-px h-6 bg-[var(--color-accent-teal)]/20 mx-1"></div>
        <button 
          onClick={() => setActiveTab('swing-trade')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'swing-trade' 
              ? 'bg-[var(--color-accent-cyan)]/20 text-[var(--color-accent-teal)] shadow-[inset_0_0_12px_rgba(45,212,191,0.2)] border border-[var(--color-accent-cyan)]/30' 
              : 'text-[var(--color-accent-teal)] hover:bg-white/5 border border-transparent'
          }`}
        >
          <Activity className="w-5 h-5 text-[var(--color-accent-teal)]" />
          <span className="hidden sm:inline text-[var(--color-accent-teal)]">Swing Trade</span>
        </button>
        <div className="w-px h-6 bg-[var(--color-accent-teal)]/20 mx-1"></div>
        <button 
          onClick={() => setActiveTab('entrada')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'entrada' 
              ? 'bg-[var(--color-accent-violet)]/20 text-[var(--color-accent-teal)] shadow-[inset_0_0_12px_rgba(167,139,250,0.2)] border border-[var(--color-accent-violet)]/30' 
              : 'text-[var(--color-accent-teal)] hover:bg-white/5 border border-transparent'
          }`}
        >
          <PlusSquare className="w-5 h-5 text-[var(--color-accent-teal)]" />
          <span className="hidden sm:inline text-[var(--color-accent-teal)]">Nova Entrada</span>
        </button>
      </motion.nav>

      {/* Main Content Area */}
      <main className="w-full max-w-5xl px-6 pt-32 pb-36 flex flex-col gap-8 relative z-10 mx-auto">
        
        <AnimatePresence>
          {rowToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass-panel p-8 rounded-[32px] max-w-sm w-full border border-rose-500/30 flex flex-col items-center gap-6 text-center"
              >
                <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Confirmar Exclusão?</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Você está prestes a apagar este registro de <b>{rowToDelete.Ticker}</b> ({rowToDelete.Data}). Esta ação não pode ser desfeita.
                  </p>
                </div>
                <div className="flex gap-4 w-full">
                  <button 
                    onClick={() => setRowToDelete(null)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDeleteRecord}
                    className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 rounded-2xl font-bold text-white shadow-lg shadow-rose-500/20 transition-all"
                  >
                    Excluir
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-panel p-6 rounded-[24px] flex flex-col gap-6 mb-4 border border-violet-500/30">
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    {user && (
                      <div className="glass-button p-1 rounded-full overflow-hidden shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[var(--color-accent-violet)] to-[var(--color-accent-teal)] p-[2px]">
                          <div className="w-full h-full rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden">
                             <img src={user.photoURL || "https://picsum.photos/seed/portrait/100/100"} alt="Avatar" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                      </div>
                    )}
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Table className="w-6 h-6 text-violet-400" />
                      Integração Google Sheets
                    </h3>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white p-2">✕</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-white font-medium">
                      Conecte sua planilha Google para que o SaaS sincronize automaticamente cada nova operação. Seus dados estarão sempre protegidos e restritos ao seu acesso.
                    </p>
                    
                    {!sheetsConnected ? (
                      <button 
                        onClick={handleConnectSheets}
                        className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
                      >
                        <Link className="w-5 h-5" />
                        Conectar Google Sheets
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-emerald-400 font-medium">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5" />
                            Google Sheets Conectado
                          </div>
                          <button 
                            onClick={handleDisconnectSheets}
                            className="bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs py-1 px-3 rounded-lg border border-red-500/30 transition-colors"
                          >
                            Desconectar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-slate-300">ID da Planilha (URL)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={spreadsheetId}
                        onChange={(e) => setSpreadsheetId(e.target.value)}
                        placeholder="Ex: 1a2b3c4d5e6f7g8h9i0..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                      <button 
                        onClick={saveSpreadsheetId}
                        disabled={syncing}
                        className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                          syncing 
                            ? 'bg-slate-500/20 border-slate-500/40 text-slate-500' 
                            : 'bg-violet-500/20 border-violet-500/40 text-violet-400 hover:bg-violet-500/40'
                        }`}
                      >
                        {syncing && <Loader2 className="w-3 h-3 animate-spin" />}
                        Salvar
                      </button>
                    </div>
                    {sheetsConnected && (
                      <button 
                        onClick={handleFetchFromSheets}
                        disabled={syncing}
                        className={`w-full mt-2 py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                          syncing 
                            ? 'bg-slate-500/20 border-slate-500/40 text-slate-500' 
                            : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/40'
                        }`}
                      >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sincronizar dados da Planilha
                      </button>
                    )}
                    <p className="text-xs text-white font-medium mt-1">
                      Dica: O ID é a parte da URL entre '/d/' e '/edit'. Ex: docs.google.com/spreadsheets/d/<b>SEU_ID_AQUI</b>/edit
                    </p>
                  </div>
                </div>

                {/* Quick Actions moved here */}
                <div className="mt-8 pt-6 border-t border-white/10 flex flex-col gap-6">
                  <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2">Ações de Conta & Dados</h4>
                  
                  <div className="flex flex-col gap-4">
                    {/* Sincronizar Nuvem */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={handleSyncToCloud}
                        disabled={syncing || !allData}
                        className="w-full sm:w-[260px] p-3 text-left bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded-xl transition-all flex items-center justify-start gap-3 group disabled:opacity-50"
                      >
                        {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cloud className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                        <span className="text-sm font-bold">Sincronizar Nuvem</span>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use para forçar o envio de lançamentos da nuvem para o Google Sheets (útil se a sincronização automática falhar).
                      </p>
                    </div>

                    {/* Importar Relatório */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full sm:w-[260px] p-3 text-left bg-[var(--color-accent-teal)]/10 hover:bg-[var(--color-accent-teal)]/20 border border-[var(--color-accent-teal)]/30 text-[var(--color-accent-teal)] rounded-xl transition-all flex items-center justify-start gap-3 group"
                      >
                        <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                        <span className="text-sm font-bold">Importar Relatório B3</span>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use para carregar uma nova planilha consolidada de negociações da B3 em formato CSV para o sistema.
                      </p>
                    </div>

                    {/* Importar do Servidor */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={handleLoadPublicFile}
                        className="w-full sm:w-[260px] p-3 text-left bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl transition-all flex items-center justify-start gap-3 group shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]"
                      >
                        <FileSearch className="w-5 h-5 group-hover:scale-110 transition-transform shrink-0" />
                        <span className="text-sm font-bold truncate">Importar do Servidor</span>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use para carregar um arquivo fixo de planilha pré-hospedado na pasta pública do servidor.
                      </p>
                    </div>

                    {/* Limpar Cache Local */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={handleClearLocalCache}
                        className="w-full sm:w-[260px] p-3 text-left bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded-xl transition-all flex items-center justify-start gap-3 group"
                      >
                        <Zap className="w-5 h-5 group-hover:scale-110 transition-transform shrink-0" />
                        <div className="flex flex-col items-start translate-y-[-1px]">
                          <span className="text-sm font-bold leading-tight">Limpar Cache Local</span>
                          <span className="text-[10px] opacity-70">Uso: {memoryUsage} / 5MB</span>
                        </div>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use quando o app estiver apresentando lentidão. Apaga apenas arquivos temporários do seu navegador.
                      </p>
                    </div>

                    {/* Limpar Banco de Dados Local */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={handleResetData}
                        className="w-full sm:w-[260px] p-3 text-left bg-rose-900/20 hover:bg-rose-900/30 border border-rose-500/30 text-rose-400 rounded-xl transition-all flex items-center justify-start gap-3 group shadow-[inset_0_0_10px_rgba(244,63,94,0.1)]"
                      >
                        <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform shrink-0" />
                        <span className="text-sm font-bold truncate">Limpar Banco de Dados</span>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use para remover todos os dados que estão em cache na tela atual (não apaga registros na nuvem).
                      </p>
                    </div>

                    {/* Sair da Conta */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <button 
                        onClick={handleLogout}
                        className="w-full sm:w-[260px] p-3 text-left bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl transition-all flex items-center justify-start gap-3 group"
                      >
                        <LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform shrink-0" />
                        <span className="text-sm font-bold">Sair da Conta</span>
                      </button>
                      <p className="text-sm text-white font-medium flex-1">
                        Use para encerrar sua sessão atual de forma segura do sistema.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {authLoading ? (
            <div className="w-full h-64 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 text-[var(--color-accent-violet)] animate-spin" />
              <p className="text-slate-400 font-medium">Carregando seus dados...</p>
            </div>
          ) : !user ? (
            <div className="w-full py-20 glass-panel rounded-[32px] flex flex-col items-center justify-center gap-6 text-center px-6">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-2">
                <Cloud className="w-10 h-10 text-[var(--color-accent-violet)]" />
              </div>
              <h2 className="text-2xl font-bold">Acesse sua carteira digital</h2>
              <p className="text-slate-400 max-w-md">Para visualizar seus investimentos, sincronizar com a nuvem e exportar relatórios, entre com sua conta Google.</p>
              <button 
                onClick={handleLogin}
                className="px-8 py-4 bg-gradient-to-r from-[var(--color-accent-violet)] to-[var(--color-accent-teal)] rounded-2xl font-bold flex items-center gap-3 shadow-lg hover:scale-105 transition-all text-white"
              >
                <LogIn className="w-5 h-5" />
                Começar agora
              </button>
              <div className="mt-8 flex flex-col items-center gap-2">
                <p className="text-xs text-slate-500">Ou continue visualizando como um convidado importando seu arquivo.</p>
                <div className="flex flex-col items-center gap-1">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm font-bold text-teal-400 hover:underline"
                  >
                    Importar CSV localmente
                  </button>
                  <span className="text-[10px] text-slate-500 text-center max-w-xs leading-tight">
                    *Para salvamento garantido sem conta, abra o app em uma nova guia, ou instale-o no dispositivo. O uso integrado na prévia (iframe) limpa os dados ao fechar.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {(activeTab === 'dashboard' || activeTab === 'historico') && (
                <motion.div 
                  key="global-filters"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col sm:flex-row items-center justify-start sm:justify-center gap-6 z-20"
                >
                  <div className="flex flex-wrap items-center justify-center gap-6">
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Ticker</span>
                      <select 
                        value={filterTicker}
                        onChange={(e) => setFilterTicker(e.target.value)}
                        disabled={!allData}
                        className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[6rem] px-4 h-[42px] text-sm text-[var(--color-accent-teal)] font-bold focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                      >
                        <option value="All" className="bg-slate-900 text-white">Todos</option>
                        {tickers.map(t => <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Mês</span>
                      <select 
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        disabled={!allData}
                        className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[6rem] px-4 h-[42px] text-sm text-[var(--color-accent-teal)] font-bold focus:outline-none focus:ring-1 focus:ring-violet-700 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                      >
                        <option value="All" className="bg-slate-900 text-white">Todos</option>
                        {months.map(m => <option key={m} value={m} className="bg-slate-900 text-white">{monthNames[m] || m}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Ano</span>
                      <select 
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        disabled={!allData}
                        className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[6rem] px-4 h-[42px] text-sm text-[var(--color-accent-teal)] font-bold focus:outline-none focus:ring-1 focus:ring-violet-700 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                      >
                        <option value="All" className="bg-slate-900 text-white">Todos</option>
                        {years.map(y => <option key={String(y)} value={String(y)} className="bg-slate-900 text-white">{y}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}

              <AnimatePresence mode="wait">

                {activeTab === 'dashboard' ? (
                  <motion.div 
                    key="dashboard"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-8"
                  >

              {/* Dashboard Panels Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                
                {/* Total Balance Card */}
                <div className="glass-panel p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] flex flex-col gap-4 sm:gap-6 relative overflow-hidden h-full lg:col-span-2 z-20">
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-[var(--color-accent-violet)] rounded-full blur-[60px] opacity-30 pointer-events-none"></div>
                  
                  <div className="flex items-center gap-3 w-full relative z-10">
                    <span className="text-xs tracking-wide uppercase sm:text-sm font-medium text-slate-300">Portfólio</span>
                  </div>
                  
                  <div className="z-10">
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-2 truncate">
                      {computedPatrimonio}
                    </h2>
                  </div>
                </div>

                {/* Yields Card */}
                <div className="glass-panel p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] flex flex-col gap-4 sm:gap-6 relative overflow-hidden h-full lg:col-span-2 z-10">
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-[var(--color-accent-teal)] rounded-full blur-[60px] opacity-20 pointer-events-none"></div>
                  
                  <div className="flex items-center gap-3 w-full relative z-10">
                    <div className="p-2 bg-white/10 rounded-xl hidden sm:block">
                      <Coins className="w-5 h-5 text-[var(--color-accent-teal)]" />
                    </div>
                    <span className="text-xs tracking-wide uppercase sm:text-sm font-medium text-slate-300">Yields</span>
                  </div>
                  
                  <div className="z-10">
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-2 truncate text-[var(--color-accent-teal)]">
                      {computedYields}
                    </h2>
                  </div>
                </div>

                {/* Var Mês Card */}
                <div className="glass-panel p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] flex flex-col justify-between relative overflow-hidden h-full lg:col-span-2 border-t-2 border-t-emerald-500/20">
                  <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-emerald-500/50 rounded-full blur-[50px] opacity-20 pointer-events-none"></div>
                  <div className="flex items-center gap-3 mb-2 z-10">
                    <span className="text-xs tracking-wide uppercase sm:text-sm font-medium text-slate-300">% Var Mês</span>
                  </div>
                  <div className="z-10 min-h-[40px] flex items-end mt-2">
                    <h2 className={`text-2xl sm:text-4xl font-bold tracking-tight ${computedPatrimonioVarMes === null ? 'text-slate-500' : computedPatrimonioVarMes >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {computedPatrimonioVarMes === null ? "---" : `${computedPatrimonioVarMes >= 0 ? "+" : ""}${computedPatrimonioVarMes.toFixed(2)}%`}
                    </h2>
                  </div>
                </div>

                {/* Var YTD Card */}
                <div className="glass-panel p-5 sm:p-8 rounded-[24px] sm:rounded-[32px] flex flex-col justify-between relative overflow-hidden h-full lg:col-span-2 border-t-2 border-t-blue-500/20">
                  <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/50 rounded-full blur-[50px] opacity-20 pointer-events-none"></div>
                  <div className="flex items-center gap-3 mb-2 z-10">
                    <span className="text-xs tracking-wide uppercase sm:text-sm font-medium text-slate-300">% Var YTD</span>
                  </div>
                  <div className="z-10 min-h-[40px] flex items-end mt-2">
                    <h2 className={`text-2xl sm:text-4xl font-bold tracking-tight ${computedPatrimonioVarYtd === null ? 'text-slate-500' : computedPatrimonioVarYtd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {computedPatrimonioVarYtd === null ? "---" : `${computedPatrimonioVarYtd >= 0 ? "+" : ""}${computedPatrimonioVarYtd.toFixed(2)}%`}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Charts Section on Dashboard */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Evolution Line Chart */}
                <div className="glass-panel p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] flex flex-col gap-4 h-[350px] lg:col-span-1">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Activity className="w-5 h-5 text-[var(--color-accent-cyan)]" />
                      Desempenho Geral
                    </h3>
                  </div>
                  
                  <div className="flex-1 w-full min-h-[120px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={computedChartData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-accent-cyan)" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="var(--color-accent-cyan)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="Data" hide={true} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(13, 27, 42, 0.8)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            backdropFilter: 'blur(8px)',
                            color: '#fff'
                          }} 
                          itemStyle={{ color: '#fff' }}
                          labelStyle={{ color: '#aaa', marginBottom: '4px' }}
                          formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, 'Total']}
                        />
                        <Area 
                          type="natural" 
                          dataKey="B3 Preço Total" 
                          stroke="var(--color-accent-cyan)" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorValue)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Allocation Pie Chart */}
                <div className="glass-panel p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] flex flex-col gap-6 h-[auto] min-h-[550px] lg:col-span-1">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2 shrink-0">
                      <PieChartIcon className="w-5 h-5 text-[var(--color-accent-violet)]" />
                      Alocação
                    </h3>
                  </div>
                  
                  <div className="flex flex-col md:flex-row-reverse gap-6 flex-1">
                    {/* Lateral View Selection Buttons on the Right */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-32 lg:w-40 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 custom-scrollbar">
                      {(['Ticker', 'Tipo Atividade', 'Banco/Corretora'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setPieViewMode(mode)}
                          className={`flex-1 md:flex-none w-full px-4 h-[38px] rounded-xl text-sm font-bold transition-all backdrop-blur-md border outline-none text-left flex items-center whitespace-nowrap ${
                            pieViewMode === mode 
                              ? 'bg-white/10 border-cyan-500/50 text-[var(--color-accent-teal)] shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)]' 
                              : 'bg-white/5 border-white/10 text-[var(--color-accent-teal)] opacity-60 hover:opacity-100 hover:bg-white/10'
                          }`}
                        >
                          {mode === 'Ticker' ? 'Ticker' : mode === 'Tipo Atividade' ? 'Atividade' : 'Corretora'}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 w-full relative min-h-[300px]">
                      {computedAllocationData.length > 0 ? (
                        <div className="flex flex-col h-full">
                          <div className="flex-1 min-h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={computedAllocationData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={40}
                                  outerRadius={75}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                  labelLine={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                                  label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                                >
                                  {computedAllocationData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: 'rgba(13, 27, 42, 0.9)', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    backdropFilter: 'blur(12px)',
                                    color: '#fff'
                                  }}
                                  itemStyle={{ fontSize: '12px' }}
                                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, 'Valor']}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          
                          {/* Legend with Scrollable Container if too many items */}
                          <div className="mt-4 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-2 pb-2">
                              {computedAllocationData.map((item, idx) => {
                                const total = computedAllocationData.reduce((acc, curr) => acc + curr.value, 0);
                                const percentage = ((item.value / total) * 100).toFixed(1);
                                return (
                                  <div key={item.name} className="flex items-center justify-between gap-1 border-b border-white/5 pb-0.5">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                      <span className="text-[11px] sm:text-xs text-slate-300 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-[11px] sm:text-xs text-[var(--color-accent-teal)] font-semibold whitespace-nowrap">{percentage}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                         <div className="w-full h-full flex items-center justify-center text-slate-500 font-medium text-sm">Nenhum dado com saldo positivo</div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Yields Bar Chart (New) */}
              <div className="glass-panel p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] flex flex-col gap-4 min-h-[400px] mt-2">
                <div className="flex justify-between items-center mb-2 flex-wrap gap-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-400" />
                    Yields
                  </h3>
                  <div className="flex items-center gap-2">
                    <select 
                      value={selectedYieldYear}
                      onChange={(e) => setSelectedYieldYear(e.target.value)}
                      className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-3 py-1.5 text-sm text-emerald-400 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer outline-none"
                    >
                      <option value="All" className="bg-slate-900 text-white">Todos os Anos</option>
                      {years.map(y => <option key={String(y)} value={String(y)} className="bg-slate-900 text-white">{y}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="flex-1 w-full min-h-[300px]">
                  {computedYieldChartData.data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={computedYieldChartData.data} margin={{ top: 30, right: 30, left: 20, bottom: 50 }}>
                        <XAxis 
                          dataKey="ticker" 
                          stroke="rgba(255,255,255,0.5)" 
                          tick={{fill: 'rgba(255,255,255,0.7)', fontSize: 12}}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          interval={0}
                        />
                        <YAxis 
                          stroke="rgba(255,255,255,0.5)" 
                          tick={{fill: 'rgba(255,255,255,0.7)', fontSize: 12}}
                          tickFormatter={(tick) => `${Number(tick)}%`}
                          width={60}
                          domain={[0, (dataMax: number) => {
                            const rounded = Math.ceil(dataMax);
                            // Set a sensible minimum max value but let it grow automatically
                            return rounded > 10 ? rounded : 10;
                          }]}
                          allowDataOverflow={true}
                        />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: 'rgba(13, 27, 42, 0.9)', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '16px',
                            backdropFilter: 'blur(12px)',
                            color: '#fff'
                          }}
                          itemStyle={{ fontSize: '12px' }}
                          formatter={(value: number, name: string, props: any) => {
                            if (name === "total" || name === "percentage" || name === "b3Total" || name.endsWith('_monetary')) return [];
                            
                            const b3Total = props.payload.b3Total;
                            const monetaryValue = props.payload[`${name}_monetary`] || 0;
                            
                            let percStr = "";
                            if (b3Total > 0 && monetaryValue > 0) {
                              const partialPerc = (monetaryValue / b3Total) * 100;
                              percStr = ` (${partialPerc.toFixed(2)}%)`;
                            }
                            return [`R$ ${monetaryValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}${percStr}`, name];
                          }}
                        />
                        {computedYieldChartData.types.map((type, idx) => {
                          const isLast = computedYieldChartData.types.length === 1 || idx === computedYieldChartData.types.length - 1;
                          return (
                            <Bar 
                              key={type} 
                              dataKey={type} 
                              stackId="a" 
                              fill={YIELD_COLORS[type] || '#8884d8'} 
                              radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                              maxBarSize={60}
                            />
                          );
                        })}
                        <Line 
                          type="monotone" 
                          dataKey="percentage" 
                          stroke="transparent" 
                          dot={{ r: 0, fill: 'transparent', stroke: 'transparent' }} 
                          activeDot={false}
                          isAnimationActive={false}
                        >
                          <LabelList 
                            dataKey="percentage" 
                            position="top" 
                            fill="#2dd4bf" 
                            fontSize={12}
                            fontWeight="bold"
                            formatter={(val: number) => val > 0 ? `${val.toFixed(2)}%` : ""} 
                          />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 italic">
                      Nenhum registro de rendimento neste período.
                    </div>
                  )}
                </div>
              </div>

            </motion.div>
          ) : activeTab === 'historico' ? (
            <motion.div 
              key="historico"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-8 w-full"
            >
              {/* Assets List or Parsed CSV Data Table */}
              <div className="pb-10 w-full">
                {filteredData ? (
                   <div className="flex flex-col gap-4">
                     <div className="flex justify-between items-center mb-2">
                       <h3 className="font-semibold text-lg">Histórico</h3>
                     </div>
                     
                     <div className="glass-panel p-2 rounded-[24px]">
                       <div className="w-full max-h-[600px] overflow-auto custom-scrollbar rounded-[20px]">
                         <table className="w-full text-left text-sm whitespace-nowrap border-collapse min-w-max relative">
                           <thead className="sticky top-0 z-20 backdrop-blur-3xl bg-slate-900/60 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                             <tr>
                               {REQUIRED_COLUMNS.map((colName, i) => (
                                 <th key={i} className="p-4 font-semibold text-[var(--color-accent-cyan)] border-b border-white/10">
                                   {colName}
                                 </th>
                               ))}
                               <th className="p-4 font-semibold text-rose-500 border-b border-white/10 text-center">Ações</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                             {filteredData.map((row, index) => (
                               <tr key={index} className="hover:bg-white/5 transition-colors group">
                                 {REQUIRED_COLUMNS.map((colKey, j) => (
                                   <td key={j} className="p-4 text-slate-300 font-medium">
                                     {row[colKey] ? String(row[colKey]) : '-'}
                                   </td>
                                 ))}
                                 <td className="p-4 text-slate-300 font-medium transition-colors text-center">
                                   <button 
                                     onClick={() => setRowToDelete(row)}
                                     className="p-2 hover:bg-rose-500/20 text-rose-500 rounded-lg transition-all"
                                     title="Excluir Registro"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     </div>
                   </div>
                ) : (
                  <div className="glass-panel p-16 rounded-[32px] flex flex-col items-center justify-center text-center opacity-60">
                    <FileSpreadsheet className="w-16 h-16 text-slate-400 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Nenhum dado carregado</h3>
                    <p className="text-slate-400 max-w-sm">
                      Faça o upload da sua planilha CSV pelo botão no menu superior para começar a análise.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'swing-trade' ? (
            <motion.div 
              key="swing-trade"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-6 w-full"
            >
              <div className="flex justify-between items-center px-2">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Activity className="w-6 h-6 text-[var(--color-accent-teal)]" />
                    Swing Trade
                  </h2>
                  <p className="text-slate-400 text-sm">Monitoramento de ativos e performance semanal</p>
                </div>
                <button
                  onClick={() => fetchSwingTradeBatch(tickers)}
                  disabled={isFetchingSwing || tickers.length === 0}
                  className="px-6 py-3 bg-[var(--color-accent-teal)]/10 hover:bg-[var(--color-accent-teal)]/20 border border-[var(--color-accent-teal)]/30 text-[var(--color-accent-teal)] rounded-2xl font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isFetchingSwing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {isFetchingSwing ? 'Atualizando...' : 'Atualizar Cotações'}
                </button>
              </div>

              <div className="glass-panel p-2 rounded-[24px]">
                <div className="w-full max-h-[600px] overflow-auto custom-scrollbar rounded-[20px]">
                  <table className="w-full text-left text-sm whitespace-nowrap border-collapse min-w-max relative">
                    <thead className="sticky top-0 z-20 backdrop-blur-3xl bg-slate-900/60 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                      <tr>
                        <th className="p-4 font-semibold text-[var(--color-accent-cyan)] border-b border-white/10 uppercase tracking-wider text-[110%]">Ticker</th>
                        <th className="p-4 font-semibold text-[var(--color-accent-teal)] border-b border-white/10 uppercase tracking-wider">B3 Preço Un</th>
                        <th className="p-4 font-semibold text-[var(--color-accent-violet)] border-b border-white/10 uppercase tracking-wider">Semana</th>
                        <th className="p-4 font-semibold text-[var(--color-accent-violet)] border-b border-white/10 uppercase tracking-wider">Mês</th>
                        <th className="p-4 font-semibold text-[var(--color-accent-violet)] border-b border-white/10 uppercase tracking-wider">12 meses</th>
                        <th className="p-4 font-semibold text-[var(--color-accent-violet)] border-b border-white/10 uppercase tracking-wider">YTD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {tickers.length > 0 ? tickers.map((ticker) => {
                        const info = swingTradeData[ticker];
                        
                        const renderPerf = (perf: any) => {
                          if (!info) return <span className="text-white italic">-</span>;
                          
                          if (typeof perf === 'number') {
                            return (
                              <span className={perf > 0 ? "text-emerald-400" : perf < 0 ? "text-rose-400" : "text-white"}>
                                {perf > 0 ? '+' : ''}{(perf * 100).toFixed(2)}%
                              </span>
                            );
                          }

                          if (typeof perf === 'string' && perf !== "-") {
                            const num = parseFloat(perf.replace('%', ''));
                            if (!isNaN(num)) {
                              return (
                                <span className={num > 0 ? "text-emerald-400" : num < 0 ? "text-rose-400" : "text-white"}>
                                  {num > 0 ? '+' : ''}{perf}
                                </span>
                              );
                            }
                          }
                          
                          return <span className="text-white uppercase text-[10px]">{perf}</span>;
                        };

                        return (
                          <tr key={ticker} className="hover:bg-white/5 transition-colors group">
                            <td className="p-4 font-bold text-[#545759] text-[110%]">{ticker}</td>
                            <td className="p-4 text-white">
                              {isFetchingSwing && !info ? (
                                <div className="flex items-center gap-2 text-white italic">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Buscando...
                                </div>
                              ) : info && info.currentPrice > 0 ? (
                                <span className="font-mono text-white">
                                  R$ {info.currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : info && info.currentPrice === 0 ? (
                                <span className="text-rose-500 font-bold uppercase text-[10px]">NOT FOUND</span>
                              ) : (
                                <span className="text-white italic">Aguardando atualização...</span>
                              )}
                            </td>
                            <td className="p-4 font-medium">{renderPerf(info?.perfWeek)}</td>
                            <td className="p-4 font-medium">{renderPerf(info?.perfMonth)}</td>
                            <td className="p-4 font-medium">{renderPerf(info?.perfYear)}</td>
                            <td className="p-4 font-medium">{renderPerf(info?.perfYTD)}</td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-white italic">
                            Nenhum ativo encontrado no histórico para monitorar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="entrada"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col gap-6 w-full"
            >
              <div className="glass-panel rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 max-w-2xl mx-auto w-full mt-4">
                <h2 className="text-xl sm:text-2xl font-semibold mb-6 flex items-center gap-3">
                  <Plus className="w-6 h-6 text-[var(--color-accent-cyan)]" />
                  Nova Entrada de Valores
                </h2>
                <form className="flex flex-col gap-5" onSubmit={handleSubmitOperation}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Data</label>
                      <input 
                        type="date" 
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                      />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Ticker/Ativo</label>
                      <select 
                        value={formTicker}
                        onChange={(e) => setFormTicker(e.target.value)}
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none outline-none"
                      >
                        <option value="" disabled className="bg-slate-900 text-white">Selecione um Ativo</option>
                        {tickers.map(t => <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>)}
                        <option value="NEW" className="bg-slate-900 text-[var(--color-accent-cyan)] font-semibold">Adicionar nova ação...</option>
                      </select>
                      {formTicker === "NEW" && (
                        <input 
                          type="text" 
                          placeholder="Digite o novo Ticker/Ação" 
                          value={formNewTicker}
                          onChange={(e) => setFormNewTicker(e.target.value)}
                          className="bg-white/5 backdrop-blur-md border border-[var(--color-accent-cyan)]/50 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] mt-1 animate-in fade-in slide-in-from-top-2 outline-none" 
                        />
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Transação</label>
                      <select 
                        value={formTransacao}
                        onChange={(e) => setFormTransacao(e.target.value)}
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none outline-none"
                      >
                        <option value="Compra" className="bg-slate-900 text-white">Compra</option>
                        <option value="Venda" className="bg-slate-900 text-white">Venda</option>
                        <option value="Dividendos" className="bg-slate-900 text-white">Dividendos</option>
                        <option value="Juros s/ capital próprio" className="bg-slate-900 text-white">Juros s/ capital próprio</option>
                        <option value="Juros s/ capital cliente" className="bg-slate-900 text-white">Juros s/ capital cliente</option>
                        <option value="Frações de ações" className="bg-slate-900 text-white">Frações de ações</option>
                        <option value="Rendimentos" className="bg-slate-900 text-white">Rendimentos</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Tipo Atividade</label>
                      <select 
                        value={formTipoAtividade}
                        onChange={(e) => setFormTipoAtividade(e.target.value)}
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none outline-none"
                      >
                        <option value="" disabled className="bg-slate-900 text-white">Selecione a Atividade</option>
                        {atividades.map(a => <option key={a} value={a} className="bg-slate-900 text-white">{a}</option>)}
                        <option value="NEW" className="bg-slate-900 text-[var(--color-accent-cyan)] font-semibold">Adicionar nova atividade...</option>
                      </select>
                      {formTipoAtividade === "NEW" && (
                        <input 
                          type="text" 
                          placeholder="Digite a nova Atividade" 
                          value={formNewTipoAtividade}
                          onChange={(e) => setFormNewTipoAtividade(e.target.value)}
                          className="bg-white/5 backdrop-blur-md border border-[var(--color-accent-cyan)]/50 rounded-xl p-3 text-[var(--color-accent-teal)] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] mt-1 animate-in fade-in slide-in-from-top-2 outline-none" 
                        />
                      )}
                    </div>

                    {isTrade ? (
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">UN (Quantidade)</label>
                        <input 
                          type="number" 
                          step="any"
                          inputMode="decimal"
                          value={formUn}
                          onChange={(e) => setFormUn(e.target.value)}
                          placeholder="Qtd." 
                          className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Yields</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formYields}
                            onChange={handleCurrencyChange(setFormYields)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[var(--color-accent-teal)] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-violet)] outline-none" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">IR (Imposto de Renda)</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formIr}
                            onChange={handleCurrencyChange(setFormIr)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[var(--color-accent-teal)] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-violet)] outline-none" 
                          />
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Corretora/Banco (Opcional)</label>
                      <input 
                        type="text" 
                        value={formCorretora}
                        onChange={(e) => setFormCorretora(e.target.value)}
                        placeholder="Ex: NuInvest, Banco Inter" 
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">CNPJ (Opcional)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9.\-/\\]*"
                        value={formCnpj}
                        onChange={(e) => setFormCnpj(e.target.value)}
                        placeholder="00.000.000/0000-00" 
                        className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                      />
                    </div>

                    {isTrade && (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Preço Un de Custo</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formPrecoUn}
                            onChange={handleCurrencyChange(setFormPrecoUn)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Total do Custo</label>
                          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 justify-center flex items-center text-[#2dd4bf] font-bold pointer-events-none w-full min-h-[46px]">
                            R$ {(
                                (parseFormattedNumber(formUn)) * 
                                (parseFormattedNumber(formPrecoUn))
                              ).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 mt-4">
                    <button 
                      type="submit" 
                      disabled={syncing || isFetchingMarket}
                      className="flex-1 py-4 bg-gradient-to-r from-[var(--color-accent-cyan)]/20 to-[var(--color-accent-teal)]/20 hover:from-[var(--color-accent-cyan)]/30 hover:to-[var(--color-accent-teal)]/30 border border-white/10 rounded-2xl font-bold text-white transition-all flex justify-center items-center gap-2 group shadow-[0_0_15px_rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50"
                    >
                      {isFetchingMarket ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Consultando Mercado...
                        </>
                      ) : syncing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          Registrar Operação
                        </>
                      )}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setFormDate("");
                        setFormTicker("");
                        setFormNewTicker("");
                        setFormTransacao("Compra");
                        setFormTipoAtividade("");
                        setFormNewTipoAtividade("");
                        setFormUn("");
                        setFormYields("");
                        setFormIr("");
                        setFormCorretora("");
                        setFormCnpj("");
                        setFormPrecoUn("");
                      }}
                      className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-[var(--color-accent-teal)] transition-all flex justify-center items-center backdrop-blur-md cursor-pointer outline-none"
                      title="Limpar Entrada"
                    >
                      Limpar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )}
  </AnimatePresence>
</main>
    </div>
  );
}
