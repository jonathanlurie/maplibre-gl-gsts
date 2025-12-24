import { TileCache } from "./TileCache";
import { getNeighborIndex } from "./tools";
import type { RGBColor, TileIndex } from "./types";
import TileWorker from "./tile-worker?worker&inline";
import { defaultGaussianScaleSpaceWeights, type GaussianScaleSpaceWeights, type GaussianScaleSpaceWeightsPerZoomLevel } from "./gaussianScaleSpaceWeights";

export type TerrainEncoding = "terrarium" | "mapbox";

export type TileProcesingWorkerMessage = {
  tileIndex: TileIndex,
  imageBitmaps: (ImageBitmap | null)[],
  padding: number,
  terrainEncoding: TerrainEncoding,
  gaussianScaleSpaceWeights: GaussianScaleSpaceWeights,
  color: RGBColor,
}

export type GSTSOptions = {
  urlPattern: string,
  terrainEncoding: TerrainEncoding;
  gaussianScaleSpaceWeights?: GaussianScaleSpaceWeightsPerZoomLevel
  color?: RGBColor,
}

/**
 * Gaussian Scale-space Terrain Shading
 */
export class GSTS {
  private readonly urlPattern: string;
  private readonly tileCache = new TileCache();
  private readonly padding = 30;
  private readonly terrainEncoding: TerrainEncoding;
  private readonly gaussianScaleSpaceWeights: GaussianScaleSpaceWeightsPerZoomLevel;
  private readonly color: RGBColor

  constructor(options: GSTSOptions) {
    this.urlPattern = options.urlPattern;
    this.terrainEncoding = options.terrainEncoding;
    this.gaussianScaleSpaceWeights = {
      ...defaultGaussianScaleSpaceWeights,
      ...(options.gaussianScaleSpaceWeights ?? {}),
    }
    this.color = options.color ?? [0, 0, 0];
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

    return new Promise((resolve) => {
      console.time("worker")
      const tileWorker = new TileWorker();

      tileWorker.postMessage({
        tileIndex,
        terrainEncoding: this.terrainEncoding,
        imageBitmaps,
        padding: this.padding,
        gaussianScaleSpaceWeights: this.gaussianScaleSpaceWeights[tileIndex.z],
        color: this.color,
      }, imageBitmaps.filter((el) => el !== null));
      
      tileWorker.onmessage = (e: MessageEvent<ImageBitmap>) => {
        console.timeEnd("worker")
        tileWorker.terminate();
        resolve(e.data)
      }
    })
  }
}

