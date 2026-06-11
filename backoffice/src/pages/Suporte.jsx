import { useState, useRef, useEffect } from 'react';

const API_BASE = 'https://api.condexpress.com';

const SUGGESTIONS = [
  'Como registar um pagamento?',
  'Como criar um plano de quotas?',
  'Como enviar uma convocatória?',
  'O que é o saldo disponível?',
];

function escapeHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(MANUAL_LINK:([^)]+)\)/g, (_, title, id) => {
      const url = `https://gocondominios.pt/manual#${id}`;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0aac08;font-weight:600;text-decoration:underline;">${title} ↗</a>`;
    })
    .replace(/\n/g, '<br>');
}

export default function Suporte() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'bot',
        text: 'Olá! 👋 Sou o assistente do **GO Condomínios**.\n\nEstou aqui para ajudar com qualquer dúvida sobre a plataforma. Como posso ajudar hoje?',
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  async function sendMessage(text) {
    const question = (text || input).trim();
    if (!question || isLoading) return;

    setInput('');
    setShowSuggestions(false);
    setError('');
    setIsLoading(true);

    const userMsg = { role: 'user', text: question };
    setMessages(prev => [...prev, userMsg]);

    const newHistory = [...chatHistory, { role: 'user', content: question }];
    setChatHistory(newHistory);

    try {
      const token = localStorage.getItem('session_token');
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: newHistory,
          question,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply || 'Desculpe, não consegui gerar uma resposta.';

      setChatHistory(prev => [...prev, { role: 'assistant', content: reply }]);
      setMessages(prev => [...prev, { role: 'bot', text: reply }]);
    } catch (err) {
      setChatHistory(prev => prev.slice(0, -1));
      setError('Não foi possível contactar o assistente. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Agente — clica para abrir ── */}
      {!isOpen && (
        <div
          onClick={() => setIsOpen(true)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0aac08, #084806)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 52,
            boxShadow: '0 8px 32px rgba(10,172,8,0.30)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(10,172,8,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(10,172,8,0.30)'; }}
          >
            🏢
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#0f1a0f' }}>Assistente GO Condomínios</div>
            <div style={{ fontSize: 13, color: '#6b7b6b', marginTop: 4 }}>Clique para iniciar o suporte</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0aac08', display: 'inline-block', boxShadow: '0 0 6px #0aac08' }} />
            <span style={{ fontSize: 12, color: '#0aac08', fontWeight: 600 }}>Online</span>
          </div>
        </div>
      )}

      {/* ── Chat panel ── */}
      {isOpen && (
        <div style={{
          width: 420, maxHeight: '80vh',
          background: '#fff', borderRadius: 18,
          boxShadow: '0 12px 40px rgba(26,107,74,0.16), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #d8e4da',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'chatIn 0.3s cubic-bezier(.34,1.56,.64,1)',
        }}>
          <style>{`
            @keyframes chatIn {
              from { opacity: 0; transform: translateY(20px) scale(0.96); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes typingBounce {
              0%,60%,100% { transform: translateY(0); opacity: 0.6; }
              30% { transform: translateY(-6px); opacity: 1; }
            }
            @keyframes msgIn {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0aac08 0%, #084806 100%)',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}>🏢</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Assistente GO Condomínios</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7affa8', boxShadow: '0 0 6px #7affa8', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Online</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >×</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-end',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                animation: 'msgIn 0.25s ease forwards',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, border: '1.5px solid #d8e4da',
                  background: msg.role === 'user' ? '#f0a500' : '#e6f9e6',
                }}>
                  {msg.role === 'user' ? '👤' : '🏢'}
                </div>
                <div
                  style={{
                    maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
                    fontSize: 13.5, lineHeight: 1.58,
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #084806, #0aac08)'
                      : '#e6f9e6',
                    color: msg.role === 'user' ? '#fff' : '#1c2318',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                    borderBottomLeftRadius: msg.role === 'bot' ? 4 : 14,
                    border: msg.role === 'bot' ? '1px solid rgba(10,172,8,0.12)' : 'none',
                  }}
                  dangerouslySetInnerHTML={{ __html: formatText(msg.text) }}
                />
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e6f9e6', border: '1.5px solid #d8e4da', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🏢</div>
                <div style={{ background: '#e6f9e6', border: '1px solid rgba(10,172,8,0.12)', borderRadius: 14, borderBottomLeftRadius: 4, padding: '12px 16px', display: 'flex', gap: 5 }}>
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#0aac08', display: 'inline-block', animation: `typingBounce 1.3s ${delay}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12.5, color: '#c0392b', background: '#fdf0f0', border: '1px solid #f5c6c6', borderRadius: 8, padding: '8px 12px' }}>
                ⚠️ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: '4px 16px 12px' }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    padding: '6px 13px', background: '#fff',
                    border: '1.5px solid #d8e4da', borderRadius: 20,
                    fontSize: 12, color: '#0aac08', cursor: 'pointer',
                    fontWeight: 500, whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e6f9e6'; e.currentTarget.style.borderColor = '#0aac08'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#d8e4da'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 14px 13px', borderTop: '1px solid #d8e4da', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escreva a sua pergunta..."
              rows={1}
              style={{
                flex: 1, padding: '10px 13px',
                border: '1.5px solid #d8e4da', borderRadius: 12,
                fontSize: 13.5, color: '#1c2318',
                background: '#f5faf5', resize: 'none', outline: 'none',
                minHeight: 42, maxHeight: 110, lineHeight: 1.45,
                fontFamily: 'inherit',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0aac08'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(10,172,8,0.09)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#d8e4da'; e.currentTarget.style.boxShadow = 'none'; }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                background: isLoading || !input.trim() ? '#d8e4da' : 'linear-gradient(135deg, #084806, #0aac08)',
                border: 'none', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18,
                transition: 'all 0.15s',
              }}
            >
              ➤
            </button>
          </div>

          <div style={{ textAlign: 'center', fontSize: 10.5, color: '#9aaa9c', padding: '0 0 10px', letterSpacing: 0.2 }}>
            Powered by GO Condomínios · IA
          </div>
        </div>
      )}
    </div>
  );
}
