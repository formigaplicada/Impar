export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      let messages;

      if (body.prompt) {
        // Modo texto — sugestão de categoria
        messages = [{ role: 'user', content: body.prompt }];
      } else if (body.imageBase64) {
        // Modo imagem — análise de foto
        const base64Data = body.imageBase64.includes(',')
          ? body.imageBase64.split(',')[1]
          : body.imageBase64;

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
        return new Response(JSON.stringify({ error: 'Parâmetros em falta' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
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

      return new Response(JSON.stringify({ descricao }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Erro interno: ' + err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
