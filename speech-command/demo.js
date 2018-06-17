const modelURLInput = document.getElementById('model-url');
const loadModelButton = document.getElementById('load-model');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const mainCanvas = document.getElementById('main-canvas');
const recogLabel = document.getElementById('recog-label');
const predictionCanvas = document.getElementById('prediction-canvas');

let stopRequested = false;

let sampleRate = 44100;
let frameMillis;

let words;

// Setup slider for magnitude threshold.
let magnitudeThreshold = -35;
const magnitudeThresholdMin = -60;
const magnitudeThresholdMax = 0;

const thresholdSlider = document.getElementById('magnitude-threshold');
thresholdSlider.setAttribute('min', magnitudeThresholdMin);
thresholdSlider.setAttribute('max', magnitudeThresholdMax);

const magnitudeThresholdSpan =
    document.getElementById('magnitude-threshold-span');
thresholdSlider.value = magnitudeThreshold;
magnitudeThresholdSpan.textContent = magnitudeThreshold;
thresholdSlider.addEventListener('click', () => {
  magnitudeThreshold = thresholdSlider.value;
  magnitudeThresholdSpan.textContent = magnitudeThreshold;
});

const magnitudeThresholdInc =
    document.getElementById('magnitude-threshold-increase');
const magnitudeThresholdDec =
    document.getElementById('magnitude-threshold-decrease');
magnitudeThresholdInc.addEventListener('click', () => {
  if (magnitudeThreshold + 1 > magnitudeThresholdMax) {
    return;
  }
  magnitudeThreshold++;
  thresholdSlider.value = magnitudeThreshold;
  magnitudeThresholdSpan.textContent = magnitudeThreshold;
});
magnitudeThresholdDec.addEventListener('click', () => {
  if (magnitudeThreshold - 1 < magnitudeThresholdMin) {
    return;
  }
  magnitudeThreshold--;
  thresholdSlider.value = magnitudeThreshold;
  magnitudeThresholdSpan.textContent = magnitudeThreshold;
});

// Setup logic for predict-every-millis
let predictEveryMillis = 500;
const predictEveryMillisMin = 100;
const predictEveryMillisMax = 1000;
const predictEveryMillisStep = 100;

const predictEveryMillisSlider = document.getElementById('predict-every-ms');
predictEveryMillisSlider.setAttribute('min', predictEveryMillisMin);
predictEveryMillisSlider.setAttribute('max', predictEveryMillisMax);
predictEveryMillisSlider.setAttribute('step', predictEveryMillisStep);
predictEveryMillisSlider.value = predictEveryMillis;

const predictEveryMillisSpan = document.getElementById('predict-every-ms-span');
predictEveryMillisSpan.textContent = predictEveryMillis;
predictEveryMillisSlider.addEventListener('click', () => {
  predictEveryMillis = predictEveryMillisSlider.value;
  predictEveryFrames = Math.round(predictEveryMillis / frameMillis);
  predictEveryMillisSpan.textContent = predictEveryMillis;
});

const predictEveryMillisDec =
    document.getElementById('predict-every-ms-decrease');
const predictEveryMillisInc =
    document.getElementById('predict-every-ms-increase');
predictEveryMillisDec.addEventListener('click', () => {
  if (predictEveryMillis - predictEveryMillisStep < predictEveryMillisMin) {
    return;
  }
  predictEveryMillis -= predictEveryMillisStep;
  predictEveryFrames = Math.round(predictEveryMillis / frameMillis);
  predictEveryMillisSlider.value = predictEveryMillis;
  predictEveryMillisSpan.textContent = predictEveryMillis;
});
predictEveryMillisInc.addEventListener('click', () => {
  if (predictEveryMillis + predictEveryMillisStep > predictEveryMillisMax) {
    return;
  }
  predictEveryMillis += predictEveryMillisStep;
  predictEveryFrames = Math.round(predictEveryMillis / frameMillis);
  predictEveryMillisSlider.value = predictEveryMillis;
  predictEveryMillisSpan.textContent = predictEveryMillis;
});

let numFrames;
let frameSize = 1024;

// Perform recognition every _ milliseconds.
let predictEveryFrames;

let modelFFTLength;
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

  // 1. Load model.
  const loadModelFrom = modelURLInput.value;
  if (loadModelFrom.indexOf(modelJSONSuffix) !==
      loadModelFrom.length - modelJSONSuffix.length) {
    alert(`Model URL must end in ${modelJSONSuffix}.`);
  }

  model = await tf.loadModel(
    tf.io.browserHTTPRequest(loadModelFrom, {credentials: 'include'}));
  const inputShape = model.inputs[0].shape;
  numFrames = inputShape[1];
  modelFFTLength = inputShape[2];

  frameMillis = frameSize / sampleRate * 1e3;
  predictEveryFrames = Math.round(predictEveryMillis / frameMillis);
  console.log('predictEveryFrames = ' + predictEveryFrames);

  console.assert(inputShape[3] === 1);

  // 2. Warm up the model.
  warmUpModel(3);

  // 3. Load the words and frameSize.
  const loadMetadataFrom = loadModelFrom.slice(
    0, loadModelFrom.length - modelJSONSuffix.length) + metadataJSONSuffix;

  const metadataJSON = await (await fetch(loadMetadataFrom)).json();
  if (frameSize !== Number.parseInt(metadataJSON.frameSize)) {
    throw new Error(
      `Unexpected frame size from model: ${metadataJSON.frameSize}`);
  }
  console.log('Loaded frameSize:', frameSize);
  words = metadataJSON.words;
  console.log('Loaded words:', words);

  startButton.disabled = false;
});

function warmUpModel(numPredictCalls) {
  const inputShape = model.inputs[0].shape;
  const x = tf.zeros([1].concat(inputShape.slice(1)));
  for (let i = 0; i < numPredictCalls; ++i) {
    const tBegin = new Date();
    model.predict(x);
    const tEnd = new Date();
    console.log(`Warm up ${i + 1} took: ${tEnd.getTime() - tBegin.getTime()} ms`);
  }
  x.dispose();
}

function start() {
  stopRequested = false;
  navigator.mediaDevices.getUserMedia({audio: true, video: false})
    .then(handleMicStream);
}

function handleMicStream(stream) {
  if (numFrames == null || modelFFTLength == null) {
    throw new Error('Load model first!');
  }

  const audioContext = new AudioContext();
  console.assert(audioContext.sampleRate === sampleRate);

  const source = audioContext.createMediaStreamSource(stream);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = frameSize * 2;
  analyser.smoothingTimeConstant = 0.0;
  const freqData = new Float32Array(analyser.frequencyBinCount);
  const bufferSize = modelFFTLength * numFrames;
  const bufferData = new Float32Array(bufferSize);
  source.connect(analyser);

  let frameCount = 0;
  function draw() {
    if (stopRequested) {
      return;
    }

    let maxMagnitude = -Infinity;
    if (frameCount % predictEveryFrames === 0 && frameCount > 0) {
      const tensorBuffer = tf.buffer([numFrames * modelFFTLength]);
      for (let i = 0; i < bufferData.length; ++i) {
        const x = bufferData[(frameCount * modelFFTLength + i) % bufferSize];
        if (x > maxMagnitude) {
          maxMagnitude = x;
        }
        tensorBuffer.set(x, i);
      }

      if (maxMagnitude > magnitudeThreshold) {
        tf.tidy(() => {
          const x = tensorBuffer.toTensor().reshape([
            1, numFrames, modelFFTLength, 1]);
          const inputTensor = normalize(x);

          const probs = model.predict(inputTensor);
          plotPredictions(probs.dataSync());
          const recogIndex = tf.argMax(probs, -1).dataSync()[0];
          recogLabel.textContent = words[recogIndex];
        });
      } else {
        // Just clear the prediction plots.
        plotPredictions();
      }
    }

    analyser.getFloatFrequencyData(freqData);
    if (freqData[0] === -Infinity && freqData[1] === -Infinity) {
      clearInterval(intervalTask);
      stopRequested = true;
      return;
    }

    const freqDataSlice = freqData.slice(0, modelFFTLength);
    let instanceMax = -Infinity;
    for (const val of freqDataSlice) {
      if (val > instanceMax) {
        instanceMax = val;
      }
    }

    const ctx = mainCanvas.getContext('2d');
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.strokeStyle = instanceMax > magnitudeThreshold ? '#00AA00' : '#AAAAAA';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -freqData[0] + 100);
    for (let i = 1; i < modelFFTLength; ++i) {
      ctx.lineTo(i, -freqData[i] + 100);
    }
    ctx.stroke();

    // Draw the threshold.
    ctx.beginPath();
    ctx.moveTo(0, -magnitudeThreshold + 100);
    ctx.lineTo(modelFFTLength - 1, -magnitudeThreshold + 100);
    ctx.stroke();

    const bufferPos = frameCount % numFrames;
    bufferData.set(
      freqDataSlice, bufferPos * modelFFTLength);
    frameCount++;
  }

  setTimeout(() => {
    intervalTask = setInterval(
      draw, analyser.frequencyBinCount / audioContext.sampleRate * 1000);
  }, 50);
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