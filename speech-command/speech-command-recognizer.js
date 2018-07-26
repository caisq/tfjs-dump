class BrowserFftSpeechCommandRecognizer {
  /**
   * Constructor for BrowserFftSpeechCommandRecognizer.
   *
   * @param {tf.Model} model An instance of tf.Model to be used for inference.
   */
  constructor(model) {
    this.SAMPLING_RATE = 44100;
    this.N_FFT = 1024;
    this.ROTATING_BUFFER_SIZE_MULTIPLIER = 2;

    this.checkModel_(model);
    this.model = model;

    // Number of audio frames per example.
    const inputShape = model.inputs[0].shape;
    this.numFrames_ = inputShape[1];
    // Number of bins along the frequency axis for each frame.
    this.modelFFTLength_ = inputShape[2];

    this.running_ = false;

    this.warmUpModel_();
    console.log('Done warming up model.');  // DEBUG
  }

  checkModel_(model) {
    const inputShape = model.inputs[0].shape;
    if (inputShape.length !== 4) {
      throw new Error(
          `Expected inputShape to be 4D, but got ${inputShape.length}D`);
    }
    if (inputShape[2] > this.N_FFT) {
      throw new Error(
          `Unexpected frame size: ${metadataJSON.frameSize}, ` +
          `which is greater than nFFT (${this.N_FFT})!`);
    }
    if (inputShape[3] !== 1) {
      throw new Error(
          `Expected last dimension of inputShape to be 1, ` +
          `but got ${inputShape[3]}`);
    }
  }

  warmUpModel_() {
    tf.tidy(() => {
      const inputShape = this.model.inputs[0].shape;
      const x = tf.zeros([1].concat(inputShape.slice(1)));
      for (let i = 0; i < 3; ++i) {
        const tBegin = new Date();
        this.model.predict(x);
        const tEnd = new Date();
        logToStatusDisplay(
            `Warm up ${i + 1} took: ${tEnd.getTime() - tBegin.getTime()} ms`);
      }
    });
  }

  async start(wordCallback) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
    } catch (err) {
      // TODO(cais): Replace with a callback.
      console.error('getUserMedia() failed: ' + err.message);
    }

    const AudioContextConstructor =
        window.AudioContext || window.webkitAudioContext;
    this.audioContext_ = new AudioContext();
    if (this.audioContext_.sampleRate !== this.SAMPLING_RATE) {
      console.warn(
        `Mismatch in sampling rate: ` +
        `Expected: ${this.SAMPLINLG_RATE}; ` +
        `Actual: ${this.audioContext_.sampleRate}`);
    }

    const source = this.audioContext_.createMediaStreamSource(stream);
    this.analyser_ = this.audioContext_.createAnalyser();
    this.analyser_.fftSize = this.N_FFT * 2;
    this.analyser_.smoothingTimeConstant = 0.0;
    source.connect(this.analyser_);
    console.log('0. ', this.analyser_);  // DEBUG

    this.freqData_ = new Float32Array(this.N_FFT);
    this.rotatingBufferNumFrames_ =
        this.numFrames_ * this.ROTATING_BUFFER_SIZE_MULTIPLIER;
    const rotatingBufferSize =
        this.modelFFTLength_ * this.rotatingBufferNumFrames_;
    this.rotatingBuffer_ = new Float32Array(rotatingBufferSize);
    this.frameCount_ = 0;
    this.tracker_ = new Tracker(this.numFrames_, 0);

    this.wordCallback_ = wordCallback;
    intervalTask = setInterval(
        this.onAudioFrame_.bind(this), this.N_FFT / this.SAMPLING_RATE * 1e3);
  }

  onAudioFrame_() {
    this.analyser_.getFloatFrequencyData(this.freqData_);
    if (this.freqData_[0] === -Infinity) {
      // No signal from microphone. Do nothing.
      return;
    }

    const freqDataSlice = this.freqData_.slice(0, this.modelFFTLength_);
    // TODO(cais): Make this a callback. Remove runOptions.
    plotSpectrum(mainCanvas, freqDataSlice, runOptions);

    const bufferPos = this.frameCount_ % this.rotatingBufferNumFrames_;
    this.rotatingBuffer_.set(freqDataSlice, bufferPos * this.modelFFTLength_);
    // TODO(cais): Import getArrayMax().
    const spectralMax = getArrayMax(freqDataSlice);

    this.tracker_.tick(true);
    if (this.tracker_.shouldFire()) {
      console.log('should fire: ', this.frameCount_);
      const freqData = getFrequencyDataFromRotatingBuffer(
          this.rotatingBuffer_, this.numFrames_, this.modelFFTLength_,
          this.frameCount_ - this.numFrames_);
      const inputTensor = getInputTensorFromFrequencyData(
          freqData, this.numFrames_, this.modelFFTLength_);

      // if (collectOneSpeechSample) {
      //   stopRequested = true;
      //   clearInterval(intervalTask);

      //   if (transferTensors[collectOneSpeechSample] == null) {
      //     transferTensors[collectOneSpeechSample] = [];
      //   }
      //   transferTensors[collectOneSpeechSample].push(inputTensor);
      //   collectWordButtons[collectOneSpeechSample].textContent =
      //     `Collect "${collectOneSpeechSample}" sample ` +
      //     `(${transferTensors[collectOneSpeechSample].length})`;
      //   enableAllCollectWordButtons();
      //   const wordDiv = collectWordDivs[collectOneSpeechSample];
      //   const newCanvas = document.createElement('canvas');
      //   newCanvas.style['display'] = 'inline-block';
      //   newCanvas.style['vertical-align'] = 'middle';
      //   newCanvas.style['height'] = '100px';
      //   newCanvas.style['width'] = '150px';
      //   newCanvas.style['padding'] = '5px';
      //   wordDiv.appendChild(newCanvas);
      //   plotSpectrogram(
      //     newCanvas, freqData,
      //     runOptions.modelFFTLength, runOptions.modelFFTLength);
      // } else {
      tf.tidy(() => {
        const t0 = performance.now();
        // if (this.model.outputs.length === 1) {
          // No transfer learning has occurred; no transfer learned model
          // has been saved in IndexedDB.
        const probs = this.model.predict(inputTensor);
        this.wordCallback_(
            {freqData, fftLength: this.modelFFTLength_}, probs.dataSync());
          // plotPredictions(predictionCanvas, words, probs.dataSync());
          // const recogIndex = tf.argMax(probs, -1).dataSync()[0];
        // } else {
        //   // This is a two headed model from transfer learning.
        //   const probs = model.predict(inputTensor);
        //   const oldWordProbs = probs[0];
        //   const transferWordProbs = probs[1];
        //   plotPredictions(predictionCanvas, words, oldWordProbs.dataSync());
        //   const recogIndex = tf.argMax(oldWordProbs, -1).dataSync()[0];
        //   plotPredictions(
        //       transferPredictionCanvas, transferWords,
        //       transferWordProbs.dataSync());
        // }
        const t1 = performance.now();
      });
      inputTensor.dispose();
      // }
    } else if (this.tracker_.isResting()) {
      // console.log('resting!');
    //   // Clear prediction plot.
    //   plotPredictions(predictionCanvas);
    //   plotPredictions(transferPredictionCanvas);
    }
    this.frameCount_++;
  }
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

function getFrequencyDataFromRotatingBuffer(
    rotatingBuffer, numFrames, fftLength, frameCount) {
  const size = numFrames * fftLength;
  const freqData = new Float32Array(size);

  const rotatingBufferSize = rotatingBuffer.length;
  const rotatingBufferNumFrames = rotatingBufferSize / fftLength;
  while (frameCount < 0) {
    frameCount += rotatingBufferNumFrames;
  }
  const indexBegin =
    (frameCount % rotatingBufferNumFrames) * fftLength;
  const indexEnd = indexBegin + size;

  for (let i = indexBegin; i < indexEnd; ++i) {
    freqData[ i - indexBegin]  = rotatingBuffer[i % rotatingBufferSize];
  }
  return freqData;
}


function getInputTensorFromFrequencyData(freqData, numFrames, fftLength) {
  const size = freqData.length;
  const tensorBuffer = tf.buffer([size]);
  for (let i = 0; i < freqData.length; ++i) {
    tensorBuffer.set(freqData[i], i);
  }
  return normalize(tensorBuffer.toTensor().reshape([
      1, numFrames, fftLength, 1]));
}
