exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    let messages;

    if (body.prompt) {
      // Modo texto — sugestão de categoria
      messages = [{ role: 'user', content: body.prompt }];
    } else if (body.imageBase64) {
      // Modo imagem — análise de foto
      const base64Data = body.imageBase64.includes(',') ? body.imageBase64.split(',')[1] : body.imageBase64;
      messages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Data }
          },
          {
            type: 'text',
            text: 'És um assistente de gestão de condomínios. Analisa esta foto e descreve de forma clara e objetiva a ocorrência ou problema que está visível, em português europeu. Sê conciso (máximo 2 frases). Se não conseguires identificar nenhum problema claro, diz isso de forma simples.'
          }
        ]
      }];
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Parâmetros em falta' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: messages
      })
    });

    const data = await response.json();
    const descricao = data.content?.[0]?.text || 'Não foi possível analisar.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descricao })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro interno: ' + err.message })
    };
  }
};
