class BrowserFftSpeechCommandRecognizer {
  constructor(model) {
    this.SAMPLING_RATE = 44100;

    this.model = model;
    const inputShape = model.inputs[0].shape;
    if (inputShape.length !== 4) {
      throw new Error(
          `Expected inputShape to be 4D, but got ${inputShape.length}D`);
    }
    if (inputShape[3] !== 1) {
      throw new Error(
          `Expected last dimension of inputShape to be 1, ` +
          `but got ${inputShape[3]}`);
    }

    // Number of audio frames per example.
    this.numFrames_ = inputShape[1];
    // Number of bins along the frequency axis for each frame.
    this.modelFFTLength_ = inputShape[2];

    this.running_ = false;
  }

  async start(callback) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });
      console.log('getUserMedia() succeeded.');  // DEBUG
    } catch (err) {
      // TODO(cais): Replace with callbacks.
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

    // handleMicStream(stream, collectOneSpeechSample);

  }
}
