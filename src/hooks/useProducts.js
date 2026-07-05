// src/hooks/useProducts.js
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

export function useProducts() {
  const { storeId } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If storeId is not ready yet, clear data and wait
    if (!storeId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, 'products'),
      where('storeId', '==', storeId), // ✅ scope by store
      orderBy('name')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setProducts(items);
        setLoading(false);
      },
      (error) => {
        console.error('useProducts error', error);
        setProducts([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId]);

  return { products, loading };
}