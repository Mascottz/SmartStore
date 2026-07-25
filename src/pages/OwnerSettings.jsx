// src/pages/OwnerSettings.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ShieldCheck, Store, Crown, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function OwnerSettings() {
  const {
    user,
    storeId,
    role,
    storeName,
    plan,
    storeIsDemo,
    upgradeToOwner,
    ownerEmail,   // optional: if you track owner email in context
    createdAt,    // optional: store createdAt date from Firestore
  } = useAuth();

  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const isOwner = role === 'owner';
  const isOwnerMode = plan === 'owner';

  const deleteStoreAndData = async () => {
    if (!isOwner) {
      toast.error('Only the store owner can delete this data.');
      return;
    }

    if (!storeId || !user) {
      toast.error('Store or user not ready. Please try again.');
      return;
    }

    const confirmed = window.confirm(
      'This will permanently delete ALL data for this store (products, sales, expenses, staff, etc.). You will then need to delete the Auth user manually in Firebase console.\n\nAre you sure?'
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      toast.loading('Deleting store data…', { id: 'delete-store' });

      const collectionsToClean = [
        'categories',
        'expenses',
        'products',
        'sales',
        'voidLogs',
        'users', // owner + team docs with this storeId
      ];

      for (const colName of collectionsToClean) {
        const q = query(
          collection(db, colName),
          where('storeId', '==', storeId)
        );
        const snap = await getDocs(q);

        let batch = writeBatch(db);
        let count = 0;

        snap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          count++;
          if (count === 450) {
            batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        });

        if (count > 0) {
          await batch.commit();
        }
      }

      // Delete the store document itself
      const storeBatch = writeBatch(db);
      storeBatch.delete(doc(db, 'stores', storeId));
      await storeBatch.commit();

      toast.success('Store data deleted.', { id: 'delete-store' });

      await auth.signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      console.error('Error deleting store data', e);
      toast.error('Could not delete all data. Check console.', {
        id: 'delete-store',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Small helper to format createdAt if provided
  const createdAtLabel =
    createdAt instanceof Date
      ? createdAt.toLocaleDateString()
      : createdAt?.toDate
      ? createdAt.toDate().toLocaleDateString()
      : '—';

  return (
    <div className="p-4 md:p-6 bg-zinc-950 min-h-screen text-white">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Owner Settings
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl">
              Manage your store’s subscription, account details, and dangerous actions.
              Only the store owner should have access to this page.
            </p>
          </div>
          {isOwner && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-xs font-medium">
              <ShieldCheck className="w-3 h-3" />
              <span>Owner access</span>
            </div>
          )}
        </div>

        {/* Top cards: store overview + subscription */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {/* Store / owner overview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center">
                <Store className="w-5 h-5 text-zinc-200" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Store overview</h2>
                <p className="text-xs text-zinc-400">
                  Basic details about this SmartStore account.
                </p>
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Store name</dt>
                <dd className="text-zinc-100 font-medium text-right">
                  {storeName || 'SmartStore NG'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Owner email</dt>
                <dd className="text-zinc-100 text-right">
                  {ownerEmail || user?.email || '—'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Your role</dt>
                <dd className="text-zinc-100 text-right capitalize">
                  {role || '—'}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Store created</dt>
                <dd className="text-zinc-100 text-right">
                  {createdAtLabel}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-400">Environment</dt>
                <dd className="text-zinc-100 text-right">
                  {storeIsDemo ? 'Demo store' : 'Live store'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Subscription / plan card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Subscription status</h2>
                <p className="text-xs text-zinc-400">
                  See your current plan and upgrade options.
                </p>
              </div>
            </div>

            <div className="mb-3">
              <p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">
                Current plan
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-100">
                  {storeIsDemo
                    ? 'Demo · Owner Mode'
                    : isOwnerMode
                    ? 'Owner Mode'
                    : 'Shop Mode (Free)'}
                </span>
                {!storeIsDemo && (
                  <span className="text-xs text-zinc-400">
                    Billing via SmartStore NG
                  </span>
                )}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400 mb-1">
                Owner Mode pricing
              </p>
              <p className="text-sm text-zinc-100">
                ₦10,000 per month
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Includes remote access from any device, full sales and expenses reports,
                staff management, and priority support.
              </p>
            </div>

            {!storeIsDemo && !isOwnerMode && isOwner && (
              <button
                onClick={upgradeToOwner}
                className="inline-flex items-center justify-center gap-2 w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
              >
                <Crown className="w-4 h-4" />
                <span>Upgrade to Owner Mode</span>
              </button>
            )}

            {!isOwner && (
              <p className="mt-3 text-xs text-zinc-500 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Only the store owner can manage the subscription.
              </p>
            )}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-zinc-900 border border-red-700/60 rounded-3xl p-5 md:p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">
            Delete store and all data
          </h2>
          <p className="text-xs text-zinc-400 mb-4">
            This will permanently remove this store and all its data from SmartStore NG
            (products, sales, expenses, staff, everything). Once deleted, nothing can
            be recovered. You will then need to delete the Auth user manually in the
            Firebase console if required.
          </p>

          {!isOwner && (
            <div className="mb-3 text-xs text-amber-400">
              You are not the store owner. Data deletion is disabled for your account.
            </div>
          )}

          <button
            onClick={deleteStoreAndData}
            disabled={!isOwner || isDeleting}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-zinc-500 px-5 py-3 rounded-2xl text-sm font-semibold"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting
              ? 'Deleting store data…'
              : 'Delete store and all data'}
          </button>
        </div>
      </div>
    </div>
  );
}