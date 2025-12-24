import type { TileProcesingWorkerMessage } from "./GSTS"
import { computeElevationDelta, createPaddedTileOffscreenCanvas, filterFloatImage, floatImageToCanvas, gaussianBlurImageData, getElevationData, makeEaseOuSineFilter, sumFloatImages, trimPaddedTile } from "./tools";


self.onmessage = async (e: MessageEvent<TileProcesingWorkerMessage>) => {
  const {imageBitmaps, padding, terrainEncoding, gaussianScaleSpaceWeights, color} = e.data;
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

  const multiResDelta = sumFloatImages([
    {fImg: eleDeltaBlur60, ratio: gaussianScaleSpaceWeights.hKernel60 },
    {fImg: eleDeltaBlur30, ratio: gaussianScaleSpaceWeights.hKernel30 },
    {fImg: eleDeltaBlur15, ratio: gaussianScaleSpaceWeights.hKernel15 },
    {fImg: eleDeltaBlur7, ratio: gaussianScaleSpaceWeights.hKernel7 },
    {fImg: eleDeltaBlur3, ratio: gaussianScaleSpaceWeights.hKernel3 },
  ]);

  console.log("max value", multiResDelta.data.reduce((pix, acc) => Math.max(pix, acc), 0));

  const filteredMultiResDelta = filterFloatImage(multiResDelta, makeEaseOuSineFilter(3000, 255))
  const paddedShadedTile = floatImageToCanvas(filteredMultiResDelta, color);
  const trimmedShadedImageBitmap = await trimPaddedTile(paddedShadedTile, tileSize, padding);
   
  self.postMessage(trimmedShadedImageBitmap, [trimmedShadedImageBitmap])
}
