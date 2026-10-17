import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // Configuração de CORS para permitir requisições do frontend
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
    // Inicializa a API do Gemini com a chave de ambiente configurada na Vercel
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Recolhe os dados enviados pelo frontend (ajuste conforme o seu formulário)
    // Exemplo simulado de receção do áudio / prompt
    const { audioData, promptText } = req.body || {};

    // Usando um modelo estável e rápido para evitar erros de sobrecarga (503)
    const modelName = 'gemini-2.5-flash';

    const prompt = promptText || `
      Você é um músico profissional especialista em transcrição e teoria musical. 
      Escute atentamente este áudio e extraia com precisão as seguintes informações musicais.
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

    // Sistema de tentativas automáticas (Retry) caso ocorra instabilidade temporária
    let response;
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!success && attempts < maxAttempts) {
      attempts++;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [prompt],
          config: {
            responseMimeType: "application/json"
          }
        });
        success = true;
      } catch (err) {
        // Se o erro for 503 (servidor ocupado) e ainda tivermos tentativas, aguarda 2 segundos e tenta de novo
        if (err.message && err.message.includes('503') && attempts < maxAttempts) {
          console.warn(`Tentativa ${attempts} falhou com erro 503. Tentando novamente em 2 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw err;
        }
      }
    }

    // Retorna o JSON processado com sucesso para a tela
    const parsedData = JSON.parse(response.text);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Falha ao processar a música:", error);
    return res.status(500).json({ 
      error: `Falha ao processar a música: ${error.message}` 
    });
  }
}
