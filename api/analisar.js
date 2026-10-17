const { GoogleGenAI } = require("@google/genai");

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let buffers = [];
    req.on('data', chunk => buffers.push(chunk));
    req.on('end', () => resolve(Buffer.concat(buffers)));
    req.on('error', err => reject(err));
  });
}

module.exports = async function handler(req, res) {
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
    
    // Modelo oficial atualizado conforme exigido pela API
    const modelName = 'gemini-3.8-flash';

    const prompt = `
      Você é um músico profissional especialista em transcrição e teoria musical. 
      Escute o áudio enviado e extraia com precisão as seguintes informações musicais.
      Sua resposta DEVE ser estritamente um objeto JSON válido, sem formatação extra de código markdown, seguindo exatamente este esquema:
      {
        "title": "Nome da Música",
        "artist": "Nome do Artista/Banda",
        "originalKey": "G",
        "bpm": 92,
        "lyricSections": [
          {
            "label": "Verso 1",
            "lines": ["Linha de letra aqui"]
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
            "section": "Verso 1",
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

    let rawText = response.text || "";
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(rawText);

    const sanitizedData = {
      title: parsedData.title || "Música Processada",
      artist: parsedData.artist || "Artista Reconhecido",
      originalKey: parsedData.originalKey || "C",
      bpm: parsedData.bpm || 120,
      lyricSections: Array.isArray(parsedData.lyricSections) && parsedData.lyricSections.length > 0 
        ? parsedData.lyricSections 
        : [{ label: "Parte Unica", lines: ["Letra transcrita"] }],
      chordLines: Array.isArray(parsedData.chordLines) && parsedData.chordLines.length > 0 
        ? parsedData.chordLines 
        : [[{ chord: "C", text: "Cifra " }]],
      measures: Array.isArray(parsedData.measures) && parsedData.measures.length > 0 
        ? parsedData.measures 
        : [{ chord: "C", section: null, cue: null, doubleBarAfter: false }]
    };

    return res.status(200).json(sanitizedData);

  } catch (error) {
    console.error("Erro no backend:", error);
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
