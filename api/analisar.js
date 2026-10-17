import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let buffers = [];
    req.on('data', chunk => buffers.push(chunk));
    req.on('end', () => resolve(Buffer.concat(buffers)));
    req.on('error', err => reject(err));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const audioBuffer = await getRawBody(req);
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'Nenhum áudio recebido.' });
    }

    const base64Audio = audioBuffer.toString("base64");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const modelName = 'gemini-2.5-flash';

    const prompt = `
      Você é um músico profissional especialista em transcrição e teoria musical. 
      Escute o áudio enviado e extraia com precisão as seguintes informações musicais.
      Sua resposta DEVE ser estritamente um objeto JSON válido, sem formatação extra de código markdown, seguindo exatamente este esquema:
      {
        "title": "Nome da Música",
        "artist": "Nome do Artista/Banda",
        "originalKey": "Tom Original (ex: G, C#, Bm)",
        "bpm": 92,
        "lyricSections": [
          {
            "label": "Intro",
            "lines": ["(instrumental)"]
          }
        ],
        "chordLines": [
          [
            {"chord": "G", "text": "Texto da linha "}
          ]
        ],
        "measures": [
          {
            "chord": "G",
            "section": "Intro",
            "cue": null,
            "doubleBarAfter": false
          }
        ]
      }
    `;

    let response;
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            prompt,
            {
              inlineData: {
                mimeType: "audio/wav",
                data: base64Audio
              }
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });
        success = true;
      } catch (err) {
        if (err.message && err.message.includes('503') && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw err;
        }
      }
    }

    const parsedData = JSON.parse(response.text);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Erro no backend:", error);
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
}
