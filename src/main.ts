import "maplibre-gl/dist/maplibre-gl.css";
import './style.css'
import { Protocol } from "pmtiles";
import {imageBitmapToCanvas } from './lib/tools.ts';
import { ShadyGroove } from './lib/ShadyGroove.ts';
import { getStyle } from 'basemapkit';
import maplibregl from 'maplibre-gl';

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

  const pmtilesTerrain = "https://fsn1.your-objectstorage.com/public-map-data/pmtiles/terrain-mapterhorn.pmtiles";
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


  // Register custom protocol: shadygroove://{z}/{x}/{y}
  maplibregl.addProtocol(ShadyGroove.protocolName, sg.getProtocolLoadFunction());


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
      // exaggeration: 1,
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

  map.addSource("sg-demo-source", sg.createSourceSpecification());

  map.addLayer({
    id: 'sg-demo-layer',
    source: 'sg-demo-source',
    type: 'raster',
    layout: {
      visibility: "visible"
    },
    // paint: {
    //   "raster-opacity": 0.75
    // }
  }, "water_stream" );

  console.log(map);

  const checkboxLayer = document.getElementById("toggle-layer-cb") as HTMLInputElement;
  checkboxLayer.addEventListener("input", () => {
    console.log(checkboxLayer.checked);

    const isVisible = map.getLayoutProperty("sg-demo-layer", "visibility") === "visible";

    if (isVisible) {
      map.setLayoutProperty("sg-demo-layer", "visibility", "none");
    } else {
      map.setLayoutProperty("sg-demo-layer", "visibility", "visible");
    }
     
  })
  
} 

f3();