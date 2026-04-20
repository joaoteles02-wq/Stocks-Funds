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
  BarChart,
  Bar,
  YAxis
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
  
  if (norm === 'date' || norm === 'data' || norm.startsWith('data') || norm.includes('negôcio') || norm.includes('negócio') || norm.includes('negocio') || norm.includes('pregao') || norm.includes('pregão') || norm === 'dia' || norm.includes('liquidação') || norm.includes('liquidacao')) return 'Data';
  
  if (norm === 'ticker' || norm === 'ativo' || norm === 'papel' || norm.includes('código') || norm.includes('codigo') || norm.includes('instrumento') || norm.includes('produto') || norm.includes('símbolo') || norm.includes('simbolo') || norm.includes('ação') || norm.includes('acao')) return 'Ticker';
  
  if (norm.includes('transation') || norm.includes('transaction') || norm.includes('transação') || norm.includes('transacao') || norm.includes('operação') || norm.includes('operacao') || norm.includes('movimentação') || norm.includes('tipo de ordem') || norm === 'tipo' || norm === 'movimentacao') return 'Transação';
  
  if (norm.includes('stock proceeds') || norm.includes('yields') || norm.includes('rendimentos') || norm.includes('proventos') || norm.includes('dividendos') || norm.includes('juros') || norm.includes('jcp') || norm === 'valor bruto' || norm === 'rendimento') return 'Yields';
  
  if (norm === 'units' || norm === 'un' || norm === 'unit' || norm.includes('quantidade') || norm.includes('qtd') || norm === 'volume' || norm === 'quantidade (un)') return 'UN';
  
  if (norm.includes('balance units') || norm.includes('saldo de un') || norm.includes('saldo un') || norm.includes('quantidade acumulada') || norm.includes('saldo de un.')) return 'Saldo de Un';
  
  if (norm.includes('b3') && (norm.includes('unit') || norm.includes('un'))) return 'B3 Preço Un';
  
  if (norm.includes('b3') && (norm.includes('total') || norm.includes('val'))) return 'B3 Preço total';
  
  if (norm.includes('cost unit') || norm.includes('preço un') || norm.includes('preco un') || norm.includes('valor unitário') || norm.includes('preco unitario') || norm.includes('preço unitário') || norm === 'preço' || norm === 'preco' || norm === 'custo un') return 'Preço Un de Custo';
  
  if ((norm.includes('total cost') || norm.includes('custo total')) && !norm.includes('balance') || norm.includes('valor total') || norm.includes('valor da operação') || norm.includes('valor liquido') || norm.includes('valor líquido')) return 'Total do Custo';
  
  if (norm.includes('balance total cost') || norm.includes('saldo custo') || norm.includes('custo total acumulado') || norm.includes('saldo de custo')) return 'Saldo Custo';
  
  if (norm.includes('avarage price') || norm.includes('average price') || norm.includes('preço médio') || norm.includes('preco medio') || norm === 'pm' || norm === 'preço medio') return 'Preço Médio';
  
  if (norm.includes('instrument type') || norm.includes('tipo atividade') || norm.includes('categoria') || norm.includes('tipo de ativo') || norm.includes('mercado') || norm.includes('especificação') || norm === 'classe') return 'Tipo Atividade';
  
  if (norm.includes('investment broker') || norm.includes('banco/corretora') || norm.includes('corretora') || norm.includes('instituição') || norm.includes('instituicao') || norm.includes('agente') || norm === 'banco') return 'Banco/Corretora';
  
  if (norm === 'cnpj') return 'CNPJ';
  
  if (norm === 'ir' || norm.includes('imposto') || norm.includes('irrf') || norm === 'taxa' || norm === 'imposto de renda') return 'IR';
  
  if (norm.includes('overall month')) return 'OverAll Month';
  
  return header.trim();
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entrada' | 'historico' | 'swing-trade'>('dashboard');
  const [tableColumns, setTableColumns] = useState<string[]>([]);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // 1. Initial Load (Synchronous as possible to prevent white flickering)
  const [allData, setAllData] = useState<any[] | null>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('saved_csv_data') : null;
    if (saved) {
      try {
        const results = Papa.parse(saved, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeHeader,
          transform: (value) => value.trim(),
        });
        return results.data;
      } catch (e) { return null; }
    }
    return null;
  });

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
  
  // Filter States
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  
  const [filterTicker, setFilterTicker] = useState<string>("All");
  const [filterYear, setFilterYear] = useState<string>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [filterTipoAtividade, setFilterTipoAtividade] = useState<string>("All");
  const [pieViewMode, setPieViewMode] = useState<'Ticker' | 'Tipo Atividade' | 'Banco/Corretora'>('Ticker');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchFinancialMarketInfo = async (ticker: string, date: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // Hoy is 2026-04-20
      const prompt = `Atue como um analista financeiro com acesso a dados em tempo real. 
      Hoje é dia 20/04/2026.
      
      Eu preciso das seguintes informações financeiras precisas para a data "${date}":
      1. Preço de fechamento (ou cotação atual se for hoje) do ativo "${ticker}". 
         - Se o ativo for brasileiro (ex: PETR4, VALE3, ITUB4), o preço deve ser em Reais (BRL).
         - Se o ativo for americano (ex: AAPL, TSLA, MSFT), o preço deve ser em Dólares (USD).
      2. Cotação do Dólar Comercial (USDBRL) para venda na data "${date}".
      
      Retorne APENAS um objeto JSON válido:
      {
        "price": number, // O preço unitário do ativo
        "dollar": number // O valor de 1 USD em BRL (ex: 5.25)
      }
      
      Use a ferramenta de busca para garantir que os valores são reais e atualizados para ${date}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} } as any],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              price: { type: Type.NUMBER },
              dollar: { type: Type.NUMBER }
            },
            required: ["price", "dollar"]
          }
        }
      });

      return JSON.parse(response.text || "{}");
    } catch (e) {
      console.error("Gemini fetch failed", e);
      return null;
    }
  };

  const fetchSwingTradeBatch = async (tickersToFetch: string[]) => {
    if (tickersToFetch.length === 0) return;
    setIsFetchingSwing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // Use standard B3 suffix for better search results if they look like B3 tickers
      const formattedTickers = tickersToFetch.map(t => {
        const clean = t.trim().toUpperCase();
        // Brazilian B3 tickers are usually 4 or 5 chars starting with letters and ending with numbers
        if (/^[A-Z]{4}[0-9]{1,2}$/.test(clean)) {
          return `${clean}.SA`;
        }
        return clean;
      });

      const prompt = `Como um analista financeiro Sênior, eu preciso das cotações de fechamento (ou preço atual se for hoje 20/04/2026) para os seguintes tickers: ${formattedTickers.join(', ')}.
      
      IMPORTANTE:
      - Tickers terminando em .SA são da Bovespa (Brasil) e os preços DEVEM ser em REAIS (BRL). Pesquise por "cotação [ticker] b3" ou "fechamento [ticker] [data]".
      - Tickers americanos (sem .SA) são em DÓLARES (USD).
      
      Datas requeridas para CADA ativo:
      1. HOJE: 20/04/2026
      2. 7 dias atrás: 13/04/2026
      3. 31 dias atrás: 20/03/2026
      4. 365 dias atrás: 20/04/2025
      5. Início de 2026: 02/01/2026
      
      Retorne um JSON rigoroso onde as chaves são os nomes originais (sem .SA): ${tickersToFetch.join(', ')}.
      Exemplo de busca sugerida para a ferramenta: "VALE3.SA historical price April 20 2026".
      
      Se não houver dados para uma data, retorne 0.0 para esse campo específico.`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} } as any],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            additionalProperties: {
              type: Type.OBJECT,
              properties: {
                current: { type: Type.NUMBER },
                hist7d: { type: Type.NUMBER },
                hist31d: { type: Type.NUMBER },
                hist365d: { type: Type.NUMBER },
                histYTD: { type: Type.NUMBER }
              },
              required: ["current", "hist7d", "hist31d", "hist365d", "histYTD"]
            }
          }
        }
      });

      const rawText = response.text || "{}";
      const raw = JSON.parse(rawText);
      const updatedData = { ...swingTradeData };
      
      // Normalize raw keys for better matching
      const normalizedRaw: Record<string, any> = {};
      Object.keys(raw).forEach(key => {
        const normKey = key.trim().toUpperCase().replace(/\.SA$/, '');
        normalizedRaw[normKey] = raw[key];
      });

      tickersToFetch.forEach(t => {
        const cleanT = t.trim().toUpperCase();
        const data = normalizedRaw[cleanT];
        
        if (data && typeof data.current === 'number' && data.current > 0) {
          const cur = data.current;
          const calcPerf = (old: any) => {
            if (typeof cur === 'number' && cur > 0 && typeof old === 'number' && old > 0) {
              return (cur / old) - 1;
            }
            return "NOT FOUND";
          };

          updatedData[t] = { 
            currentPrice: cur,
            perfWeek: calcPerf(data.hist7d),
            perfMonth: calcPerf(data.hist31d),
            perfYear: calcPerf(data.hist365d),
            perfYTD: calcPerf(data.histYTD)
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
      
      const unNum = parseFloat(formUn) || 0;
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
        "Transação": formTransacao,
        "Tipo Atividade": formTipoAtividade === "NEW" ? formNewTipoAtividade : formTipoAtividade,
        "UN": isTrade ? formUn : "",
        "Preço Un de Custo": isTrade ? formPrecoUn : "",
        "Yields": !isTrade ? formYields : "",
        "IR": formIr,
        "Banco/Corretora": bancoCorretora,
        "CNPJ": formCnpj,
        "B3 Preço Un": b3PrecoUn.toFixed(4),
        "B3 Preço total": b3PrecoTotal.toFixed(2),
        "Dollar": dollar.toFixed(4),
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
      if (rowToDelete.id) {
        // From Firestore
        setSyncing(true);
        await deleteDoc(doc(db, "investments", rowToDelete.id));
        setSyncing(false);
      } else {
        // Local Data (CSV)
        const saved = localStorage.getItem('saved_csv_data');
        if (saved) {
          const results = Papa.parse(saved, { header: true, skipEmptyLines: true });
          // Find original match for local records
          const newData = results.data.filter((r: any) => {
            return !(r.Ticker === rowToDelete.Ticker && r.Data === rowToDelete.Data && r.UN === String(rowToDelete.UN));
          });
          const newCsv = Papa.unparse(newData);
          localStorage.setItem('saved_csv_data', newCsv);
          
          // Re-process local data state manually for instant update
          setAllData(prev => prev ? prev.filter(r => r !== rowToDelete) : null);
        }
      }
      setRowToDelete(null);
    } catch (error) {
      console.error("Delete failed", error);
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
        },
      });
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

  const handleAppendToSheets = async (record: any) => {
    if (!sheetsTokens || !spreadsheetId) return;

    const cleanId = spreadsheetId.includes('/d/') 
      ? spreadsheetId.split('/d/')[1].split('/')[0] 
      : spreadsheetId.trim();

    // Map record to array matching COLUMNS
    const rowDataArr = REQUIRED_COLUMNS.map(col => record[col] || "");

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
        alert(`Aviso: O registro foi salvo no App, mas não pôde ser enviado para o Google Sheets: ${err.details || err.error}`);
      } else {
        console.log("Successfully appended to Sheets");
      }
    } catch (error) {
      console.error("Error writing to Sheets API:", error);
    }
  };

  // Firestore Sync Effect
  useEffect(() => {
    if (!user) {
      setAllData(null);
      return;
    }

    const q = query(
      collection(db, "investments"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setAllData(processDataPure(data));
    });

    return () => unsubscribe();
  }, [user]);

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

  const handleExportCSV = () => {
    if (!allData) return;
    const csv = Papa.unparse(allData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `investimentos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    // Restaurando arquivo em memória caso o usuário atualize a página antes de mandar pra nuvem
    const saved = localStorage.getItem('saved_csv_data');
    if (saved) {
      Papa.parse(saved, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        transform: (value) => value.trim(),
        complete: (results) => {
          setTableColumns(results.meta.fields || []);
          processData(results.data as any[]);
        },
      });
    }
  }, []);

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
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      const cleanCsv = text.replace(/,\s+"/g, ',"').replace(/"\s+,/g, '",');
      // Salva o CSV na memória do navegador para não precisar submeter de novo
      localStorage.setItem('saved_csv_data', cleanCsv);
      
      Papa.parse(cleanCsv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        transform: (value) => value.trim(),
        complete: (results) => {
          setTableColumns(results.meta.fields || []);
          processData(results.data as any[]);
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
      .filter(r => r["Ticker"] !== "" && r["Ticker"] !== "TOTAL");

    // 2. Desduplicação por Assinatura (Fingerprint)
    const uniqueMap = new Map<string, any>();
    cleanRows.forEach(row => {
      let parts: string[] = [];
      const tipoAtiv = String(row["Tipo Atividade"] || "").trim().toUpperCase();
      const transacao = String(row["Transação"] || "").trim().toUpperCase();
      
      // Para rendimentos, quantidade e preço muitas vezes vêm zerados de formas diferentes
      // na mesma corretora, o que quebra a desduplicação e soma duas vezes
      const isYield = tipoAtiv.includes("RENDIMENTO") || tipoAtiv.includes("JURO") || tipoAtiv.includes("DIVIDEND") ||
                      transacao.includes("RENDIMENTO") || transacao.includes("JURO") || transacao.includes("DIVIDEND") || transacao.includes("JCP");
                      
      if (isYield) {
        // Reduzimos a assinatura para ignorar textos de transação que podem 
        // diferir por 1 letra (causando o duplicado de 58.10)
        parts = [
          row["Data"],
          row["Ticker"],
          row["Banco/Corretora"],
          row["_yields_fixed"]
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

    // 3. Ordenação Cronológica
    dedupedData.sort((a, b) => {
      const getComparable = (dateStr: string) => {
        if (!dateStr || typeof dateStr !== 'string') return "00000000";
        const p = dateStr.split('/');
        if (p.length !== 3) return "00000000";
        return p[2] + p[1] + p[0]; // YYYYMMDD
      };
      return getComparable(a["Data"]).localeCompare(getComparable(b["Data"]));
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
      
      // B3 Pricing (Mantém lógica anterior se já existir valor de mercado vindo do CSV ou se quiser re-calcular)
      // Para brevidade e foco na correção do desaparecimento, mantemos a lógica de formatação de B3 se o valor existir
      const b3Un = parseNum(row["B3 Preço Un"]);
      if (b3Un > 0) {
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
    return Array.from(new Set(allData.map(r => r["Ticker"]).filter(t => t && t.toUpperCase() !== 'MONTH CLOSING'))).sort();
  }, [allData]);

  // Auto-fetch Swing Trade Data when tab is selected
  useEffect(() => {
    if (activeTab === 'swing-trade' && tickers.length > 0 && Object.keys(swingTradeData).length === 0 && !isFetchingSwing) {
      fetchSwingTradeBatch(tickers);
    }
  }, [activeTab, tickers, swingTradeData, isFetchingSwing]);

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
      
      const matchYear = filterYear === "All" || year === filterYear;
      const matchMonth = filterMonth === "All" || month === filterMonth;
      const matchTicker = filterTicker === "All" || row["Ticker"] === filterTicker;
      return matchYear && matchMonth && matchTicker;
    });
  }, [allData, filterTicker, filterYear, filterMonth]);

  const parseMoney = (val: any) => {
    if (!val) return 0;
    const str = String(val).replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const getPatrimonioFor = (t: string, y: string, m: string, tp: string = "All", c: string = "All") => {
    if (!allData) return 0;
    
    // Convert target year/month to a comparable string YYYYMM
    const targetYM = (y === "All" || m === "All") ? "999999" : y + m.padStart(2, '0');
    
    // Group by Ticker and find the last row that is <= targetYM
    const latestValues = new Map<string, number>();
    
    // Important: allData must be sorted by date (already handled in processData)
    allData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING") return;
      
      const matchTicker = t === "All" || ticker === t;
      if (!matchTicker) return;

      const tipoAtiv = String(row["Tipo Atividade"] || "").trim();
      const matchTipo = tp === "All" || tipoAtiv === tp;
      if (!matchTipo) return;

      const corr = String(row["Banco/Corretora"] || "").trim();
      const matchCorretora = c === "All" || corr === c;
      if (!matchCorretora) return;

      const parts = row["Data"] ? row["Data"].split('/') : [];
      if (parts.length !== 3) return;
      const rowYM = parts[2] + parts[1].padStart(2, '0');
      
      if (rowYM <= targetYM) {
        // Usamos Saldo Custo como fallback se B3 total não estiver disponível
        const b3TotalStr = row["B3 Preço total"];
        const saldoCustoStr = row["Saldo Custo"];
        
        if (b3TotalStr && b3TotalStr.trim() !== "" && b3TotalStr !== "NOT FOUND") {
          latestValues.set(ticker, parseMoney(b3TotalStr));
        } else if (saldoCustoStr && saldoCustoStr.trim() !== "") {
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
    const sum = getPatrimonioFor(filterTicker, filterYear, filterMonth);
    return `R$ ${sum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [allData, filterTicker, filterYear, filterMonth]);

  const computedYields = useMemo(() => {
    if (!allData) return "R$ 0,00";
    let sumYields = 0;
    
    allData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING" || ticker.toUpperCase() === "TOTAL") return;

      const parts = row["Data"] ? row["Data"].split('/') : [];
      const m = parts.length === 3 ? parts[1] : "";
      const y = parts.length === 3 ? parts[2] : "";
      
      const matchYear = filterYear === "All" || y === filterYear;
      const matchMonth = filterMonth === "All" || m === filterMonth;
      const matchTicker = filterTicker === "All" || ticker === filterTicker;
      
      if (matchYear && matchMonth && matchTicker && row["Yields"]) {
        sumYields += parseMoney(row["Yields"]);
      }
    });
    return `R$ ${sumYields.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [allData, filterTicker, filterYear, filterMonth]);

  const computedAllocationData = useMemo(() => {
    if (!allData) return [];
    const targetYM = (filterYear === "All" || filterMonth === "All") ? "999999" : filterYear + filterMonth;
    
    // Para alocação, pegamos o último valor de cada ticker até a data alvo
    const latestTickerInfo = new Map<string, { value: number, type: string, broker: string }>();
    
    allData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING" || ticker.toUpperCase() === "TOTAL") return;
      
      const parts = row["Data"] ? row["Data"].split('/') : [];
      if (parts.length !== 3) return;
      const rowYM = parts[2] + parts[1];
      
      if (rowYM <= targetYM) {
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
           backgroundImage: `linear-gradient(to bottom, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.15)), url('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600')`,
           backgroundSize: `100% 100%, 80%`,
           backgroundRepeat: `no-repeat, repeat`,
           backgroundPosition: `center, center`,
           filter: `brightness(1.2)`
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
                className="p-2.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-500 rounded-xl transition-all flex items-center justify-center group shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                title="Configurações e Ações"
              >
                <Settings className={`w-5 h-5 transition-transform duration-500 ${showSettings ? 'rotate-90' : 'group-hover:rotate-45'}`} />
              </button>
              <div className="hidden sm:block glass-button p-1 rounded-full overflow-hidden">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[var(--color-accent-violet)] to-[var(--color-accent-teal)] p-[2px]">
                  <div className="w-full h-full rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden">
                     <img src={user.photoURL || "https://picsum.photos/seed/portrait/100/100"} alt="Avatar" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </div>
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
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 bg-[var(--color-accent-teal)]/10 hover:bg-[var(--color-accent-teal)]/20 border border-[var(--color-accent-teal)]/30 text-[var(--color-accent-teal)] rounded-xl transition-colors flex items-center justify-center group shadow-[0_0_15px_rgba(45,212,191,0.15)]"
            title="Importar CSV"
          >
            <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
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
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Table className="w-6 h-6 text-violet-400" />
                    Integração Google Sheets
                  </h3>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-slate-400">
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
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 font-medium">
                        <CheckCircle2 className="w-5 h-5" />
                        Google Sheets Conectado
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
                    <p className="text-[10px] text-slate-500 italic">
                      Dica: O ID é a parte da URL entre '/d/' e '/edit'. Ex: docs.google.com/spreadsheets/d/<b>SEU_ID_AQUI</b>/edit
                    </p>
                  </div>
                </div>

                {/* Quick Actions moved here */}
                <div className="mt-4 pt-6 border-t border-white/10 flex flex-wrap items-center gap-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest w-full mb-1">Ações de Conta & Dados</h4>
                  
                  <button 
                    onClick={handleSyncToCloud}
                    disabled={syncing || !allData}
                    className="flex-1 min-w-[140px] p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                  >
                    {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cloud className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    <span className="text-sm font-bold">Sincronizar Nuvem</span>
                  </button>

                  <button 
                    onClick={handleExportCSV}
                    className="flex-1 min-w-[140px] p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-500 rounded-xl transition-all flex items-center justify-center gap-2 group"
                  >
                    <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                    <span className="text-sm font-bold">Exportar CSV</span>
                  </button>

                  <button 
                    onClick={handleLogout}
                    className="flex-1 min-w-[140px] p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl transition-all flex items-center justify-center gap-2 group"
                  >
                    <LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    <span className="text-sm font-bold">Sair da Conta</span>
                  </button>
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
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-bold text-teal-400 hover:underline"
                >
                  Importar CSV localmente
                </button>
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
                        className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[7rem] px-4 h-[42px] text-sm text-[var(--color-accent-teal)] font-bold focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
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
                  
                  <input 
                    type="file" 
                    accept=".csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
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
                  
                  <div className="flex-1 w-full -ml-4 min-h-[120px]">
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
                       <span className="text-sm text-[var(--color-accent-violet)] font-medium bg-[var(--color-accent-violet)]/10 px-3 py-1 rounded-lg">
                         {filteredData.length} registros no filtro
                       </span>
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
                        <th className="p-4 font-semibold text-[var(--color-accent-cyan)] border-b border-white/10 uppercase tracking-wider">Ticker</th>
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
                          if (!info) return <span className="text-slate-500 italic">-</span>;
                          if (typeof perf === 'number') {
                            return (
                              <span className={perf >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {perf >= 0 ? '+' : ''}{(perf * 100).toFixed(2)}%
                              </span>
                            );
                          }
                          return <span className="text-slate-500 uppercase text-[10px]">{perf}</span>;
                        };

                        return (
                          <tr key={ticker} className="hover:bg-white/5 transition-colors group">
                            <td className="p-4 text-white font-bold">{ticker}</td>
                            <td className="p-4 text-slate-300">
                              {isFetchingSwing && !info ? (
                                <div className="flex items-center gap-2 text-slate-500 italic">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Buscando...
                                </div>
                              ) : info && info.currentPrice > 0 ? (
                                <span className="font-mono text-white">
                                  R$ {info.currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : info && info.currentPrice === 0 ? (
                                <span className="text-rose-500/70 font-bold uppercase text-[10px]">NOT FOUND</span>
                              ) : (
                                <span className="text-slate-500 italic">Aguardando atualização...</span>
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
                          <td colSpan={6} className="p-12 text-center text-slate-500 italic">
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
                            onChange={(e) => setFormYields(e.target.value)}
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
                            onChange={(e) => setFormIr(e.target.value)}
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
                            onChange={(e) => setFormPrecoUn(e.target.value)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-[#2dd4bf] font-bold placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] outline-none" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] sm:text-xs font-bold text-white uppercase tracking-widest">Total do Custo</label>
                          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 justify-center flex items-center text-[#2dd4bf] font-bold pointer-events-none w-full min-h-[46px]">
                            R$ {(
                                (parseFloat(formUn) || 0) * 
                                (parseFloat(formPrecoUn.replace(',', '.')) || 0)
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
