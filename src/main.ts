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

  const tileImageBitmap = await gsts.computeTileWr(
    // {z: 2, x: 40, y: 1},
    // {z: 3, x: 4, y: 2},
    // {z: 4, x: 8, y: 5},
    // {z: 5, x: 16, y: 11},
    // {z: 6, x: 33, y: 23},
    // {z: 7, x: 66, y: 46},
    // {z: 8, x: 133, y: 93},
    // {z: 9, x: 264, y: 182}
    // {z: 10, x: 530, y: 365},
    // {z: 11, x: 1060, y: 731},
    // {z: 12, x: 2127, y: 1454},
    // {z: 12, x: 2126, y: 1449}
    // {z: 13, x: 4253, y: 2900}
    // {z: 13, x: 4254, y: 2902}
    // {z: 14, x: 8507, y: 5804}
    // {z: 14, x: 8509, y: 5804}
    // {z: 15, x: 17115, y: 11554}
    // {z: 16, x: 34228, y: 23114}
    // {z: 16, x: 34236, y: 23118}
    {z: 16, x: 34261, y: 23134}
    
  );
  const canvas = imageBitmapToCanvas(tileImageBitmap);
  appDiv.append(canvas);
}

f2();