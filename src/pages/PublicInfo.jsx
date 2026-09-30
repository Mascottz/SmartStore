import { Link } from 'react-router-dom';
import logo from '/logo-smartstore.png';

const PAGES = {
  privacy: {
    title: 'Privacy Policy',
    updated: '24 August 2026',
    body: [
      [
        'Who we are',
        'SmartStore NG ("we", "us") provides point-of-sale, inventory, team, and reporting tools for businesses in Nigeria and beyond. This policy explains how we handle personal and business data when you use smartstoreng.shop.',
      ],
      [
        'Information we collect',
        'We collect the account email and password you sign up with, the shop profile you create (name, business type, categories), and the records you enter while using the product (products, sales, voided sales, expenses, team members, and receipts). When you start a Paystack payment, Paystack may collect your payment details on its own platform.',
      ],
      [
        'How we use your information',
        'We use this information to run your store workspace, keep your team signed in, generate your reports and receipts, resolve support requests, and improve product reliability. We do not sell your customer lists, sale data, or personal information.',
      ],
      [
        'Legal bases & legitimate use',
        'We process data to provide the service you requested (contract), to keep the platform secure and operational (legitimate interest), and to meet Nigerian and other legal obligations. We do not use your store data for advertising.',
      ],
      [
        'Sharing & disclosure',
        'We share data only with the service providers required to run the product: primarily Supabase (database and authentication), Paystack (payment processing when you choose to pay), and Google Gemini when you choose to use the optional StoreSense assistant. The assistant sends limited store context such as aggregate figures and product labels so it can answer your question; it does not send passwords, account emails, customer names, or raw receipt history. We may disclose data if required by law or to protect the rights and safety of users and the platform. We never sell your data.',
      ],
      [
        'Where your data lives',
        'With the live backend enabled, data is stored in a Supabase (Postgres) project with row-level security. In demo mode, data stays in your browser (localStorage) and is not transmitted to any server unless you choose to use the StoreSense assistant, in which case the limited context described above is sent to the configured Gemini endpoint.',
      ],
      [
        'Data retention',
        'We keep your account and store data while your account is active so the workspace keeps working. You may request deletion of your account and store data at any time and we will remove it, subject to records we must keep for legal, tax, or fraud-prevention purposes.',
      ],
      [
        'Security',
        'We use industry-standard protections, including encrypted connections (HTTPS), hashed passwords through our authentication provider, and row-level security so each store is only visible to its members and the platform operators.',
      ],
      [
        'Cookies & local storage',
        'We use browser local storage to remember your session, theme preference, and (for the audit trail) admin actions. We do not use third-party advertising cookies.',
      ],
      [
        'Your rights',
        'You may request access to, a copy of, correction of, or deletion of your personal and store data at any time. Store owners may remove team members from the Team page and control who may access the store.',
      ],
      [
        'Children\'s privacy',
        'SmartStore NG is a business tool intended for business owners and their staff. It is not directed at children under 13, and we do not knowingly collect their personal data.',
      ],
      [
        'Changes to this policy',
        'If we change this policy, we will post the updated version here and update the date above. Material changes will be highlighted in-app or by email where required.',
      ],
      [
        'Contact us',
        'For privacy requests or to exercise any of your rights, email hello@smartstoreng.shop or write to SmartStore NG, Abuja, Nigeria.',
      ],
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: '24 August 2026',
    body: [
      [
        'Acceptance of these terms',
        'By creating an account or using SmartStore NG, you agree to these Terms of Service. If you use the service on behalf of a business, you confirm you are authorised to accept these terms for that business.',
      ],
      [
        'Using SmartStore NG',
        'SmartStore NG is a store-management tool. You are responsible for the accuracy of the products, prices, and sales you record, and for the staff you invite. You agree to use the service only for lawful business purposes.',
      ],
      [
        'Accounts & responsibility',
        'Keep your password private. Store owners decide who may join, and they approve or reject staff requests. You are responsible for activity that happens under your account. Super-admin access is reserved for the platform operator.',
      ],
      [
        'Plans & payments',
        'Shop Mode is free. Owner Mode unlocks StoreSense, full reports and expense analytics, and may carry a subscription fee. When you subscribe, payment is processed through Paystack (an independent third party); we do not store your card details. Fees are non-refundable except where law requires. We may offer demo billing in the app until a live payment provider is connected.',
      ],
      [
        'StoreSense assistant',
        'StoreSense is an Owner Mode feature. Stores on the Owner Mode plan (and the public demo store) can use it across the app, for every approved member of that store; Shop Mode stores see an upgrade prompt instead. It can answer questions, explain records, and guide you to features. AI responses may be incomplete or inaccurate, so check important numbers in the relevant SmartStore screen. The assistant respects your account permissions and does not replace your responsibility for sales, stock, staff, or financial decisions.',
      ],
      [
        'Acceptable use',
        'Do not use the service to store or sell unlawful goods, to attack or disrupt the platform, to access another shop’s data, or to impersonate others. We may suspend or terminate accounts that break these terms.',
      ],
      [
        'Intellectual property',
        'SmartStore NG and its software, branding, and content are owned by us or our licensors. You retain ownership of the data you enter into your store and grant us a limited licence to host and process it solely to provide the service.',
      ],
      [
        'Termination',
        'You may stop using the service and delete your account at any time. We may suspend or terminate access if you breach these terms, and we will give you notice where practicable.',
      ],
      [
        'Disclaimer & limitation of liability',
        'The service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, our total liability for any claim relating to the service is limited to the amount you paid for the service in the 12 months before the claim.',
      ],
      [
        'Governing law & jurisdiction',
        'These Terms are governed by the laws of the Federal Republic of Nigeria, including the Nigeria Data Protection Act 2023 (NDPA) and the Nigeria Data Protection Regulation (NDPR) where applicable. You agree that any dispute arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the courts of Nigeria sitting in the Federal Capital Territory, Abuja.',
      ],
      [
        'Changes to these terms',
        'We may update these Terms from time to time. The latest version will always be available at this page, with the updated date shown above. Continued use of the service after changes takes effect constitutes acceptance of the new Terms.',
      ],
      [
        'Contact us',
        'Questions about these Terms? Email hello@smartstoreng.shop or write to SmartStore NG, Abuja, Nigeria.',
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
        'Use StoreSense',
        'StoreSense comes with Owner Mode. On a subscribed store, open StoreSense from anywhere inside the app and ask about sales, stock, best sellers, credit, expenses, reports, team, settings, or how to use a feature. In Inventory, StoreSense can also arrange rough stock-list text into reviewed rows with generated SKUs. Everyone on the team can use it, it works with local insights offline, and it follows the permissions of your role. On Shop Mode the StoreSense button explains the feature and links to the upgrade.',
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
        'Email support',
        'For product questions, account access, or help recovering a store, email info@mastechinnovations.com.ng or call +2349138825300. We reply during Nigerian business hours.',
      ],
      [
        'Business inquiries',
        'Partnerships, wholesale, and press: business@smartstoreng.shop.',
      ],
      [
        'Powered by MASTECH INNOVATIONS',
        'SmartStore NG is a product of MASTECH INNOVATIONS, based in Abuja, Nigeria.',
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

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-zinc-500 sm:flex-row">
          <span>
            Powered by{' '}
            <span className="font-semibold text-zinc-700">MASTECH INNOVATIONS</span>
          </span>
          <a href="mailto:info@mastechinnovations.com.ng" className="hover:text-emerald-600">
            info@mastechinnovations.com.ng
          </a>
        </div>
      </footer>
    </div>
  );
}
