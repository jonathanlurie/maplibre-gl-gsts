import QuickLRU from "quick-lru";
import {fetchAsImageBitmap, wrapTileIndex } from "./tools";
import type { TileIndex } from "./types";

export type TileCacheOptions = {
  cacheSize?: number;
};

export class TileCache {
  private readonly texturePool: QuickLRU<string, ImageBitmap>;
  private readonly unavailableTextures = new Set<string>();

  constructor(options: TileCacheOptions = {}) {
    const cacheSize = options.cacheSize ?? 1000;

    this.texturePool = new QuickLRU<string, ImageBitmap>({
      maxSize: cacheSize,

      onEviction(_key: string, value: ImageBitmap) {
        console.log("Freeing texture from GPU memory");
        value.close();
      },
    });
  }

  /**
   * Get a texture from its z/x/y index
   * If a tile is already in the cache, it will be retrieved from the cache.
   * If a texture already failed to be retrieved, it is not trying again.
   */
  getTexture(tileIndex: TileIndex, textureUrlPattern: string): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const tileIndexWrapped = wrapTileIndex(tileIndex);
      const textureURL = textureUrlPattern
        .replace("{x}", tileIndexWrapped.x.toString())
        .replace("{y}", tileIndexWrapped.y.toString())
        .replace("{z}", tileIndexWrapped.z.toString());

      // The texture is not existing. An unfruitful attempt was made already
      if (this.unavailableTextures.has(textureURL)) {
        return reject(new Error("Could not load tile data."));
      }

      // The texture is in the pool of already fetched textures
      if (this.texturePool.has(textureURL)) {
        resolve(this.texturePool.get(textureURL) as ImageBitmap);
        return;
      }

      fetchAsImageBitmap(textureURL)
      .then((imgBtmp) => {
        this.texturePool.set(textureURL, imgBtmp);
        resolve(imgBtmp);
      })
      .catch(() => {
        this.unavailableTextures.add(textureURL);
        reject(new Error("Could not load texture."));
      })
    });
  }

  /**
   * Clear the texture cache
   */
  clear() {
    this.texturePool.clear();
    this.unavailableTextures.clear();
  }
}
