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

  async start(wordCallback, config) {
    if (this.frameIntervalTask_ != null) {
      throw new Error(
          'Cannot start because there is ongoing streaming recognition.')
    }

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

    logToStatusDisplay('Creating audio context...');
    const AudioContextConstructor =
        window.AudioContext || window.webkitAudioContext;
    this.audioContext_ = new AudioContextConstructor();
    logToStatusDisplay('Created audio context.');
    if (this.audioContext_.sampleRate !== this.SAMPLING_RATE) {
      console.warn(
        `Mismatch in sampling rate: ` +
        `Expected: ${this.SAMPLINLG_RATE}; ` +
        `Actual: ${this.audioContext_.sampleRate}`);
    }

    this.streamSource_ = this.audioContext_.createMediaStreamSource(stream);
    logToStatusDisplay('Created audio source.');
    this.analyser_ = this.audioContext_.createAnalyser();
    this.analyser_.fftSize = this.N_FFT * 2;
    this.analyser_.smoothingTimeConstant = 0.0;
    this.streamSource_.connect(this.analyser_);
    logToStatusDisplay('Created analyser.');

    this.freqData_ = new Float32Array(this.N_FFT);
    this.rotatingBufferNumFrames_ =
        this.numFrames_ * this.ROTATING_BUFFER_SIZE_MULTIPLIER;
    const rotatingBufferSize =
        this.modelFFTLength_ * this.rotatingBufferNumFrames_;
    this.rotatingBuffer_ = new Float32Array(rotatingBufferSize);
    this.frameCount_ = 0;

    let overlapFactor = 0;
    if (config != null && config.overlapFactor != null) {
      overlapFactor = config.overlapFactor;
    }
    this.tracker_ = new Tracker(
        Math.round(this.numFrames_ * (1 - overlapFactor)), 0);

    this.wordCallback_ = wordCallback;
    this.frameIntervalTask_ = setInterval(
        this.onAudioFrame_.bind(this), this.N_FFT / this.SAMPLING_RATE * 1e3);
  }

  onAudioFrame_() {
    this.analyser_.getFloatFrequencyData(this.freqData_);
    if (this.freqData_[0] === -Infinity) {
      // No signal from microphone. Do nothing.
      return;
    }

    const freqDataSlice = this.freqData_.slice(0, this.modelFFTLength_);

    const bufferPos = this.frameCount_ % this.rotatingBufferNumFrames_;
    this.rotatingBuffer_.set(freqDataSlice, bufferPos * this.modelFFTLength_);
    // TODO(cais): Import getArrayMax().
    const spectralMax = getArrayMax(freqDataSlice);

    this.tracker_.tick(true);
    if (this.tracker_.shouldFire()) {
      const freqData = getFrequencyDataFromRotatingBuffer(
          this.rotatingBuffer_, this.numFrames_, this.modelFFTLength_,
          this.frameCount_ - this.numFrames_);
      const inputTensor = getInputTensorFromFrequencyData(
          freqData, this.numFrames_, this.modelFFTLength_);

      tf.tidy(() => {
        if (this.model.outputs.length === 1) {
          // No transfer learning has occurred; no transfer learned model
          // has been saved in IndexedDB.
          const t0 = performance.now();
          const probs = this.model.predict(inputTensor).dataSync();
          console.log(
              `Inference on audio frame took ${performance.now() - t0} ms`);
          this.wordCallback_(
              {freqData, fftLength: this.modelFFTLength_}, probs);
        } else {
          // This is a two headed model from transfer learning.
          this.wordCallback_(
              {freqData, fftLength: this.modelFFTLength_},
              this.model.predict(inputTensor).map(p => p.dataSync()));
        }

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

  async stop() {
    if (this.frameIntervalTask_ == null) {
      throw new Error(
          'Cannot stop because there is no ongoing streaming recognition.')
    }

    clearInterval(this.frameIntervalTask_);
    this.frameIntervalTask_ = null;
    await this.analyser_ .disconnect();
    await this.audioContext_.close();
    logToStatusDisplay('Audio context closed.');
  }

  get numFrames() {
    return this.numFrames_;
  }

  get fftLength() {
    return this.modelFFTLength_;
  }

  getInputTensorFromFrequencyData(freqData) {
    return getInputTensorFromFrequencyData(
        freqData, this.numFrames_, this.modelFFTLength_);
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
