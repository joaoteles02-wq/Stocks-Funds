# INSTRUÇÕES PARA O AGENTE — Integração IR Calculator

## O que foi gerado

Dois arquivos prontos para integrar no projeto React + Firebase:

1. `IRCalculator.tsx` — componente React completo (TypeScript + Tailwind + Firebase)
2. `exportar_para_firebase.py` — script Python para upload do CSV para o Firestore

---

## PASSO 1 — Adicionar o componente React

### 1.1 Copiar o arquivo
Salve `IRCalculator.tsx` em:
```
src/components/IR/IRCalculator.tsx
```

### 1.2 Ajustar o import do Firebase
No topo do arquivo, a linha:
```ts
import { db } from "../../lib/firebase";
```
(Já ajustado para o caminho do seu projeto).

### 1.3 Usar o componente
Em qualquer página ou rota do projeto:
```tsx
import IRCalculator from './components/IR/IRCalculator';

// dentro do JSX:
<IRCalculator />
```

---

## PASSO 2 — Configurar regras do Firestore

No Firebase Console → Firestore → Regras, garanta acesso à coleção `operacoes`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /operacoes/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## PASSO 3 — Script Python (exportar_para_firebase.py)

### 3.1 Instalar dependências
```bash
pip install firebase-admin pandas
```

### 3.2 Chave de serviço do Firebase
1. Firebase Console → Configurações do projeto (ícone de engrenagem)
2. Aba "Contas de serviço"
3. Botão "Gerar nova chave privada"
4. Salve o JSON como `firebase_key.json` na mesma pasta do script

### 3.3 Ajustar configurações no script
No topo de `exportar_para_firebase.py`:
```python
CSV_PATH  = "operacoes.csv"   # caminho do seu CSV
KEY_PATH  = "firebase_key.json"
SEPARATOR = ";"               # ou "\t" se for TSV
DECIMAL   = ","               # separador decimal
```

### 3.4 Executar
```bash
python exportar_para_firebase.py
```
