import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  PieChart as PieChartIcon
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
  const norm = header.trim().replace(/\s+/g, ' ').toLowerCase();
  
  if (norm.includes('dollar') || norm.includes('dolar') || norm.includes('dólar')) return 'Dollar';
  if (norm === 'date' || norm === 'data') return 'Data';
  if (norm === 'ticker') return 'Ticker';
  if (norm.includes('transation') || norm.includes('transaction') || norm.includes('transação') || norm.includes('transacao')) return 'Transação';
  if (norm.includes('stock proceeds') || norm.includes('yields')) return 'Yields';
  if (norm === 'units' || norm === 'un' || norm === 'unit') return 'UN';
  if (norm.includes('balance units') || norm.includes('saldo de un') || norm.includes('saldo un')) return 'Saldo de Un';
  if (norm.includes('b3') && (norm.includes('unit') || norm.includes('un'))) return 'B3 Preço Un';
  if (norm.includes('b3') && (norm.includes('total') || norm.includes('val'))) return 'B3 Preço total';
  if (norm.includes('cost unit') || norm.includes('preço un') || norm.includes('preco un')) return 'Preço Un de Custo';
  if (norm.includes('total cost') && !norm.includes('balance')) return 'Total do Custo';
  if (norm.includes('balance total cost') || norm.includes('saldo custo')) return 'Saldo Custo';
  if (norm.includes('avarage price') || norm.includes('average price') || norm.includes('preço médio') || norm.includes('preco medio')) return 'Preço Médio';
  if (norm.includes('instrument type') || norm.includes('tipo atividade')) return 'Tipo Atividade';
  if (norm.includes('investment broker') || norm.includes('banco/corretora') || norm.includes('corretora')) return 'Banco/Corretora';
  if (norm === 'cnpj') return 'CNPJ';
  if (norm === 'ir') return 'IR';
  if (norm.includes('overall month')) return 'OverAll Month';
  
  return header.trim();
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'entrada'>('dashboard');
  const [allData, setAllData] = useState<any[] | null>(null);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [totalBalance, setTotalBalance] = useState<string>("$ 34,924.80");
  
  // Filter States
  const [filterTicker, setFilterTicker] = useState<string>("All");
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, '0'));
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

  // Carrega automaticamente a última planilha caso você atualize a página
  useEffect(() => {
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
  }, []);

  // Auto-preenchimento ao selecionar o Ticker
  useEffect(() => {
    if (formTicker && formTicker !== "NEW" && allData.length > 0) {
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

  const processData = (data: any[]) => {
    const validData = data.filter(r => Object.values(r).some(v => v !== "" && v != null));

    validData.sort((a, b) => {
      const parseDate = (dateStr: string) => {
        if (!dateStr || typeof dateStr !== 'string') return '00000000';
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return parts[2] + parts[1].padStart(2, '0') + parts[0].padStart(2, '0'); 
        }
        return dateStr;
      };
      return parseDate(a["Data"]).localeCompare(parseDate(b["Data"]));
    });

    // --- CÁLCULOS DE COLUNAS (Executado de baixo pra cima ordenado por data) ---
    const parseNum = (val: any) => {
      if (!val) return 0;
      let str = String(val).replace(/R\$\s?/gi, "").replace(/\$\s?/g, "").trim();
      
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
      return isNaN(num) ? 0 : num;
    };

    const tickerState = new Map<string, { saldoUn: number, saldoCusto: number }>();

    validData.forEach(row => {
      const ticker = row["Ticker"];
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING" || ticker.toUpperCase() === "TOTAL") return;

      if (!tickerState.has(ticker)) {
        tickerState.set(ticker, { saldoUn: 0, saldoCusto: 0 });
      }
      const state = tickerState.get(ticker)!;

      // Obtendo valores atuais da linha e lidando com Vendas (UN negativo para subtrair do Saldo)
      let currentUn = parseNum(row["UN"] || "0");
      const transacaoStr = String(row["Transação"] || "").toUpperCase();
      const isVenda = transacaoStr.includes("VENDA") || transacaoStr.includes("SELL");
      if (isVenda && currentUn > 0) currentUn = -currentUn;

      const precoUn = parseNum(row["Preço Un de Custo"] || "0");
      const dollarRaw = row["Dollar"] || "";
      const isDollarNotFound = dollarRaw === "NOT FOUND" || String(dollarRaw).includes("#") || dollarRaw === "";
      const dollarNum = parseNum(dollarRaw);
      const corretora = String(row["Banco/Corretora"] || "").toUpperCase();

      // Fórmulas de Saldo
      const totalCusto = currentUn * precoUn;
      const saldoUn = state.saldoUn + currentUn;
      const saldoCusto = state.saldoCusto + totalCusto;
      const precoMedio = saldoUn !== 0 ? (Math.abs(saldoCusto) / Math.abs(saldoUn)) : 0;

      // Atualiza o estado cumulativo
      state.saldoUn = saldoUn;
      state.saldoCusto = saldoCusto;

      // O normalizeHeader na importação já garantiu que as colunas se chamam "B3 Preço Un" e "B3 Preço total"
      // Lendo da chave encontrada
      const b3PrecoUnRaw = row["B3 Preço Un"] || "";
      const b3Str = String(b3PrecoUnRaw).toUpperCase();
      const isNotFound = b3Str === "NOT FOUND" || b3Str.includes("#") || b3Str === "" || b3Str.includes("ERROR") || b3Str.includes("N/A") || b3Str === "-";
      const b3PrecoUnNum = parseNum(b3PrecoUnRaw);

      // Gravando nas chaves oficiais que a tabela (REQUIRED_COLUMNS) renderiza
      if (isNotFound) {
        row["B3 Preço Un"] = "NOT FOUND";
        row["B3 Preço total"] = "NOT FOUND";
      } else {
        row["B3 Preço Un"] = `R$ ${b3PrecoUnNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
        
        let b3Total = 0;
        if (corretora.includes("NOMAD")) {
          if (isDollarNotFound) {
            row["B3 Preço total"] = "NOT FOUND (Dólar)";
          } else {
            b3Total = saldoUn * b3PrecoUnNum * dollarNum;
            row["B3 Preço total"] = `R$ ${b3Total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
        } else {
          b3Total = saldoUn * b3PrecoUnNum;
          row["B3 Preço total"] = `R$ ${b3Total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      }

      // Atualiza os valores formatados de volta na linha EXATAMENTE com o nome das colunas exigidas
      if (currentUn !== 0) {
         row["Total do Custo"] = `R$ ${totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      row["Saldo de Un"] = saldoUn.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
      row["Saldo Custo"] = `R$ ${saldoCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (precoMedio > 0) {
        row["Preço Médio"] = `R$ ${precoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
      }
    });

    setAllData(validData);
  };

  // ----- Memos for Filtering and Computed Data -----

  const tickers = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => r["Ticker"]).filter(t => t && t.toUpperCase() !== 'MONTH CLOSING'))).sort();
  }, [allData]);

  const atividades = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => String(r["Tipo Atividade"] || "").trim()).filter(Boolean))).sort();
  }, [allData]);

  const corretoras = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => String(r["Banco/Corretora"] || "").trim()).filter(Boolean))).sort();
  }, [allData]);

  const years = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => {
      const parts = r["Data"]?.split('/');
      return parts?.length === 3 ? parts[2] : null;
    }).filter(Boolean))).sort().reverse();
  }, [allData]);

  const months = useMemo(() => {
    if (!allData) return [];
    return Array.from(new Set(allData.map(r => {
      const parts = r["Data"]?.split('/');
      return parts?.length === 3 ? parts[1] : null;
    }).filter(Boolean))).sort();
  }, [allData]);

  const monthNames: Record<string, string> = {
    "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
    "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez"
  };

  const filteredData = useMemo(() => {
    if (!allData) return null;
    return allData.filter(row => {
      const parts = row["Data"] ? row["Data"].split('/') : [];
      const month = parts.length === 3 ? parts[1] : "";
      const year = parts.length === 3 ? parts[2] : "";
      
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
    const targetYM = (y === "All" || m === "All") ? "999999" : y + m;
    
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
      const rowYM = parts[2] + parts[1];
      
      if (rowYM <= targetYM) {
        const b3TotalStr = row["B3 Preço total"];
        if (b3TotalStr && b3TotalStr.trim() !== "" && b3TotalStr !== "NOT FOUND") {
          latestValues.set(ticker, parseMoney(b3TotalStr));
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
      const parts = row["Data"] ? row["Data"].split('/') : [];
      const m = parts.length === 3 ? parts[1] : "";
      const y = parts.length === 3 ? parts[2] : "";
      
      const matchYear = filterYear === "All" || y === filterYear;
      const matchMonth = filterMonth === "All" || m === filterMonth;
      const matchTicker = filterTicker === "All" || row["Ticker"] === filterTicker;
      
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
      if (!ticker || ticker.toUpperCase() === "MONTH CLOSING") return;
      
      const parts = row["Data"] ? row["Data"].split('/') : [];
      if (parts.length !== 3) return;
      const rowYM = parts[2] + parts[1];
      
      if (rowYM <= targetYM) {
        const b3TotalStr = row["B3 Preço total"];
        if (b3TotalStr && b3TotalStr !== "NOT FOUND") {
          latestTickerInfo.set(ticker, {
            value: parseMoney(b3TotalStr),
            type: String(row["Tipo Atividade"] || "Outros"),
            broker: String(row["Banco/Corretora"] || "Outros")
          });
        }
      }
    });

    const aggregated = new Map<string, number>();
    latestTickerInfo.forEach((info, ticker) => {
      let key = ticker;
      if (pieViewMode === 'Tipo Atividade') key = info.type;
      if (pieViewMode === 'Banco/Corretora') key = info.broker;
      
      aggregated.set(key, (aggregated.get(key) || 0) + info.value);
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
      <div className="bg-blobs"></div>
      
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
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 bg-[var(--color-accent-teal)]/10 hover:bg-[var(--color-accent-teal)]/20 border border-[var(--color-accent-teal)]/30 text-[var(--color-accent-teal)] rounded-xl transition-colors flex items-center justify-center group shadow-[0_0_15px_rgba(45,212,191,0.15)]"
            title="Importar CSV"
          >
            <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
          <button className="hidden sm:block glass-button p-1 rounded-full outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] focus:ring-opacity-50">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[var(--color-accent-violet)] to-[var(--color-accent-teal)] p-[2px]">
              <div className="w-full h-full rounded-full bg-slate-900 border border-white/20 flex items-center justify-center overflow-hidden">
                 <img src="https://picsum.photos/seed/portrait/100/100" alt="Avatar" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
              </div>
            </div>
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
              ? 'bg-[var(--color-accent-cyan)]/20 text-[#11538d] shadow-[inset_0_0_12px_rgba(45,212,191,0.2)] border border-[var(--color-accent-cyan)]/30' 
              : 'text-[#11538d] hover:bg-white/5 border border-transparent'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 text-[#11538d]" />
          <span className="hidden sm:inline text-[#11538d]">Dashboard</span>
        </button>
        <div className="w-px h-6 bg-[#11538d]/20 mx-1"></div>
        <button 
          onClick={() => setActiveTab('historico')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'historico' 
              ? 'bg-[var(--color-accent-teal)]/20 text-[#11538d] shadow-[inset_0_0_12px_rgba(45,212,191,0.2)] border border-[var(--color-accent-teal)]/30' 
              : 'text-[#11538d] hover:bg-white/5 border border-transparent'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 text-[#11538d]" />
          <span className="hidden sm:inline text-[#11538d]">Histórico</span>
        </button>
        <div className="w-px h-6 bg-[#11538d]/20 mx-1"></div>
        <button 
          onClick={() => setActiveTab('entrada')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all ${
            activeTab === 'entrada' 
              ? 'bg-[var(--color-accent-violet)]/20 text-[#11538d] shadow-[inset_0_0_12px_rgba(167,139,250,0.2)] border border-[var(--color-accent-violet)]/30' 
              : 'text-[#11538d] hover:bg-white/5 border border-transparent'
          }`}
        >
          <PlusSquare className="w-5 h-5 text-[#11538d]" />
          <span className="hidden sm:inline text-[#11538d]">Nova Entrada</span>
        </button>
      </motion.nav>

      {/* Main Content Area */}
      <main className="w-full max-w-5xl px-6 pt-32 pb-36 flex flex-col gap-8 relative z-10 mx-auto">

        <AnimatePresence mode="wait">
          {(activeTab === 'dashboard' || activeTab === 'historico') && (
            <motion.div 
              key="global-filters"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass-panel px-4 sm:px-6 py-4 rounded-[20px] sm:rounded-[24px] flex flex-col sm:flex-row items-start sm:items-center justify-start sm:justify-between gap-4 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
            >
              <div className="flex overflow-x-auto w-full custom-scrollbar pb-2 sm:pb-0 items-center justify-start sm:justify-end gap-3 sm:gap-6">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                    <Filter className="w-4 h-4 text-cyan-500" />
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Ticker</span>
                  <select 
                    value={filterTicker}
                    onChange={(e) => setFilterTicker(e.target.value)}
                    disabled={!allData}
                    className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[5rem] px-3 h-[38px] text-sm text-cyan-500 font-bold focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                  >
                    <option value="All" className="bg-slate-900 text-white">Todos</option>
                    {tickers.map(t => <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>)}
                  </select>
                </div>

                <div className="w-px h-6 bg-white/5 mx-1"></div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mês</span>
                  <select 
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    disabled={!allData}
                    className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[4rem] px-3 h-[38px] text-sm text-violet-700 font-bold focus:outline-none focus:ring-1 focus:ring-violet-700 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                  >
                    <option value="All" className="bg-slate-900 text-white">Todos</option>
                    {months.map(m => <option key={m} value={m} className="bg-slate-900 text-white">{monthNames[m] || m}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ano</span>
                  <select 
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    disabled={!allData}
                    className="appearance-none text-center bg-white/5 backdrop-blur-md border border-white/10 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)] rounded-xl min-w-[4rem] px-3 h-[38px] text-sm text-violet-700 font-bold focus:outline-none focus:ring-1 focus:ring-violet-700 cursor-pointer disabled:opacity-50 transition-all hover:bg-white/10 outline-none"
                  >
                    <option value="All" className="bg-slate-900 text-white">Todos</option>
                    {years.map(y => <option key={String(y)} value={String(y)} className="bg-slate-900 text-white">{y}</option>)}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                  
                  <div className="flex flex-col md:flex-row gap-6 flex-1">
                    {/* Lateral View Selection Buttons */}
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-32 lg:w-40 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 custom-scrollbar">
                      {(['Ticker', 'Tipo Atividade', 'Banco/Corretora'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setPieViewMode(mode)}
                          className={`flex-1 md:flex-none w-full px-4 h-[38px] rounded-xl text-sm font-bold transition-all backdrop-blur-md border outline-none text-left flex items-center whitespace-nowrap ${
                            pieViewMode === mode 
                              ? 'bg-white/10 border-cyan-500/50 text-cyan-500 shadow-[3px_3px_12px_rgba(0,0,0,0.5),inset_2px_2px_8px_rgba(255,255,255,0.1),inset_-2px_-2px_8px_rgba(0,0,0,0.4)]' 
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          {mode === 'Ticker' ? 'Ticker' : mode === 'Tipo Atividade' ? 'Atividade' : 'Corretora'}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 w-full relative min-h-[350px]">
                      {computedAllocationData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={computedAllocationData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="none"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {computedAllocationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'rgba(13, 27, 42, 0.8)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(8px)',
                                color: '#fff'
                              }}
                              formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, 'Valor']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
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
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                             {filteredData.map((row, i) => (
                               <tr key={i} className="hover:bg-white/5 transition-colors">
                                 {REQUIRED_COLUMNS.map((colKey, j) => (
                                   <td key={j} className="p-4 text-slate-300 font-medium">
                                     {row[colKey] ? String(row[colKey]) : '-'}
                                   </td>
                                 ))}
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
                <form className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[#11538d]">Data</label>
                      <input 
                        type="date" 
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]" 
                      />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[#11538d]">Ticker/Ativo</label>
                      <select 
                        value={formTicker}
                        onChange={(e) => setFormTicker(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none"
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
                          className="bg-white/5 border border-[var(--color-accent-cyan)]/50 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] mt-1 animate-in fade-in slide-in-from-top-2" 
                        />
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[#11538d]">Transação</label>
                      <select 
                        value={formTransacao}
                        onChange={(e) => setFormTransacao(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none"
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
                      <label className="text-sm font-medium text-[#11538d]">Tipo Atividade</label>
                      <select 
                        value={formTipoAtividade}
                        onChange={(e) => setFormTipoAtividade(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] appearance-none"
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
                          className="bg-white/5 border border-[var(--color-accent-cyan)]/50 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)] mt-1 animate-in fade-in slide-in-from-top-2" 
                        />
                      )}
                    </div>

                    {isTrade ? (
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-[#11538d]">UN (Quantidade)</label>
                        <input 
                          type="number" 
                          step="any"
                          inputMode="decimal"
                          value={formUn}
                          onChange={(e) => setFormUn(e.target.value)}
                          placeholder="Qtd." 
                          className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]" 
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-[#11538d]">Yields</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formYields}
                            onChange={(e) => setFormYields(e.target.value)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-violet)]" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-[#11538d]">IR (Imposto de Renda)</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formIr}
                            onChange={(e) => setFormIr(e.target.value)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-violet)]" 
                          />
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[#11538d]">Corretora/Banco (Opcional)</label>
                      <input 
                        type="text" 
                        value={formCorretora}
                        onChange={(e) => setFormCorretora(e.target.value)}
                        placeholder="Ex: NuInvest, Banco Inter" 
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]" 
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-[#11538d]">CNPJ (Opcional)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9.\-/\\]*"
                        value={formCnpj}
                        onChange={(e) => setFormCnpj(e.target.value)}
                        placeholder="00.000.000/0000-00" 
                        className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]" 
                      />
                    </div>

                    {isTrade && (
                      <>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-[#11538d]">Preço Un de Custo</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            value={formPrecoUn}
                            onChange={(e) => setFormPrecoUn(e.target.value)}
                            placeholder="R$ 0,00" 
                            className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-cyan)]" 
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-sm font-medium text-[#11538d]">Total do Custo</label>
                          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-black font-semibold pointer-events-none">
                            R$ {(
                                (parseFloat(formUn) || 0) * 
                                (parseFloat(formPrecoUn.replace(',', '.')) || 0)
                              ).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <button type="button" className="mt-4 w-full py-4 bg-gradient-to-r from-[var(--color-accent-cyan)]/20 to-[var(--color-accent-teal)]/20 hover:from-[var(--color-accent-cyan)]/30 hover:to-[var(--color-accent-teal)]/30 border border-white/10 rounded-2xl font-bold text-white transition-all flex justify-center items-center gap-2 group shadow-[0_0_15px_rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    Registrar Operação
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
