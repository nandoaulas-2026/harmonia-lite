module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    title: "Música de Demonstração",
    artist: "Harmonia App",
    originalKey: "G",
    bpm: 90,
    lyricSections: [
      { label: "Verso 1", lines: ["Esta é uma resposta de teste padrão."] }
    ],
    chordLines: [
      [{ chord: "G", text: "Acorde de teste " }]
    ],
    measures: [
      { chord: "G", section: "Intro", cue: null, doubleBarAfter: false }
    ]
  });
};
