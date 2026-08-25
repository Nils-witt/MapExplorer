import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MapLayerMouseEvent,
  MapRef,
  MarkerDragEvent,
  ViewStateChangeEvent,
} from '@vis.gl/react-maplibre';
import {
  GeolocateControl,
  Layer,
  Map,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from '@vis.gl/react-maplibre';
import type { RequestParameters, ResourceType } from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import {
  AddMarkerButtonControl,
  MarkersListButtonControl,
  SearchButtonControl,
  SettingsButtonControl,
} from './components/MapControls';
import { OverlaysProvider, useOverlays } from './context/OverlaysContext';
import {
  GeoObjectsProvider,
  describeGeoObjectError,
  toGeoObjectRequest,
  useGeoObjects,
} from './context/GeoObjectsContext';
import { ServersProvider, useServers } from './context/ServersContext';
import {
  DEFAULT_OVERLAY_OPACITY,
  OVERLAY_LAYER_PREFIX,
  OVERLAY_SOURCE_PREFIX,
  findAuthorizationHeader,
} from './lib/overlayMap';
import {
  applyConfig,
  loadMapPosition,
  loadMarkersEnabled,
  loadShowAllMarkers,
  loadShowMarkerLabels,
  loadStyleUrl,
  saveMapPosition,
  saveMarkersEnabled,
  saveShowAllMarkers,
  saveShowMarkerLabels,
  saveStyleUrl,
} from './lib/storage';
import PlaceIcon from '@mui/icons-material/Place';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  authorizationCodeGrant,
  Configuration,
  discovery,
} from 'openid-client';
import { oauthConfig } from './lib/oauth2';

setWorkerUrl(workerUrl);

// Both dialogs are hidden behind an `open` flag until the user opens the
// settings menu or the markers list - loading their code (and, for
// MarkersDialog, the CSV import machinery it pulls in) eagerly would bloat
// the initial bundle for something most sessions never touch.
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((m) => ({
    default: m.SettingsDialog,
  })),
);
const MarkersDialog = lazy(() =>
  import('./components/MarkersDialog').then((m) => ({
    default: m.MarkersDialog,
  })),
);

const DEFAULT_STYLE_URL =
  import.meta.env.VITE_DEFAULT_STYLE_URL ??
  'https://demotiles.maplibre.org/style.json';

const DEFAULT_MAP_POSITION = {
  center: [7.09, 50.73] as [number, number],
  zoom: 10,
  bearing: 0,
  pitch: 0,
};

function MapView() {
  const mapRef = useRef<MapRef | null>(null);
  const { overlays, overlaysRef } = useOverlays();
  const {
    allGeoObjects,
    activeOverlayId,
    isOnline,
    createGeoObject,
    updateGeoObject,
  } = useGeoObjects();
  const { serversRef, authErrors, dismissAuthError } = useServers();

  const [settingsOpen, setSettingsOpen] = useState(false);
  // Once true, stays true - lets the (lazy-loaded) dialog stay mounted
  // across close/reopen so its close transition still animates, while still
  // deferring the initial chunk load until first opened.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [markersDialogOpen, setMarkersDialogOpen] = useState(false);
  const [markersDialogLoaded, setMarkersDialogLoaded] = useState(false);
  const [styleUrl, setStyleUrl] = useState(() =>
    loadStyleUrl(DEFAULT_STYLE_URL),
  );
  const [addingMarker, setAddingMarker] = useState(false);
  const [relocatingUuid, setRelocatingUuid] = useState<string | null>(null);
  const [initialPosition] = useState(
    () => loadMapPosition() ?? DEFAULT_MAP_POSITION,
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showMarkerLabels, setShowMarkerLabels] = useState(() =>
    loadShowMarkerLabels(),
  );
  const [showAllMarkers, setShowAllMarkers] = useState(() =>
    loadShowAllMarkers(),
  );
  const [markersEnabled, setMarkersEnabled] = useState(() =>
    loadMarkersEnabled(),
  );
  const [mapActionError, setMapActionError] = useState<string | null>(null);

  useEffect(() => {
    try {
      fetch('/config.json')
        .then((response) => response.json())
        .then((config) => {
          applyConfig(config);
        })
        .catch((error) => {
          console.log('Failed to load config.json:', error);
        });
    } catch (error) {
      console.log('Failed to load config.json:', error);
    }
  }, []);

  useEffect(() => {
    saveStyleUrl(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    saveShowMarkerLabels(showMarkerLabels);
  }, [showMarkerLabels]);

  useEffect(() => {
    saveShowAllMarkers(showAllMarkers);
  }, [showAllMarkers]);

  useEffect(() => {
    saveMarkersEnabled(markersEnabled);
  }, [markersEnabled]);

  useEffect(() => {
    if (!markersEnabled) {
      setAddingMarker(false);
      setMarkersDialogOpen(false);
    }
  }, [markersEnabled]);

  const addMarkerDisabled = !activeOverlayId || !isOnline;
  const addMarkerDisabledReason = !isOnline
    ? "You're offline"
    : !activeOverlayId
      ? 'Connect to a server and select a map to add markers'
      : undefined;

  const handleMapClick = (event: MapLayerMouseEvent) => {
    if (relocatingUuid) {
      const uuid = relocatingUuid;
      setRelocatingUuid(null);
      const entry = allGeoObjects.find(
        (candidate) => candidate.geoObject.uuid === uuid,
      );
      if (!entry) {
        return;
      }
      const { lng, lat } = event.lngLat;
      updateGeoObject(
        entry.overlayId,
        entry.geoObject.uuid,
        toGeoObjectRequest(entry, { latitude: lat, longitude: lng }),
      ).catch((err) => {
        setMapActionError(describeGeoObjectError(err));
      });
      return;
    }
    if (!addingMarker) {
      return;
    }
    setAddingMarker(false);
    if (!activeOverlayId) {
      return;
    }
    const { lng, lat } = event.lngLat;
    createGeoObject(activeOverlayId, {
      name: 'New marker',
      latitude: lat,
      longitude: lng,
    }).catch((err) => {
      setMapActionError(describeGeoObjectError(err));
    });
  };

  const handleRelocateMarker = (uuid: string) => {
    setAddingMarker(false);
    setSelectedMarkerId(uuid);
    setRelocatingUuid(uuid);
  };

  const handleMoveEnd = (event: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = event.viewState;
    saveMapPosition({ center: [longitude, latitude], zoom, bearing, pitch });
  };

  const visibleGeoObjects = useMemo(
    () =>
      showAllMarkers
        ? allGeoObjects
        : allGeoObjects.filter(
            (entry) => entry.geoObject.uuid === selectedMarkerId,
          ),
    [allGeoObjects, showAllMarkers, selectedMarkerId],
  );

  const searchableGeoObjects = useMemo(
    () =>
      allGeoObjects.map((entry) => {
        const sublabel = [
          entry.geoObject.street,
          entry.geoObject.housenumber,
          entry.geoObject.postcode,
        ]
          .filter(Boolean)
          .join(' ');
        const searchText = [
          entry.geoObject.name,
          entry.geoObject.street,
          entry.geoObject.housenumber,
          entry.geoObject.postcode,
          entry.geoObject.externalId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return {
          uuid: entry.geoObject.uuid,
          label: entry.geoObject.name,
          sublabel,
          searchText,
        };
      }),
    [allGeoObjects],
  );

  const enabledOverlaysTopFirst = useMemo(
    () => [...overlays].reverse().filter((overlay) => overlay.enabled),
    [overlays],
  );

  const handleLocateMarker = (uuid: string) => {
    const entry = allGeoObjects.find(
      (candidate) => candidate.geoObject.uuid === uuid,
    );
    setSelectedMarkerId(uuid);
    const map = mapRef.current;
    if (!entry || !map) {
      return;
    }
    map.flyTo({
      center: [entry.geoObject.longitude, entry.geoObject.latitude],
      zoom: Math.max(map.getZoom(), 14),
    });
  };

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: initialPosition.center[0],
          latitude: initialPosition.center[1],
          zoom: initialPosition.zoom,
          bearing: initialPosition.bearing,
          pitch: initialPosition.pitch,
        }}
        mapStyle={styleUrl}
        cursor={addingMarker || relocatingUuid ? 'crosshair' : undefined}
        style={{ position: 'absolute', inset: 0 }}
        transformRequest={(
          url: string,
          _resourceType?: ResourceType,
        ): RequestParameters | undefined => {
          const authorizationHeader = findAuthorizationHeader(
            url,
            overlaysRef.current,
            serversRef.current,
          );
          if (!authorizationHeader) {
            return undefined;
          }
          return { url, headers: { Authorization: authorizationHeader } };
        }}
        onClick={handleMapClick}
        onMoveEnd={handleMoveEnd}
      >
        <NavigationControl position="top-left" />
        {markersEnabled ? (
          <>
            <AddMarkerButtonControl
              active={addingMarker}
              onToggle={() => setAddingMarker((prev) => !prev)}
              disabled={addMarkerDisabled}
              disabledReason={addMarkerDisabledReason}
            />
            <MarkersListButtonControl
              onOpen={() => {
                setMarkersDialogLoaded(true);
                setMarkersDialogOpen(true);
              }}
            />
          </>
        ) : null}
        <SearchButtonControl
          items={searchableGeoObjects}
          onSelect={handleLocateMarker}
        />
        <GeolocateControl
          position="top-left"
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
        />
        <SettingsButtonControl
          onOpen={() => {
            setSettingsLoaded(true);
            setSettingsOpen(true);
          }}
        />
        {enabledOverlaysTopFirst.map((overlay) => (
          <Source
            key={overlay.id}
            id={`${OVERLAY_SOURCE_PREFIX}${overlay.id}`}
            type="raster"
            tiles={overlay.tiles}
            tileSize={256}
          >
            <Layer
              id={`${OVERLAY_LAYER_PREFIX}${overlay.id}`}
              type="raster"
              paint={{
                'raster-opacity': overlay.opacity ?? DEFAULT_OVERLAY_OPACITY,
              }}
            />
          </Source>
        ))}
        {visibleGeoObjects.map((entry) => (
          <Marker
            key={entry.geoObject.uuid}
            longitude={entry.geoObject.longitude}
            latitude={entry.geoObject.latitude}
            draggable
            onDragEnd={(event: MarkerDragEvent) =>
              updateGeoObject(
                entry.overlayId,
                entry.geoObject.uuid,
                toGeoObjectRequest(entry, {
                  latitude: event.lngLat.lat,
                  longitude: event.lngLat.lng,
                }),
              ).catch((err) => {
                setMapActionError(describeGeoObjectError(err));
              })
            }
          >
            <PlaceIcon
              color={
                selectedMarkerId === entry.geoObject.uuid ? 'error' : 'primary'
              }
              fontSize="large"
            />
          </Marker>
        ))}
        {showMarkerLabels
          ? visibleGeoObjects.map((entry) => (
              <Popup
                key={entry.geoObject.uuid}
                longitude={entry.geoObject.longitude}
                latitude={entry.geoObject.latitude}
                closeButton={false}
                closeOnClick={false}
                anchor="top"
                offset={16}
                className="marker-label-popup"
              >
                {entry.geoObject.name}
              </Popup>
            ))
          : null}
      </Map>
      {Object.keys(authErrors).length > 0 ? (
        <Stack
          spacing={1}
          sx={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            width: 'min(90vw, 420px)',
          }}
        >
          {Object.entries(authErrors).map(([serverId, message]) => (
            <Alert
              key={serverId}
              severity="error"
              onClose={() => dismissAuthError(serverId)}
            >
              {message}
            </Alert>
          ))}
        </Stack>
      ) : null}
      {addingMarker ? (
        <div className="marker-hint">Click the map to place a marker</div>
      ) : null}
      {relocatingUuid ? (
        <div className="marker-hint">Click the map to move the marker</div>
      ) : null}
      {mapActionError ? (
        <Alert
          severity="error"
          onClose={() => setMapActionError(null)}
          sx={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
          }}
        >
          {mapActionError}
        </Alert>
      ) : null}
      <div className="copyright">© 2026 Nils Witt</div>
      {settingsLoaded ? (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            styleUrl={styleUrl}
            onApplyStyle={setStyleUrl}
            markersEnabled={markersEnabled}
            onMarkersEnabledChange={setMarkersEnabled}
          />
        </Suspense>
      ) : null}
      {markersEnabled && markersDialogLoaded ? (
        <Suspense fallback={null}>
          <MarkersDialog
            open={markersDialogOpen}
            onClose={() => setMarkersDialogOpen(false)}
            onLocate={handleLocateMarker}
            onRelocate={handleRelocateMarker}
            showMarkerLabels={showMarkerLabels}
            onShowMarkerLabelsChange={setShowMarkerLabels}
            showAllMarkers={showAllMarkers}
            onShowAllMarkersChange={setShowAllMarkers}
          />
        </Suspense>
      ) : null}
    </>
  );
}

const execOauth = async () => {
  const issuer = oauthConfig.issuer;
  const clientId = oauthConfig.clientId;

  const config: Configuration = await discovery(new URL(issuer), clientId);
  let code_verifier = localStorage.getItem('code_verifier') || '';

  let currentUrl: URL = new URL(window.location.href);
  let tokens = await authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: code_verifier,
    idTokenExpected: true,
    expectedState: localStorage.getItem('state') || undefined,
  });

  console.log('Token Endpoint Response', tokens);
};

export function App() {
  if (window.location.pathname === '/oauth/callback') {
    execOauth();
    return <div>OAuth callback received. Wait</div>;
  }

  return (
    <ServersProvider>
      <OverlaysProvider>
        <GeoObjectsProvider>
          <MapView />
        </GeoObjectsProvider>
      </OverlaysProvider>
    </ServersProvider>
  );
}
