import { Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PendingApproval from '../components/PendingApproval';
import logo from '/logo-smartstore.png';

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
  ['Chioma, Port Harcourt', 'It is simple enough for a busy shop and powerful enough to grow with us.'],
];

export default function Landing() {
  const { user, approvalStatus } = useAuth();
  const navigate = useNavigate();
  if (user && (approvalStatus === 'pending' || approvalStatus === 'rejected')) return <PendingApproval />;
  if (user) return <Navigate to="/dashboard" replace />;

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
            <a href="#how-it-works" className="transition-colors hover:text-emerald-600">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-emerald-600">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="hidden px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:text-zinc-950 sm:block"
            >
              Log In
            </button>
            <button
              onClick={() => navigate('/login')}
              className="rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              Get Started
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
                One calm, organized workspace for sales, inventory, people, and profit. SmartStore NG
                helps you run today and grow tomorrow.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
                >
                  Start for free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a
                  href="#features"
                  className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-6 py-3.5 font-semibold text-zinc-700 transition-colors hover:border-emerald-300 hover:text-emerald-700"
                >
                  Explore features <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </a>
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
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <PriceCard
                title="Shop Mode"
                price={'\u20A60'}
                text="The essentials for running your shop today."
                items={['POS and sales history', 'Inventory basics', 'Team access']}
                cta="Start free"
              />
              <PriceCard
                featured
                title="Owner Mode"
                price={'\u20A65,000'}
                text="The complete view for owners who want to grow."
                items={['Everything in Shop Mode', 'Full reports and expenses', 'Remote oversight and approvals']}
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
              onClick={() => navigate('/login')}
              className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
            >
              Get started free <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 bg-white px-5 py-10 text-sm text-zinc-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <span className="flex items-center gap-2.5 font-bold text-zinc-900">
            <img src={logo} alt="SmartStore NG" className="h-7 w-7 rounded-lg object-contain" />
            SmartStore <span className="text-emerald-600">NG</span>
          </span>
          <span>Simple tools for ambitious businesses.</span>
          <span>&copy; {new Date().getFullYear()} SmartStore NG</span>
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
    ['Golden Penny Spaghetti', '\u20A63,600'],
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
            <Package className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-900">Low stock alert</span>
            <span className="block truncate text-[11px] text-zinc-500">Rice 5kg &middot; 4 left</span>
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
                {recentSales.map(([name, amount]) => (
                  <div key={name} className="flex items-center gap-2.5 py-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-700">{name}</span>
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

function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-zinc-600">{text}</p>}
    </div>
  );
}

function PriceCard({ title, price, text, items, cta, featured }) {
  const navigate = useNavigate();
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
        {featured && <span className="text-sm font-normal text-zinc-500">/month</span>}
      </p>
      <ul className="mt-7 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-zinc-700">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate('/login')}
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
