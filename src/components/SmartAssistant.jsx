import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  LoaderCircle,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStoreData } from '../hooks/useStoreData';
import { api } from '../lib/backend';
import { askAssistant, buildAssistantContext } from '../lib/assistant';

const SUGGESTIONS = [
  { label: 'How are sales today?', value: 'How are sales today?' },
  { label: 'What needs restocking?', value: 'What needs restocking?' },
  { label: 'What is selling best?', value: 'What is selling best?' },
  { label: 'How do I add a product?', value: 'How do I add a product?' },
  { label: 'How much credit is open?', value: 'How much credit is open?' },
];

const welcomeMessage = (storeName) => ({
  id: 'welcome',
  from: 'assistant',
  text: `Hi! I’m your SmartStore assistant. I can help you with any part of ${storeName || 'your store'} — from ringing up a sale to managing stock, credit, expenses, reports and your team.`,
  mode: 'insights',
});

export default function SmartAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const { storeId, storeName, niche, role } = useAuth();
  const { data: sales } = useStoreData(
    () => (storeId ? api.sales.list(storeId) : []),
    [storeId]
  );
  const { data: products } = useStoreData(
    () => (storeId ? api.products.list(storeId) : []),
    [storeId]
  );
  const { data: expenses } = useStoreData(
    () => (storeId ? api.expenses.list(storeId) : []),
    [storeId]
  );
  const { data: creditPayments } = useStoreData(
    () => (storeId ? api.creditPayments.list(storeId) : []),
    [storeId]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState(() => [welcomeMessage('your store')]);
  const [isThinking, setIsThinking] = useState(false);
  const [hasNewReply, setHasNewReply] = useState(false);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const context = useMemo(
    () =>
      buildAssistantContext({
        storeName,
        niche,
        role,
        currentPath: location.pathname,
        sales,
        products,
        expenses,
        creditPayments,
      }),
    [storeName, niche, role, location.pathname, sales, products, expenses, creditPayments]
  );

  // Replace the optimistic greeting once the store context is known.
  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0].id === 'welcome'
        ? [welcomeMessage(storeName || 'your store')]
        : current
    );
  }, [storeName]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    inputRef.current?.focus();
    setHasNewReply(false);
  }, [messages, isOpen]);

  // Only show a single unobtrusive entry point on the app, not on the public
  // landing/login screens. The mobile monitor has its own layout but shares
  // this component.
  if (!storeId) return null;

  const submitQuestion = async (value = question) => {
    const clean = String(value || '').trim();
    if (!clean || isThinking) return;

    setQuestion('');
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, from: 'user', text: clean },
    ]);
    setIsThinking(true);

    const result = await askAssistant(clean, context);
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        from: 'assistant',
        text: result.answer,
        mode: result.mode,
        action: result.action,
      },
    ]);
    setIsThinking(false);
    if (!isOpen) setHasNewReply(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitQuestion();
  };

  const runSuggestion = (value) => {
    setIsOpen(true);
    submitQuestion(value);
  };

  const closeAssistant = () => {
    setIsOpen(false);
    setHasNewReply(false);
  };

  const onAction = (action) => {
    if (!action?.route) return;
    closeAssistant();
    navigate(action.route);
  };

  const isOnAssistantDestination = ['/reports', '/inventory', '/sales', '/credit', '/expenses', '/pos'].some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[59] bg-zinc-950/20 backdrop-blur-[1px] sm:hidden"
          onClick={closeAssistant}
          aria-hidden="true"
        />
      )}

      <section
        aria-label="SmartStore AI assistant"
        className={`fixed bottom-24 right-3 z-[60] flex w-[calc(100vw-1.5rem)] max-w-[24rem] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/20 transition-all dark:border-zinc-700 dark:bg-zinc-900 sm:bottom-6 sm:right-6 ${
          isOpen
            ? 'pointer-events-auto max-h-[min(72vh,42rem)] scale-100 opacity-100'
            : 'pointer-events-none max-h-0 scale-95 opacity-0'
        }`}
      >
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 px-5 pb-5 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold tracking-tight">SmartStore AI</h2>
                <p className="mt-0.5 text-[11px] text-emerald-50/80">Your shop co-pilot</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAssistant}
              className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-50/85">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" />
            <span>{isOnAssistantDestination ? 'I can explain what you are seeing here.' : 'Ask about your live store data or how to use SmartStore.'}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-[13rem] flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.map((message) => (
              <Message key={message.id} message={message} onAction={onAction} />
            ))}
            {isThinking && (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-zinc-100 px-3.5 py-3 dark:bg-zinc-800">
                  <div className="flex items-center gap-1.5" aria-label="Assistant is thinking">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 && !isThinking && (
            <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.value}
                    onClick={() => runSuggestion(suggestion.value)}
                    className="rounded-full border border-zinc-200 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-emerald-400"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-1.5 transition-colors focus-within:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950">
              <input
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about your store..."
                aria-label="Ask SmartStore AI"
                maxLength={500}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-zinc-400"
              />
              <button
                type="submit"
                disabled={!question.trim() || isThinking}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send question"
              >
                {isThinking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-400">AI can make mistakes. Check important numbers in Reports.</p>
          </form>
        </div>
      </section>

      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          setHasNewReply(false);
        }}
        className={`fixed bottom-24 right-4 z-[61] flex items-center gap-2 rounded-full border border-emerald-400/40 bg-zinc-900 px-3.5 py-3 text-white shadow-xl shadow-zinc-950/20 transition-all hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 sm:bottom-6 sm:right-6 ${
          isOpen ? 'pointer-events-none scale-90 opacity-0' : 'scale-100 opacity-100'
        }`}
        aria-label="Open SmartStore AI assistant"
        aria-expanded={isOpen}
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-black">
          <MessageCircle className="h-4 w-4" />
          {hasNewReply && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-zinc-900 dark:ring-white" />}
        </span>
        <span className="text-sm font-semibold">Ask AI</span>
      </button>
    </>
  );
}

function Message({ message, onAction }) {
  if (message.from === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 text-sm text-white shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 max-w-[88%]">
        <div className="rounded-2xl rounded-tl-md bg-zinc-100 px-3.5 py-2.5 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {message.text}
        </div>
        {message.action && (
          <button
            type="button"
            onClick={() => onAction(message.action)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            {message.action.label}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
        {message.mode === 'ai' && <p className="mt-1 text-[10px] text-zinc-400">AI response</p>}
      </div>
    </div>
  );
}
