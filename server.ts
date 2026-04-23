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
    const cleanTicker = ticker.trim().toUpperCase().replace(".SA", "");
    const isBrazilian = /^[A-Z]{4}[0-9]{1,2}$/.test(cleanTicker) || cleanTicker === "BOVA11" || cleanTicker === "SMAL11";
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
              let varWeek = 0; let varMonth = 0; let var12m = 0;
              const currPrice = result.regularMarketPrice;
              const history = result.historicalDataPrice;

              if (history && history.length > 0) {
                const now = Date.now() / 1000;
                const getPriceFrom = (days: number) => {
                  const target = now - (days * 24 * 60 * 60);
                  return history.reduce((prev: any, curr: any) => 
                     Math.abs(curr.date - target) < Math.abs(prev.date - target) ? curr : prev
                  ).close;
                };
                const week = getPriceFrom(7);
                const month = getPriceFrom(30);
                const year = history[0].close;
                if (week) varWeek = ((currPrice - week) / week) * 100;
                if (month) varMonth = ((currPrice - month) / month) * 100;
                if (year) var12m = ((currPrice - year) / year) * 100;
              }
              return { price: currPrice, variWeek: varWeek, variMonth: varMonth, vari12Month: var12m };
           }
        }
        console.log(`[Debug] Brapi failed for ${cleanTicker}, falling back to Yahoo`);
      }
      
      // Fallback ou padrão internacional
      const quote = await yahooFinance.quote(`${cleanTicker}.SA` || cleanTicker);
      if (!quote) return null;
      return { price: quote.regularMarketPrice || quote.price, variWeek: 0, variMonth: 0, vari12Month: 0 };
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
    } else {
        console.log(`[Debug] Ticker ${t} failed or returned null`);
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
