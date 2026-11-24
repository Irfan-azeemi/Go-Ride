import React, { useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal, AuthModalMode } from './components/AuthModal';
import { CustomerDashboard } from './components/CustomerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoRideLogo } from './components/GoRideLogo';
import { LandingPage } from './components/LandingPage';
import {
  DEFAULT_FARE_CONFIG,
  DEFAULT_VEHICLES,
  seedInitialFleetAndConfig,
} from './data/seedData';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  AdminRecord,
  AppNotification,
  Booking,
  Driver,
  FareConfig,
  UserProfile,
  Vehicle,
  VehicleType,
} from './types/goride';

type AppView = 'landing' | 'customer' | 'admin';

function timestampMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRecord, setAdminRecord] = useState<AdminRecord | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [view, setView] = useState<AppView>('landing');
  const [preselectVehicleType, setPreselectVehicleType] = useState<VehicleType>('car');
  const [customerInitialTab, setCustomerInitialTab] = useState<'overview' | 'book' | 'history' | 'profile'>('overview');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('customer-login');

  // Firestore synced collections
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fareConfig, setFareConfig] = useState<FareConfig>(DEFAULT_FARE_CONFIG);
  const [customerBookings, setCustomerBookings] = useState<Booking[]>([]);
  const [customerNotifications, setCustomerNotifications] = useState<AppNotification[]>([]);

  // Admin synced collections
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allCustomers, setAllCustomers] = useState<UserProfile[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AppNotification[]>([]);

  // Listen for Google Maps quota errors
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Load runtime Google Maps API key if not injected at Vite build time
  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/maps-config')
      .then((res) => res.json())
      .then((data) => {
        if (data?.apiKey) setMapsApiKey(data.apiKey);
      })
      .catch(() => {
        // Ignore if offline
      });
  }, [mapsApiKey]);

  // Public Firestore catalog listeners (vehicles + fareConfig)
  useEffect(() => {
    const unsubVehicles = onSnapshot(
      collection(db, 'vehicles'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Vehicle);
        setVehicles(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'vehicles')
    );

    const unsubFare = onSnapshot(
      doc(db, 'fareConfig', 'default'),
      (snap) => {
        if (snap.exists()) {
          setFareConfig(snap.data() as FareConfig);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'fareConfig/default')
    );

    return () => {
      unsubVehicles();
      unsubFare();
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setIsAdmin(false);
        setAdminRecord(null);
        setUserProfile(null);
        setCustomerBookings([]);
        setCustomerNotifications([]);
        setAllBookings([]);
        setAllCustomers([]);
        setDrivers([]);
        setAdmins([]);
        setAdminNotifications([]);
        setView('landing');
        setAuthReady(true);
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (adminSnap.exists()) {
          setIsAdmin(true);
          setAdminRecord(adminSnap.data() as AdminRecord);
        } else {
          setIsAdmin(false);
          setAdminRecord(null);
        }
      } catch {
        setIsAdmin(false);
        setAdminRecord(null);
      }

      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Authenticated Customer listeners
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('customerId', '==', firebaseUser.uid)
    );
    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Booking)
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
        setCustomerBookings(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
    );

    const notifsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubNotifs = onSnapshot(
      notifsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AppNotification)
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
        setCustomerNotifications(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubProfile();
      unsubBookings();
      unsubNotifs();
    };
  }, [authReady, firebaseUser]);

  // Authenticated Admin listeners
  useEffect(() => {
    if (!authReady || !firebaseUser || !isAdmin) return;

    void seedInitialFleetAndConfig();

    const unsubAllBookings = onSnapshot(
      collection(db, 'bookings'),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Booking)
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
        setAllBookings(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'bookings')
    );

    const unsubCustomers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAllCustomers(snap.docs.map((d) => d.data() as UserProfile));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    const unsubDrivers = onSnapshot(
      collection(db, 'drivers'),
      (snap) => {
        setDrivers(snap.docs.map((d) => d.data() as Driver));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'drivers')
    );

    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        setAdmins(snap.docs.map((d) => d.data() as AdminRecord));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'admins')
    );

    const adminNotifQ = query(
      collection(db, 'notifications'),
      where('userId', '==', 'admin')
    );
    const unsubAdminNotifs = onSnapshot(
      adminNotifQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AppNotification)
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
        setAdminNotifications(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubAllBookings();
      unsubCustomers();
      unsubDrivers();
      unsubAdmins();
      unsubAdminNotifs();
    };
  }, [authReady, firebaseUser, isAdmin]);

  const effectiveVehicles: Vehicle[] = useMemo(() => {
    if (vehicles.length > 0) return vehicles;
    return DEFAULT_VEHICLES.map((v) => ({ ...v }));
  }, [vehicles]);

  const handleOpenAuth = (mode: AuthModalMode) => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleAuthenticated = async (target: 'customer' | 'admin') => {
    if (target === 'admin') {
      const user = auth.currentUser;
      if (user) {
        const snap = await getDoc(doc(db, 'admins', user.uid));
        if (snap.exists()) {
          setIsAdmin(true);
          setAdminRecord(snap.data() as AdminRecord);
          setView('admin');
          return;
        }
      }
    }
    setCustomerInitialTab('book');
    setView('customer');
  };

  const handleOpenDashboard = (target: 'customer' | 'admin', preselectType?: VehicleType) => {
    if (preselectType) {
      setPreselectVehicleType(preselectType);
      setCustomerInitialTab('book');
    }
    if (target === 'admin' && isAdmin) {
      setView('admin');
    } else {
      setView('customer');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setView('landing');
  };

  const content = !authReady ? (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
      <GoRideLogo size="lg" />
      <div className="inline-flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-[#155EEF]" />
        Initializing GoRide...
      </div>
    </div>
  ) : view === 'admin' && firebaseUser && isAdmin ? (
    <AdminDashboard
      firebaseUser={firebaseUser}
      adminRecord={adminRecord}
      customers={allCustomers}
      bookings={allBookings}
      vehicles={effectiveVehicles}
      drivers={drivers}
      admins={admins}
      fareConfig={fareConfig}
      notifications={adminNotifications}
      onGoHome={() => setView('landing')}
      onSignOut={() => void handleSignOut()}
    />
  ) : view === 'customer' && firebaseUser ? (
    <CustomerDashboard
      firebaseUser={firebaseUser}
      profile={userProfile}
      vehicles={effectiveVehicles}
      fareConfig={fareConfig}
      bookings={customerBookings}
      notifications={customerNotifications}
      mapsConfigured={Boolean(mapsApiKey)}
      initialVehicleType={preselectVehicleType}
      initialTab={customerInitialTab}
      onGoHome={() => setView('landing')}
      onSignOut={() => void handleSignOut()}
    />
  ) : (
    <LandingPage
      vehicles={effectiveVehicles}
      fareConfig={fareConfig}
      isSignedIn={Boolean(firebaseUser)}
      isAdmin={isAdmin}
      onOpenAuth={handleOpenAuth}
      onOpenDashboard={handleOpenDashboard}
    />
  );

  return (
    <ErrorBoundary>
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {mapsApiKey ? (
        <APIProvider
          apiKey={mapsApiKey}
          language="en"
          region="PK"
        >
          {content}
        </APIProvider>
      ) : (
        content
      )}

      <AuthModal
        open={authModalOpen}
        mode={authModalMode}
        onModeChange={setAuthModalMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(target) => void handleAuthenticated(target)}
      />
    </ErrorBoundary>
  );
}
