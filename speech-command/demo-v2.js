const modelURLInput = document.getElementById('model-url');
const loadModelButton = document.getElementById('load-model');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const mainCanvas = document.getElementById('main-canvas');
const spectrogramCanvas = document.getElementById('spectrogram-canvas');
const predictionCanvas = document.getElementById('prediction-canvas');
const transferPredictionCanvas = document.getElementById('transfer-prediction-canvas');
const transferLearnHistoryDiv = document.getElementById('transfer-learn-history');

let stopRequested = false;

let words;

// Setup slider for magnitude threshold.
const runOptions = {
  magnitudeThreshold: -35,
  magnitudeThresholdMin: -100,
  magnitudeThresholdMax: 0,
  rotatingBufferSizeMultiplier: 2,
  refractoryPeriodMillis: 1000,
  waitingPeriodMillis: 500,
  frameMillis: null,  // Frame duration in milliseconds.
};

let intervalTask = null;

let model;  // TODO(cais): Remove.
let recognizer;

// Variables for transfer learning.
let transferWords;
let transferTensors = {};
let collectWordDivs = {};
let collectWordButtons = {};

loadModelButton.addEventListener('click', async () => {
  loadModelButton.disabled = true;
  await loadModelAndMetadataAndWarmUpModel(true);
});

const remoteModelURL = 'https://storage.googleapis.com/tfjs-speech-command-model-17w/model.json';

async function loadModelAndMetadataAndWarmUpModel(loadFromRemote) {
  const modelJSONSuffix = 'model.json';
  const metadataJSONSuffix = 'metadata.json';

  // 1. Load model.
  let loadModelFrom;
  if (loadFromRemote) {
    loadModelFrom = remoteModelURL;
    if (loadModelFrom.indexOf(modelJSONSuffix) !==
        loadModelFrom.length - modelJSONSuffix.length) {
      alert(`Model URL must end in ${modelJSONSuffix}.`);
    }

    logToStatusDisplay('Loading model...');
  } else {
    loadModelFrom = LOCAL_MODEL_SAVE_LOCATION;
  }

  model = await tf.loadModel(loadModelFrom);
  model.summary();

  recognizer = new BrowserFftSpeechCommandRecognizer(model);

  // 2. Load the words and frameSize.
  let metadataJSON;
  if (loadFromRemote) {
    const loadMetadataFrom = loadModelFrom.slice(
        0, loadModelFrom.length - modelJSONSuffix.length) +
        metadataJSONSuffix;
    metadataJSON = await (await fetch(loadMetadataFrom)).json();
  } else {
    metadataJSON = JSON.parse(localStorage.getItem(MODEL_METADATA_SAVE_LOCATION));
  }

  words = metadataJSON.words;
  logToStatusDisplay(`Loaded ${words.length} words: ` + words);

  startButton.disabled = false;
  enterLearnWordsButton.disabled = false;
  startTransferLearnButton.disabled = false;
  logToStatusDisplay(`Done loading.`);
  // // 4. If model has more than one heads, load the transfer words.
  // if (model.outputs.length > 1) {
  //   transferWords =
  //       JSON.parse(localStorage.getItem(TRANSFER_WORDS_SAVE_LOCATION));
  //   learnWordsInput.value = transferWords.join(',');
  //   logToStatusDisplay(
  //       `Loaded transfer learned words: ${JSON.stringify(transferWords)}`);
  // }
}

// function start(collectOneSpeechSample) {
//   stopRequested = false;
//   navigator.mediaDevices.getUserMedia({audio: true, video: false})
//     .then(stream => {
//       logToStatusDisplay('getUserMedia() succeeded.');
//       handleMicStream(stream, collectOneSpeechSample);
//     }).catch(err => {
//       logToStatusDisplay('getUserMedia() failed: ' + err.message);
//     });
// }

startButton.addEventListener('click', async () => {
  logToStatusDisplay('Starting recognizer...');
  await recognizer.start((spectrogram, probs) => {
    plotSpectrogram(
        spectrogramCanvas, spectrogram.freqData,
        spectrogram.fftLength, spectrogram.fftLength);
    plotPredictions(predictionCanvas, words, probs);
  });
  startButton.disabled = true;
  stopButton.disabled = false;
});

stopButton.addEventListener('click', async () => {
  await recognizer.stop();
  startButton.disabled = false;
  stopButton.disabled = true;
});

// UI code foro transfer learning.
const learnWordsInput = document.getElementById('learn-words');
const enterLearnWordsButton = document.getElementById('enter-learn-words');
const collectButtonsDiv = document.getElementById('collect-words');
const startTransferLearnButton =
  document.getElementById('start-transfer-learn');

enterLearnWordsButton.addEventListener('click', () => {
  enterLearnWordsButton.disabled = true;
  transferWords =
    learnWordsInput.value.trim().split(',').map(w => w.trim());

  for (const word of transferWords) {
    const wordDiv = document.createElement('div');
    wordDiv.style['border'] = 'solid 1px'
    const button = document.createElement('button');
    button.style['display'] = 'inline-block';
    button.style['vertical-align'] = 'middle';
    button.textContent = `Collect "${word}" sample (0)`;
    wordDiv.appendChild(button);
    wordDiv.style['height'] = '100px';
    collectButtonsDiv.appendChild(wordDiv);
    collectWordDivs[word] = wordDiv;
    collectWordButtons[word] = button;

    button.addEventListener('click', () => {
      disableAllCollectWordButtons();
      currentlyCollectedWord = word;
      logToStatusDisplay(
          `Collect one sample of word "${currentlyCollectedWord}"`);
      start(word);
    });
  }
});

startTransferLearnButton.addEventListener('click', async () => {
  const [xs, ys] = prepareLearnTensors();
  await doTransferLearning(xs, ys);
});

function disableAllCollectWordButtons() {
  for (const word in collectWordButtons) {
    collectWordButtons[word].disabled = true;
  }
}

function enableAllCollectWordButtons() {
  for (const word in collectWordButtons) {
    collectWordButtons[word].disabled = false;
  }
}

/**
 * @returns
 *   1. xs: A Tensor of shape `[numExamples, numTimeSteps, numFreqSteps]`.
 *   2. ys: A one-hot encoded target Tensor of shape `[numExamples, numWords]`.
 */
function prepareLearnTensors() {
  return tf.tidy(() => {
    const numDistinctWords = transferWords.length;
    let numWords = 0;
    let xs;
    let ys;
    for (let i = 0; i < transferWords.length; ++i) {
      const word = transferWords[i];
      for (const tensor of transferTensors[word]) {
        const yBuffer = tf.buffer([1, numDistinctWords]);
        yBuffer.set(1, 0, i);

        if (numWords === 0) {
          xs = tensor;
          ys = yBuffer.toTensor();
        } else {
          xs = tf.concat([xs, tensor], 0);
          ys = tf.concat([ys, yBuffer.toTensor()], 0);
        }

        numWords++;
      }
    }

    return [xs, ys];
  });
}

async function doTransferLearning(xs, ys) {
  const cutoffLayerIndex = 9;
  for (let i = 0; i <= cutoffLayerIndex; ++i) {
    model.layers[i].trainable = false;
  }

  const cutoffTensor = model.layers[cutoffLayerIndex].output;
  const newDenseLayer = tf.layers.dense({
    units: transferWords.length,
    activation: 'softmax'});
  const newOutputTensor = newDenseLayer.apply(cutoffTensor);

  const transferModel = tf.model({inputs: model.inputs, outputs: newOutputTensor});
  transferModel.compile({loss: 'categoricalCrossentropy',  optimizer: 'adam'});

  const numEpochs = 40;
  const plotData = {
    x: [],
    y: [],
    type: 'scatter',
  };
  const plotLayout = {
    xaxis: {range: [0, numEpochs], title: 'Epoch #'},
    yaxis: {title: 'Train loss'},
  };
  const history = await transferModel.fit(xs, ys, {
    epochs: numEpochs,
    callbacks: {
      onEpochEnd: async (epoch, log) => {
        plotData.x.push(epoch + 1);
        plotData.y.push(log.loss);
        Plotly.newPlot(transferLearnHistoryDiv, [plotData], plotLayout);
        await tf.nextFrame();
        console.log(`epoch = ${epoch}: loss = ${log.loss}`);
      }
    }
  });

  model = tf.model({
    inputs: model.inputs,
    outputs: model.outputs.concat(transferModel.outputs),
  });

  // TODO(cais): Save transfer words in localstorage.

  return history;
}
