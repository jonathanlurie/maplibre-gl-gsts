import { TileCache } from "./TileCache";
import { createPaddedTileOffscreenCanvas, getNeighborIndex } from "./tools";
import type { RGBColor, TileIndex } from "./types";
import TileWorker from "./tile-worker?worker&inline";
import { defaultGaussianScaleSpaceWeights, type GaussianScaleSpaceWeights, type GaussianScaleSpaceWeightsPerZoomLevel } from "./gaussianScaleSpaceWeights";

export type TerrainEncoding = "terrarium" | "mapbox";

export type TileProcesingWorkerMessage = {
  tileIndex: TileIndex,
  paddedTile: ImageBitmap,
  padding: number,
  terrainEncoding: TerrainEncoding,
  gaussianScaleSpaceWeights: GaussianScaleSpaceWeights,
  color: RGBColor,
  tileSize: number,
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

  async computeTile(tileIndex: TileIndex): Promise<ImageBitmap> {
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
    const paddedCanvas = createPaddedTileOffscreenCanvas(imageBitmaps, this.padding);

    const paddedTile = await createImageBitmap(paddedCanvas);

    const tileSize = imageBitmaps[0]?.width as number;
    

    return new Promise((resolve) => {
      const tileWorker = new TileWorker();

      tileWorker.postMessage({
        tileIndex,
        tileSize,
        terrainEncoding: this.terrainEncoding,
        paddedTile,
        padding: this.padding,
        gaussianScaleSpaceWeights: this.gaussianScaleSpaceWeights[tileIndex.z],
        color: this.color,
      }, 
      [
        paddedTile,
      ]
      );
      
      tileWorker.onmessage = (e: MessageEvent<ImageBitmap>) => {
        tileWorker.terminate();
        resolve(e.data)
      }
    })
  }
}

