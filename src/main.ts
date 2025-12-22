import './style.css'
import { buildGaussianKernel, buildGaussianKernelFromRadius, computeElevationDelta, fetchAsImageBitmap, filterFloatImage, floatImageToCanvas, gaussianBlurImageData, getElevationData, imageBitmapToCanvas, loadImg, loadImgFetch, makeBlurryCopy, makeEaseOuSineFilter, maxFloatImages, sumFloatImages } from './lib/tools.ts';
import { GSTS } from './lib/GSTS.ts';

const appDiv = document.getElementById('app') as HTMLDivElement;


const f1 = async () => {
  // const tileUrl = "https://tiles.mapterhorn.com/12/2126/1456.webp";
  // const tileUrl = "https://tiles.mapterhorn.com/14/8508/5824.webp";
  // const tileUrl = "https://tiles.mapterhorn.com/14/8515/5811.webp";
  const tileUrl = "https://tiles.mapterhorn.com/12/2127/1454.webp";


  const canvasElmt = document.createElement("canvas");
  const imgBtmp = await fetchAsImageBitmap(tileUrl);

  if (!canvasElmt || !imgBtmp) return;

  canvasElmt.width = imgBtmp.width
  canvasElmt.height = imgBtmp.height

  const canvasCtx = canvasElmt.getContext("2d");

  if (!canvasCtx) return;
  canvasCtx.drawImage(imgBtmp, 0, 0);

  const elevationData = getElevationData(canvasElmt)

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

  const eleDeltaBlur60 = computeElevationDelta(blurredElevation60, elevationData, true);
  const eleDeltaBlur30 = computeElevationDelta(blurredElevation30, elevationData, true);
  const eleDeltaBlur15 = computeElevationDelta(blurredElevation15, elevationData, true);
  const eleDeltaBlur7 = computeElevationDelta(blurredElevation7, elevationData, true);
  const eleDeltaBlur3 = computeElevationDelta(blurredElevation3, elevationData, true);

  // const multiResDelta = sumFloatImages([
  //   {fImg: eleDeltaBlur60, ratio: 1},
  //   {fImg: eleDeltaBlur30, ratio: 1},
  //   {fImg: eleDeltaBlur15, ratio: 1},
  //   {fImg: eleDeltaBlur7, ratio: 1},
  //   {fImg: eleDeltaBlur3, ratio: 1},
  // ]);

  // // for ZOOM 12
  // const multiResDelta = maxFloatImages([
  //   {fImg: eleDeltaBlur60, ratio: 0.5},
  //   {fImg: eleDeltaBlur30, ratio: 4},
  //   {fImg: eleDeltaBlur15, ratio: 6},
  //   {fImg: eleDeltaBlur7, ratio: 12},
  //   {fImg: eleDeltaBlur3, ratio: 10},
  // ])

  // for ZOOM 12
  const intensityFactor = 1
  const multiResDelta = sumFloatImages([
    {fImg: eleDeltaBlur60, ratio: 0.5 * intensityFactor},
    {fImg: eleDeltaBlur30, ratio: 4 * intensityFactor},
    {fImg: eleDeltaBlur15, ratio: 4 * intensityFactor},
    {fImg: eleDeltaBlur7, ratio: 12 * intensityFactor},
    {fImg: eleDeltaBlur3, ratio: 10 * intensityFactor},
  ]);
  
  // for ZOOM 14
  // const intensityFactor = 2
  // const multiResDelta = maxFloatImages([
  //   {fImg: eleDeltaBlur60, ratio: 0.5 * intensityFactor},
  //   {fImg: eleDeltaBlur30, ratio: 4 * intensityFactor},
  //   {fImg: eleDeltaBlur15, ratio: 6 * intensityFactor},
  //   {fImg: eleDeltaBlur7, ratio: 12 * intensityFactor},
  //   {fImg: eleDeltaBlur3, ratio: 10 * intensityFactor},
  // ])

  

  console.log("multiResDelta", multiResDelta);
  
  const filteredMultiResDelta = filterFloatImage(multiResDelta, makeEaseOuSineFilter(2800, 255))

  const outputCanvas = floatImageToCanvas(filteredMultiResDelta, 1, 0);
  
  appDiv.append(outputCanvas);

}

const f2 = async () => {
  const gsts = new GSTS({
    urlPattern: "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
    terrainEncoding: "terrarium",
  });

  const tileImageBitmap = await gsts.computeTile({z: 12, x: 2127, y: 1454});
  const canvas = imageBitmapToCanvas(tileImageBitmap);
  appDiv.append(canvas);
}

f2();