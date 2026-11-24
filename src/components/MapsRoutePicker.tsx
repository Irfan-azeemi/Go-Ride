import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Navigation, Route as RouteIcon, Search } from 'lucide-react';
import { LatLngLiteral, VehicleType } from '../types/goride';

export interface SelectedLocation {
  address: string;
  coords: LatLngLiteral;
}

export interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
}

interface MapsRoutePickerProps {
  pickup: SelectedLocation | null;
  destination: SelectedLocation | null;
  vehicleType: VehicleType;
  mapsConfigured: boolean;
  onPickupChange: (loc: SelectedLocation | null) => void;
  onDestinationChange: (loc: SelectedLocation | null) => void;
  onRouteCalculated: (metrics: RouteMetrics | null) => void;
}

const PAKISTAN_CENTER: LatLngLiteral = { lat: 30.3753, lng: 69.3451 };

function notifyIfQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('QuotaExceeded') ||
    msg.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

function haversineKm(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return Math.max(0.5, Number((R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(2)));
}

interface PlacePredictionLike {
  text: { text: string };
  toPlace: () => {
    location?: { lat: () => number; lng: () => number } | null;
    formattedAddress?: string | null;
    displayName?: string | null;
    fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
  };
}

interface AutocompleteSuggestionLike {
  placePrediction?: PlacePredictionLike;
}

interface PolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
}

interface PlaceSearchInputProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (val: string) => void;
  onPlaceResolved: (loc: SelectedLocation) => void;
  rightAdornment?: React.ReactNode;
}

const PlaceSearchInput: React.FC<PlaceSearchInputProps> = ({
  id,
  label,
  placeholder,
  value,
  onValueChange,
  onPlaceResolved,
  rightAdornment,
}) => {
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  const sessionTokenRef = useRef<unknown>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionLike[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (!placesLib || skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib as unknown as {
          AutocompleteSessionToken: new () => unknown;
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
              suggestions?: AutocompleteSuggestionLike[];
            }>;
          };
        };
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        setLoading(true);
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['pk'],
        });
        setSuggestions(res.suggestions || []);
        setOpen(true);
      } catch (err) {
        notifyIfQuotaError(err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [placesLib, value]);

  const handleSelectSuggestion = async (suggestion: AutocompleteSuggestionLike) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
      });
      const loc = place.location;
      if (loc) {
        const addressText =
          place.formattedAddress ||
          place.displayName ||
          suggestion.placePrediction.text.text;
        skipNextFetchRef.current = true;
        onValueChange(addressText);
        onPlaceResolved({
          address: addressText,
          coords: { lat: loc.lat(), lng: loc.lng() },
        });
      }
    } catch (err) {
      notifyIfQuotaError(err);
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setOpen(false);
    }
  };

  const handleFallbackGeocode = async () => {
    const queryText = value.trim();
    if (queryText.length < 3) return;
    setLoading(true);
    try {
      if (placesLib) {
        const { Place } = placesLib as unknown as {
          Place: {
            searchByText: (req: Record<string, unknown>) => Promise<{
              places?: Array<{
                displayName?: string;
                formattedAddress?: string;
                location?: { lat: () => number; lng: () => number };
              }>;
            }>;
          };
        };
        if (Place && typeof Place.searchByText === 'function') {
          const res = await Place.searchByText({
            textQuery: queryText,
            fields: ['displayName', 'formattedAddress', 'location'],
            region: 'pk',
          });
          const first = res.places?.[0];
          if (first?.location) {
            const addressText = first.formattedAddress || first.displayName || queryText;
            skipNextFetchRef.current = true;
            onValueChange(addressText);
            onPlaceResolved({
              address: addressText,
              coords: { lat: first.location.lat(), lng: first.location.lng() },
            });
            setOpen(false);
            return;
          }
        }
      }

      if (geocodingLib) {
        const { Geocoder } = geocodingLib as unknown as {
          Geocoder: new () => {
            geocode: (req: { address?: string; region?: string }) => Promise<{
              results?: Array<{
                formatted_address?: string;
                geometry?: { location?: { lat: () => number; lng: () => number } };
              }>;
            }>;
          };
        };
        if (Geocoder) {
          const geocoder = new Geocoder();
          const geoRes = await geocoder.geocode({ address: queryText, region: 'PK' });
          const primary = geoRes.results?.[0];
          const loc = primary?.geometry?.location;
          if (loc) {
            const addressText = primary?.formatted_address || queryText;
            skipNextFetchRef.current = true;
            onValueChange(addressText);
            onPlaceResolved({
              address: addressText,
              coords: { lat: loc.lat(), lng: loc.lng() },
            });
            setOpen(false);
            return;
          }
        }
      }

      const res = await fetch(`/api/geocode?address=${encodeURIComponent(queryText)}`);
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        skipNextFetchRef.current = true;
        onValueChange(data.formattedAddress || queryText);
        onPlaceResolved({
          address: data.formattedAddress || queryText,
          coords: { lat: data.lat, lng: data.lng },
        });
        setOpen(false);
      }
    } catch (err) {
      notifyIfQuotaError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleFallbackGeocode();
              }
            }}
            placeholder={placeholder}
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] transition-colors"
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="w-4 h-4 text-[#155EEF] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>
        {rightAdornment}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleSelectSuggestion(s)}
                className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-blue-50/70 hover:text-[#102E65] flex items-start gap-2.5 transition-colors cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-[#155EEF] mt-0.5 shrink-0" />
                <span className="line-clamp-2">{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface RouteControllerProps {
  pickup: SelectedLocation | null;
  destination: SelectedLocation | null;
  vehicleType: VehicleType;
  onRouteCalculated: (metrics: RouteMetrics | null) => void;
  onRouteStatus: (status: { loading: boolean; error: string | null }) => void;
}

const RouteController: React.FC<RouteControllerProps> = ({
  pickup,
  destination,
  vehicleType,
  onRouteCalculated,
  onRouteStatus,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<PolylineLike[]>([]);

  useEffect(() => {
    if (!map) return;
    if (pickup && !destination) {
      map.panTo(pickup.coords);
      map.setZoom(14);
    } else if (!pickup && destination) {
      map.panTo(destination.coords);
      map.setZoom(14);
    }
  }, [map, pickup, destination]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!pickup || !destination) {
      onRouteCalculated(null);
      onRouteStatus({ loading: false, error: null });
      return;
    }

    if (!map || !routesLib) {
      const estKm = haversineKm(pickup.coords, destination.coords);
      onRouteCalculated({
        distanceKm: estKm,
        durationMinutes: Math.max(5, Math.round((estKm / 30) * 60)),
      });
      return;
    }

    let cancelled = false;
    onRouteStatus({ loading: true, error: null });

    const runCompute = async () => {
      const tryMode = async (mode: string) => {
        const request = {
          origin: pickup.coords,
          destination: destination.coords,
          travelMode: mode,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
        };
        return (routesLib.Route as unknown as {
          computeRoutes: (req: typeof request) => Promise<{
            routes?: Array<{
              distanceMeters?: number;
              durationMillis?: number;
              viewport?: unknown;
              createPolylines: () => PolylineLike[];
            }>;
          }>;
        }).computeRoutes(request);
      };

      try {
        let res = await tryMode(vehicleType === 'bike' ? 'TWO_WHEELER' : 'DRIVING');
        if ((!res.routes || res.routes.length === 0) && vehicleType === 'bike') {
          res = await tryMode('DRIVING');
        }
        if (cancelled) return;

        const primaryRoute = res.routes?.[0];
        if (!primaryRoute) {
          const fallbackKm = haversineKm(pickup.coords, destination.coords);
          onRouteCalculated({
            distanceKm: fallbackKm,
            durationMinutes: Math.max(5, Math.round((fallbackKm / 32) * 60)),
          });
          onRouteStatus({
            loading: false,
            error: 'Exact road route unavailable; using direct distance estimate.',
          });
          return;
        }

        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#155EEF',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          (map as unknown as { fitBounds: (b: unknown) => void }).fitBounds(primaryRoute.viewport);
        }

        const distanceKm = Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(2));
        const durationMinutes = Math.max(
          2,
          Math.round((primaryRoute.durationMillis ?? 0) / 60000)
        );
        onRouteCalculated({ distanceKm, durationMinutes });
        onRouteStatus({ loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const isQuota = notifyIfQuotaError(err);
        const fallbackKm = haversineKm(pickup.coords, destination.coords);
        onRouteCalculated({
          distanceKm: fallbackKm,
          durationMinutes: Math.max(5, Math.round((fallbackKm / 32) * 60)),
        });
        onRouteStatus({
          loading: false,
          error: isQuota
            ? 'Google Maps route quota reached; estimated distance applied.'
            : 'Unable to load route data. Using estimated distance.',
        });
      }
    };

    void runCompute();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, pickup, destination, vehicleType, onRouteCalculated, onRouteStatus]);

  return null;
};

export const MapsRoutePicker: React.FC<MapsRoutePickerProps> = ({
  pickup,
  destination,
  vehicleType,
  mapsConfigured,
  onPickupChange,
  onDestinationChange,
  onRouteCalculated,
}) => {
  const geocodingLib = useMapsLibrary('geocoding');
  const [pickupQuery, setPickupQuery] = useState(pickup?.address || '');
  const [destQuery, setDestQuery] = useState(destination?.address || '');
  const [activePinMode, setActivePinMode] = useState<'pickup' | 'destination'>('pickup');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [routeStatus, setRouteStatus] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (pickup?.address && pickup.address !== pickupQuery) {
      setPickupQuery(pickup.address);
    }
  }, [pickup?.address]);

  useEffect(() => {
    if (destination?.address && destination.address !== destQuery) {
      setDestQuery(destination.address);
    }
  }, [destination?.address]);

  const reverseGeocodeCoords = useCallback(
    async (coords: LatLngLiteral): Promise<string> => {
      if (geocodingLib) {
        try {
          const { Geocoder } = geocodingLib as unknown as {
            Geocoder: new () => {
              geocode: (req: { location: LatLngLiteral }) => Promise<{
                results?: Array<{ formatted_address?: string }>;
              }>;
            };
          };
          if (Geocoder) {
            const geocoder = new Geocoder();
            const geoRes = await geocoder.geocode({ location: coords });
            const formatted = geoRes.results?.[0]?.formatted_address;
            if (formatted) return formatted;
          }
        } catch (err) {
          notifyIfQuotaError(err);
        }
      }

      try {
        const res = await fetch(
          `/api/reverse-geocode?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`
        );
        if (res.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (res.ok) {
          const data = await res.json();
          if (data.formattedAddress) return data.formattedAddress;
        }
      } catch {
        // Fallback to coordinate label
      }
      return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    },
    [geocodingLib]
  );

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const formatted = await reverseGeocodeCoords(coords);
        setPickupQuery(formatted);
        onPickupChange({ address: formatted, coords });
        setActivePinMode('destination');
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Please search your pickup address above.'
            : 'Could not determine your current GPS location.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = async (ev: MapMouseEvent) => {
    const latLng = ev.detail.latLng;
    if (!latLng) return;
    const coords = { lat: latLng.lat, lng: latLng.lng };
    const formatted = await reverseGeocodeCoords(coords);
    if (activePinMode === 'pickup') {
      setPickupQuery(formatted);
      onPickupChange({ address: formatted, coords });
      setActivePinMode('destination');
    } else {
      setDestQuery(formatted);
      onDestinationChange({ address: formatted, coords });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlaceSearchInput
          id="pickup-search"
          label="Pickup Location"
          placeholder="Search pickup street, sector, or landmark..."
          value={pickupQuery}
          onValueChange={(val) => {
            setPickupQuery(val);
            if (!val.trim()) onPickupChange(null);
          }}
          onPlaceResolved={(loc) => {
            onPickupChange(loc);
            setActivePinMode('destination');
          }}
          rightAdornment={
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
              title="Use my current location"
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#155EEF] hover:bg-blue-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {geoLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">My Location</span>
            </button>
          }
        />

        <PlaceSearchInput
          id="destination-search"
          label="Destination Location"
          placeholder="Search destination in Pakistan..."
          value={destQuery}
          onValueChange={(val) => {
            setDestQuery(val);
            if (!val.trim()) onDestinationChange(null);
          }}
          onPlaceResolved={(loc) => onDestinationChange(loc)}
        />
      </div>

      {geoError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {geoError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActivePinMode('pickup')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activePinMode === 'pickup'
                ? 'bg-white text-[#102E65] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Click Map: Set Pickup
          </button>
          <button
            type="button"
            onClick={() => setActivePinMode('destination')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activePinMode === 'destination'
                ? 'bg-white text-[#102E65] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Click Map: Set Destination
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          {routeStatus.loading && (
            <span className="inline-flex items-center gap-1.5 text-[#155EEF] font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Calculating route...
            </span>
          )}
          {!routeStatus.loading && routeStatus.error && (
            <span className="text-amber-700">{routeStatus.error}</span>
          )}
          {!routeStatus.loading && !routeStatus.error && pickup && destination && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <RouteIcon className="w-3.5 h-3.5" />
              Live route active
            </span>
          )}
        </div>
      </div>

      <div className="w-full h-[320px] md:h-[380px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative">
        {mapsConfigured ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={PAKISTAN_CENTER}
            defaultZoom={5}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            onClick={handleMapClick}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
          >
            {pickup && (
              <AdvancedMarker position={pickup.coords} title="Pickup Location">
                <Pin background="#155EEF" borderColor="#102E65" glyphColor="#FFFFFF" />
              </AdvancedMarker>
            )}
            {destination && (
              <AdvancedMarker position={destination.coords} title="Destination">
                <Pin background="#102E65" borderColor="#0F172A" glyphColor="#FFFFFF" />
              </AdvancedMarker>
            )}
            <RouteController
              pickup={pickup}
              destination={destination}
              vehicleType={vehicleType}
              onRouteCalculated={onRouteCalculated}
              onRouteStatus={setRouteStatus}
            />
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6">
            <Navigation className="w-8 h-8 text-[#155EEF] mb-2" />
            <p className="text-sm font-semibold text-[#102E65]">Google Maps initializing...</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Ensure your Google Maps Platform API key is enabled to render interactive map tiles and routing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
