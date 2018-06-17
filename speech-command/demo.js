const modelURLInput = document.getElementById('model-url');
const loadModelButton = document.getElementById('load-model');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const mainCanvas = document.getElementById('main-canvas');
const spectrogramCanvas = document.getElementById('spectrogram-canvas');
const recogLabel = document.getElementById('recog-label');
const predictionCanvas = document.getElementById('prediction-canvas');

let stopRequested = false;

let words;

// Setup slider for magnitude threshold.
const runOptions = {
  magnitudeThreshold: -35,
  magnitudeThresholdMin: -60,
  magnitudeThresholdMax: 0,
  predictEveryMillis: 500,
  predictEveryMillisMin: 100,
  predictEveryMillisMax: 1000,
  predictEveryMillisStep: 100,
  sampleRate: 44100,
  frameSize: 1024,
  rotatingBufferSizeMultiplier: 2,
  refractoryPeriodFrames: 40,
  waitingPeriodFrames: 20,  // TODO(cais): Maybe us milliseconds in these two constants.
  numFrames: null,
  modelFFTLength: null,
  frameMillis: null,  // Frame duration in milliseconds.
  predictEveryFrames: null,  // Perform recognition every _ milliseconds.
};

setUpThresholdSlider(runOptions);
setUpPredictEveryMillisSlider(runOptions);

let intervalTask = null;

let model;

function plotPredictions(probabilities) {
  const barWidth = 40;
  const barGap = 10;

  const ctx = predictionCanvas.getContext('2d');
  ctx.clearRect(0, 0, predictionCanvas.width, predictionCanvas.height);

  ctx.font = '15px Arial';
  ctx.beginPath();
  for (let i = 0; i < words.length; ++i) {
    ctx.fillText(
      words[i], i * (barWidth + barGap), 0.95 * predictionCanvas.height);
  }
  ctx.stroke();

  if (probabilities == null) {
    return;
  }

  ctx.beginPath();
  for (let i = 0; i < probabilities.length; ++i) {
    const x = i * (barWidth + barGap);
    ctx.rect(
      x,
      predictionCanvas.height * 0.85 * (1 - probabilities[i]),
      barWidth,
      predictionCanvas.height * 0.85 * probabilities[i]);
  }
  ctx.stroke();
}

loadModelButton.addEventListener('click', async () => {
  const modelJSONSuffix = 'model.json';
  const metadataJSONSuffix = 'metadata.json';

  loadModelButton.disabled = true;

  // 1. Load model.
  const loadModelFrom = modelURLInput.value;
  if (loadModelFrom.indexOf(modelJSONSuffix) !==
      loadModelFrom.length - modelJSONSuffix.length) {
    alert(`Model URL must end in ${modelJSONSuffix}.`);
  }


  logToStatusDisplay('Loading model...');
  model = await tf.loadModel(loadModelFrom);
  const inputShape = model.inputs[0].shape;
  runOptions.numFrames = inputShape[1];
  runOptions.modelFFTLength = inputShape[2];
  logToStatusDisplay(`numFrames: ${runOptions.numFrames}`);

  runOptions.frameMillis = runOptions.frameSize / runOptions.sampleRate * 1e3;
  runOptions.predictEveryFrames =
    Math.round(runOptions.predictEveryMillis / runOptions.frameMillis);
  logToStatusDisplay('predictEveryFrames = ' + runOptions.predictEveryFrames);

  console.assert(inputShape[3] === 1);

  // 2. Warm up the model.
  warmUpModel(3);

  // 3. Load the words and frameSize.
  const loadMetadataFrom = loadModelFrom.slice(
    0, loadModelFrom.length - modelJSONSuffix.length) + metadataJSONSuffix;

  const metadataJSON = await (await fetch(loadMetadataFrom)).json();
  if (runOptions.frameSize !== Number.parseInt(metadataJSON.frameSize)) {
    throw new Error(
      `Unexpected frame size from model: ${metadataJSON.frameSize}`);
  }
  words = metadataJSON.words;
  logToStatusDisplay('frameSize: ' + runOptions.frameSize);
  logToStatusDisplay(`Loaded ${words.length} words: ` + words);

  startButton.disabled = false;
});

function warmUpModel(numPredictCalls) {
  const inputShape = model.inputs[0].shape;
  const x = tf.zeros([1].concat(inputShape.slice(1)));
  for (let i = 0; i < numPredictCalls; ++i) {
    const tBegin = new Date();
    model.predict(x);
    const tEnd = new Date();
    logToStatusDisplay(`Warm up ${i + 1} took: ${tEnd.getTime() - tBegin.getTime()} ms`);
  }
  x.dispose();
}

function start() {
  stopRequested = false;
  navigator.mediaDevices.getUserMedia({audio: true, video: false})
    .then(stream => {
      logToStatusDisplay('getUserMedia() succeeded.');
      handleMicStream(stream);
    }).catch(err => {
      handleMicStream('getUserMedia() failed.');
    })
}

function handleMicStream(stream) {
  if (runOptions.numFrames == null || runOptions.modelFFTLength == null) {
    throw new Error('Load model first!');
  }

  const audioContext = new AudioContext();
  logToStatusDisplay(`audioContext.sampleRate = ${audioContext.sampleRate}`);
  if (audioContext.sampleRate !== runOptions.sampleRate) {
    alert(
      `Mismatch in sampling rate: ` +
      `${audioContext.sampleRate} !== ${runOptions.sampleRate}`);
  }

  console.log('stream:', stream);  // DEBUG
  const source = audioContext.createMediaStreamSource(stream);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = runOptions.frameSize * 2;
  analyser.smoothingTimeConstant = 0.0;
  source.connect(analyser);

  const freqData = new Float32Array(analyser.frequencyBinCount);
  const rotatingBufferNumFrames =
    runOptions.numFrames * runOptions.rotatingBufferSizeMultiplier;
  const rotatingBufferSize =
    runOptions.modelFFTLength * rotatingBufferNumFrames;
  const rotatingBuffer = new Float32Array(rotatingBufferSize);

  let frameCount = 0;
  const tracker = new Tracker(
    runOptions.waitingPeriodFrames, runOptions.refractoryPeriodFrames);
  function draw() {
    if (stopRequested) {
      return;
    }

    analyser.getFloatFrequencyData(freqData);
    if (freqData[0] === -Infinity && freqData[1] === -Infinity) {
      logToStatusDisplay('Stopped due to -Infinity magnitude.');
      clearInterval(intervalTask);
      stopRequested = true;
      return;
    }

    const freqDataSlice = freqData.slice(0, runOptions.modelFFTLength);
    plotSpectrum(mainCanvas, freqDataSlice, runOptions);

    const bufferPos = frameCount % rotatingBufferNumFrames;
    rotatingBuffer.set(freqDataSlice, bufferPos * runOptions.modelFFTLength);
    const spectralMax = getArrayMax(freqDataSlice);

    tracker.tick(spectralMax > runOptions.magnitudeThreshold);
    if (tracker.shouldFire()) {
      console.log(
        `frameCount = ${frameCount}; bufferPos = ${bufferPos}`);  // DEBUG
      // const inputTensor = getInputTensorFromRotatingBuffer(rotatingBuffer, frameCount);
      const freqData = getFrequencyDataFromRotatingBuffer(
        rotatingBuffer, frameCount - runOptions.numFrames);
      // plotSpectrogram(
      //   spectrogramCanvas, freqData,
      //   runOptions.modelFFTLength, runOptions.modelFFTLength);

      // DEBUG
      // clearInterval(intervalTask); stopRequested = true; return;
      const inputTensor = getInputTensorFromFrequencyData(freqData);
      const probs = model.predict(inputTensor);
      plotPredictions(probs.dataSync());
      const recogIndex = tf.argMax(probs, -1).dataSync()[0];
      recogLabel.textContent += words[recogIndex] + ',';
    } else if (tracker.isResting()) {
      // Clear prediction plot.
      plotPredictions();
    }

    frameCount++;
  }

  setTimeout(() => {
    intervalTask = setInterval(
      draw, analyser.frequencyBinCount / audioContext.sampleRate * 1000);
  }, 50);
}

function getArrayMax(xs) {
  let max = -Infinity;
  for (let i = 0; i < xs.length; ++i) {
    if (xs[i] > max) {
      max = xs[i];
    }
  }
  return max;
}

function getFrequencyDataFromRotatingBuffer(rotatingBuffer, frameCount) {
  const size = runOptions.numFrames * runOptions.modelFFTLength;
  const freqData = new Float32Array(size);

  const rotatingBufferSize = rotatingBuffer.length;
  const rotatingBufferNumFrames =
    rotatingBufferSize / runOptions.modelFFTLength;
  while (frameCount < 0) {
    frameCount += rotatingBufferNumFrames;
  }
  const indexBegin =
    (frameCount % rotatingBufferNumFrames) * runOptions.modelFFTLength;
  const indexEnd = indexBegin + size;

  for (let i = indexBegin; i < indexEnd; ++i) {
    freqData[ i - indexBegin]  = rotatingBuffer[i % rotatingBufferSize];
  }
  return freqData;
}

function getInputTensorFromFrequencyData(freqData) {
  const size = freqData.length;
  const tensorBuffer = tf.buffer([size]);
  for (let i = 0; i < freqData.length; ++i) {
    tensorBuffer.set(freqData[i], i);
  }
  return normalize(tensorBuffer.toTensor().reshape([
    1, runOptions.numFrames, runOptions.modelFFTLength, 1]));
}

startButton.addEventListener('click', () => {
  start();
  startButton.disabled = true;
  stopButton.disabled = false;
});

stopButton.addEventListener('click', () => {
  stopRequested = true;
  startButton.disabled = false;
  stopButton.disabled = true;
});

