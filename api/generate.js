// api/generate.js
// Função serverless (roda na Vercel). Recebe um link do YouTube,
// extrai só o áudio e pede pra IA (Gemini) devolver letra + cifra + grade
// já no formato que o app usa.

import ytdl from "@distube/ytdl-core";
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

  const { url } = req.body || {};
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Link do YouTube inválido." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY não configurada no servidor." });
  }

  try {
    const info = await ytdl.getInfo(url);
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: "lowestaudio",
      filter: "audioonly",
    });
    if (!audioFormat) {
      return res.status(422).json({ error: "Não foi possível encontrar uma faixa de áudio nesse link." });
    }

    const audioBuffer = await streamToBuffer(
      ytdl.downloadFromInfo(info, { format: audioFormat })
    );

    if (audioBuffer.length > 19 * 1024 * 1024) {
      return res.status(413).json({
        error: "Áudio grande demais para o envio direto (~" + Math.round(audioBuffer.length / 1e6) + "MB). Tente uma música mais curta por enquanto.",
      });
    }

    const audioBase64 = audioBuffer.toString("base64");
    const mimeType = (audioFormat.mimeType || "audio/webm").split(";")[0];

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      { inlineData: { data: audioBase64, mimeType } },
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

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
      }
