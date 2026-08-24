import { Link } from 'react-router-dom';
import logo from '/logo-smartstore.png';

const PAGES = {
  privacy: {
    title: 'Privacy Policy',
    updated: '24 August 2026',
    body: [
      [
        'What we collect',
        'SmartStore NG stores the account email you sign up with, the shop profile you create, and the sales, inventory, team, and expense records you enter while using the product.',
      ],
      [
        'How we use it',
        'We use this information only to run your store workspace, keep your team signed in, and improve reliability. We do not sell customer lists or sale data.',
      ],
      [
        'Where it lives',
        'When the live backend is enabled, data is stored in a Supabase (Postgres) project with row-level security. In demo mode, data stays in your browser only.',
      ],
      [
        'Your choices',
        'You can ask us to export or delete a store by emailing hello@smartstoreng.shop. Store owners can remove team members from the Team page at any time.',
      ],
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: '24 August 2026',
    body: [
      [
        'Using SmartStore NG',
        'SmartStore NG is a store-management tool. You are responsible for the accuracy of the products, prices, and sales you record, and for the staff you invite.',
      ],
      [
        'Accounts',
        'Keep your password private. Store owners decide who may join, and they approve or reject staff requests. Super-admin access is reserved for the platform operator.',
      ],
      [
        'Plans',
        'Shop Mode is free. Owner Mode unlocks full reports and expense analytics. Demo billing may be shown in the app until a live payment provider is connected.',
      ],
      [
        'Acceptable use',
        'Do not use the service to store unlawful goods, attack the platform, or access another shop’s data. We may suspend accounts that break these terms.',
      ],
    ],
  },
  help: {
    title: 'Help Center',
    updated: '24 August 2026',
    body: [
      [
        'Create a store',
        'Sign up as a business owner, choose your niche, and add your first products. Staff can join later with the 6-character code on the Team page.',
      ],
      [
        'Take a sale',
        'Open POS, tap items or scan a barcode (camera or USB scanner), pick Cash, Transfer, or POS/Card, then complete the sale. Print an 80mm thermal receipt from POS or Sales History.',
      ],
      [
        'Install the app',
        'On a supported browser you will see an Install banner in the bottom-right corner. Dismiss it once and we will remember that choice on this device.',
      ],
      [
        'Need more help?',
        'Write to hello@smartstoreng.shop with your store name and a short description of the issue. We reply during Nigerian business hours.',
      ],
    ],
  },
  contact: {
    title: 'Contact Us',
    updated: '24 August 2026',
    body: [
      [
        'Support',
        'Email hello@smartstoreng.shop for product questions, account access, or help recovering a store.',
      ],
      [
        'Business inquiries',
        'Partnerships, wholesale, and press: business@smartstoreng.shop.',
      ],
      [
        'Nigeria',
        'SmartStore NG is built for shops across Nigeria. We are based in Lagos.',
      ],
    ],
  },
};

export default function PublicInfo({ page }) {
  const content = PAGES[page] || PAGES.help;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-bold">
            <img src={logo} alt="" className="h-8 w-8 rounded-lg object-contain" />
            SmartStore <span className="text-emerald-600">NG</span>
          </Link>
          <Link to="/login" className="text-sm font-semibold text-emerald-700 hover:text-emerald-600">
            Log In
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
          Updated {content.updated}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{content.title}</h1>
        <div className="mt-10 space-y-8">
          {content.body.map(([heading, text]) => (
            <section key={heading}>
              <h2 className="text-lg font-semibold text-zinc-900">{heading}</h2>
              <p className="mt-2 leading-7 text-zinc-600">{text}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-zinc-500">
          <Link to="/" className="font-semibold text-emerald-700 hover:text-emerald-600">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
