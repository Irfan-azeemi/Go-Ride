import React, { useState } from 'react';
import { ArrowRight, Bike, Car, CheckCircle2, Clock, MapPin, ShieldCheck, Users } from 'lucide-react';
import { HERO_BANNER_IMAGE } from '../data/seedData';
import { FareConfig, Vehicle, VehicleType } from '../types/goride';
import { formatPKR, safeImageSrc } from '../utils/pakistan';
import { GoRideLogo } from './GoRideLogo';

interface LandingPageProps {
  vehicles: Vehicle[];
  fareConfig: FareConfig;
  isSignedIn: boolean;
  isAdmin: boolean;
  onOpenAuth: (mode: 'customer-login' | 'customer-register' | 'admin-login') => void;
  onOpenDashboard: (target: 'customer' | 'admin', preselectType?: VehicleType) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  vehicles,
  fareConfig,
  isSignedIn,
  isAdmin,
  onOpenAuth,
  onOpenDashboard,
}) => {
  const [fleetFilter, setFleetFilter] = useState<'all' | 'car' | 'bike'>('all');
  const [estDistance, setEstDistance] = useState<number>(12);
  const [estType, setEstType] = useState<VehicleType>('car');

  const filteredVehicles = vehicles.filter((v) =>
    fleetFilter === 'all' ? true : v.type === fleetFilter
  );

  const estimatedFare =
    estType === 'car'
      ? Math.max(fareConfig.minimumFare, (fareConfig.carBaseFare + estDistance * fareConfig.carPerKm) * fareConfig.peakMultiplier)
      : Math.max(fareConfig.minimumFare, (fareConfig.bikeBaseFare + estDistance * fareConfig.bikePerKm) * fareConfig.peakMultiplier);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Exact 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <GoRideLogo size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#fleet" className="hover:text-[#155EEF] transition-colors whitespace-nowrap shrink-0">
              Fleet
            </a>
            <a href="#fares" className="hover:text-[#155EEF] transition-colors whitespace-nowrap shrink-0">
              Fare Rates
            </a>
            <a href="#coverage" className="hover:text-[#155EEF] transition-colors whitespace-nowrap shrink-0">
              Coverage
            </a>
            <a href="#how-it-works" className="hover:text-[#155EEF] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                isSignedIn
                  ? onOpenDashboard(isAdmin ? 'admin' : 'customer')
                  : onOpenAuth('customer-login')
              }
              className="px-4 py-2 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSignedIn ? (isAdmin ? 'Admin Console' : 'Book a Ride') : 'Book a Ride'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-sm font-semibold text-[#155EEF] mb-3">
                  Pakistan Urban & Intercity Mobility · Asia/Karachi
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-[#102E65] tracking-tight leading-[1.1] text-balance mb-4">
                  Your Journey, Your Choice!
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                  Book verified air-conditioned cars or agile commuter bikes across Karachi, Lahore, and Islamabad with live Google Maps routing and upfront Pakistani Rupee fares.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      isSignedIn
                        ? onOpenDashboard('customer', 'car')
                        : onOpenAuth('customer-register')
                    }
                    className="px-6 py-3 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Car className="w-4 h-4" />
                    Book a Car
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      isSignedIn
                        ? onOpenDashboard('customer', 'bike')
                        : onOpenAuth('customer-login')
                    }
                    className="px-6 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#102E65] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Bike className="w-4 h-4 text-[#155EEF]" />
                    Book a Bike
                  </button>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span>Car from {formatPKR(fareConfig.carPerKm)}/km</span>
                  <span aria-hidden="true">·</span>
                  <span>Bike from {formatPKR(fareConfig.bikePerKm)}/km</span>
                  <span aria-hidden="true">·</span>
                  <span>Live Google Maps Route & ETA</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                  <img
                    src={HERO_BANNER_IMAGE}
                    alt="GoRide modern blue sedan and commuter bike outside a Pakistani transit hub"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>

            {/* Full-width 4-column metric strip below hero */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-100">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 mb-1">Car Base + Rate</p>
                <p className="font-display text-lg font-bold text-[#102E65] tabular-nums">
                  {formatPKR(fareConfig.carBaseFare)} + {formatPKR(fareConfig.carPerKm)}/km
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 mb-1">Bike Base + Rate</p>
                <p className="font-display text-lg font-bold text-[#102E65] tabular-nums">
                  {formatPKR(fareConfig.bikeBaseFare)} + {formatPKR(fareConfig.bikePerKm)}/km
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 mb-1">Active Fleet</p>
                <p className="font-display text-lg font-bold text-[#102E65] tabular-nums">
                  {vehicles.filter((v) => v.availability === 'Available').length} Vehicles Ready
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <p className="text-xs text-slate-500 mb-1">Operating Standard</p>
                <p className="font-display text-lg font-bold text-[#102E65]">
                  PKR · Asia/Karachi
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Fleet Showcase */}
        <section id="fleet" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102E65]">
                Verified Cars & Bikes
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Compare seating, per-kilometer PKR rates, and live fleet availability.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start">
              {(['all', 'car', 'bike'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFleetFilter(tab)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    fleetFilter === tab
                      ? 'bg-white text-[#102E65] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'all' ? 'All Vehicles' : tab === 'car' ? 'Cars' : 'Bikes'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVehicles.map((vehicle) => {
              const imgUrl = safeImageSrc(vehicle.imageUrl);
              const isAvailable = vehicle.availability === 'Available';
              return (
                <article
                  key={vehicle.vehicleId}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col hover:border-[#155EEF]/40 transition-colors"
                >
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={vehicle.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        {vehicle.type === 'car' ? (
                          <Car className="w-12 h-12" />
                        ) : (
                          <Bike className="w-12 h-12" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                      <span>{vehicle.type === 'car' ? 'Car' : 'Bike'} · {vehicle.city || 'Pakistan'}</span>
                      <span
                        className={`font-semibold ${
                          isAvailable ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {vehicle.availability}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#102E65]">
                      {vehicle.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 mb-4">{vehicle.model}</p>

                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                      <div className="text-xs text-slate-600 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span className="tabular-nums">
                            {vehicle.seats} {vehicle.seats === 1 ? 'Rider Seat' : 'Seats'}
                          </span>
                        </div>
                        <div className="font-display text-sm font-bold text-[#102E65] tabular-nums">
                          {formatPKR(vehicle.pricePerKm)} / km
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!isAvailable}
                        onClick={() =>
                          isSignedIn
                            ? onOpenDashboard('customer', vehicle.type)
                            : onOpenAuth('customer-login')
                        }
                        className="px-4 py-2 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {isAvailable ? 'Select & Book' : 'Unavailable'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Interactive Fare Calculator & Coverage */}
        <section id="fares" className="bg-white border-y border-slate-200 py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-6">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102E65] mb-3">
                Transparent PKR Fare Estimator
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Estimate your trip fare before booking. Final distance and travel time are calculated live on Google Maps when you confirm pickup and drop-off points.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setEstType('car')}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      estType === 'car' ? 'bg-white text-[#102E65] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    Car Ride
                  </button>
                  <button
                    type="button"
                    onClick={() => setEstType('bike')}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      estType === 'bike' ? 'bg-white text-[#102E65] shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    <Bike className="w-3.5 h-3.5" />
                    Bike Ride
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                    <span>Estimated Distance</span>
                    <span className="font-mono tabular-nums text-[#155EEF]">{estDistance} km</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={estDistance}
                    onChange={(e) => setEstDistance(Number(e.target.value))}
                    className="w-full accent-[#155EEF] cursor-pointer"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Estimated Total Fare</p>
                    <p className="font-display text-2xl font-extrabold text-[#102E65] tabular-nums">
                      {formatPKR(estimatedFare)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      isSignedIn
                        ? onOpenDashboard('customer', estType)
                        : onOpenAuth('customer-register')
                    }
                    className="px-5 py-2.5 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Book Now
                  </button>
                </div>
              </div>
            </div>

            <div id="coverage" className="lg:col-span-6 space-y-6">
              <div>
                <h3 className="font-display text-2xl font-bold text-[#102E65] mb-2">
                  Major Cities Across Pakistan
                </h3>
                <p className="text-sm text-slate-600">
                  Real-time dispatch and verified drivers operating daily across key metropolitan corridors.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { city: 'Karachi', detail: 'Clifton · DHA · Gulshan · Jinnah Airport' },
                  { city: 'Lahore', detail: 'Gulberg · DHA · Johar Town · Model Town' },
                  { city: 'Islamabad', detail: 'Blue Area · F-6 / F-7 · G-11 · Airport' },
                  { city: 'Rawalpindi', detail: 'Saddar · Bahria Town · Chaklala' },
                ].map((item) => (
                  <div
                    key={item.city}
                    className="p-4 rounded-xl bg-white border border-slate-200"
                  >
                    <div className="flex items-center gap-2 font-display font-bold text-[#102E65] text-sm mb-1">
                      <MapPin className="w-4 h-4 text-[#155EEF]" />
                      {item.city}
                    </div>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102E65]">
              How GoRide Works
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Four straightforward steps from route search to arrival.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '01.',
                icon: MapPin,
                title: 'Pin Route on Google Maps',
                body: 'Search pickup and destination addresses or tap your live GPS location.',
              },
              {
                num: '02.',
                icon: Car,
                title: 'Choose Car or Bike',
                body: 'Pick an available sedan, SUV, hatchback, or commuter bike with exact PKR/km rates.',
              },
              {
                num: '03.',
                icon: Clock,
                title: 'Schedule Date & Time',
                body: 'Book immediately or schedule ahead in Asia/Karachi local time.',
              },
              {
                num: '04.',
                icon: CheckCircle2,
                title: 'Track Live Status',
                body: 'Receive instant in-app alerts as dispatch approves and assigns your driver.',
              },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.num} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-semibold text-[#155EEF]">
                      {step.num}
                    </span>
                    <Icon className="w-5 h-5 text-[#102E65]" />
                  </div>
                  <h3 className="font-display font-bold text-base text-[#102E65] mb-1.5">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="bg-[#102E65] text-slate-200 border-t border-[#102E65]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <GoRideLogo variant="light" size="sm" />
            <p className="text-xs text-blue-200/80 mt-1">
              Your Journey, Your Choice! · Pakistan Car & Bike Mobility Platform
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <button
              type="button"
              onClick={() => onOpenAuth('customer-login')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Customer Login
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('customer-register')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Customer Registration
            </button>
            <button
              type="button"
              onClick={() =>
                isSignedIn && isAdmin
                  ? onOpenDashboard('admin')
                  : onOpenAuth('admin-login')
              }
              className="inline-flex items-center gap-1.5 text-blue-200 hover:text-white font-semibold transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Portal
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
