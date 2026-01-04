import { TileCache } from "./TileCache";
import { buildGaussianKernelFromRadius, createPaddedTileOffscreenCanvas, getNeighborIndex } from "./tools";
import type { RGBColor, TileIndex } from "./types";
import TileWorker from "./tile-worker?worker&inline";
import { defaultGaussianScaleSpaceWeights, type GaussianScaleSpaceWeights, type GaussianScaleSpaceWeightsPerZoomLevel } from "./gaussianScaleSpaceWeights";
import { ProcessingNode, RasterContext, Texture, UNIFORM_TYPE } from "raster-gl";

export type TerrainEncoding = "terrarium" | "mapbox";

const terrariumToElevation = `
// Decoding Terrarium encoding
float terrariumToElevation(vec4 color) {
  return (color.r * 255.0 * 256.0 + color.g * 255.0 + color.b * 255.0 / 256.0) - 32768.0;
}
`.trim();

const elevationToTerrarium = `
// Encoding elevation to Terrarium
vec4 elevationToTerrarium(float elevation) {
  float e = elevation + 32768.0;
  float r = floor(e / 256.0);
  float g = floor(e - r * 256.0);
  float b = (e - r * 256.0 - g) * 256.0;
  return vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
}
`.trim();

const fragmentShaderBlurPass = `
#version 300 es
precision highp float;

const int MAX_KERNEL_SIZE = 121;

in vec2 uv;
out vec4 fragColor;

uniform float u_kernel[MAX_KERNEL_SIZE];
uniform int u_kernelSize;
uniform sampler2D u_tile;
uniform bool u_isHorizontalPass;

${terrariumToElevation}

${elevationToTerrarium}

void main() {
  // Getting texture coordinate in integer
  // ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
  // vec4 color = texelFetch(u_tile, pixelCoord, 0);  // 0 = mip level

  // Size of the texture in number of pixels
  vec2 textureSize = vec2(textureSize(u_tile, 0));

  float unitHorizontalStep = 1. / textureSize.x;
  float unitVerticalStep = 1. / textureSize.y;

  float sum = 0.0;
  vec2 neighborPosition = vec2(uv);
  int halfKernelSize = u_kernelSize / 2;

  for (int i = 0; i < u_kernelSize; i++) {
    if(u_isHorizontalPass) {
      neighborPosition.x = uv.x + float(i - halfKernelSize) * unitHorizontalStep;
    } else {
      neighborPosition.y = uv.y + float(i - halfKernelSize) * unitVerticalStep; 
    }
      
    vec4 color = texture(u_tile, neighborPosition);
    float elevation = terrariumToElevation(color);
    sum += u_kernel[i] * elevation;
  }

  fragColor = elevationToTerrarium(sum);
}
`.trim();

const fragmentShaderCombine = `
#version 300 es
precision highp float;

#define PI 3.141592653589793

in vec2 uv;
out vec4 fragColor;

uniform vec3 u_tint;

uniform float u_weightLowPass_3;
uniform float u_weightLowPass_7;
uniform float u_weightLowPass_15;
uniform float u_weightLowPass_30;
uniform float u_weightLowPass_60;

uniform sampler2D u_tile;
uniform sampler2D u_tileLowPass_3;
uniform sampler2D u_tileLowPass_7;
uniform sampler2D u_tileLowPass_15;
uniform sampler2D u_tileLowPass_30;
uniform sampler2D u_tileLowPass_60;

${terrariumToElevation}


float easeOutSine(float value, float maxValue, float scale) {
  return sin(((min(value, maxValue) / maxValue) * PI) / 2.) * scale;
}


void main() {
  float eleTile = terrariumToElevation(texture(u_tile, uv));
  float eleTileLowPass3 = terrariumToElevation(texture(u_tileLowPass_3, uv));
  float eleTileLowPass7 = terrariumToElevation(texture(u_tileLowPass_7, uv));
  float eleTileLowPass15 = terrariumToElevation(texture(u_tileLowPass_15, uv));
  float eleTileLowPass30 = terrariumToElevation(texture(u_tileLowPass_30, uv));
  float eleTileLowPass60 = terrariumToElevation(texture(u_tileLowPass_60, uv));

  float eleDeltaLowPass3 = max(0., eleTileLowPass3 - eleTile);
  float eleDeltaLowPass7 = max(0., eleTileLowPass7 - eleTile);
  float eleDeltaLowPass15 = max(0., eleTileLowPass15 - eleTile);
  float eleDeltaLowPass30 = max(0., eleTileLowPass30 - eleTile);
  float eleDeltaLowPass60 = max(0., eleTileLowPass60 - eleTile);

  float multiresWeightedDelta = (eleDeltaLowPass3 * u_weightLowPass_3)
    + (eleDeltaLowPass7 * u_weightLowPass_7)
    + (eleDeltaLowPass15 * u_weightLowPass_15)
    + (eleDeltaLowPass30 * u_weightLowPass_30)
    + (eleDeltaLowPass60 * u_weightLowPass_60);

  float easedValue = easeOutSine(multiresWeightedDelta, 2000., 1.);

  fragColor = vec4(u_tint.r, u_tint.g, u_tint.b, easedValue);
}

`.trim();





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
  minzoom: 0,
  maxzoom: 12,
}

/**
 * Gaussian Scale-space Terrain Shading
 */
export class GSTS {
  private readonly urlPattern: string;
  private readonly tileCache = new TileCache();
  private readonly padding = 60;
  private readonly terrainEncoding: TerrainEncoding;
  private readonly gaussianScaleSpaceWeights: GaussianScaleSpaceWeightsPerZoomLevel;
  private readonly color: RGBColor
  private rctx!: RasterContext;
  private lowPassHorizontalNode!: ProcessingNode;
  private lowPassVerticalNode!: ProcessingNode;
  private combineNode!: ProcessingNode;

  constructor(options: GSTSOptions) {
    this.urlPattern = options.urlPattern;
    this.terrainEncoding = options.terrainEncoding;
    this.gaussianScaleSpaceWeights = {
      ...defaultGaussianScaleSpaceWeights,
      ...(options.gaussianScaleSpaceWeights ?? {}),
    }
    this.color = options.color ?? [0, 0, 0];
  }

  private initGl(tileSize: number) {
    if (this.rctx) return;

    this.rctx = new RasterContext({
      width: tileSize + 2 * this.padding,
      height: tileSize + 2 * this.padding,
      offscreen: true,
    });

    this.lowPassHorizontalNode = new ProcessingNode(this.rctx, {
      renderToTexture: true,
      reuseOutputTexture: false,
    });

    this.lowPassHorizontalNode.setShaderSource({
      fragmentShaderSource: fragmentShaderBlurPass,
    });

    this.lowPassVerticalNode = new ProcessingNode(this.rctx, {
      renderToTexture: true,
      reuseOutputTexture: false,
    });

    this.lowPassVerticalNode.setShaderSource({
      fragmentShaderSource: fragmentShaderBlurPass,
    });

    this.combineNode = new ProcessingNode(this.rctx, { renderToTexture: false });

    this.combineNode.setShaderSource({
      fragmentShaderSource: fragmentShaderCombine,
    });
  }


  async computeTile(tileIndex: TileIndex,
    options: {
      abortSignal?: AbortSignal,
    } = {}
  ): Promise<ImageBitmap | null> {
    const tilePromises = await Promise.allSettled([
      this.tileCache.getTile(tileIndex, this.urlPattern, options.abortSignal), // center
      this.tileCache.getTile(getNeighborIndex(tileIndex, "N"), this.urlPattern, options.abortSignal), // north
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NE"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "E"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SE"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "S"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SW"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "W"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NW"), this.urlPattern, options.abortSignal),
    ]);

    if (tilePromises[0].status !== "fulfilled" || !tilePromises[0].value) {
      return null;
    }

    if(options.abortSignal?.aborted) {
      return null;
    }
    
    const imageBitmaps = tilePromises.map((res) => res.status === "fulfilled" ? res.value : null);
    const paddedCanvas = createPaddedTileOffscreenCanvas(imageBitmaps, this.padding);
    const paddedTile = await createImageBitmap(paddedCanvas);
    const tileSize = imageBitmaps[0]?.width as number;

    return new Promise((resolve) => {
      const tileWorker = new TileWorker();

      options.abortSignal?.addEventListener("abort", () => {
        console.log("ABORT tile: ", tileIndex);
        tileWorker.terminate();
      },
      // { once: true },
    );

      tileWorker.postMessage({
        tileIndex,
        tileSize,
        terrainEncoding: this.terrainEncoding,
        paddedTile,
        padding: this.padding,
        gaussianScaleSpaceWeights: this.gaussianScaleSpaceWeights[tileIndex.z],
        color: this.color,
      }, [paddedTile]);
      
      tileWorker.onmessage = (e: MessageEvent<ImageBitmap>) => {
        tileWorker.terminate();
        resolve(e.data)
      }
      
    })
  }







  async computeTileGl(tileIndex: TileIndex,
    options: {
      abortSignal?: AbortSignal,
    } = {}
  ): Promise<ImageBitmap | null> {
    const tilePromises = await Promise.allSettled([
      this.tileCache.getTile(tileIndex, this.urlPattern, options.abortSignal), // center
      this.tileCache.getTile(getNeighborIndex(tileIndex, "N"), this.urlPattern, options.abortSignal), // north
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NE"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "E"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SE"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "S"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "SW"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "W"), this.urlPattern, options.abortSignal),
      this.tileCache.getTile(getNeighborIndex(tileIndex, "NW"), this.urlPattern, options.abortSignal),
    ]);    

    if (tilePromises[0].status !== "fulfilled" || !tilePromises[0].value) {
      return null;
    }

    if(options.abortSignal?.aborted) {
      return null;
    }
    
    const imageBitmaps = tilePromises.map((res) => res.status === "fulfilled" ? res.value : null);
    const paddedCanvas = createPaddedTileOffscreenCanvas(imageBitmaps, this.padding);
    const paddedTile = await createImageBitmap(paddedCanvas);
    const tileSize = imageBitmaps[0]?.width as number;
    const gaussianScaleSpaceWeights = this.gaussianScaleSpaceWeights[tileIndex.z];

    this.initGl(tileSize);

    console.time("compute GL");

    const tex = Texture.fromImageSource(this.rctx, paddedTile);
    
    const lowPassTextures: Record<number, Texture | null> = {
      3: null,
      7: null,
      15: null,
      30: null,
      60: null,
    } as const;

    const kernelRadii = Object.keys(lowPassTextures).map((r) => Number.parseInt(r, 10));

    for (const radius of kernelRadii) {
      const kernel = Array.from(buildGaussianKernelFromRadius(radius));

      this.lowPassHorizontalNode.setUniformNumber("u_kernel", kernel);
      this.lowPassHorizontalNode.setUniformNumber("u_kernelSize", kernel.length, UNIFORM_TYPE.INT);
      this.lowPassHorizontalNode.setUniformBoolean("u_isHorizontalPass", true);
      this.lowPassHorizontalNode.setUniformTexture2D("u_tile", tex);
      this.lowPassHorizontalNode.render();

      this.lowPassVerticalNode.setUniformNumber("u_kernel", kernel);
      this.lowPassVerticalNode.setUniformNumber("u_kernelSize", kernel.length, UNIFORM_TYPE.INT);
      this.lowPassVerticalNode.setUniformBoolean("u_isHorizontalPass", false);
      this.lowPassVerticalNode.setUniformTexture2D("u_tile", this.lowPassHorizontalNode);
      this.lowPassVerticalNode.render();

      lowPassTextures[radius] = this.lowPassVerticalNode.getOutputTexture();
    }

    this.combineNode.setUniformRGB("u_tint", this.color);
    this.combineNode.setUniformTexture2D("u_tile", tex);
    this.combineNode.setUniformNumber("u_weightLowPass_3", gaussianScaleSpaceWeights.hKernel3);
    this.combineNode.setUniformNumber("u_weightLowPass_7", gaussianScaleSpaceWeights.hKernel7);
    this.combineNode.setUniformNumber("u_weightLowPass_15", gaussianScaleSpaceWeights.hKernel15);
    this.combineNode.setUniformNumber("u_weightLowPass_30", gaussianScaleSpaceWeights.hKernel30);
    this.combineNode.setUniformNumber("u_weightLowPass_60", gaussianScaleSpaceWeights.hKernel60);

    this.combineNode.setUniformTexture2D("u_tileLowPass_3", lowPassTextures[3] as Texture);
    this.combineNode.setUniformTexture2D("u_tileLowPass_7", lowPassTextures[7] as Texture);
    this.combineNode.setUniformTexture2D("u_tileLowPass_15", lowPassTextures[15] as Texture);
    this.combineNode.setUniformTexture2D("u_tileLowPass_30", lowPassTextures[30] as Texture);
    this.combineNode.setUniformTexture2D("u_tileLowPass_60", lowPassTextures[60] as Texture);

    this.combineNode.render();

    // const pixelData = combineNode.getPixelData();
    console.timeEnd("compute GL");

    const imageBitmap = await this.combineNode.getImageBitmap({
      x: this.padding,
      y: this.padding,
      w: tileSize,
      h: tileSize,
    });

    this.rctx.free();

    return imageBitmap
  }
}

