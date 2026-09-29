// Optional Vercel serverless endpoint for SmartStore AI powered by Gemini.
// Keep GOOGLE_API_KEY server-side; never put it in a VITE_* variable.
import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json').json(body);
};

const trimContext = (context) => {
  if (!context || typeof context !== 'object') return {};
  // The client already sends aggregates. The allow-list is a second boundary
  // so unexpected fields are not forwarded to the model.
  return {
    storeName: String(context.storeName || 'your store').slice(0, 100),
    businessType: String(context.businessType || 'business').slice(0, 80),
    role: String(context.role || 'team member').slice(0, 40),
    currentScreen: String(context.currentScreen || '/').slice(0, 80),
    currency: 'NGN',
    today: context.today,
    last7Days: context.last7Days,
    thisMonth: context.thisMonth,
    catalogue: context.catalogue,
    topSellers: context.topSellers,
    creditBook: context.creditBook,
  };
};

async function requireUser(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anonKey || !token) return false;

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return !error && Boolean(data?.user);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!(await requireUser(req))) {
    return json(res, 401, { error: 'Sign in required.' });
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: 'Google AI is not configured.' });
  }

  const question = String(req.body?.question || '').trim().slice(0, 500);
  if (!question) return json(res, 400, { error: 'A question is required.' });

  const context = trimContext(req.body?.context);
  const system = `You are SmartStore AI, a concise and practical assistant for a Nigerian small-business POS app.
Answer only from the store snapshot provided. Use naira (₦) for amounts. Never invent numbers, customer names, product facts, or actions.
You can explain or guide the user through every SmartStore area: POS and receipts, inventory, sales history, credit book, reports, expenses, team, approvals, settings, billing and owner modes.
Keep answers under 90 words, use plain language, and mention the relevant app area when useful. Respect the user's role and never promise access to a restricted feature.
Do not perform or suggest irreversible actions automatically. If data is missing, say so.
Store snapshot: ${JSON.stringify(context)}`;
  const model = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: question }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 180,
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error('SmartStore Gemini error', response.status, payload?.error?.message);
      return json(res, 502, { error: 'Google AI is temporarily unavailable.' });
    }

    const answer = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!answer) return json(res, 502, { error: 'Google AI returned an empty response.' });
    return json(res, 200, { answer });
  } catch (error) {
    console.error('SmartStore Gemini request failed', error);
    return json(res, 502, { error: 'Google AI is temporarily unavailable.' });
  }
}
