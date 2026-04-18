import Papa from 'papaparse';
import fs from 'fs';

let csvText = fs.readFileSync('./public/data.csv', 'utf8');

// Fix spaces before/after quotes mapping to proper CSV formatting before Papa parses it
csvText = csvText.replace(/,\s+"/g, ',"').replace(/"\s+,/g, '",');

const normalizeHeader = (header) => {
  const norm = header.trim().replace(/\s+/g, ' ').toLowerCase();
  
  if (norm.includes('dollar date') || norm === 'dollar') return 'Dollar';
  if (norm === 'date' || norm === 'data') return 'Data';
  if (norm === 'ticker') return 'Ticker';
  if (norm.includes('transation') || norm.includes('transaction')) return 'Transação';
  if (norm.includes('stock proceeds') || norm.includes('yields')) return 'Yields';
  if (norm === 'units' || norm === 'un') return 'UN';
  if (norm.includes('balance units') || norm.includes('saldo de un')) return 'Saldo de Un';
  if (norm.includes('cost unit price') || norm.includes('preço un de custo')) return 'Preço Un de Custo';
  if (norm.includes('total cost') && !norm.includes('balance')) return 'Total do Custo';
  if (norm.includes('balance total cost') || norm.includes('saldo custo')) return 'Saldo Custo';
  if (norm.includes('avarage price') || norm.includes('average price') || norm.includes('preço médio')) return 'Preço Médio';
  if (norm.includes('b3 unit price') || norm.includes('b3 preço un')) return 'B3 Preço Un da B3';
  if (norm.includes('b3 total price') || norm.includes('b3 preço total')) return 'B3 Preço total';
  if (norm.includes('instrument type') || norm.includes('tipo atividade')) return 'Tipo Atividade';
  if (norm.includes('investment broker') || norm.includes('banco/corretora')) return 'Banco/Corretora';
  if (norm === 'cnpj') return 'CNPJ';
  if (norm === 'ir') return 'IR';
  if (norm.includes('overall month')) return 'OverAll Month';
  
  return header.trim();
};

Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: normalizeHeader,
  transform: (value) => value.trim(),
  complete: (results) => {
    console.log(Object.keys(results.data[0]));
    console.log(results.data[0]);
    console.log(results.data[1]);
  },
});
