// api/generate.js
// Função serverless (roda na Vercel). Recebe um arquivo de áudio (enviado
// pelo próprio usuário, já em base64) e pede pra IA (Gemini) devolver
// letra + cifra + grade já no formato que o app usa.
//
// OBS: essa versão NÃO baixa mais áudio do YouTube no servidor — o YouTube
// passou a bloquear esse tipo de download vindo de servidores (mesmo com
// login), então agora é o usuário quem baixa o áudio e envia o arquivo.

import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  maxDuration: 60,
};

const PROMPT = `Você é um transcritor musical profissional (letrista + cifrista + arranjador).
Ouça o áudio anexado do início ao fim e devolva SOMENTE um JSON válido, sem markdown,
sem crases, sem texto antes ou depois — apenas o objeto JSON, no formato exato abaixo:

{
  "title": "string",
  "artist": "string (ou \\"Artista não identificado\\")",
  "originalKey": "nota, ex: G, Am, D",
  "bpm": 90,
  "lyricSections": [
    { "label": "Intro | Verso 1 | Pré-Refrão | Refrão | Ponte | Solo | Final",
      "lines": ["linha 1 da letra", "linha 2 da letra"] }
  ],
  "chordLines": [
    [ { "chord": "G", "text": "trecho da letra correspondente " },
      { "chord": "Em", "text": "próximo trecho" } ]
  ],
  "measures": [
    { "chord": "G", "section": "Estrofe" ,"cue": null, "doubleBarAfter": false }
  ]
}

Regras importantes:
- "measures": um objeto por compasso, cobrindo a música inteira em 4/4 (aproxime se não for 4/4).
- "section": preencha só no compasso em que uma nova seção começa (ex: "Estrofe", "Refrão", "Ponte", "Intro"). Nos demais compassos, use null.
- "cue": só quando houver uma marcação de arranjo clara e audível (ex: "break — todos param", "bateria entra", "só voz e violão"). Caso contrário, null.
- "doubleBarAfter": true no último compasso de cada seção/trecho.
- Seja fiel à letra e aos acordes reais ouvidos na gravação — não invente progressão genérica.
- Se não conseguir ouvir algum trecho com clareza, faça a melhor aproximação possível, mas nunca deixe campos vazios ou ausentes.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  const { audioBase64, mimeType } = req.body || {};
  if (!audioBase64) {
    return res.status(400).json({ error: "Nenhum arquivo de áudio recebido." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor." });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const result = await model.generateContent([
      { inlineData: { data: audioBase64, mimeType: mimeType || "audio/mpeg" } },
      { text: PROMPT },
    ]);

    const rawText = result.response.text().trim();
    const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");

    let song;
    try {
      song = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(502).json({
        error: "A IA respondeu em um formato inesperado. Tente novamente.",
        raw: rawText.slice(0, 500),
      });
    }

    return res.status(200).json({ song });
  } catch (err) {
    console.error("Erro em /api/generate:", err);
    return res.status(500).json({ error: "Falha ao processar a música: " + (err.message || "erro desconhecido") });
  }
}
