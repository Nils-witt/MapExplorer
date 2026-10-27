// A MapLibre custom layer that draws units as 3D models with three.js,
// sharing the map's WebGL context and depth buffer. Each unit gets the
// built-in vehicle (or the deployment's glTF model), turned to its course
// and carrying its tactical symbol on the roof and, for the vehicle, on
// both sides.
//
// The scene is laid out in meters around the map center (x east, y north,
// z up), so float32 positions on the GPU stay precise; the camera matrix
// maps that frame onto MapLibre's mercator projection every frame.
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Camera,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MercatorCoordinate } from 'maplibre-gl';
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from 'maplibre-gl';

export interface UnitModelInput {
  key: string;
  lat: number;
  lon: number;
  // Degrees clockwise from true north; null faces north.
  course: number | null;
  // The tactical symbol as an image URL, or null without one.
  symbolUrl: string | null;
}

// The space on a model for its symbol, in model meters: a horizontal
// rectangle on the roof, and optionally vertical ones on both sides.
interface SymbolSlots {
  roof: { z: number; width: number; length: number };
  sides: { x: number; z: number; length: number; height: number } | null;
}

interface SymbolTexture {
  texture: Texture;
  // Width over height.
  aspect: number;
}

interface UnitObject {
  root: Group;
  lat: number;
  lon: number;
  symbolUrl: string | null;
  symbol: SymbolTexture | null;
  symbolMaterial: MeshBasicMaterial | null;
}

// The built-in vehicle, in meters; it faces +y (north).
const VEHICLE = {
  width: 2.4,
  length: 6.9,
  clearance: 0.45,
  boxLength: 5,
  boxHeight: 2.7,
  cabLength: 1.9,
  cabHeight: 2.1,
};

// The map's tile size, which sets how many pixels the world is wide.
const TILE_SIZE = 512;

export class UnitModelLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom';
  readonly renderingMode = '3d';

  private map: MaplibreMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new Camera();
  private readonly units = new Map<string, UnitObject>();
  private minSizePx = 50;
  private disposed = false;

  // The glTF model, once loaded; until then (or without one) the vehicle.
  private template: Object3D | null = null;
  private templateSlots: SymbolSlots | null = null;
  private templateLength = 0;

  private readonly geometries = {
    box: new BoxGeometry(1, 1, 1),
    wheel: new CylinderGeometry(0.45, 0.45, 0.3, 16).rotateZ(Math.PI / 2),
    plane: new PlaneGeometry(1, 1),
  };
  private readonly materials = {
    body: new MeshLambertMaterial({ color: 0xeeeeee }),
    cab: new MeshLambertMaterial({ color: 0xd8d8d8 }),
    glass: new MeshLambertMaterial({ color: 0x2c3e50 }),
    wheel: new MeshLambertMaterial({ color: 0x222222 }),
  };

  // Scratch values for render().
  private readonly mainMatrix = new Matrix4();
  private readonly originMatrix = new Matrix4();
  private readonly originScale = new Vector3();

  constructor(id: string, modelUrl?: string) {
    this.id = id;
    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.8);
    sun.position.set(-0.5, -1, 2);
    this.scene.add(sun);
    if (modelUrl) {
      new GLTFLoader()
        .loadAsync(modelUrl)
        .then((gltf) => {
          if (!this.disposed) {
            this.setTemplate(gltf.scene);
          }
        })
        .catch((error) => {
          console.error(`Failed to load unit model ${modelUrl}:`, error);
        });
    }
  }

  onAdd(map: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
  }

  // Also called when the map's style changes; the scene is kept so the
  // layer can be added again.
  onRemove() {
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  // Models are drawn at least this many pixels long on screen.
  setMinSize(px: number) {
    this.minSizePx = px;
    this.map?.triggerRepaint();
  }

  setUnits(inputs: UnitModelInput[]) {
    const keys = new Set(inputs.map((input) => input.key));
    for (const [key, unit] of this.units) {
      if (!keys.has(key)) {
        this.removeUnit(unit);
        this.units.delete(key);
      }
    }
    for (const input of inputs) {
      let unit = this.units.get(input.key);
      if (!unit) {
        unit = {
          root: new Group(),
          lat: input.lat,
          lon: input.lon,
          symbolUrl: null,
          symbol: null,
          symbolMaterial: null,
        };
        this.units.set(input.key, unit);
        this.scene.add(unit.root);
        this.populate(unit);
      }
      unit.lat = input.lat;
      unit.lon = input.lon;
      unit.root.rotation.z = -((input.course ?? 0) * Math.PI) / 180;
      if (unit.symbolUrl !== input.symbolUrl) {
        this.setSymbol(unit, input.symbolUrl);
      }
    }
    this.map?.triggerRepaint();
  }

  render(_gl: WebGLRenderingContext, options: CustomRenderMethodInput) {
    const { map, renderer } = this;
    if (!map || !renderer || this.units.size === 0) {
      return;
    }
    const origin = MercatorCoordinate.fromLngLat(map.getCenter(), 0);
    const mercatorPerMeter = origin.meterInMercatorCoordinateUnits();
    const metersPerPixel =
      1 / (TILE_SIZE * 2 ** map.getZoom()) / mercatorPerMeter;
    const scale = Math.max(
      1,
      (this.minSizePx * metersPerPixel) / this.modelLength(),
    );
    for (const unit of this.units.values()) {
      const position = MercatorCoordinate.fromLngLat([unit.lon, unit.lat], 0);
      unit.root.position.set(
        (position.x - origin.x) / mercatorPerMeter,
        -(position.y - origin.y) / mercatorPerMeter,
        0,
      );
      unit.root.scale.setScalar(scale);
    }

    this.originMatrix
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(
        this.originScale.set(
          mercatorPerMeter,
          -mercatorPerMeter,
          mercatorPerMeter,
        ),
      );
    this.camera.projectionMatrix
      .copy(this.mainMatrix.fromArray(options.defaultProjectionData.mainMatrix))
      .multiply(this.originMatrix);
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();
    renderer.resetState();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    for (const unit of this.units.values()) {
      this.removeUnit(unit);
    }
    this.units.clear();
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.template?.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials: Material[] = [object.material].flat();
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private modelLength(): number {
    return this.template ? this.templateLength : VEHICLE.length;
  }

  private setTemplate(scene: Object3D) {
    // glTF is y up and faces +z; turn it to z up, facing +y.
    scene.rotation.set(Math.PI / 2, Math.PI, 0);
    const wrapper = new Group().add(scene);
    wrapper.updateMatrixWorld(true);
    const box = new Box3().setFromObject(wrapper);
    // Stand it on the ground, centered.
    scene.position.set(
      -(box.min.x + box.max.x) / 2,
      -(box.min.y + box.max.y) / 2,
      -box.min.z,
    );
    const size = box.getSize(new Vector3());
    this.template = wrapper;
    this.templateLength = Math.max(size.x, size.y, size.z) || 1;
    this.templateSlots = {
      roof: { z: size.z, width: size.x, length: size.y },
      sides: null,
    };
    for (const unit of this.units.values()) {
      this.populate(unit);
    }
    this.map?.triggerRepaint();
  }

  // (Re)builds a unit's model and symbol planes.
  private populate(unit: UnitObject) {
    unit.root.clear();
    unit.root.add(this.template ? this.template.clone() : this.vehicle());
    if (!unit.symbol || !unit.symbolMaterial) {
      return;
    }
    const { aspect } = unit.symbol;
    const slots = this.template ? this.templateSlots! : vehicleSlots();
    const lift = 0.03;

    const [roofWidth, roofLength] = fit(
      aspect,
      slots.roof.width * 0.9,
      slots.roof.length * 0.9,
    );
    const roof = new Mesh(this.geometries.plane, unit.symbolMaterial);
    roof.scale.set(roofWidth, roofLength, 1);
    roof.position.z = slots.roof.z + lift;
    unit.root.add(roof);

    if (slots.sides) {
      const { x, z, length, height } = slots.sides;
      const [sideLength, sideHeight] = fit(aspect, length, height);
      // Upright and readable from outside: the image's top points up and
      // its right side towards the front on the right, the back on the left.
      for (const side of [1, -1]) {
        const plane = new Mesh(this.geometries.plane, unit.symbolMaterial);
        plane.scale.set(sideLength, sideHeight, 1);
        plane.rotation.set(Math.PI / 2, (side * Math.PI) / 2, 0);
        plane.position.set(side * (x + lift), 0, z);
        unit.root.add(plane);
      }
    }
  }

  private vehicle(): Group {
    const { width, clearance, boxLength, boxHeight, cabLength, cabHeight } =
      VEHICLE;
    const back = -VEHICLE.length / 2;
    const vehicle = new Group();
    const box = new Mesh(this.geometries.box, this.materials.body);
    box.scale.set(width, boxLength, boxHeight);
    box.position.set(0, back + boxLength / 2, clearance + boxHeight / 2);
    const cab = new Mesh(this.geometries.box, this.materials.cab);
    cab.scale.set(width, cabLength, cabHeight);
    cab.position.set(
      0,
      back + boxLength + cabLength / 2,
      clearance + cabHeight / 2,
    );
    const windshield = new Mesh(this.geometries.box, this.materials.glass);
    windshield.scale.set(width * 0.9, 0.05, cabHeight * 0.4);
    windshield.position.set(
      0,
      back + boxLength + cabLength,
      clearance + cabHeight * 0.7,
    );
    vehicle.add(box, cab, windshield);
    for (const y of [back + 1.2, back + boxLength + cabLength * 0.5]) {
      for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
        const wheel = new Mesh(this.geometries.wheel, this.materials.wheel);
        wheel.position.set(x, y, 0.45);
        vehicle.add(wheel);
      }
    }
    return vehicle;
  }

  private setSymbol(unit: UnitObject, symbolUrl: string | null) {
    unit.symbolUrl = symbolUrl;
    this.clearSymbol(unit);
    this.populate(unit);
    if (!symbolUrl) {
      return;
    }
    loadSymbolTexture(symbolUrl)
      .then((symbol) => {
        // Dropped, or the symbol changed again, while it was loading.
        if (
          this.disposed ||
          unit.symbolUrl !== symbolUrl ||
          !unit.root.parent
        ) {
          symbol.texture.dispose();
          return;
        }
        unit.symbol = symbol;
        unit.symbolMaterial = new MeshBasicMaterial({
          map: symbol.texture,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        });
        this.populate(unit);
        this.map?.triggerRepaint();
      })
      .catch((error) => {
        console.error('Failed to render unit symbol:', error);
      });
  }

  private clearSymbol(unit: UnitObject) {
    unit.symbol?.texture.dispose();
    unit.symbolMaterial?.dispose();
    unit.symbol = null;
    unit.symbolMaterial = null;
  }

  private removeUnit(unit: UnitObject) {
    this.clearSymbol(unit);
    unit.root.removeFromParent();
  }
}

function vehicleSlots(): SymbolSlots {
  const { width, clearance, boxLength, boxHeight } = VEHICLE;
  return {
    roof: {
      z: clearance + boxHeight,
      width,
      length: boxLength,
    },
    sides: {
      x: width / 2,
      z: clearance + boxHeight / 2,
      length: boxLength * 0.85,
      height: boxHeight * 0.75,
    },
  };
}

// The largest [width, height] of the given aspect that fits the box.
function fit(aspect: number, width: number, height: number): number[] {
  return aspect > width / height
    ? [width, width / aspect]
    : [height * aspect, height];
}

// Rasterizes the symbol, as WebGL can't use SVGs as textures.
async function loadSymbolTexture(url: string): Promise<SymbolTexture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const aspect =
    image.naturalWidth && image.naturalHeight
      ? image.naturalWidth / image.naturalHeight
      : 1;
  const canvas = document.createElement('canvas');
  canvas.height = 256;
  canvas.width = Math.round(256 * aspect);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect };
}
