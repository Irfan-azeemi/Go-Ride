import React, { useMemo, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  Bike,
  Car,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Download,
  Edit3,
  Home,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DEFAULT_VEHICLES, seedInitialFleetAndConfig } from '../data/seedData';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AdminRecord,
  AppNotification,
  Booking,
  BookingStatus,
  Driver,
  DriverAvailability,
  FareConfig,
  UserProfile,
  Vehicle,
  VehicleAvailability,
  VehicleType,
} from '../types/goride';
import {
  compressImageFileToDataUrl,
  formatKarachiTimestamp,
  formatPKR,
  generateId,
  getStatusDisplay,
  isValidPakistanPhone,
  normalizePakistanPhone,
  safeImageSrc,
} from '../utils/pakistan';
import { ConfirmDialog } from './ConfirmDialog';
import { GoRideLogo } from './GoRideLogo';

type AdminTab = 'overview' | 'bookings' | 'fleet' | 'drivers' | 'customers' | 'settings';

interface AdminDashboardProps {
  firebaseUser: FirebaseUser;
  adminRecord: AdminRecord | null;
  customers: UserProfile[];
  bookings: Booking[];
  vehicles: Vehicle[];
  drivers: Driver[];
  admins: AdminRecord[];
  fareConfig: FareConfig;
  notifications: AppNotification[];
  onGoHome: () => void;
  onSignOut: () => void;
}

const ALL_BOOKING_STATUSES: BookingStatus[] = [
  'Pending',
  'Accepted',
  'Driver Assigned',
  'In Progress',
  'Completed',
  'Rejected',
  'Cancelled',
];

const PIE_COLORS = ['#155EEF', '#102E65', '#16A34A', '#D97706', '#DC2626', '#64748B'];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  firebaseUser,
  adminRecord,
  customers,
  bookings,
  vehicles,
  drivers,
  admins,
  fareConfig,
  notifications,
  onGoHome,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Bookings filters & assignment modal
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'All' | BookingStatus>('All');
  const [bookingTypeFilter, setBookingTypeFilter] = useState<'all' | VehicleType>('all');
  const [assignModalBooking, setAssignModalBooking] = useState<Booking | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fleet management
  const [fleetTypeFilter, setFleetTypeFilter] = useState<'all' | VehicleType>('all');
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vName, setVName] = useState('');
  const [vType, setVType] = useState<VehicleType>('car');
  const [vModel, setVModel] = useState('');
  const [vSeats, setVSeats] = useState(4);
  const [vPricePerKm, setVPricePerKm] = useState(75);
  const [vBaseFare, setVBaseFare] = useState(250);
  const [vAvailability, setVAvailability] = useState<VehicleAvailability>('Available');
  const [vPlate, setVPlate] = useState('');
  const [vCity, setVCity] = useState('Lahore');
  const [vImageUrl, setVImageUrl] = useState(DEFAULT_VEHICLES[0].imageUrl);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<Vehicle | null>(null);

  // Drivers management
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [dName, setDName] = useState('');
  const [dPhone, setDPhone] = useState('');
  const [dType, setDType] = useState<VehicleType>('car');
  const [dLicense, setDLicense] = useState('');
  const [dAvailability, setDAvailability] = useState<DriverAvailability>('Available');
  const [driverSaving, setDriverSaving] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [deleteDriverTarget, setDeleteDriverTarget] = useState<Driver | null>(null);

  // Customers search
  const [customerSearch, setCustomerSearch] = useState('');

  // Fare config & Admin access
  const [carBaseFare, setCarBaseFare] = useState(fareConfig.carBaseFare);
  const [carPerKm, setCarPerKm] = useState(fareConfig.carPerKm);
  const [bikeBaseFare, setBikeBaseFare] = useState(fareConfig.bikeBaseFare);
  const [bikePerKm, setBikePerKm] = useState(fareConfig.bikePerKm);
  const [minimumFare, setMinimumFare] = useState(fareConfig.minimumFare);
  const [peakMultiplier, setPeakMultiplier] = useState(fareConfig.peakMultiplier);
  const [fareSaving, setFareSaving] = useState(false);
  const [fareFeedback, setFareFeedback] = useState<string | null>(null);

  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminAddMsg, setAdminAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Sync fare form when fareConfig updates from Firestore
  React.useEffect(() => {
    setCarBaseFare(fareConfig.carBaseFare);
    setCarPerKm(fareConfig.carPerKm);
    setBikeBaseFare(fareConfig.bikeBaseFare);
    setBikePerKm(fareConfig.bikePerKm);
    setMinimumFare(fareConfig.minimumFare);
    setPeakMultiplier(fareConfig.peakMultiplier);
  }, [fareConfig]);

  // Metrics
  const kpis = useMemo(() => {
    const totalCustomers = customers.length;
    const totalBookings = bookings.length;
    const pendingBookings = bookings.filter((b) => b.status === 'Pending').length;
    const completedBookings = bookings.filter((b) => b.status === 'Completed').length;
    const totalRevenue = bookings
      .filter((b) => b.status === 'Completed')
      .reduce((sum, b) => sum + (b.fare || 0), 0);
    const projectedRevenue = bookings
      .filter((b) => ['Accepted', 'Driver Assigned', 'In Progress', 'Completed'].includes(b.status))
      .reduce((sum, b) => sum + (b.fare || 0), 0);
    return {
      totalCustomers,
      totalBookings,
      pendingBookings,
      completedBookings,
      totalRevenue,
      projectedRevenue,
    };
  }, [customers, bookings]);

  const vehicleRevenueChart = useMemo(() => {
    const carBookings = bookings.filter((b) => b.vehicleType === 'car');
    const bikeBookings = bookings.filter((b) => b.vehicleType === 'bike');
    return [
      {
        name: 'Cars',
        bookings: carBookings.length,
        revenue: carBookings
          .filter((b) => b.status === 'Completed')
          .reduce((s, b) => s + b.fare, 0),
      },
      {
        name: 'Bikes',
        bookings: bikeBookings.length,
        revenue: bikeBookings
          .filter((b) => b.status === 'Completed')
          .reduce((s, b) => s + b.fare, 0),
      },
    ];
  }, [bookings]);

  const statusDistribution = useMemo(() => {
    return ALL_BOOKING_STATUSES.map((st) => ({
      name: st,
      value: bookings.filter((b) => b.status === st).length,
    })).filter((d) => d.value > 0);
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase();
    return bookings.filter((b) => {
      const okStatus = bookingStatusFilter === 'All' || b.status === bookingStatusFilter;
      const okType = bookingTypeFilter === 'all' || b.vehicleType === bookingTypeFilter;
      const okQuery =
        !q ||
        b.bookingId.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerPhone.toLowerCase().includes(q) ||
        b.pickupLocation.toLowerCase().includes(q) ||
        b.destination.toLowerCase().includes(q);
      return okStatus && okType && okQuery;
    });
  }, [bookings, bookingSearch, bookingStatusFilter, bookingTypeFilter]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return customers.filter(
      (c) =>
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const sendCustomerNotification = async (
    customerId: string,
    bookingId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error'
  ) => {
    const notifId = generateId('ntf');
    await setDoc(doc(db, 'notifications', notifId), {
      notificationId: notifId,
      userId: customerId,
      bookingId,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    });
  };

  const handleUpdateBookingStatus = async (booking: Booking, nextStatus: BookingStatus) => {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'bookings', booking.bookingId), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      await sendCustomerNotification(
        booking.customerId,
        booking.bookingId,
        `Booking ${nextStatus}`,
        `Your ${booking.vehicleType} booking (${booking.bookingId}) status is now ${nextStatus}.`,
        nextStatus === 'Rejected' || nextStatus === 'Cancelled' ? 'warning' : 'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.bookingId}`);
    } finally {
      setActionLoading(false);
    }
  };

  const openAssignModal = (booking: Booking) => {
    setAssignModalBooking(booking);
    const availVeh = vehicles.find(
      (v) => v.type === booking.vehicleType && v.availability === 'Available'
    );
    const availDrv = drivers.find(
      (d) => d.vehicleType === booking.vehicleType && d.availability === 'Available'
    );
    setAssignVehicleId(booking.vehicleId || availVeh?.vehicleId || '');
    setAssignDriverId(booking.assignedDriverId || availDrv?.driverId || '');
  };

  const handleConfirmAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalBooking) return;
    const veh = vehicles.find((v) => v.vehicleId === assignVehicleId);
    const drv = drivers.find((d) => d.driverId === assignDriverId);
    if (!veh || !drv) return;

    setAssignSaving(true);
    try {
      await updateDoc(doc(db, 'bookings', assignModalBooking.bookingId), {
        vehicleId: veh.vehicleId,
        vehicleName: veh.name,
        assignedDriverId: drv.driverId,
        assignedDriverName: drv.fullName,
        assignedDriverPhone: drv.phone,
        status: 'Driver Assigned',
        updatedAt: serverTimestamp(),
      });

      await sendCustomerNotification(
        assignModalBooking.customerId,
        assignModalBooking.bookingId,
        'Driver Assigned',
        `${drv.fullName} (${drv.phone}) has been assigned with ${veh.name}.`,
        'success'
      );
      setAssignModalBooking(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${assignModalBooking.bookingId}`);
    } finally {
      setAssignSaving(false);
    }
  };

  const openNewVehicleModal = (type: VehicleType) => {
    setEditingVehicle(null);
    setVName('');
    setVType(type);
    setVModel('2025 · Standard');
    setVSeats(type === 'car' ? 4 : 1);
    setVPricePerKm(type === 'car' ? fareConfig.carPerKm : fareConfig.bikePerKm);
    setVBaseFare(type === 'car' ? fareConfig.carBaseFare : fareConfig.bikeBaseFare);
    setVAvailability('Available');
    setVPlate('');
    setVCity('Lahore');
    setVImageUrl(
      type === 'car'
        ? '/src/assets/images/car_sedan_comfort_1795462969923.jpg'
        : '/src/assets/images/bike_commuter_ride_1795462971351.jpg'
    );
    setVehicleModalOpen(true);
  };

  const openEditVehicleModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setVName(v.name);
    setVType(v.type);
    setVModel(v.model);
    setVSeats(v.seats);
    setVPricePerKm(v.pricePerKm);
    setVBaseFare(v.baseFare);
    setVAvailability(v.availability);
    setVPlate(v.plateNumber || '');
    setVCity(v.city || 'Lahore');
    setVImageUrl(v.imageUrl);
    setVehicleModalOpen(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setVehicleSaving(true);
    const id = editingVehicle?.vehicleId || generateId('veh');
    try {
      const payload = {
        vehicleId: id,
        name: vName.trim(),
        type: vType,
        model: vModel.trim(),
        seats: Number(vSeats),
        pricePerKm: Number(vPricePerKm),
        baseFare: Number(vBaseFare),
        availability: vAvailability,
        imageUrl: vImageUrl,
        plateNumber: vPlate.trim() || 'PK-001',
        city: vCity.trim() || 'Pakistan',
        updatedAt: serverTimestamp(),
      };
      if (editingVehicle) {
        await updateDoc(doc(db, 'vehicles', id), payload);
      } else {
        await setDoc(doc(db, 'vehicles', id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setVehicleModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `vehicles/${id}`);
    } finally {
      setVehicleSaving(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteVehicleTarget) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'vehicles', deleteVehicleTarget.vehicleId));
      setDeleteVehicleTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `vehicles/${deleteVehicleTarget.vehicleId}`);
    } finally {
      setActionLoading(false);
    }
  };

  const openNewDriverModal = () => {
    setEditingDriver(null);
    setDName('');
    setDPhone('');
    setDType('car');
    setDLicense('');
    setDAvailability('Available');
    setDriverError(null);
    setDriverModalOpen(true);
  };

  const openEditDriverModal = (d: Driver) => {
    setEditingDriver(d);
    setDName(d.fullName);
    setDPhone(d.phone);
    setDType(d.vehicleType);
    setDLicense(d.licenseNumber);
    setDAvailability(d.availability);
    setDriverError(null);
    setDriverModalOpen(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverError(null);
    if (!isValidPakistanPhone(dPhone)) {
      setDriverError('Please enter a valid Pakistan mobile number (e.g., +92 300 1234567).');
      return;
    }
    setDriverSaving(true);
    const id = editingDriver?.driverId || generateId('drv');
    try {
      const payload = {
        driverId: id,
        fullName: dName.trim(),
        phone: normalizePakistanPhone(dPhone),
        vehicleType: dType,
        licenseNumber: dLicense.trim(),
        availability: dAvailability,
        rating: editingDriver?.rating ?? 4.9,
        updatedAt: serverTimestamp(),
      };
      if (editingDriver) {
        await updateDoc(doc(db, 'drivers', id), payload);
      } else {
        await setDoc(doc(db, 'drivers', id), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setDriverModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `drivers/${id}`);
    } finally {
      setDriverSaving(false);
    }
  };

  const handleDeleteDriver = async () => {
    if (!deleteDriverTarget) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'drivers', deleteDriverTarget.driverId));
      setDeleteDriverTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `drivers/${deleteDriverTarget.driverId}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveFareRates = async (e: React.FormEvent) => {
    e.preventDefault();
    setFareSaving(true);
    setFareFeedback(null);
    try {
      await setDoc(doc(db, 'fareConfig', 'default'), {
        carBaseFare: Number(carBaseFare),
        carPerKm: Number(carPerKm),
        bikeBaseFare: Number(bikeBaseFare),
        bikePerKm: Number(bikePerKm),
        minimumFare: Number(minimumFare),
        peakMultiplier: Number(peakMultiplier),
        updatedAt: serverTimestamp(),
      });
      setFareFeedback('PKR fare rates updated across the platform.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'fareConfig/default');
    } finally {
      setFareSaving(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAddMsg(null);
    const uid = newAdminUid.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(uid)) {
      setAdminAddMsg({ type: 'error', text: 'Invalid Firebase UID format.' });
      return;
    }
    try {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        name: newAdminName.trim(),
        email: newAdminEmail.trim(),
        role: 'admin',
        createdAt: serverTimestamp(),
      });
      setNewAdminUid('');
      setNewAdminName('');
      setNewAdminEmail('');
      setAdminAddMsg({ type: 'success', text: 'Administrator added securely.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }
  };

  const handleExportReportCSV = () => {
    const headers = [
      'Booking ID',
      'Customer',
      'Phone',
      'Type',
      'Vehicle',
      'Driver',
      'Pickup',
      'Destination',
      'Date',
      'Time',
      'Distance (km)',
      'Fare (PKR)',
      'Status',
    ];
    const rows = bookings.map((b) => [
      b.bookingId,
      b.customerName,
      b.customerPhone,
      b.vehicleType,
      b.vehicleName || '',
      b.assignedDriverName || '',
      `"${(b.pickupLocation || '').replace(/"/g, '""')}"`,
      `"${(b.destination || '').replace(/"/g, '""')}"`,
      b.pickupDate,
      b.pickupTime,
      b.distance,
      b.fare,
      b.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goride-bookings-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSeedFleet = async () => {
    setSeeding(true);
    try {
      await seedInitialFleetAndConfig();
      setFareFeedback('Default Pakistan Cars, Bikes, Drivers, and Fare Rates seeded into Firestore.');
    } finally {
      setSeeding(false);
    }
  };

  const unreadAdminNotifs = notifications.filter((n) => !n.read).length;

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview & Reports', icon: LayoutDashboard },
    { id: 'bookings', label: 'Bookings', icon: BarChart3 },
    { id: 'fleet', label: 'Cars & Bikes', icon: Car },
    { id: 'drivers', label: 'Drivers', icon: UserCheck },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'settings', label: 'Fare Rates & Access', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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

        <div className="px-5 py-3 border-b border-white/10 text-xs text-blue-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-300 shrink-0" />
          <span className="truncate font-medium">Admin Dispatch Console</span>
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#155EEF] text-white'
                    : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'bookings' && kpis.pendingBookings > 0 && (
                  <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-400 text-[#102E65] tabular-nums">
                    {kpis.pendingBookings}
                  </span>
                )}
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
            <span>Public Site</span>
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

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold text-[#102E65] truncate">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExportReportCSV}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#102E65] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#155EEF]" />
              Export CSV
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((p) => !p)}
                className="relative p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                aria-label="Dispatch Alerts"
              >
                <Bell className="w-4 h-4" />
                {unreadAdminNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#155EEF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadAdminNotifs}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-[#102E65]">
                      Dispatch Alerts
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
                      <p className="p-4 text-xs text-slate-500 text-center">No alerts yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.notificationId}
                          type="button"
                          onClick={() =>
                            void updateDoc(doc(db, 'notifications', n.notificationId), { read: true })
                          }
                          className={`w-full text-left p-3.5 hover:bg-slate-50 cursor-pointer ${
                            !n.read ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <div className="flex justify-between gap-2 text-xs font-semibold text-[#102E65]">
                            <span>{n.title}</span>
                            <span className="text-[11px] font-normal text-slate-400">
                              {formatKarachiTimestamp(n.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-[#102E65]">
                {adminRecord?.name || firebaseUser.displayName || 'Administrator'}
              </span>
              <span className="text-[11px] text-slate-500">{firebaseUser.email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* OVERVIEW & REPORTS */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Total Customers</p>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {kpis.totalCustomers}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Total Bookings</p>
                  <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                    {kpis.totalBookings}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Pending Review</p>
                  <p className="font-display text-2xl font-extrabold text-amber-600 tabular-nums">
                    {kpis.pendingBookings}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Completed Trips</p>
                  <p className="font-display text-2xl font-extrabold text-emerald-600 tabular-nums">
                    {kpis.completedBookings}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-xs text-slate-500 mb-1">Completed Revenue</p>
                  <p className="font-display text-xl font-extrabold text-[#155EEF] tabular-nums">
                    {formatPKR(kpis.totalRevenue)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-[#102E65]">
                        Bookings & Revenue by Vehicle Type
                      </h2>
                      <p className="text-xs text-slate-500">
                        Projected pipeline: {formatPKR(kpis.projectedRevenue)}
                      </p>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={vehicleRevenueChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 12 }} />
                        <Bar dataKey="revenue" name="Revenue (PKR)" fill="#155EEF" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6">
                  <h2 className="font-display text-base font-bold text-[#102E65] mb-1">
                    Booking Status Distribution
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">Live operational breakdown</p>
                  {statusDistribution.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                      No booking records available for charts yet.
                    </div>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusDistribution}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={84}
                            paddingAngle={2}
                          >
                            {statusDistribution.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#E2E8F0', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BOOKINGS MANAGEMENT */}
          {activeTab === 'bookings' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    placeholder="Search customer, phone, ID, pickup, or destination..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bookingTypeFilter}
                    onChange={(e) => setBookingTypeFilter(e.target.value as 'all' | VehicleType)}
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-white text-slate-700"
                  >
                    <option value="all">All Vehicles</option>
                    <option value="car">Cars Only</option>
                    <option value="bike">Bikes Only</option>
                  </select>

                  <select
                    value={bookingStatusFilter}
                    onChange={(e) =>
                      setBookingStatusFilter(e.target.value as 'All' | BookingStatus)
                    }
                    className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-white text-slate-700"
                  >
                    <option value="All">All Statuses</option>
                    {ALL_BOOKING_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredBookings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
                  No bookings match the current filters.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBookings.map((b) => {
                    const st = getStatusDisplay(b.status);
                    return (
                      <div
                        key={b.bookingId}
                        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-semibold text-[#102E65]">
                              {b.bookingId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-slate-800">{b.customerName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{b.customerPhone}</span>
                            <span aria-hidden="true">·</span>
                            <span>{b.vehicleName || b.vehicleType.toUpperCase()}</span>
                          </div>
                          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${st.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${st.dotClass}`} />
                            {st.label}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                          <div className="lg:col-span-6 space-y-1.5 text-xs sm:text-sm">
                            <p className="text-slate-700">
                              <span className="text-slate-400">From: </span>
                              {b.pickupLocation}
                            </p>
                            <p className="text-slate-900 font-medium">
                              <span className="text-slate-400 font-normal">To: </span>
                              {b.destination}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              {b.pickupDate} {b.pickupTime} PKT · {b.distance} km ·{' '}
                              <span className="font-semibold text-[#102E65]">
                                {formatPKR(b.fare)}
                              </span>
                            </p>
                            {b.assignedDriverName && (
                              <p className="text-xs text-[#155EEF] font-medium">
                                Assigned: {b.assignedDriverName} ({b.assignedDriverPhone})
                              </p>
                            )}
                          </div>

                          <div className="lg:col-span-6 flex flex-wrap items-center lg:justify-end gap-2">
                            {b.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => void handleUpdateBookingStatus(b, 'Accepted')}
                                  className="px-3 py-1.5 rounded-lg bg-[#155EEF] hover:bg-[#102E65] text-white text-xs font-semibold cursor-pointer"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading}
                                  onClick={() => setRejectTarget(b)}
                                  className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {['Pending', 'Accepted', 'Driver Assigned'].includes(b.status) && (
                              <button
                                type="button"
                                onClick={() => openAssignModal(b)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#102E65] text-xs font-semibold cursor-pointer"
                              >
                                Assign Driver & Vehicle
                              </button>
                            )}

                            <select
                              aria-label={`Change status for ${b.bookingId}`}
                              value={b.status}
                              disabled={actionLoading}
                              onChange={(e) =>
                                void handleUpdateBookingStatus(b, e.target.value as BookingStatus)
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
                            >
                              {ALL_BOOKING_STATUSES.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* FLEET MANAGEMENT */}
          {activeTab === 'fleet' && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                  {(['all', 'car', 'bike'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFleetTypeFilter(t)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        fleetTypeFilter === t ? 'bg-white text-[#102E65] shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {t === 'all' ? 'All Fleet' : t === 'car' ? 'Cars' : 'Bikes'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openNewVehicleModal('car')}
                    className="px-3.5 py-2 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Car
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewVehicleModal('bike')}
                    className="px-3.5 py-2 rounded-xl bg-[#102E65] hover:bg-[#155EEF] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Bike
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {vehicles
                  .filter((v) => (fleetTypeFilter === 'all' ? true : v.type === fleetTypeFilter))
                  .map((v) => {
                    const img = safeImageSrc(v.imageUrl);
                    return (
                      <div
                        key={v.vehicleId}
                        className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
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
                              {v.type === 'car' ? <Car className="w-10 h-10" /> : <Bike className="w-10 h-10" />}
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>
                              {v.type.toUpperCase()} · {v.plateNumber || 'PK'} · {v.city || 'Pakistan'}
                            </span>
                            <span
                              className={`font-semibold ${
                                v.availability === 'Available'
                                  ? 'text-emerald-700'
                                  : v.availability === 'On Trip'
                                  ? 'text-[#155EEF]'
                                  : 'text-amber-700'
                              }`}
                            >
                              {v.availability}
                            </span>
                          </div>
                          <h3 className="font-display font-bold text-base text-[#102E65]">
                            {v.name}
                          </h3>
                          <p className="text-xs text-slate-500 mb-3">{v.model}</p>

                          <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-display font-bold text-[#102E65] tabular-nums">
                              {formatPKR(v.pricePerKm)}/km · {v.seats} seats
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditVehicleModal(v)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#155EEF] cursor-pointer"
                                aria-label={`Edit ${v.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteVehicleTarget(v)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 cursor-pointer"
                                aria-label={`Delete ${v.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* DRIVERS MANAGEMENT */}
          {activeTab === 'drivers' && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Manage verified Car Drivers & Bike Riders available for dispatch assignment.
                </p>
                <button
                  type="button"
                  onClick={openNewDriverModal}
                  className="px-4 py-2 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Driver
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Driver Name</th>
                        <th className="px-4 py-3">Phone (PK)</th>
                        <th className="px-4 py-3">Vehicle Type</th>
                        <th className="px-4 py-3">License</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drivers.map((d) => (
                        <tr key={d.driverId} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-semibold text-[#102E65]">{d.fullName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">{d.phone}</td>
                          <td className="px-4 py-3 text-xs uppercase font-semibold text-slate-700">
                            {d.vehicleType}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.licenseNumber}</td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            <span
                              className={
                                d.availability === 'Available'
                                  ? 'text-emerald-700'
                                  : d.availability === 'Assigned'
                                  ? 'text-[#155EEF]'
                                  : 'text-slate-500'
                              }
                            >
                              {d.availability}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5">
                            <button
                              type="button"
                              onClick={() => openEditDriverModal(d)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#155EEF] cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDriverTarget(d)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMERS DIRECTORY */}
          {activeTab === 'customers' && (
            <div className="space-y-5 animate-fade-in">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers by name, email, or +92 phone..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>
                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                  {filteredCustomers.length} Registered Customers
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">Total Rides</th>
                        <th className="px-4 py-3 text-right">Completed Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                            No registered customers found.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map((c) => {
                          const custBookings = bookings.filter((b) => b.customerId === c.uid);
                          const spend = custBookings
                            .filter((b) => b.status === 'Completed')
                            .reduce((s, b) => s + b.fare, 0);
                          return (
                            <tr key={c.uid} className="hover:bg-slate-50/70">
                              <td className="px-4 py-3 font-semibold text-[#102E65]">
                                {c.fullName}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">{c.email}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                                {c.phone}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                                {custBookings.length}
                              </td>
                              <td className="px-4 py-3 text-right font-display font-bold text-xs text-[#102E65] tabular-nums">
                                {formatPKR(spend)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* FARE RATES & ADMIN ACCESS */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
              <form
                onSubmit={handleSaveFareRates}
                className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#102E65]">
                    PKR Fare Rates Configuration
                  </h2>
                  <CreditCard className="w-5 h-5 text-[#155EEF]" />
                </div>

                {fareFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    {fareFeedback}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Car Base Fare (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={carBaseFare}
                      onChange={(e) => setCarBaseFare(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Car Per-Km Rate (PKR)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={carPerKm}
                      onChange={(e) => setCarPerKm(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bike Base Fare (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={bikeBaseFare}
                      onChange={(e) => setBikeBaseFare(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bike Per-Km Rate (PKR)
                    </label>
                    <input
                      type="number"
                      min={5}
                      value={bikePerKm}
                      onChange={(e) => setBikePerKm(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Minimum Ride Fare (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minimumFare}
                      onChange={(e) => setMinimumFare(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Peak Multiplier (1.0 - 3.0)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      max={3}
                      value={peakMultiplier}
                      onChange={(e) => setPeakMultiplier(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={fareSaving}
                    className="px-5 py-2.5 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    {fareSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Fare Rates
                  </button>
                  <button
                    type="button"
                    disabled={seeding}
                    onClick={() => void handleSeedFleet()}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#102E65] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Database className="w-4 h-4 text-[#155EEF]" />
                    {seeding ? 'Seeding...' : 'Seed Default Fleet'}
                  </button>
                </div>
              </form>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#102E65]">
                    Authorized Administrators
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Public admin signup is disabled. Grant admin privileges only to verified user UIDs.
                  </p>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {admins.map((a) => (
                    <div key={a.uid} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-[#102E65]">{a.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {a.email} · <span className="font-mono">{a.uid}</span>
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#155EEF] uppercase">
                        {a.role}
                      </span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddAdmin} className="space-y-3 pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold text-[#102E65]">Authorize Additional Admin</p>
                  {adminAddMsg && (
                    <p
                      className={`text-xs p-2.5 rounded-lg ${
                        adminAddMsg.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-rose-50 text-rose-800'
                      }`}
                    >
                      {adminAddMsg.text}
                    </p>
                  )}
                  <input
                    type="text"
                    required
                    value={newAdminUid}
                    onChange={(e) => setNewAdminUid(e.target.value)}
                    placeholder="Firebase Auth UID"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl font-mono"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Admin Full Name"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                    />
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="Admin Email"
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#102E65] hover:bg-[#155EEF] text-white text-xs font-semibold cursor-pointer"
                  >
                    Grant Admin Access
                  </button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Assign Driver & Vehicle Modal */}
      {assignModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleConfirmAssignment}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#102E65]">
                Assign Vehicle & Driver
              </h3>
              <button
                type="button"
                onClick={() => setAssignModalBooking(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Booking <span className="font-mono font-semibold">{assignModalBooking.bookingId}</span> ·{' '}
              {assignModalBooking.customerName} ({assignModalBooking.vehicleType.toUpperCase()})
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Vehicle
              </label>
              <select
                required
                value={assignVehicleId}
                onChange={(e) => setAssignVehicleId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
              >
                <option value="">Choose a {assignModalBooking.vehicleType}...</option>
                {vehicles
                  .filter((v) => v.type === assignModalBooking.vehicleType)
                  .map((v) => (
                    <option key={v.vehicleId} value={v.vehicleId}>
                      {v.name} ({v.plateNumber || 'PK'}) — {v.availability}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Driver / Rider
              </label>
              <select
                required
                value={assignDriverId}
                onChange={(e) => setAssignDriverId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
              >
                <option value="">Choose a driver...</option>
                {drivers
                  .filter((d) => d.vehicleType === assignModalBooking.vehicleType)
                  .map((d) => (
                    <option key={d.driverId} value={d.driverId}>
                      {d.fullName} ({d.phone}) — {d.availability}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalBooking(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assignSaving || !assignVehicleId || !assignDriverId}
                className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {assignSaving ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vehicle Add/Edit Modal */}
      {vehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveVehicle}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#102E65]">
                {editingVehicle ? 'Edit Vehicle' : `Add New ${vType === 'car' ? 'Car' : 'Bike'}`}
              </h3>
              <button
                type="button"
                onClick={() => setVehicleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Name</label>
                <input
                  type="text"
                  required
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="e.g., Honda City Aspire"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value as VehicleType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="car">Car</option>
                  <option value="bike">Bike</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Model & Spec</label>
                <input
                  type="text"
                  required
                  value={vModel}
                  onChange={(e) => setVModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Availability</label>
                <select
                  value={vAvailability}
                  onChange={(e) => setVAvailability(e.target.value as VehicleAvailability)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="Available">Available</option>
                  <option value="On Trip">On Trip</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Seats</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={vSeats}
                  onChange={(e) => setVSeats(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Per-Km Fare (PKR)</label>
                <input
                  type="number"
                  min={5}
                  value={vPricePerKm}
                  onChange={(e) => setVPricePerKm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Base Fare (PKR)</label>
                <input
                  type="number"
                  min={0}
                  value={vBaseFare}
                  onChange={(e) => setVBaseFare(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plate Number</label>
                <input
                  type="text"
                  value={vPlate}
                  onChange={(e) => setVPlate(e.target.value)}
                  placeholder="LEA-2025"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={vCity}
                onChange={(e) => setVCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vehicle Photo (Choose Preset or Upload)
              </label>
              <div className="flex items-center gap-3">
                <select
                  value={vImageUrl}
                  onChange={(e) => setVImageUrl(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                >
                  {DEFAULT_VEHICLES.map((dv) => (
                    <option key={dv.vehicleId} value={dv.imageUrl}>
                      {dv.name} Studio Photo
                    </option>
                  ))}
                </select>
                <label className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#155EEF] hover:bg-blue-50 cursor-pointer whitespace-nowrap">
                  Upload File
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const dataUrl = await compressImageFileToDataUrl(file, 320, 14000);
                        setVImageUrl(dataUrl);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVehicleModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={vehicleSaving}
                className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {vehicleSaving ? 'Saving...' : 'Save Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Driver Add/Edit Modal */}
      {driverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveDriver}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-[#102E65]">
                {editingDriver ? 'Edit Driver' : 'Add Verified Driver'}
              </h3>
              <button
                type="button"
                onClick={() => setDriverModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {driverError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {driverError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={dName}
                onChange={(e) => setDName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number (Pakistan)
              </label>
              <input
                type="tel"
                required
                value={dPhone}
                onChange={(e) => setDPhone(e.target.value)}
                placeholder="+92 300 1234567"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Type</label>
                <select
                  value={dType}
                  onChange={(e) => setDType(e.target.value as VehicleType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="car">Car</option>
                  <option value="bike">Bike</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Availability</label>
                <select
                  value={dAvailability}
                  onChange={(e) => setDAvailability(e.target.value as DriverAvailability)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="Available">Available</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Off Duty">Off Duty</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Driving License Number
              </label>
              <input
                type="text"
                required
                value={dLicense}
                onChange={(e) => setDLicense(e.target.value)}
                placeholder="PK-LHR-123456"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDriverModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={driverSaving}
                className="px-4 py-2 rounded-xl bg-[#155EEF] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {driverSaving ? 'Saving...' : 'Save Driver'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title="Reject Ride Booking?"
        description={`Rejecting booking ${rejectTarget?.bookingId || ''} will notify ${rejectTarget?.customerName || 'the customer'}.`}
        confirmLabel="Reject Booking"
        tone="danger"
        loading={actionLoading}
        onConfirm={() => {
          if (rejectTarget) {
            void handleUpdateBookingStatus(rejectTarget, 'Rejected').then(() =>
              setRejectTarget(null)
            );
          }
        }}
        onCancel={() => setRejectTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteVehicleTarget)}
        title="Delete Vehicle?"
        description={`Remove ${deleteVehicleTarget?.name || ''} from the GoRide fleet?`}
        confirmLabel="Delete Vehicle"
        tone="danger"
        loading={actionLoading}
        onConfirm={() => void handleDeleteVehicle()}
        onCancel={() => setDeleteVehicleTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteDriverTarget)}
        title="Remove Driver?"
        description={`Remove ${deleteDriverTarget?.fullName || ''} from the GoRide drivers directory?`}
        confirmLabel="Remove Driver"
        tone="danger"
        loading={actionLoading}
        onConfirm={() => void handleDeleteDriver()}
        onCancel={() => setDeleteDriverTarget(null)}
      />
    </div>
  );
};
