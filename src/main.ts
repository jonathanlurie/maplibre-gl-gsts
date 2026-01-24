import "maplibre-gl/dist/maplibre-gl.css";
import './style.css'
import { Protocol, TileType } from "pmtiles";
import {imageBitmapToCanvas } from './lib/tools.ts';
import { ShadyGroove } from './lib/ShadyGroove.ts';
import { getStyle } from 'basemapkit';
import maplibregl from 'maplibre-gl';
import type { TileIndex } from "./lib/types.ts";

const appDiv = document.getElementById('app') as HTMLDivElement;

const f2 = async () => {
  const sg = new ShadyGroove({
    urlPattern: "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
    terrainEncoding: "terrarium",
    color: [12, 34, 69],
  });

  const tileImageBitmap = await sg.computeTileGl(
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

  const terrainEncoding = "terrarium";
  const mapterhornTileJson = "https://tiles.mapterhorn.com/tile.json";
  const mapterhornUrlPattern = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"

  const sg = new ShadyGroove({
    urlPattern: mapterhornUrlPattern,
    terrainEncoding,
    color: [36, 70, 125],
    maxzoom: 16,
    alpha: 0.5,
  });

  // Register custom protocolfor this instance of ShadyGroove
  maplibregl.addProtocol(sg.getProtocolName(), sg.getProtocolLoadFunction());

  const style = getStyle("avenue", {
    pmtiles: "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/planet.pmtiles",
    sprite: "https://raw.githubusercontent.com/jonathanlurie/phosphor-mlgl-sprite/refs/heads/main/sprite/phosphor-diecut",
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    lang: "en",
    hidePOIs: true,
    globe: true,
    terrain: {
      tilejson: mapterhornTileJson,
      encoding: terrainEncoding,
      hillshading: true,
    }
  });

  console.log(style);
  

  const map = new maplibregl.Map({
    container: "app",
    hash: true,
    style: style,
    maxPitch: 80,
  });

  // map.showTileBoundaries = true;

  await new Promise((resolve) => map.on("load", resolve));

  sg.addToMap(map, "water_stream");

  // Adding a checkbox to toggle the visibility of the ShadyGroove layer
  const checkboxLayer = document.getElementById("toggle-layer-cb") as HTMLInputElement;
  checkboxLayer.addEventListener("change", () => {
    sg.setVisibility(checkboxLayer.checked)
  })
} 




// Using pmtiles for terrain and custom loading function
const f4 = async () => {
  // Keeping a ref so that 
  const pmTilesProtocol = new Protocol();

  // Register the PMTiles protocol
  maplibregl.addProtocol("pmtiles", pmTilesProtocol.tile);

  const pmtilesTerrain = "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/terrain-mapterhorn.pmtiles";
  const terrainEncoding = "terrarium";
  
  const style = getStyle("avenue", {
    pmtiles: "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/planet.pmtiles",
    sprite: "https://raw.githubusercontent.com/jonathanlurie/phosphor-mlgl-sprite/refs/heads/main/sprite/phosphor-diecut",
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    lang: "en",
    hidePOIs: true,
    globe: true,
    terrain: {
      pmtiles: pmtilesTerrain,
      encoding: terrainEncoding,
      hillshading: true,
    }
  });  

  const map = new maplibregl.Map({
    container: "app",
    hash: true,
    style: style,
    maxPitch: 80,
  });

  await new Promise((resolve) => map.on("load", resolve));

  // Getting the PMTiles instnace that is already used to display hillshading
  const terrainPm = pmTilesProtocol.tiles.get(pmtilesTerrain);

  if (!terrainPm) {
    throw new Error("The PMTiles instance for terrain does not exist.");
  }

  const terrainPmHeader = await terrainPm.getHeader();

  const tileTypeToMime: Record<number, string> = {
    [TileType.Avif]: "image/avif",
    [TileType.Jpeg]: "image/jpeg",
    [TileType.Webp]: "image/webp",
    [TileType.Png]: "image/png",
  };
  
  const tileMime = tileTypeToMime[terrainPmHeader.tileType];
  
  if (!tileMime) {
    throw new Error("The terrain tile format must be avif, jpeg, webp or png.")
  }

  // This is the customTileImageBitmapMaker callback for the ShadyGroove instance
  // as an alternative to providing a URL pattern for {z}{x}{y} tiles.
  // Here we are reusing the the PMTiles instance that is internal to the PMTiles' Protocol
  // instance declared above so that we can reuse the cached tiles originally used for hillshading
  const tileIndexToImageBitmap = async (tileIndex: TileIndex, abortSignal?: AbortSignal): Promise<ImageBitmap | null> => {
    const tileRangeResponse = await terrainPm.getZxy(tileIndex.z, tileIndex.x, tileIndex.y, abortSignal);  
    const tileBuffer = tileRangeResponse?.data;

    if (!tileBuffer) {
      return null;
    }
  
    const blob = new Blob([tileBuffer], { type: tileMime });    
    return await createImageBitmap(blob);
  }

  const sg = new ShadyGroove({
    customTileImageBitmapMaker: tileIndexToImageBitmap,
    terrainEncoding,
    color: [36, 70, 125],
    maxzoom: terrainPmHeader.maxZoom,
    minzoom: terrainPmHeader.minZoom,
    alpha: 0.5,
  });

  // Register custom protocol for this instance of ShadyGroove
  maplibregl.addProtocol(sg.getProtocolName(), sg.getProtocolLoadFunction());

  sg.addToMap(map, "water_stream");

  // Adding a checkbox to toggle the visibility of the ShadyGroove layer
  const checkboxLayer = document.getElementById("toggle-layer-cb") as HTMLInputElement;
  checkboxLayer.addEventListener("change", () => {
    sg.setVisibility(checkboxLayer.checked)
  })
  
} 

f3();