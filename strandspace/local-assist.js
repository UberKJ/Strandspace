// strandspace/local-assist.js
export async function generateLocalAssist({ parsed, subjectLabel = 'general' }) {
  const prompt = `You are helping build a clean Strandspace construct.
Subject: ${subjectLabel}
User request: ${parsed.raw}

Return ONLY valid JSON with these exact keys:
{
  "constructLabel": "short name",
  "target": "main goal or object",
  "objective": "what this construct helps achieve",
  "context": "situation or environment",
  "steps": "step-by-step instructions",
  "notes": "important tips or warnings",
  "tags": ["tag1", "tag2"]
}`;

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5:9b',
      prompt: prompt,
      stream: false,
      options: { temperature: 0.3 }
    })
  });

  const data = await response.json();
  const jsonStart = data.response.indexOf('{');
  const jsonText = data.response.slice(jsonStart);
  
  return JSON.parse(jsonText);
}

export default generateLocalAssist;