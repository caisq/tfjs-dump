const modelURLInput = document.getElementById('model-url');
const loadModelButton = document.getElementById('load-model');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const mainCanvas = document.getElementById('main-canvas');
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

  // 1. Load model.
  const loadModelFrom = modelURLInput.value;
  if (loadModelFrom.indexOf(modelJSONSuffix) !==
      loadModelFrom.length - modelJSONSuffix.length) {
    alert(`Model URL must end in ${modelJSONSuffix}.`);
  }

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

  const source = audioContext.createMediaStreamSource(stream);

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = runOptions.frameSize * 2;
  analyser.smoothingTimeConstant = 0.0;
  const freqData = new Float32Array(analyser.frequencyBinCount);
  const bufferSize = runOptions.modelFFTLength * runOptions.numFrames;
  const bufferData = new Float32Array(bufferSize);
  source.connect(analyser);

  let frameCount = 0;
  function draw() {
    if (stopRequested) {
      return;
    }

    let maxMagnitude = -Infinity;
    if (frameCount % runOptions.predictEveryFrames === 0 && frameCount > 0) {
      const tensorBuffer = tf.buffer([
        runOptions.numFrames * runOptions.modelFFTLength]);
      for (let i = 0; i < bufferData.length; ++i) {
        const x =
          bufferData[(frameCount * runOptions.modelFFTLength + i) % bufferSize];
        if (x > maxMagnitude) {
          maxMagnitude = x;
        }
        tensorBuffer.set(x, i);
      }

      if (maxMagnitude > runOptions.magnitudeThreshold) {
        tf.tidy(() => {
          const x = tensorBuffer.toTensor().reshape([
            1, runOptions.numFrames, runOptions.modelFFTLength, 1]);
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

    const freqDataSlice = freqData.slice(0, runOptions.modelFFTLength);
    plotSpectrum(mainCanvas, freqDataSlice, runOptions);

    const bufferPos = frameCount % runOptions.numFrames;
    bufferData.set(freqDataSlice, bufferPos * runOptions.modelFFTLength);
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
