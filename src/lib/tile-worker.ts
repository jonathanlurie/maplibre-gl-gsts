import type { TileProcesingWorkerMessage } from "./GSTS"
import { computeElevationDelta, createPaddedTileOffscreenCanvas, filterFloatImage, floatImageToCanvas, gaussianBlurImageData, getElevationData, makeEaseOuSineFilter, sumFloatImages, trimPaddedTile } from "./tools";


self.onmessage = async (e: MessageEvent<TileProcesingWorkerMessage>) => {
  const {imageBitmaps, padding, terrainEncoding} = e.data;
  const tileSize = imageBitmaps[0]?.width ?? 512;

  const paddedTileCanvas = createPaddedTileOffscreenCanvas(imageBitmaps, padding);

  const elevationData = getElevationData(paddedTileCanvas, terrainEncoding);

  const blurredElevation60 = gaussianBlurImageData(elevationData, 60);
  const blurredElevation30 = gaussianBlurImageData(elevationData, 30);
  const blurredElevation15 = gaussianBlurImageData(elevationData, 15);
  const blurredElevation7 = gaussianBlurImageData(elevationData, 7);
  const blurredElevation3 = gaussianBlurImageData(elevationData, 3);

  const eleDeltaBlur60 = computeElevationDelta(blurredElevation60, elevationData, true);
  const eleDeltaBlur30 = computeElevationDelta(blurredElevation30, elevationData, true);
  const eleDeltaBlur15 = computeElevationDelta(blurredElevation15, elevationData, true);
  const eleDeltaBlur7 = computeElevationDelta(blurredElevation7, elevationData, true);
  const eleDeltaBlur3 = computeElevationDelta(blurredElevation3, elevationData, true);

  const intensityFactor = 1;
  const multiResDelta = sumFloatImages([
    {fImg: eleDeltaBlur60, ratio: 0.5 * intensityFactor},
    {fImg: eleDeltaBlur30, ratio: 4 * intensityFactor},
    {fImg: eleDeltaBlur15, ratio: 4 * intensityFactor},
    {fImg: eleDeltaBlur7, ratio: 12 * intensityFactor},
    {fImg: eleDeltaBlur3, ratio: 10 * intensityFactor},
  ]);

  const filteredMultiResDelta = filterFloatImage(multiResDelta, makeEaseOuSineFilter(2800, 255))

  const paddedShadedTile = floatImageToCanvas(filteredMultiResDelta, 1, 0);
  const trimmedShadedImageBitmap = await trimPaddedTile(paddedShadedTile, tileSize, padding);
   
  self.postMessage(trimmedShadedImageBitmap, [trimmedShadedImageBitmap])
}
