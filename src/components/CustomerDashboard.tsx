import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  Bell,
  Bike,
  Calendar,
  Camera,
  Car,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  History,
  Home,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Phone,
  Search,
  ShieldAlert,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AppNotification,
  Booking,
  BookingStatus,
  FareConfig,
  UserProfile,
  Vehicle,
  VehicleType,
} from '../types/goride';
import {
  compressImageFileToDataUrl,
  formatKarachiTimestamp,
  formatPKR,
  generateId,
  getKarachiDateString,
  getKarachiTimeString,
  getStatusDisplay,
  isValidPakistanPhone,
  normalizePakistanPhone,
  safeImageSrc,
} from '../utils/pakistan';
import { ConfirmDialog } from './ConfirmDialog';
import { GoRideLogo } from './GoRideLogo';
import { MapsRoutePicker, RouteMetrics, SelectedLocation } from './MapsRoutePicker';

type CustomerTab = 'overview' | 'book' | 'history' | 'profile';

interface CustomerDashboardProps {
  firebaseUser: FirebaseUser;
  profile: UserProfile | null;
  vehicles: Vehicle[];
  fareConfig: FareConfig;
  bookings: Booking[];
  notifications: AppNotification[];
  mapsConfigured: boolean;
  initialVehicleType?: VehicleType;
  initialTab?: CustomerTab;
  onGoHome: () => void;
  onSignOut: () => void;
}

const BOOKING_STATUS_FILTERS: Array<'All' | BookingStatus> = [
  'All',
  'Pending',
  'Accepted',
  'Driver Assigned',
  'In Progress',
  'Completed',
  'Cancelled',
  'Rejected',
];

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  firebaseUser,
  profile,
  vehicles,
  fareConfig,
  bookings,
  notifications,
  mapsConfigured,
  initialVehicleType = 'car',
  initialTab = 'overview',
  onGoHome,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Booking form state
  const [vehicleType, setVehicleType] = useState<VehicleType>(initialVehicleType);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [destination, setDestination] = useState<SelectedLocation | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);
  const [customerName, setCustomerName] = useState(profile?.fullName || firebaseUser.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(
    profile?.phone && profile.phone !== '+92 300 0000000' ? profile.phone : ''
  );
  const [pickupDate, setPickupDate] = useState(getKarachiDateString());
  const [pickupTime, setPickupTime] = useState(getKarachiTimeString());
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingFeedback, setBookingFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Booking history filters & cancel dialog
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | BookingStatus>('All');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Profile & password state
  const [editName, setEditName] = useState(profile?.fullName || firebaseUser.displayName || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editAvatar, setEditAvatar] = useState(profile?.profileImage || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setVehicleType(initialVehicleType);
  }, [initialVehicleType]);

  useEffect(() => {
    if (profile) {
      setCustomerName((prev) => prev || profile.fullName);
      if (profile.phone && profile.phone !== '+92 300 0000000') {
        setCustomerPhone((prev) => prev || profile.phone);
      }
      setEditName(profile.fullName);
      setEditPhone(profile.phone === '+92 300 0000000' ? '' : profile.phone);
      setEditAvatar(profile.profileImage || '');
    }
  }, [profile]);

  const vehiclesForType = useMemo(
    () => vehicles.filter((v) => v.type === vehicleType),
    [vehicles, vehicleType]
  );

  useEffect(() => {
    const firstAvailable = vehiclesForType.find((v) => v.availability === 'Available');
    if (firstAvailable && !vehiclesForType.some((v) => v.vehicleId === selectedVehicleId && v.availability === 'Available')) {
      setSelectedVehicleId(firstAvailable.vehicleId);
    } else if (!firstAvailable) {
      setSelectedVehicleId('');
    }
  }, [vehiclesForType, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => vehiclesForType.find((v) => v.vehicleId === selectedVehicleId) || null,
    [vehiclesForType, selectedVehicleId]
  );

  const calculatedFare = useMemo(() => {
    if (!routeMetrics) return 0;
    const base =
      selectedVehicle?.baseFare ??
      (vehicleType === 'car' ? fareConfig.carBaseFare : fareConfig.bikeBaseFare);
    const ratePerKm =
      selectedVehicle?.pricePerKm ??
      (vehicleType === 'car' ? fareConfig.carPerKm : fareConfig.bikePerKm);
    const raw = (base + routeMetrics.distanceKm * ratePerKm) * fareConfig.peakMultiplier;
    return Math.round(Math.max(fareConfig.minimumFare, raw));
  }, [routeMetrics, selectedVehicle, vehicleType, fareConfig]);

  const handleRouteCalculated = useCallback((metrics: RouteMetrics | null) => {
    setRouteMetrics(metrics);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = bookings.length;
    const active = bookings.filter((b) =>
      ['Pending', 'Accepted', 'Driver Assigned', 'In Progress'].includes(b.status)
    ).length;
    const completed = bookings.filter((b) => b.status === 'Completed').length;
    const totalSpent = bookings
      .filter((b) => b.status === 'Completed')
      .reduce((sum, b) => sum + (b.fare || 0), 0);
    return { total, active, completed, totalSpent };
  }, [bookings]);

  const chartData = useMemo(() => {
    const byStatus: Record<string, { name: string; rides: number; pkr: number }> = {
      Pending: { name: 'Pending', rides: 0, pkr: 0 },
      Active: { name: 'Active', rides: 0, pkr: 0 },
      Completed: { name: 'Completed', rides: 0, pkr: 0 },
      Cancelled: { name: 'Cancelled', rides: 0, pkr: 0 },
    };
    bookings.forEach((b) => {
      if (b.status === 'Pending') {
        byStatus.Pending.rides += 1;
        byStatus.Pending.pkr += b.fare;
      } else if (['Accepted', 'Driver Assigned', 'In Progress'].includes(b.status)) {
        byStatus.Active.rides += 1;
        byStatus.Active.pkr += b.fare;
      } else if (b.status === 'Completed') {
        byStatus.Completed.rides += 1;
        byStatus.Completed.pkr += b.fare;
      } else {
        byStatus.Cancelled.rides += 1;
        byStatus.Cancelled.pkr += b.fare;
      }
    });
    return Object.values(byStatus);
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
      const matchesQuery =
        !q ||
        b.bookingId.toLowerCase().includes(q) ||
        b.pickupLocation.toLowerCase().includes(q) ||
        b.destination.toLowerCase().includes(q) ||
        (b.vehicleName || '').toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [bookings, searchQuery, statusFilter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleMarkNotificationRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingFeedback(null);

    if (customerName.trim().length < 2) {
      setBookingFeedback({ type: 'error', text: 'Please enter your full name.' });
      return;
    }
    if (!isValidPakistanPhone(customerPhone)) {
      setBookingFeedback({
        type: 'error',
        text: 'Enter a valid Pakistan mobile number (e.g., +92 300 1234567 or 0300-1234567).',
      });
      return;
    }
    if (!pickup || !destination) {
      setBookingFeedback({
        type: 'error',
        text: 'Please select both Pickup and Destination locations on the map.',
      });
      return;
    }
    if (!routeMetrics || calculatedFare <= 0) {
      setBookingFeedback({
        type: 'error',
        text: 'Waiting for route distance calculation. Please verify your pickup and destination pins.',
      });
      return;
    }

    setBookingSubmitting(true);
    const bookingId = generateId('bk');
    const normalizedPhone = normalizePakistanPhone(customerPhone);

    try {
      await setDoc(doc(db, 'bookings', bookingId), {
        bookingId,
        customerId: firebaseUser.uid,
        customerName: customerName.trim(),
        customerPhone: normalizedPhone,
        vehicleType,
        vehicleId: selectedVehicle?.vehicleId || '',
        vehicleName: selectedVehicle?.name || (vehicleType === 'car' ? 'Standard Car' : 'Standard Bike'),
        pickupLocation: pickup.address.slice(0, 290),
        pickupLat: pickup.coords.lat,
        pickupLng: pickup.coords.lng,
        destination: destination.address.slice(0, 290),
        destLat: destination.coords.lat,
        destLng: destination.coords.lng,
        pickupDate,
        pickupTime,
        distance: routeMetrics.distanceKm,
        durationMinutes: routeMetrics.durationMinutes,
        fare: calculatedFare,
        specialInstructions: specialInstructions.trim().slice(0, 390),
        status: 'Pending',
        createdAt: serverTimestamp(),
      });

      const notifId = generateId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        notificationId: notifId,
        userId: 'admin',
        bookingId,
        title: `New ${vehicleType === 'car' ? 'Car' : 'Bike'} Booking`,
        message: `${customerName.trim()} requested a ${vehicleType} (${routeMetrics.distanceKm} km · ${formatPKR(calculatedFare)}).`,
        type: 'info',
        read: false,
        createdAt: serverTimestamp(),
      });

      setBookingFeedback({
        type: 'success',
        text: `Booking ${bookingId} confirmed! Dispatch is reviewing your ride request.`,
      });
      setSpecialInstructions('');
      setActiveTab('history');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `bookings/${bookingId}`);
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleConfirmCancelBooking = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await updateDoc(doc(db, 'bookings', cancelTarget.bookingId), {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
      setCancelTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${cancelTarget.bookingId}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileMsg(null);
    try {
      const compressed = await compressImageFileToDataUrl(file, 160, 14000);
      setEditAvatar(compressed);
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process image.',
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    if (editName.trim().length < 2) {
      setProfileMsg({ type: 'error', text: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!isValidPakistanPhone(editPhone)) {
      setProfileMsg({
        type: 'error',
        text: 'Enter a valid Pakistan phone number (e.g., +92 300 1234567).',
      });
      return;
    }

    setProfileSaving(true);
    try {
      const normalized = normalizePakistanPhone(editPhone);
      if (profile) {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          fullName: editName.trim(),
          phone: normalized,
          profileImage: editAvatar || '',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          uid: firebaseUser.uid,
          fullName: editName.trim(),
          email: firebaseUser.email || '',
          phone: normalized,
          role: 'customer',
          profileImage: editAvatar || '',
          createdAt: serverTimestamp(),
        });
      }
      await updateProfile(firebaseUser, { displayName: editName.trim() });
      setCustomerName(editName.trim());
      setCustomerPhone(normalized);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    const hasPasswordProvider = firebaseUser.providerData.some(
      (p) => p.providerId === 'password'
    );
    if (!hasPasswordProvider) {
      setPasswordMsg({
        type: 'error',
        text: 'Your account uses Google Sign-In. Password management is handled through your Google Account.',
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email || '',
        currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      setPasswordMsg({
        type: 'error',
        text:
          code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            ? 'Current password is incorrect.'
            : err instanceof Error
            ? err.message
            : 'Unable to update password.',
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const navItems: Array<{ id: CustomerTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'book', label: 'Book a Ride', icon: Navigation },
    { id: 'history', label: 'My Bookings', icon: History },
    { id: 'profile', label: 'Profile & Security', icon: UserIcon },
  ];

  const latestActiveBooking = bookings.find((b) =>
    ['Pending', 'Accepted', 'Driver Assigned', 'In Progress'].includes(b.status)
  );

  const needsPhoneCompletion = !profile?.phone || profile.phone === '+92 300 0000000';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#102E65] text-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
          <GoRideLogo variant="light" size="sm" />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-blue-200 hover:text-white"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#155EEF] text-white'
                    : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={onGoHome}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-blue-100 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-[#102E65] truncate">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('book')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              New Ride
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#155EEF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-[#102E65]">
                      Ride Updates
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 text-center">
                        No notifications yet.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.notificationId}
                          type="button"
                          onClick={() => void handleMarkNotificationRead(n.notificationId)}
                          className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
                            !n.read ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-[#102E65]">
                              {n.title}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {formatKarachiTimestamp(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                {safeImageSrc(profile?.profileImage || firebaseUser.photoURL || '') ? (
                  <img
                    src={safeImageSrc(profile?.profileImage || firebaseUser.photoURL || '')}
                    alt={profile?.fullName || 'Customer'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-4 h-4 text-[#155EEF]" />
                )}
              </div>
              <span className="hidden md:inline text-xs font-semibold text-slate-700 max-w-[120px] truncate">
                {profile?.fullName || firebaseUser.displayName || 'Customer'}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {needsPhoneCompletion && activeTab !== 'profile' && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-[#155EEF] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#102E65]">
                    Complete your Pakistan phone number
                  </p>
                  <p className="text-xs text-slate-600">
                    Add your active +92 mobile number so drivers can reach you at pickup.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Update Profile
              </button>
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Total Bookings</span>
                    <History className="w-4 h-4 text-[#155EEF]" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {stats.total}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Active / Pending</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {stats.active}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Completed Rides</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {stats.completed}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>Completed Spend</span>
                    <CreditCard className="w-4 h-4 text-[#155EEF]" />
                  </div>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {formatPKR(stats.totalSpent)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-[#102E65]">
                        Active Ride Status
                      </h2>
                      <p className="text-xs text-slate-500">
                        Live dispatch updates from booking to arrival
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('book')}
                      className="px-3.5 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold hover:bg-[#102E65] transition-colors cursor-pointer"
                    >
                      Book Car / Bike
                    </button>
                  </div>

                  {latestActiveBooking ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="text-xs text-slate-500 font-mono">
                          {latestActiveBooking.bookingId} · {latestActiveBooking.vehicleName || latestActiveBooking.vehicleType.toUpperCase()}
                        </div>
                        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${getStatusDisplay(latestActiveBooking.status).textClass}`}>
                          <span className={`w-2 h-2 rounded-full ${getStatusDisplay(latestActiveBooking.status).dotClass}`} />
                          {getStatusDisplay(latestActiveBooking.status).label}
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2.5">
                          <MapPin className="w-4 h-4 text-[#155EEF] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-slate-400">Pickup</p>
                            <p className="font-medium text-slate-800">{latestActiveBooking.pickupLocation}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <Navigation className="w-4 h-4 text-[#102E65] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-slate-400">Destination</p>
                            <p className="font-medium text-slate-800">{latestActiveBooking.destination}</p>
                          </div>
                        </div>
                      </div>

                      {/* 5-step progress bar */}
                      <div className="pt-2">
                        <div className="grid grid-cols-5 gap-1.5 text-[11px]">
                          {(['Pending', 'Accepted', 'Driver Assigned', 'In Progress', 'Completed'] as BookingStatus[]).map((step, idx) => {
                            const order = ['Pending', 'Accepted', 'Driver Assigned', 'In Progress', 'Completed'];
                            const currentIdx = order.indexOf(latestActiveBooking.status);
                            const reached = currentIdx >= idx;
                            return (
                              <div key={step} className="space-y-1">
                                <div className={`h-1.5 rounded-full ${reached ? 'bg-[#155EEF]' : 'bg-slate-200'}`} />
                                <p className={`truncate ${reached ? 'text-[#102E65] font-semibold' : 'text-slate-400'}`}>
                                  {step}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {latestActiveBooking.assignedDriverName && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="text-slate-500">Assigned Driver: </span>
                            <span className="font-semibold text-[#102E65]">
                              {latestActiveBooking.assignedDriverName}
                            </span>
                          </div>
                          {latestActiveBooking.assignedDriverPhone && (
                            <span className="inline-flex items-center gap-1 font-mono text-[#155EEF] font-medium">
                              <Phone className="w-3.5 h-3.5" />
                              {latestActiveBooking.assignedDriverPhone}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600 tabular-nums">
                        <span>
                          {latestActiveBooking.pickupDate} · {latestActiveBooking.pickupTime} · {latestActiveBooking.distance} km
                        </span>
                        <span className="font-display font-bold text-sm text-[#102E65]">
                          {formatPKR(latestActiveBooking.fare)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-[#102E65]">No active rides right now</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4">
                        Select a pickup and destination on Google Maps to book your next car or bike.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('book')}
                        className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold cursor-pointer"
                      >
                        Schedule a Ride
                      </button>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6">
                  <h2 className="font-display text-base font-bold text-[#102E65] mb-1">
                    Booking Breakdown
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">Rides across status categories</p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 12 }}
                        />
                        <Bar dataKey="rides" name="Rides" fill="#155EEF" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BOOK A RIDE TAB */}
          {activeTab === 'book' && (
            <form onSubmit={handleCreateBooking} className="space-y-6 animate-fade-in">
              {bookingFeedback && (
                <div
                  className={`p-4 rounded-2xl border text-sm ${
                    bookingFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {bookingFeedback.text}
                </div>
              )}

              {/* Step 1: Vehicle Type & Fleet Selection */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#102E65]">
                      1. Choose Vehicle Type & Model
                    </h2>
                    <p className="text-xs text-slate-500">
                      Select a Car or Bike to view available fleet options and PKR/km pricing.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
                    <button
                      type="button"
                      onClick={() => setVehicleType('car')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        vehicleType === 'car'
                          ? 'bg-white text-[#102E65] shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Car className="w-4 h-4 text-[#155EEF]" />
                      Book a Car
                    </button>
                    <button
                      type="button"
                      onClick={() => setVehicleType('bike')}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        vehicleType === 'bike'
                          ? 'bg-white text-[#102E65] shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Bike className="w-4 h-4 text-[#155EEF]" />
                      Book a Bike
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vehiclesForType.map((v) => {
                    const isAvailable = v.availability === 'Available';
                    const selected = selectedVehicleId === v.vehicleId;
                    const img = safeImageSrc(v.imageUrl);
                    return (
                      <button
                        key={v.vehicleId}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedVehicleId(v.vehicleId)}
                        className={`text-left rounded-2xl border overflow-hidden transition-all cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
                          selected
                            ? 'border-[#155EEF] ring-2 ring-[#155EEF]/20 bg-blue-50/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="aspect-[16/10] bg-slate-100 overflow-hidden">
                          {img ? (
                            <img
                              src={img}
                              alt={v.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              {v.type === 'car' ? <Car className="w-9 h-9" /> : <Bike className="w-9 h-9" />}
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-500">{v.city || 'Pakistan'}</span>
                            <span className={`font-semibold ${isAvailable ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {v.availability}
                            </span>
                          </div>
                          <p className="font-display font-bold text-sm text-[#102E65]">{v.name}</p>
                          <p className="text-xs text-slate-500 mb-3">{v.model}</p>
                          <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-100">
                            <span className="inline-flex items-center gap-1 text-slate-600 tabular-nums">
                              <Users className="w-3.5 h-3.5" />
                              {v.seats} {v.seats === 1 ? 'Seat' : 'Seats'}
                            </span>
                            <span className="font-display font-bold text-[#155EEF] tabular-nums">
                              {formatPKR(v.pricePerKm)}/km
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Google Maps Route Picker */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#102E65]">
                    2. Select Pickup & Destination on Google Maps
                  </h2>
                  <p className="text-xs text-slate-500">
                    Search addresses, click the map, or tap My Location to calculate exact route distance and travel duration.
                  </p>
                </div>
                <MapsRoutePicker
                  pickup={pickup}
                  destination={destination}
                  vehicleType={vehicleType}
                  mapsConfigured={mapsConfigured}
                  onPickupChange={setPickup}
                  onDestinationChange={setDestination}
                  onRouteCalculated={handleRouteCalculated}
                />
              </div>

              {/* Step 3: Schedule, Passenger Details & Fare Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#102E65]">
                    3. Trip Details & Schedule (Asia/Karachi)
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pakistan Phone Number
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+92 300 1234567"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pickup Date
                      </label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          required
                          min={getKarachiDateString()}
                          value={pickupDate}
                          onChange={(e) => setPickupDate(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pickup Time (PKT)
                      </label>
                      <div className="relative">
                        <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="time"
                          required
                          value={pickupTime}
                          onChange={(e) => setPickupTime(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Special Instructions (Optional)
                    </label>
                    <textarea
                      rows={3}
                      maxLength={400}
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="Gate number, landmark note, luggage space, or call upon arrival..."
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                    />
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    <h2 className="font-display text-lg font-bold text-[#102E65]">
                      Fare Summary
                    </h2>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Vehicle</span>
                        <span className="font-semibold text-[#102E65]">
                          {selectedVehicle?.name || (vehicleType === 'car' ? 'Standard Car' : 'Standard Bike')}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Estimated Distance</span>
                        <span className="font-mono font-semibold text-[#102E65] tabular-nums">
                          {routeMetrics ? `${routeMetrics.distanceKm} km` : 'Select route'}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Travel Duration</span>
                        <span className="font-mono font-semibold text-[#102E65] tabular-nums">
                          {routeMetrics ? `${routeMetrics.durationMinutes} mins` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Base + Per-km Rate</span>
                        <span className="font-mono text-slate-700 tabular-nums">
                          {formatPKR(
                            selectedVehicle?.baseFare ??
                              (vehicleType === 'car' ? fareConfig.carBaseFare : fareConfig.bikeBaseFare)
                          )}{' '}
                          +{' '}
                          {formatPKR(
                            selectedVehicle?.pricePerKm ??
                              (vehicleType === 'car' ? fareConfig.carPerKm : fareConfig.bikePerKm)
                          )}
                          /km
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-slate-700">Estimated Fare</span>
                      <span className="font-display text-2xl font-extrabold text-[#155EEF] tabular-nums">
                        {calculatedFare > 0 ? formatPKR(calculatedFare) : 'PKR —'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={bookingSubmitting || !pickup || !destination || !routeMetrics}
                    className="w-full py-3 px-5 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    {bookingSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Confirming Booking...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirm Booking
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* MY BOOKINGS TAB */}
          {activeTab === 'history' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by booking ID, pickup, destination, or vehicle..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  {BOOKING_STATUS_FILTERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        statusFilter === st
                          ? 'bg-[#155EEF] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {filteredBookings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                  <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="font-display font-bold text-base text-[#102E65]">
                    No bookings found
                  </p>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    {bookings.length === 0
                      ? 'You have not booked any car or bike rides yet.'
                      : 'Try clearing your search or status filter.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('book')}
                    className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold cursor-pointer"
                  >
                    Book a Ride
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBookings.map((b) => {
                    const statusMeta = getStatusDisplay(b.status);
                    return (
                      <div
                        key={b.bookingId}
                        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2.5 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-[#102E65]">
                              {b.bookingId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{b.vehicleName || b.vehicleType.toUpperCase()}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {b.pickupDate} {b.pickupTime} PKT
                            </span>
                          </div>

                          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusMeta.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                            {statusMeta.label}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                          <div className="md:col-span-7 space-y-2 text-sm">
                            <div className="flex items-start gap-2">
                              <MapPin className="w-4 h-4 text-[#155EEF] mt-0.5 shrink-0" />
                              <span className="text-slate-700">{b.pickupLocation}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Navigation className="w-4 h-4 text-[#102E65] mt-0.5 shrink-0" />
                              <span className="text-slate-900 font-medium">{b.destination}</span>
                            </div>
                            {b.assignedDriverName && (
                              <p className="text-xs text-slate-600 pt-1">
                                Driver: <span className="font-semibold text-[#102E65]">{b.assignedDriverName}</span>
                                {b.assignedDriverPhone ? ` · ${b.assignedDriverPhone}` : ''}
                              </p>
                            )}
                          </div>

                          <div className="md:col-span-5 flex flex-wrap md:flex-col md:items-end justify-between gap-3">
                            <div className="md:text-right">
                              <p className="text-xs text-slate-500 tabular-nums">
                                {b.distance} km {b.durationMinutes ? `· ${b.durationMinutes} mins` : ''}
                              </p>
                              <p className="font-display text-lg font-extrabold text-[#102E65] tabular-nums">
                                {formatPKR(b.fare)}
                              </p>
                            </div>

                            {b.status === 'Pending' && (
                              <button
                                type="button"
                                onClick={() => setCancelTarget(b)}
                                className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Cancel Pending Booking
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PROFILE & SECURITY TAB */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
              <form
                onSubmit={handleSaveProfile}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-[#102E65]">
                  Customer Profile
                </h2>

                {profileMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs ${
                      profileMsg.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {profileMsg.text}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                    {safeImageSrc(editAvatar) ? (
                      <img
                        src={safeImageSrc(editAvatar)}
                        alt="Profile photo"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <UserIcon className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                  <label className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#155EEF] hover:bg-blue-50 cursor-pointer inline-flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => void handleAvatarUpload(e)}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={firebaseUser.email || ''}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number (Pakistan)
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] tabular-nums"
                  />
                </div>

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {profileSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Profile
                </button>
              </form>

              <form
                onSubmit={handleChangePassword}
                className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 self-start"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-[#155EEF]" />
                  <h2 className="font-display text-lg font-bold text-[#102E65]">
                    Change Password
                  </h2>
                </div>

                {passwordMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs ${
                      passwordMsg.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {passwordMsg.text}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#102E65] hover:bg-[#155EEF] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {passwordSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update Password
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel Pending Booking?"
        description={`Are you sure you want to cancel booking ${cancelTarget?.bookingId || ''}? Once cancelled, you will need to create a new request.`}
        confirmLabel="Yes, Cancel Ride"
        cancelLabel="Keep Booking"
        tone="danger"
        loading={cancelling}
        onConfirm={() => void handleConfirmCancelBooking()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
};
