import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";

interface AuthState {
  user: User | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isPlatformAdmin: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, isPlatformAdmin: false, loading: false, error: null });
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const isPlatformAdmin = userDoc.exists() && userDoc.data()?.platformAdmin === true;
        setState({ user, isPlatformAdmin, loading: false, error: null });
      } catch {
        setState({ user, isPlatformAdmin: false, loading: false, error: "Failed to verify admin status" });
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setState((s) => ({ ...s, loading: false, error: "Invalid credentials" }));
    }
  };

  const logout = () => signOut(auth);

  return { ...state, login, logout };
}
