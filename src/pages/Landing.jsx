import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Check, ChevronRight, Package, Receipt, ShieldCheck, ShoppingCart, Users,
  Wallet, Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PendingApproval from '../components/PendingApproval';

const features = [
  ['POS Register', 'Ring up sales quickly with a clean, reliable register.', ShoppingCart],
  ['Inventory', 'Know what is in stock, what is moving, and what needs attention.', Package],
  ['Reports', 'Turn daily sales into clear decisions with simple reports.', BarChart3],
  ['Sales History', 'Find every receipt and transaction whenever you need it.', Receipt],
  ['Void Audit', 'Keep a transparent record of voided transactions.', ShieldCheck],
  ['Team', 'Give staff the right access while keeping control.', Users],
  ['Expenses', 'Track spending and see the real health of your business.', Wallet],
  ['Approval Queue', 'Approve new team members before they access your store.', Check],
];
const niches = ['Supermarket', 'Boutique', 'Pharmacy', 'Restaurant', 'Salon', 'Any Business'];
const testimonials = [
  ['Amaka, Lagos', 'SmartStore gives me the numbers I need without making me become an accountant.'],
  ['Tunde, Abuja', 'My team can serve customers faster, and I can check the business from anywhere.'],
  ['Chioma, Port Harcourt', 'It is simple enough for a busy shop and powerful enough to grow with us.'],
];

export default function Landing() {
  const { user, approvalStatus } = useAuth();
  const navigate = useNavigate();
  if (user && (approvalStatus === 'pending' || approvalStatus === 'rejected')) return <PendingApproval />;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen overflow-hidden bg-zinc-950 text-white selection:bg-emerald-400 selection:text-zinc-950">
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-zinc-950"><Zap className="h-5 w-5" /></div>
            <span className="text-lg font-bold tracking-tight">SmartStore <span className="text-emerald-400">NG</span></span>
          </button>
          <div className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#features" className="hover:text-white">Features</a><a href="#how-it-works" className="hover:text-white">How it works</a><a href="#pricing" className="hover:text-white">Pricing</a>
          </div>
          <div className="flex items-center gap-3"><button onClick={() => navigate('/login')} className="hidden px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white sm:block">Log In</button><button onClick={() => navigate('/login')} className="rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950 hover:bg-emerald-300">Get Started</button></div>
        </div>
      </nav>

      <main>
        <section className="relative mx-auto max-w-7xl px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
          <div className="pointer-events-none absolute -right-40 -top-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative max-w-4xl"><p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Built for Nigerian businesses</p>
            <h1 className="text-5xl font-bold leading-[1.04] tracking-tight sm:text-7xl">The smarter way to <span className="text-emerald-400">manage your shop.</span></h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400">One calm, powerful workspace for sales, inventory, people, and profit. SmartStore NG helps you run today and grow tomorrow.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><button onClick={() => navigate('/login')} className="flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 py-3.5 font-bold text-zinc-950 hover:bg-emerald-300">Start for free <ArrowRight className="h-4 w-4" /></button><a href="#features" className="flex items-center justify-center gap-2 rounded-full border border-zinc-700 px-6 py-3.5 font-semibold text-zinc-300 hover:border-zinc-500 hover:text-white">Explore features <ChevronRight className="h-4 w-4" /></a></div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-zinc-900/60"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/10 px-5 sm:grid-cols-4 sm:divide-y-0 lg:px-8">{[['6', 'business niches'], ['12+', 'powerful features'], ['N0', 'starting price'], ['24/7', 'clarity and control']].map(([v, l]) => <div key={l} className="px-4 py-7 text-center sm:py-8"><p className="text-3xl font-bold text-emerald-400">{v}</p><p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{l}</p></div>)}</div></section>

        <section id="features" className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><SectionHeading eyebrow="Everything in one place" title="Tools that keep business moving." text="Less guesswork. Fewer spreadsheets. More time focused on your customers." /><div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{features.map(([title, text, Icon]) => <div key={title} className="group rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 hover:border-emerald-400/40"><div className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400"><Icon className="h-5 w-5" /></div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p></div>)}</div></section>

        <section className="border-y border-white/10 bg-zinc-900/50"><div className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><SectionHeading eyebrow="Made for your business" title="One system. Every kind of shop." /><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{niches.map((niche, i) => <div key={niche} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center text-sm font-semibold text-zinc-300"><span className="mb-3 block text-xs text-emerald-400">0{i + 1}</span>{niche}</div>)}</div></div></section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><SectionHeading eyebrow="Simple from day one" title="Get up and running in minutes." /><div className="mt-12 grid gap-8 md:grid-cols-4">{[['01', 'Create your account', 'Start with your email and choose the setup that fits you.'], ['02', 'Set up your shop', 'Tell us what you sell and add your first products.'], ['03', 'Invite your team', 'Give each person access that matches their role.'], ['04', 'Sell with confidence', 'Use live insights to make your next decision.']].map(([n, t, x]) => <div key={n} className="relative"><p className="text-sm font-bold text-emerald-400">{n}</p><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{x}</p></div>)}</div></section>

        <section className="border-y border-white/10 bg-zinc-900/50"><div className="mx-auto max-w-7xl px-5 py-24 lg:px-8"><SectionHeading eyebrow="Loved by owners" title="Built for the way you work." /><div className="mt-10 grid gap-4 md:grid-cols-3">{testimonials.map(([name, quote]) => <blockquote key={name} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"><p className="text-base leading-7 text-zinc-300">“{quote}”</p><footer className="mt-6 text-sm font-semibold text-emerald-400">{name}</footer></blockquote>)}</div></div></section>

        <section id="pricing" className="mx-auto max-w-5xl px-5 py-24 lg:px-8"><SectionHeading eyebrow="Clear, fair pricing" title="Start free. Upgrade when ready." /><div className="mt-10 grid gap-5 md:grid-cols-2"><PriceCard title="Shop Mode" price="N0" text="The essentials for running your shop today." items={['POS and sales history', 'Inventory basics', 'Team access']} /><PriceCard featured title="Owner Mode" price="N5,000" text="The complete view for owners who want to grow." items={['Everything in Shop Mode', 'Full reports and expenses', 'Remote oversight and approvals']} /></div></section>
        <section className="mx-5 mb-24 rounded-3xl bg-emerald-400 px-6 py-14 text-center text-zinc-950 sm:px-12"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Your business deserves a better system.</h2><p className="mx-auto mt-4 max-w-xl text-zinc-800">Join owners building calmer, more profitable businesses with SmartStore NG.</p><button onClick={() => navigate('/login')} className="mt-8 rounded-full bg-zinc-950 px-6 py-3.5 font-bold text-white hover:bg-zinc-800">Get started free <ArrowRight className="ml-2 inline h-4 w-4" /></button></section>
      </main>
      <footer className="border-t border-white/10 px-5 py-10 text-sm text-zinc-500"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row"><span className="font-bold text-zinc-300">SmartStore <span className="text-emerald-400">NG</span></span><span>Simple tools for ambitious businesses.</span><span>© {new Date().getFullYear()} SmartStore NG</span></div></footer>
    </div>
  );
}
function SectionHeading({ eyebrow, title, text }) { return <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">{eyebrow}</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>{text && <p className="mt-4 text-zinc-500">{text}</p>}</div>; }
function PriceCard({ title, price, text, items, featured }) { return <div className={`rounded-3xl border p-7 ${featured ? 'border-emerald-400 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-900'}`}><div className="flex items-start justify-between"><div><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-zinc-500">{text}</p></div>{featured && <span className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-zinc-950">Most popular</span>}</div><p className="mt-8 text-4xl font-bold">{price}<span className="text-sm font-normal text-zinc-500">{featured && '/month'}</span></p><ul className="mt-7 space-y-3">{items.map((item) => <li key={item} className="flex items-center gap-2 text-sm text-zinc-300"><Check className="h-4 w-4 text-emerald-400" />{item}</li>)}</ul></div>; }
