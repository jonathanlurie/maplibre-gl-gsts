import "maplibre-gl/dist/maplibre-gl.css";
import './style.css'
import { Protocol } from "pmtiles";
import {imageBitmapToCanvas } from './lib/tools.ts';
import { GSTS } from './lib/GSTS.ts';
import { getStyle } from 'basemapkit';
import maplibregl from 'maplibre-gl';

const appDiv = document.getElementById('app') as HTMLDivElement;

const f2 = async () => {
  const gsts = new GSTS({
    urlPattern: "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
    terrainEncoding: "terrarium",
    color: [12, 34, 69],
  });

  const tileImageBitmap = await gsts.computeTileGl(
    // {z: 16, x: 34261, y: 23134}
    // {z: 10, x: 532, y: 363}
    {z: 11, x: 1066, y: 728}
  );

  if (!tileImageBitmap) {
    throw new Error("Tile is null");
  }

  const canvas = imageBitmapToCanvas(tileImageBitmap);
  appDiv.append(canvas);
}

const f3 = async () => {
  maplibregl.addProtocol("pmtiles", new Protocol().tile);

  const pmtilesTerrain = "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/terrain-mapterhorn.pmtiles";
  const terrainEncoding = "terrarium";
  const mapterhornTileJson = "https://tiles.mapterhorn.com/tile.json";
  const mapterhornUrlPattern = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"

  const gsts = new GSTS({
    urlPattern: mapterhornUrlPattern,
    terrainEncoding,
    color: [36, 70, 125]
  });


  // Register custom protocol: gsts://{z}/{x}/{y}
  maplibregl.addProtocol("gsts", async ({ url }, abortController) => {
    try {
      const urlObj = new URL(url);
      const urlParams = urlObj.searchParams
      const z = Number.parseInt(urlParams.get("z") as string);
      const x = Number.parseInt(urlParams.get("x") as string);
      const y = Number.parseInt(urlParams.get("y") as string);
      
      const tile = await gsts.computeTileGl({ z, x, y }, { abortSignal: abortController?.signal });

      // MapLibre protocols can return ImageBitmap directly
      // MapLibre custom protocols can return these raster data types:
      // - ImageBitmap (what you're using)
      // - HTMLImageElement
      // - ImageData
      // - ArrayBuffer (for encoded image formats like PNG, JPEG, WebP)
      // - { data: Uint8Array | Uint8ClampedArray, width: number, height: number } (raw RGBA pixels)
      return { data: tile };
    } catch (err) {
      if (abortController?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      throw err;
    }
  });











  


  const style = getStyle("avenue", {
    pmtiles: "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/planet.pmtiles",
    sprite: "https://raw.githubusercontent.com/jonathanlurie/phosphor-mlgl-sprite/refs/heads/main/sprite/phosphor-diecut",
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    lang: "en",
    hidePOIs: true,
    globe: true,
    terrain: {
      // pmtiles: pmtilesTerrain,
      tilejson: mapterhornTileJson,
      encoding: terrainEncoding,
      hillshading: true,
      exaggeration: 0,
    }
  });

  console.log(style);
  

  const map = new maplibregl.Map({
    container: "app",
    hash: true,
    style: style,
    maxPitch: 80,
  });

  map.showTileBoundaries = true;

  await new Promise((resolve) => map.on("load", resolve));


  

  map.addSource("gsts-demo-source", {
    type: "raster",
    tiles: ["gsts://info?z={z}&x={x}&y={y}"],
    tileSize: 512,
    maxzoom: 14,
  });

  map.addLayer({
    id: 'gsts-demo-layer',
    source: 'gsts-demo-source',
    type: 'raster',
    layout: {
      visibility: "visible"
    },
    paint: {
      "raster-opacity": 0.75
    }
  }, "water_stream" );

  console.log(map);

  const checkboxLayer = document.getElementById("toggle-layer-cb") as HTMLInputElement;
  checkboxLayer.addEventListener("input", () => {
    console.log(checkboxLayer.checked);

    const isVisible = map.getLayoutProperty("gsts-demo-layer", "visibility") === "visible";

    if (isVisible) {
      map.setLayoutProperty("gsts-demo-layer", "visibility", "none");
    } else {
      map.setLayoutProperty("gsts-demo-layer", "visibility", "visible");
    }
     
  })
  
}

f3();