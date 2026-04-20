import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.set("trust proxy", true);
app.use(express.json());

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
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowData]
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error appending to sheet:", error);
    res.status(500).json({ error: "Erro ao escrever na planilha." });
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
