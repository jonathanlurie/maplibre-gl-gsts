import { TileCache } from "./TileCache";
import { computeElevationDelta, createPaddedTileOffscreenCanvas, filterFloatImage, floatImageToCanvas, gaussianBlurImageData, getElevationData, getNeighborIndex, makeEaseOuSineFilter, sumFloatImages, trimPaddedTile } from "./tools";
import type { TileIndex } from "./types";

import TileWorker from "./tile-worker?worker&inline";

export type TerrainEncoding = "terrarium" | "mapbox";

export type TileProcesingWorkerMessage = {
  tileIndex: TileIndex,
  imageBitmaps: (ImageBitmap | null)[],
  padding: number,
  terrainEncoding: TerrainEncoding,
}

export type GSTSOptions = {
  urlPattern: string,
  terrainEncoding: TerrainEncoding;
}

/**
 * Gaussian Scale-space Terrain Shading
 */
export class GSTS {
  private readonly urlPattern: string;
  private readonly tileCache = new TileCache();
  private readonly padding = 30;
  private readonly terrainEncoding: TerrainEncoding;

  constructor(options: GSTSOptions) {
    this.urlPattern = options.urlPattern;
    this.terrainEncoding = options.terrainEncoding;
  }

  async preparePaddedTile(tileIndex: TileIndex): Promise<OffscreenCanvas> {
    const tilePromises = await Promise.allSettled([
      this.tileCache.getTile(tileIndex, this.urlPattern), // center
      this.tileCache.getTile(getNeighborIndex(tileIndex, "N"), this.urlPattern), // north
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NE"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "E"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SE"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "S"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SW"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "W"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NW"), this.urlPattern),
    ])

    const imageBitmaps = tilePromises.map((res) => res.status === "fulfilled" ? res.value : null);

    console.time("Prepare padded tile");
    const canvas = createPaddedTileOffscreenCanvas(imageBitmaps, this.padding);
    console.timeEnd("Prepare padded tile");
    return canvas;
  }

  async computeTile(tileIndex: TileIndex) {
    
    const paddedTileCanvas = await this.preparePaddedTile(tileIndex);
    

    const tileSize = paddedTileCanvas.width - 2 * this.padding;

    console.time("convert to elevation")
    const elevationData = getElevationData(paddedTileCanvas, this.terrainEncoding);
    console.timeEnd("convert to elevation")

    console.time("blur60")
    const blurredElevation60 = gaussianBlurImageData(elevationData, 60);
    console.timeEnd("blur60")
  
    console.time("blur30")
    const blurredElevation30 = gaussianBlurImageData(elevationData, 30);
    console.timeEnd("blur30")
  
    console.time("blur15")
    const blurredElevation15 = gaussianBlurImageData(elevationData, 15);
    console.timeEnd("blur15")
  
    console.time("blur7")
    const blurredElevation7 = gaussianBlurImageData(elevationData, 7);
    console.timeEnd("blur7")
  
    console.time("blur3")
    const blurredElevation3 = gaussianBlurImageData(elevationData, 3);
    console.timeEnd("blur3")
  
    console.time("Compute delta elevation")
    const eleDeltaBlur60 = computeElevationDelta(blurredElevation60, elevationData, true);
    const eleDeltaBlur30 = computeElevationDelta(blurredElevation30, elevationData, true);
    const eleDeltaBlur15 = computeElevationDelta(blurredElevation15, elevationData, true);
    const eleDeltaBlur7 = computeElevationDelta(blurredElevation7, elevationData, true);
    const eleDeltaBlur3 = computeElevationDelta(blurredElevation3, elevationData, true);
    console.timeEnd("Compute delta elevation")

    console.time("Float sum")
    const intensityFactor = 1;
    const multiResDelta = sumFloatImages([
      {fImg: eleDeltaBlur60, ratio: 0.5 * intensityFactor},
      {fImg: eleDeltaBlur30, ratio: 4 * intensityFactor},
      {fImg: eleDeltaBlur15, ratio: 4 * intensityFactor},
      {fImg: eleDeltaBlur7, ratio: 12 * intensityFactor},
      {fImg: eleDeltaBlur3, ratio: 10 * intensityFactor},
    ]);
    console.timeEnd("Float sum")

    console.time("Filter")
    const filteredMultiResDelta = filterFloatImage(multiResDelta, makeEaseOuSineFilter(2800, 255))
    console.timeEnd("Filter")

    console.time("Convert to canvas")
    const paddedShadedTile = floatImageToCanvas(filteredMultiResDelta, 1, 0);
    console.timeEnd("Convert to canvas")

    console.time("Trim")
    const trimmedShadedImageBitmap = trimPaddedTile(paddedShadedTile, tileSize, this.padding);
    console.timeEnd("Trim")

    return trimmedShadedImageBitmap;
  }

  async computeTileWr(tileIndex: TileIndex): Promise<ImageBitmap> {

    const tilePromises = await Promise.allSettled([
      this.tileCache.getTile(tileIndex, this.urlPattern), // center
      this.tileCache.getTile(getNeighborIndex(tileIndex, "N"), this.urlPattern), // north
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NE"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "E"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SE"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "S"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SW"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "W"), this.urlPattern),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NW"), this.urlPattern),
    ])

    const imageBitmaps = tilePromises.map((res) => res.status === "fulfilled" ? res.value : null);

    // const paddedTileCanvas = await this.preparePaddedTile(tileIndex);
    // const tileSize = paddedTileCanvas.width - 2 * this.padding;


    return new Promise((resolve) => {
      console.time("worker")
      const tileWorker = new TileWorker()

      
      tileWorker.postMessage({
        tileIndex,
        terrainEncoding: this.terrainEncoding,
        imageBitmaps,
        padding: this.padding,
      }, imageBitmaps.filter((el) => el !== null));
      
      tileWorker.onmessage = (e: MessageEvent<ImageBitmap>) => {
        console.timeEnd("worker")
        console.log("DATA", e.data)
        tileWorker.terminate();
        resolve(e.data)

        
      }

    })

    
  }

}

