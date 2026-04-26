import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.set("trust proxy", true);
app.use(express.json());

// API para buscar cotações detalhadas
app.post("/api/finance/quote", async (req, res) => {
  const { tickers } = req.body;
  if (!tickers || !Array.isArray(tickers)) {
    return res.status(400).json({ error: "Tickers not provided" });
  }

  const results: Record<string, any> = {};
  const brapiToken = process.env.BRAPI_TOKEN || "";

  const fetchAsset = async (ticker: string) => {
    let cleanTicker = ticker.trim().toUpperCase().replace(".SA", "");
    if (cleanTicker.startsWith("BVMF:")) {
      cleanTicker = cleanTicker.substring(5);
    }
    const isBrazilian = /^[A-Z0-9]{4}[0-9]{1,2}$/.test(cleanTicker) || cleanTicker === "BOVA11" || cleanTicker === "SMAL11";
    const cryptoSet = new Set(["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK", "MATIC", "SHIB", "UNI", "LTC", "BITCOIN"]);
    
    let isCryptoBrl = false;
    let cryptoUsdTicker = "";

    if (cryptoSet.has(cleanTicker) || cleanTicker === "BITCOIN") {
      cleanTicker = cleanTicker === "BITCOIN" ? "BTC-USD" : `${cleanTicker}-USD`;
    } else if (cleanTicker.endsWith("BRL")) {
      const baseToken = cleanTicker.replace("BRL", "");
      if (cryptoSet.has(baseToken) || baseToken === "BITCOIN") {
        isCryptoBrl = true;
        cryptoUsdTicker = baseToken === "BITCOIN" ? "BTC-USD" : `${baseToken}-USD`;
      }
    }

    const signal = AbortSignal.timeout(8000);

    try {
      if (isBrazilian && brapiToken) {
        console.log(`[Debug] Fetching B3 for ${cleanTicker} via Brapi`);
        const url = `https://brapi.dev/api/quote/${cleanTicker}?token=${brapiToken}&range=1y&interval=1d&fundamental=false&dividends=false`;
        const res = await fetch(url, { signal });
        
        if (res.ok) {
           const data = await res.json();
           const result = data.results?.[0];
           if (result) {
              let varWeek = 0; let varMonth = 0; let var12m = 0; let varYTD = 0;
              const currPrice = result.regularMarketPrice;
              const history = result.historicalDataPrice;

              let sparkline: any[] = [];
              if (history && history.length > 0) {
                const now = Date.now() / 1000;
                const targetYtd = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
                
                sparkline = history
                  .filter((h: any) => h.date >= targetYtd && typeof h.close === 'number')
                  .map((h: any) => ({ price: h.close, date: h.date * 1000 }));

                const getPriceFromTarget = (target: number) => {
                  return history.reduce((prev: any, curr: any) => 
                     Math.abs(curr.date - target) < Math.abs(prev.date - target) ? curr : prev
                  ).close;
                };
                
                const week = getPriceFromTarget(now - 7 * 24 * 60 * 60);
                const month = getPriceFromTarget(now - 30 * 24 * 60 * 60);
                const year = history[0].close;
                const ytdPrice = getPriceFromTarget(targetYtd);
                
                if (week) varWeek = ((currPrice - week) / week) * 100;
                if (month) varMonth = ((currPrice - month) / month) * 100;
                if (year) var12m = ((currPrice - year) / year) * 100;
                if (ytdPrice) varYTD = ((currPrice - ytdPrice) / ytdPrice) * 100;
              }
              return { price: currPrice, variWeek: varWeek, variMonth: varMonth, vari12Month: var12m, variYTD: varYTD, ytdHistory: sparkline };
           }
        }
      }
      
      // Fallback ou padrão internacional
      let quote;
      let usdToBrlQuote;
      try {
        // Tenta com .SA se parecer brasileiro mas falhou no Brapi
        if (isBrazilian) {
          quote = await yahooFinance.quote(`${cleanTicker}.SA`);
        } else if (isCryptoBrl) {
          const [usdQuote, brlQuote] = await Promise.all([
            yahooFinance.quote(cryptoUsdTicker).catch(() => null),
            yahooFinance.quote('BRL=X').catch(() => null)
          ]);
          if (usdQuote && brlQuote) {
             quote = {
                ...usdQuote,
                regularMarketPrice: (usdQuote.regularMarketPrice || 0) * (brlQuote.regularMarketPrice || 0),
                price: (usdQuote.regularMarketPrice || 0) * (brlQuote.regularMarketPrice || 0),
                symbol: cryptoUsdTicker
             };
             usdToBrlQuote = brlQuote.regularMarketPrice;
          }
        } else if (cleanTicker.endsWith("BRL")) {
          // Especial para pares BRL que não são criptomoedas padrão do app
          const baseToken = cleanTicker.replace("BRL", "");
          try {
             quote = await yahooFinance.quote(`${baseToken}-BRL`);
          } catch {
             quote = await yahooFinance.quote(`${cleanTicker}=X`);
          }
        } else {
          quote = await yahooFinance.quote(cleanTicker);
        }
      } catch (e) {
        // Se falhou tenta sem .SA ou fallback final
        try {
          quote = await yahooFinance.quote(cleanTicker);
        } catch (e2) {
          return null;
        }
      }

      if (!quote) return null;

      let varWeek = 0; let varMonth = 0; let var12m = 0; let varYTD = 0;
      let sparkline: any[] = [];
      const currPrice = quote.regularMarketPrice || quote.price;

      // Buscar histórico pelo Yahoo Finance
      try {
        const dateStr = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const queryOpts = {
          period1: dateStr
        };
        let histTicker = cleanTicker;
        if (isBrazilian && !histTicker.endsWith(".SA")) histTicker += ".SA";
        else if (quote.symbol) histTicker = quote.symbol;

        const chartRes = await yahooFinance.chart(histTicker, queryOpts);
        const hist = chartRes?.quotes || [];
        if (hist && hist.length > 0) {
          const now = Date.now();
          const targetYtd = new Date(new Date().getFullYear(), 0, 1).getTime();
          const multiplier = usdToBrlQuote || 1;
          
          sparkline = hist
            .filter((h: any) => {
               const time = h.date ? new Date(h.date).getTime() : 0;
               return time >= targetYtd && typeof h.close === 'number';
            })
            .map((h: any) => ({ price: h.close * multiplier, date: new Date(h.date).getTime() }));

          const getPriceFromTarget = (target: number) => {
             return hist.reduce((prev: any, curr: any) => {
                const prevTime = prev.date ? new Date(prev.date).getTime() : 0;
                const currTime = curr.date ? new Date(curr.date).getTime() : 0;
                return Math.abs(currTime - target) < Math.abs(prevTime - target) ? curr : prev;
             }).close * multiplier;
          };
          
          const week = getPriceFromTarget(now - 7 * 24 * 60 * 60 * 1000);
          const month = getPriceFromTarget(now - 30 * 24 * 60 * 60 * 1000);
          const year = hist[0].close; // 1 year ago (start of period1)
          const ytdPrice = getPriceFromTarget(targetYtd);

          if (week) varWeek = ((currPrice - week) / week) * 100;
          if (month) varMonth = ((currPrice - month) / month) * 100;
          if (year) var12m = ((currPrice - year) / year) * 100;
          if (ytdPrice) varYTD = ((currPrice - ytdPrice) / ytdPrice) * 100;
        }
      } catch (histError) {
        console.error(`Status de histórico detalhado não alcançado para ${cleanTicker}`, histError);
      }

      return { price: currPrice, variWeek: varWeek, variMonth: varMonth, vari12Month: var12m, variYTD: varYTD, ytdHistory: sparkline };
    } catch (e) {
      console.error(`Error fetching ${ticker}:`, e);
      return null;
    }
  };

  const promises = tickers.map(t => fetchAsset(t));
  const settledResults = await Promise.allSettled(promises);

  tickers.forEach((t, i) => {
    if (settledResults[i].status === 'fulfilled' && settledResults[i].value) {
      results[t] = settledResults[i].value;
    }
  });

  res.json({ quotes: results });
});

// Google OAuth Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  undefined // Redirect URI will be handled dynamically or from env
);

// Validating Google Identity
// In a real SaaS, you'd use firebase-admin to verify the client's token
// For simplicity here, we assume the client provides the auth state

app.get("/api/auth/google/url", (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const redirectUri = `https://${host}/api/auth/google/callback`;
  
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    prompt: "consent",
    redirect_uri: redirectUri
  });
  
  res.json({ url });
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const redirectUri = `https://${host}/api/auth/google/callback`;

  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri
    });
    
    // In a production app, you would save tokens to Firestore linked to the specific uid
    // For this context, we'll send it back to the client via postMessage
    // to be stored securely (or at least used sessionally)
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'GOOGLE_SHEETS_AUTH_SUCCESS',
                tokens: ${JSON.stringify(tokens)}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação concluída! Esta janela fechará automaticamente.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code:", error);
    res.status(500).send("Erro na autenticação com o Google.");
  }
});

// API para adicionar dados ao Google Sheets
app.post("/api/sheets/append", async (req, res) => {
  const { tokens, spreadsheetId, rowData } = req.body;
  
  if (!tokens || !spreadsheetId || !rowData) {
    return res.status(400).json({ error: "Parâmetros ausentes." });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(tokens);

  const sheets = google.sheets({ version: "v4", auth });
  
  try {
    console.log(`Attempting to append to sheet: ${spreadsheetId}`);
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [rowData]
      }
    });
    console.log("Append result:", appendResult.status);
    res.json({ success: true });
  } catch (error) {
    console.error("Error appending to sheet:", error);
    res.status(500).json({ 
      error: "Erro ao escrever na planilha.", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/sheets/delete", async (req, res) => {
  const { tokens, spreadsheetId, rowData } = req.body;
  
  if (!tokens || !spreadsheetId || !rowData) {
    return res.status(400).json({ error: "Parâmetros ausentes." });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(tokens);

  const sheets = google.sheets({ version: "v4", auth });
  
  try {
    // 1. Fetch sheet values
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "A:Z",
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Planilha vazia." });
    }

    // Standard columns based on the exact user format
    const dIdx = 3;  // Data
    const tIdx = 4;  // Ticker
    const transIdx = 5; // Transação
    const uIdx = 7;  // UN
    const typeIdx = 19; // Tipo Atividade

    const cleanNumStr = (str: any) => {
        if (!str) return 0;
        let s = String(str).replace(/R\$\s?/gi, "").replace(/\$\s?/g, "").trim();
        if (s.includes(',') && s.includes('.')) {
          if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, "").replace(",", ".");
          else s = s.replace(/,/g, "");
        } else if (s.includes(',')) s = s.replace(",", ".");
        return parseFloat(s) || 0;
    };
    const cleanStr = (str: any) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

    const normalizeDate = (dateStr: any) => {
      let s = String(dateStr || "").trim();
      if (!s) return "";
      s = s.replace(/\./g, '/').split(' ')[0];
      let p: string[] = [];
      if (s.includes('/')) p = s.split('/');
      else if (s.includes('-')) p = s.split('-');
      if (p.length === 3) {
        let y = p[0].length === 4 ? p[0] : p[2];
        let m = p[1];
        let d = p[0].length === 4 ? p[2] : p[0];
        if (y.length === 2) y = "20" + y;
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
      }
      return s;
    };

    let rowIndexToDelete = -1;
    console.log(`🗑️ Attempting to delete from sheet: Ticker=${rowData.Ticker}, Transact=${rowData.Transação}, UN=${rowData.UN}, Data=${rowData.Data}`);
    
    for (let i = rows.length - 1; i >= 1; i--) {
        const r = rows[i];
        if (!r[tIdx]) continue;
        
        const isTickerMatch = cleanStr(r[tIdx]) === cleanStr(rowData.Ticker);
        
        const transactValue = rowData.Transação || rowData.Transacao || "";
        const isTransMatch = cleanStr(r[transIdx]) === cleanStr(transactValue);
        
        const rUnNum = cleanNumStr(r[uIdx]);
        const rowUnNum = cleanNumStr(rowData.UN);
        const isUnMatch = Math.abs(rUnNum - rowUnNum) < 0.0001 || (r[uIdx] === "" && rowData.UN === "");
        
        // Match Date
        const rDate = normalizeDate(r[dIdx] || "");
        const rowDate = normalizeDate(rowData.Data || "");
        const isDateMatch = rDate === rowDate || rDate === "" || rowDate === "";

        if (isTickerMatch && isTransMatch && isUnMatch && isDateMatch) {
            console.log(`✅ Found exact match at row ${i} (1-based: ${i + 1}). Row Data: ${JSON.stringify(r)}`);
            rowIndexToDelete = i;
            break;
        }
    }

    if (rowIndexToDelete === -1) {
        console.log(`❌ No matching row found in Sheets to delete.`);
        return res.status(404).json({ error: "Registro não encontrado na planilha." });
    }

    // Get spreadsheet info to get the sheetId of the first sheet
    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = spreadsheetInfo.data.sheets?.[0]?.properties?.sheetId || 0;

    // 2. Delete the row using batchUpdate
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: "ROWS",
                            startIndex: rowIndexToDelete,      // inclusive (0-based)
                            endIndex: rowIndexToDelete + 1    // exclusive
                        }
                    }
                }
            ]
        }
    });

    res.json({ success: true, deletedRow: rowIndexToDelete + 1 });
  } catch (error) {
    console.error("Error deleting from sheet:", error);
    res.status(500).json({ 
      error: "Erro ao excluir da planilha.", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API para buscar dados do Google Sheets
app.post("/api/sheets/get", async (req, res) => {
  const { spreadsheetId, tokens } = req.body;
  
  if (!tokens || !spreadsheetId) {
    return res.status(400).json({ error: "Parâmetros ausentes." });
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(tokens);

  const sheets = google.sheets({ version: "v4", auth });
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId as string,
      range: "A:Z", // Lê todas as colunas
    });
    res.json({ values: response.data.values });
  } catch (error) {
    console.error("Error getting sheet values:", error);
    res.status(500).json({ error: "Erro ao ler a planilha. Verifique se o ID está correto e se você deu permissão." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
