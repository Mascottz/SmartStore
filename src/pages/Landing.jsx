import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookUser,
  Check,
  Eye,
  Minus,
  Monitor,
  MonitorSmartphone,
  Package,
  PlayCircle,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '/logo-smartstore.png';

const features = [
  ['POS Register', 'Ring up sales quickly with a clean, reliable register.', ShoppingCart],
  ['Inventory', 'Know what is in stock, what is moving, and what needs attention.', Package],
  ['Reports', 'Turn daily sales into clear decisions with simple reports.', BarChart3],
  ['Sales History', 'Find every receipt and transaction whenever you need it.', Receipt],
  ['Credit Book', 'Sell on credit or part payment; every repayment is recorded until the debt is settled.', BookUser],
  ['Void Audit', 'Keep a transparent record of voided transactions.', ShieldCheck],
  ['Team', 'Give staff the right access while keeping control.', Users],
  ['Expenses', 'Track spending and see the real health of your business.', Wallet],
  ['Approval Queue', 'Approve new team members before they access your store.', Check],
];

const businessTypes = [
  'Supermarkets',
  'Minimarts',
  'Boutiques',
  'Pharmacies',
  'Restaurants',
  'Salons',
  'Bookshops',
  'Electronics Stores',
  'Bakeries',
  'Fashion Houses',
  'Grocery Stores',
  'Hardware Shops',
];

const stats = [
  ['6', 'business niches'],
  ['12+', 'powerful features'],
  ['\u20A60', 'starting price'],
  ['24/7', 'clarity and control'],
];

const steps = [
  ['01', 'Create your account', 'Start with your email and choose the setup that fits you.'],
  ['02', 'Set up your shop', 'Tell us what you sell and add your first products.'],
  ['03', 'Invite your team', 'Give each person access that matches their role.'],
  ['04', 'Sell with confidence', 'Use live insights to make your next decision.'],
];

const testimonials = [
  ['Amaka, Lagos', 'SmartStore gives me the numbers I need without making me become an accountant.'],
  ['Tunde, Abuja', 'My team can serve customers faster, and I can check the business from anywhere.'],
  ['Chioma, Port Harcourt', 'My regulars buy on credit every week and the Credit Book keeps every kobo accounted for.'],
];

// Owner Mode marketing prices. Yearly is two months free versus paying monthly.
const OWNER_MONTHLY = '\u20A65,000';
const OWNER_YEARLY = '\u20A650,000';
const OWNER_YEARLY_SAVINGS = '\u20A610,000';

export default function Landing() {
  // A fresh browser open always starts here, even for visitors with a saved
  // session; the root route no longer bounces signed-in users into the app.
  // Their call-to-action buttons simply point into the app instead of the
  // sign-up flow.
  const { user } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState('monthly'); // 'monthly' | 'yearly'
  const yearly = billing === 'yearly';

  // Signed in: straight into the app. Signed out: the sign-in / sign-up flow.
  const goApp = () => navigate(user ? '/dashboard' : '/login');

  return (
    <div className="min-h-screen overflow-hidden bg-white text-zinc-900 selection:bg-emerald-600 selection:text-white">
      <nav className="sticky top-0 z-30 border-b border-zinc-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5"
            aria-label="Back to top"
          >
            <img src={logo} alt="SmartStore NG" className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-lg font-bold tracking-tight text-zinc-900">
              SmartStore <span className="text-emerald-600">NG</span>
            </span>
          </button>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-600 md:flex">
            <a href="#features" className="transition-colors hover:text-emerald-600">Features</a>
            <a href="#pos" className="transition-colors hover:text-emerald-600">Point of Sale</a>
            <a href="#owner-mode" className="transition-colors hover:text-emerald-600">Owner Modes</a>
            <a href="#how-it-works" className="transition-colors hover:text-emerald-600">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-emerald-600">Pricing</a>
            <Link to="/demo" className="transition-colors hover:text-emerald-600">Live demo</Link>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={goApp}
              className="hidden px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:text-zinc-950 sm:block"
            >
              {user ? 'Open App' : 'Log In'}
            </button>
            <button
              onClick={goApp}
              className="rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              {user ? 'Go to App' : 'Get Started'}
            </button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero with 3D dashboard preview */}
        <section className="relative">
          <div
            className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Built for Nigerian businesses
              </p>
              <h1 className="text-4xl font-bold leading-[1.06] tracking-tight text-zinc-950 sm:text-6xl">
                The smarter way to <span className="text-emerald-600">manage your shop.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600">
                One calm, organized workspace for sales, credit, inventory, people, and profit. SmartStore NG
                helps you run today and grow tomorrow.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={goApp}
                  className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
                >
                  {user ? 'Open your dashboard' : 'Start for free'}
                  {!user && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </button>
                <Link
                  to="/demo"
                  className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-6 py-3.5 font-semibold text-zinc-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" /> Try the live demo
                </Link>
              </div>
              <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Free to start. No card required. Set up in minutes.
              </p>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* Business types marquee */}
        <section
          id="niches"
          aria-label="Types of businesses SmartStore supports"
          className="overflow-hidden border-y border-zinc-100 bg-zinc-50/80 py-7 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
        >
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
            <MarqueeRow />
            <MarqueeRow ariaHidden />
          </div>
        </section>

        {/* Stats */}
        <section className="border-b border-zinc-100 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-zinc-100 px-0 sm:grid-cols-4 lg:mx-auto">
            {stats.map(([value, label]) => (
              <div key={label} className="bg-white px-4 py-8 text-center sm:py-9">
                <p className="text-3xl font-bold text-emerald-600">{value}</p>
                <p className="mt-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <SectionHeading
            eyebrow="Everything in one place"
            title="Tools that keep business moving."
            text="Less guesswork. Fewer spreadsheets. More time focused on your customers."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, text, Icon]) => (
              <div
                key={title}
                className="rounded-2xl border border-zinc-200 bg-white p-6 transition-all hover:border-emerald-300 hover:shadow-[0_12px_32px_-16px_rgba(5,150,105,0.25)]"
              >
                <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-zinc-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Point of Sale showcase */}
        <section id="pos" className="border-y border-zinc-100 bg-zinc-50/70">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-24 lg:grid-cols-2 lg:gap-10 lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">At the counter</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
                A register your cashiers actually enjoy.
              </h2>
              <p className="mt-4 text-zinc-600">
                Tap products into the sale, scan barcodes, take cash, transfer, card, part payment
                or credit, and print a clean receipt. Fast enough for a queue, simple enough for a
                new hire on day one.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  'Search and category tabs to find any product in a second',
                  'Barcode scanning by camera or USB scanner',
                  'Cash, Transfer, Card, Partial and Credit in one tap',
                  'The total and Complete Sale button stay in view as the cart grows',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-9">
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" /> Open the register in the demo
                </Link>
              </div>
            </div>
            <PosPreview />
          </div>
        </section>

        {/* Owner Mode: the two-way app */}
        <section id="owner-mode" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <SectionHeading
            eyebrow="For owners on the move"
            title="Two ways to open your shop. Both yours."
            text="Owner Mode subscribers get a two-way app: a strictly Monitoring experience on your phone, and the full Transactional register at the counter. SmartStore detects your device and opens the right one — and you can switch anytime."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-5 font-semibold text-zinc-900">Monitoring mode</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                The whole shop on your phone — strictly watching, never selling.
              </p>
              <ul className="mt-5 space-y-3">
                {[
                  "Today's revenue, receipts and the 7-day trend",
                  'Live inventory with low-stock and expiry alerts',
                  'Who owes what, with the full repayment history',
                  'Profit reports, expenses and the void audit trail',
                  'Approve staff and manage your team remotely',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                No POS. No checkout. Ever.
              </p>
            </div>
            <div className="rounded-3xl border border-zinc-200 bg-white p-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Monitor className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-5 font-semibold text-zinc-900">Transactional mode</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                The complete app at the counter — register included.
              </p>
              <ul className="mt-5 space-y-3">
                {[
                  'The full POS register, receipts and credit sales',
                  'Inventory, expenses and team management',
                  'Everything in monitoring mode, plus selling',
                  'Opens by default on the shop computer',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
                Device detection picks the mode; your switch is remembered.
              </p>
            </div>
          </div>

          {/* Free vs Owner: benefits and restrictions at a glance */}
          <div className="mt-12 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
            <div className="grid grid-cols-[1fr,auto,auto] items-center gap-3 border-b border-zinc-100 bg-zinc-50/70 px-5 py-4 text-xs font-bold uppercase tracking-wider text-zinc-500 sm:grid-cols-[1fr,10rem,10rem] sm:px-7">
              <span className="text-left">Compare plans</span>
              <span className="text-center">Shop Mode</span>
              <span className="text-center text-emerald-700">Owner Mode</span>
            </div>
            {[
              ['POS register & receipts', true, true],
              ['Inventory & sales history', true, true],
              ['Team', 'You + 1 cashier + 1 manager', 'Unlimited, every role'],
              ['Admin role', false, true],
              ['Full profit reports & expense analytics', false, true],
              ['Owner monitoring app on your phone', false, true],
              ['Two-way modes with device detection', false, true],
            ].map(([label, free, owner]) => (
              <div
                key={label}
                className="grid grid-cols-[1fr,auto,auto] items-center gap-3 border-b border-zinc-100 px-5 py-3.5 text-sm last:border-b-0 sm:grid-cols-[1fr,10rem,10rem] sm:px-7"
              >
                <span className="text-zinc-700">{label}</span>
                <CompareCell value={free} />
                <CompareCell value={owner} highlight />
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-zinc-100 bg-zinc-50/70">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
            <SectionHeading eyebrow="Simple from day one" title="Get up and running in minutes." />
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([n, t, x]) => (
                <div key={n} className="border-t-2 border-emerald-100 pt-5">
                  <p className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                    {n}
                  </p>
                  <h3 className="mt-4 font-semibold text-zinc-900">{t}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{x}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <SectionHeading eyebrow="Loved by owners" title="Built for the way you work." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {testimonials.map(([name, quote]) => (
              <figure key={name} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <blockquote>
                  <p className="text-base leading-7 text-zinc-700">&ldquo;{quote}&rdquo;</p>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  {name}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-zinc-100 bg-zinc-50/70">
          <div className="mx-auto max-w-5xl px-5 py-24 lg:px-8">
            <SectionHeading
              eyebrow="Clear, fair pricing"
              title="Start free. Upgrade when ready."
              text="No hidden fees. No contracts. Pay only when your shop outgrows the basics."
            />

            {/* Billing cycle toggle */}
            <div className="mt-8 flex justify-center">
              <div
                role="radiogroup"
                aria-label="Billing cycle"
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!yearly}
                  onClick={() => setBilling('monthly')}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    !yearly ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={yearly}
                  onClick={() => setBilling('yearly')}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    yearly ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Yearly
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      yearly ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    Save {OWNER_YEARLY_SAVINGS}
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <PriceCard
                title="Shop Mode"
                price={'\u20A60'}
                period="/month"
                text="The essentials for running your shop today."
                items={['POS and sales history', 'Inventory basics', 'Team: you + 1 cashier + 1 manager']}
                excluded={[
                  'No admin role or extra staff',
                  'No full profit reports or expense analytics',
                  'No two-way owner app',
                ]}
                cta="Start free"
              />
              <PriceCard
                featured
                title="Owner Mode"
                price={yearly ? OWNER_YEARLY : OWNER_MONTHLY}
                period={yearly ? '/year' : '/month'}
                note={
                  yearly
                    ? `Two months free, save ${OWNER_YEARLY_SAVINGS} a year`
                    : `Or ${OWNER_YEARLY} a year and save ${OWNER_YEARLY_SAVINGS}`
                }
                text="The complete view for owners who want to grow."
                items={[
                  'Everything in Shop Mode',
                  'Two-way owner app: Monitoring & Transactional',
                  'Full reports, expenses & void audit',
                  'Unlimited team, every role',
                ]}
                cta="Choose Owner Mode"
              />
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-24 lg:px-8">
          <div className="rounded-3xl bg-emerald-600 px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your business deserves a better system.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-emerald-50">
              Join owners building calmer, more profitable businesses with SmartStore NG.
            </p>
            <button
              onClick={goApp}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
            >
              {user ? 'Open your dashboard' : 'Get started free'}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 bg-white text-sm text-zinc-500">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <span className="flex items-center gap-2.5 font-bold text-zinc-900">
              <img src={logo} alt="SmartStore NG" className="h-7 w-7 rounded-lg object-contain" />
              SmartStore <span className="text-emerald-600">NG</span>
            </span>
            <p className="mt-4 max-w-xs leading-6">
              Smarter management for shops, pharmacies, boutiques, and restaurants across Nigeria.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-900">Product</h3>
            <ul className="mt-4 space-y-2.5">
              <li><a href="#features" className="hover:text-emerald-600">Features</a></li>
              <li><a href="#pos" className="hover:text-emerald-600">Point of Sale</a></li>
              <li><a href="#niches" className="hover:text-emerald-600">Niches</a></li>
              <li><a href="#pricing" className="hover:text-emerald-600">Pricing</a></li>
              <li><Link to="/demo" className="hover:text-emerald-600">Live demo</Link></li>
              <li>
                <button type="button" onClick={goApp} className="hover:text-emerald-600">
                  {user ? 'Open App' : 'Log In'}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-900">Support</h3>
            <ul className="mt-4 space-y-2.5">
              <li><Link to="/contact" className="hover:text-emerald-600">Contact Us</Link></li>
              <li><Link to="/help" className="hover:text-emerald-600">Help Center</Link></li>
              <li>
                <a href="mailto:info@mastechinnovations.com.ng" className="hover:text-emerald-600">
                  Email Support
                </a>
              </li>
              <li>
                <a href="tel:+2349138825300" className="hover:text-emerald-600">
                  +234 913 882 5300
                </a>
              </li>
              <li>
                <a href="mailto:business@smartstoreng.shop" className="hover:text-emerald-600">
                  Business Inquiries
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-900">Legal</h3>
            <ul className="mt-4 space-y-2.5">
              <li><Link to="/privacy" className="hover:text-emerald-600">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-emerald-600">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-zinc-100">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-5 text-xs sm:flex-row lg:px-8">
            <span>&copy; {new Date().getFullYear()} SmartStore NG. All rights reserved.</span>
            <span>
              Powered by{' '}
              <span className="font-semibold text-zinc-700">MASTECH INNOVATIONS</span>
              {' '}&middot; Lagos, Nigeria
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MarqueeRow({ ariaHidden }) {
  return (
    <div className="flex items-center" aria-hidden={ariaHidden || undefined}>
      {businessTypes.map((type) => (
        <span
          key={type}
          className="flex items-center gap-8 whitespace-nowrap px-8 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500"
        >
          {type}
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

function DashboardPreview() {
  const bars = [
    ['Mon', 42],
    ['Tue', 64],
    ['Wed', 51],
    ['Thu', 78],
    ['Fri', 60],
    ['Sat', 96],
    ['Sun', 70],
  ];
  const recentSales = [
    ['Peak Milk 900g', '\u20A66,800'],
    ['Golden Penny Spaghetti', '\u20A63,600', 'Part paid'],
    ['Cola 50cl, pack of 12', '\u20A64,200'],
  ];

  return (
    <div className="relative pb-6 pr-4 pt-10 [perspective:1600px] sm:pr-8 lg:pb-4">
      <div
        className="pointer-events-none absolute inset-x-4 bottom-0 top-16 -z-10 rounded-[2.5rem] bg-emerald-100/60 blur-2xl"
        aria-hidden="true"
      />
      <div
        role="img"
        aria-label="Preview of the SmartStore dashboard"
        className="relative flex flex-col items-start gap-3"
      >
        <div className="absolute -left-4 top-2 z-10 hidden w-60 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl xl:flex [transform:rotateY(12deg)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-900">Sale completed</span>
            <span className="block truncate text-[11px] text-zinc-500">{'\u20A6'}12,500 &middot; Receipt SM-48213</span>
          </span>
        </div>
        <div className="absolute -right-2 bottom-24 z-10 hidden w-56 items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-xl xl:flex [transform:rotateY(-12deg)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <BookUser className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-900">Repayment recorded</span>
            <span className="block truncate text-[11px] text-zinc-500">Mama Ngozi &middot; {'\u20A6'}800 left</span>
          </span>
        </div>

        <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_48px_90px_-24px_rgba(16,24,40,0.22)] transition-transform duration-700 ease-out [transform:rotateX(7deg)_rotateY(-13deg)] hover:[transform:rotateX(0deg)_rotateY(0deg)]">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-3">
            <div className="flex items-center gap-2">
              <img src={logo} alt="" className="h-5 w-5 rounded object-contain" />
              <span className="text-xs font-semibold text-zinc-700">Marta&rsquo;s Mart &middot; Dashboard</span>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              Today
            </span>
          </div>

          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <div className="min-w-0 overflow-hidden rounded-xl bg-emerald-50 p-3.5">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-emerald-700/70 sm:text-[11px]">Sales today</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums text-emerald-800 sm:text-lg">{'\u20A6'}86,400</p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700">+12% this week</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50 p-3.5">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">Transactions</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums text-zinc-900 sm:text-lg">47</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">today so far</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50 p-3.5">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">Low stock</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums text-zinc-900 sm:text-lg">3 items</p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">Restock soon</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-zinc-100 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold text-zinc-900">Sales this week</p>
                <p className="text-[11px] font-medium text-zinc-500">{'\u20A6'}412,300</p>
              </div>
              <div className="mt-3 flex h-24 items-end gap-2">
                {bars.map(([day, h], i) => (
                  <div key={day} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-20 w-full items-end">
                      <div
                        className={`w-full rounded-md ${i === bars.length - 2 ? 'bg-emerald-500' : 'bg-zinc-200'}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400">{day}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold text-zinc-900">Recent transactions</p>
                <span className="text-[11px] font-medium text-emerald-700">View all</span>
              </div>
              <div className="mt-2 divide-y divide-zinc-100">
                {recentSales.map(([name, amount, chip]) => (
                  <div key={name} className="flex items-center gap-2.5 py-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-700">{name}</span>
                    {chip && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                        {chip}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-zinc-900">{amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PosPreview() {
  const tiles = [
    ['Peak Milk 400g', '\u20A62,800'],
    ['Indomie Chicken', '\u20A6350'],
    ['Coca-Cola 50cl', '\u20A6400'],
    ['Dettol Soap', '\u20A6650'],
    ['Eva Water 75cl', '\u20A6250'],
    ['Gala Roll', '\u20A6350'],
  ];
  const cart = [
    ['Peak Milk 400g', 2, '\u20A65,600'],
    ['Coca-Cola 50cl', 3, '\u20A61,200'],
    ['Gala Roll', 1, '\u20A6350'],
  ];

  return (
    <div
      role="img"
      aria-label="Preview of the SmartStore point of sale register"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_48px_90px_-24px_rgba(16,24,40,0.22)]"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
          <ShoppingCart className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Register
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          Marta&rsquo;s Mart
        </span>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-5 sm:p-5">
        {/* Product grid */}
        <div className="sm:col-span-3">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Search products
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {tiles.map(([name, price]) => (
              <div key={name} className="rounded-xl border border-zinc-100 bg-white p-2.5 shadow-sm">
                <div className="mb-2 h-8 rounded-lg bg-emerald-50" aria-hidden="true" />
                <p className="truncate text-[11px] font-medium text-zinc-800">{name}</p>
                <p className="text-[11px] font-bold text-emerald-700">{price}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="flex flex-col rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 sm:col-span-2">
          <p className="text-xs font-semibold text-zinc-900">Current Sale</p>
          <div className="mt-2 space-y-2">
            {cart.map(([name, qty, amount]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-zinc-800">{name}</p>
                  <p className="text-[10px] text-zinc-500">{amount}</p>
                </div>
                <div className="flex items-center gap-1 text-zinc-500">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white ring-1 ring-zinc-200">
                    <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                  <span className="w-4 text-center text-[11px] font-semibold text-zinc-900">{qty}</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white ring-1 ring-zinc-200">
                    <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
            <span className="text-[11px] text-zinc-500">Total</span>
            <span className="text-base font-bold text-zinc-900">{'\u20A6'}7,150</span>
          </div>
          <div className="mt-2 rounded-lg bg-emerald-500 py-2 text-center text-xs font-bold text-black">
            Complete Sale
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-zinc-600">{text}</p>}
    </div>
  );
}

function CompareCell({ value, highlight = false }) {
  if (value === true) {
    return (
      <span className="flex items-center justify-center">
        <Check
          className={`h-4 w-4 ${highlight ? 'text-emerald-600' : 'text-zinc-400'}`}
          aria-label="Included"
        />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="flex items-center justify-center">
        <Minus className="h-4 w-4 text-zinc-300" aria-label="Not included" />
      </span>
    );
  }
  return (
    <span
      className={`text-center text-xs font-medium ${
        highlight ? 'text-emerald-700' : 'text-zinc-500'
      }`}
    >
      {value}
    </span>
  );
}

function PriceCard({ title, price, period, note, text, items, excluded = [], cta, featured }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div
      className={`rounded-3xl border bg-white p-7 ${
        featured ? 'border-emerald-500 shadow-[0_24px_48px_-24px_rgba(5,150,105,0.35)] ring-1 ring-emerald-500' : 'border-zinc-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <p className="mt-2 text-sm text-zinc-600">{text}</p>
        </div>
        {featured && (
          <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
            Most popular
          </span>
        )}
      </div>
      <p className="mt-8 text-4xl font-bold text-zinc-950">
        {price}
        {period && <span className="text-sm font-normal text-zinc-500">{period}</span>}
      </p>
      {note && <p className="mt-1.5 text-xs font-semibold text-emerald-700">{note}</p>}
      <ul className="mt-7 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-zinc-700">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            {item}
          </li>
        ))}
        {excluded.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-zinc-500">
            <Minus className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate(user ? '/dashboard' : '/login')}
        className={`mt-8 w-full rounded-full px-4 py-3 text-sm font-semibold transition-colors ${
          featured
            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
            : 'border border-zinc-200 bg-white text-zinc-800 hover:border-emerald-300 hover:text-emerald-700'
        }`}
      >
        {cta}
      </button>
    </div>
  );
}
