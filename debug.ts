const mockHeaders = [
  "Date", "Ticker", "Transation", "Stock Proceeds", "Units", "Balance Units", 
  "Cost  Unit Price", "Total Cost (H*J)", "Balance Total Cost (prior + K)", 
  "Avarage Price (K/H(", "B3 Unit Price", "B3  Total Price  (H*M)", 
  "Instrument Type", "Investment Broker", "CNPJ", "IR", "Dollar Date "
];

const normalizeHeader = (header) => {
  const norm = header.trim().replace(/\s+/g, ' ').toLowerCase();
  
  if (norm.includes('dollar') || norm.includes('dolar')) return 'Dollar';
  if (norm === 'date' || norm === 'data') return 'Data';
  if (norm === 'ticker') return 'Ticker';
  if (norm.includes('transation') || norm.includes('transaction') || norm.includes('transação') || norm.includes('transacao')) return 'Transação';
  if (norm.includes('stock proceeds') || norm.includes('yields')) return 'Yields';
  if (norm === 'units' || norm === 'un' || norm === 'unit') return 'UN';
  if (norm.includes('balance units') || norm.includes('saldo de un') || norm.includes('saldo un')) return 'Saldo de Un';
  if (norm.includes('cost unit') || norm.includes('preço un') || norm.includes('preco un')) return 'Preço Un de Custo';
  if (norm.includes('total cost') && !norm.includes('balance')) return 'Total do Custo';
  if (norm.includes('balance total cost') || norm.includes('saldo custo')) return 'Saldo Custo';
  if (norm.includes('avarage price') || norm.includes('average price') || norm.includes('preço médio') || norm.includes('preco medio')) return 'Preço Médio';
  if (norm.includes('b3 unit price') || norm.includes('b3 preço un') || norm.includes('b3 preco un')) return 'B3 Preço Un da B3';
  if (norm.includes('b3 total price') || norm.includes('b3 preço total') || norm.includes('b3 preco total')) return 'B3 Preço total';
  if (norm.includes('instrument type') || norm.includes('tipo atividade')) return 'Tipo Atividade';
  if (norm.includes('investment broker') || norm.includes('banco/corretora') || norm.includes('corretora')) return 'Banco/Corretora';
  if (norm === 'cnpj') return 'CNPJ';
  if (norm === 'ir') return 'IR';
  if (norm.includes('overall month')) return 'OverAll Month';
  
  return header.trim();
};

console.log(mockHeaders.map(normalizeHeader));
