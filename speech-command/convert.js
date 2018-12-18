/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */


const fileInput = document.getElementById('fileInput');
// TODO(cais): Remove.
// const convertButton = document.getElementById('convert');

const MAX_RECORDING_LENGTH_SEC = 1.1;  // TODO(cais): Allow longer.

const OfflineAudioContextConstructor =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;

let outputArrays = null;
let recordingCounter;
let numRecordings;
let frameSize;
let numFrames;

function collectConversionResults() {
  return {
    data: Array.from(outputArrays[0].slice(0, numFrames * frameSize)),
    numRecordings,
    logText
  };
}

function queryRecordingCounter() {
  return recordingCounter;
}

let logText = '';
function logStatus(text) {
  logText += text + '\n';
}

async function startNewRecording() {

  return new Promise((resolve, reject) => {
    const samplingFrequencyHz = 44100;
    const nFFTIn = 1024;
    const nFFTOut = 232;  // TODO(cais): DO NOT HARDCODE.
    frameSize = nFFTOut;

    let offlineAudioContext;
    try {
      offlineAudioContext = new OfflineAudioContextConstructor(
          1, samplingFrequencyHz * MAX_RECORDING_LENGTH_SEC * 2,
          samplingFrequencyHz);
    } catch (error) {
      logStatus(
          `Failed to create OfflineAudioContextConstructor: ${error.message}`);
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dat = new Float32Array(reader.result);
      logStatus(`dat.length = ${dat.length}`);
      const source = offlineAudioContext.createBufferSource();
      logStatus(`source = ${source}`);
      source.buffer = createBufferWithValuesAndOutputArray(
          offlineAudioContext, dat, nFFTIn, nFFTOut, outputArrays);
      logStatus(`source.buffer = ${source.buffer}`);
      logStatus(`outputArrays.length = ${outputArrays.length}`);

      const analyser = offlineAudioContext.createAnalyser();
      analyser.fftSize = nFFTIn * 2;
      analyser.smoothingTimeConstant = 0.0;
      logStatus(`Created analyser`);
      const freqData = new Float32Array(analyser.frequencyBinCount);
      logStatus(`analyser.frequencyBinCount = ${analyser.frequencyBinCount}`);

      source.connect(analyser);
      analyser.connect(offlineAudioContext.destination);
      logStatus(`Connected analyser`);
      logStatus(`Calling source.start()`);
      source.start();
      logStatus(`DONE Calling source.start()`);

      function detectFreeze() {
        reject(new Error('Frozen'));
      }
      setTimeout(detectFreeze, MAX_RECORDING_LENGTH_SEC * 1e3);

      let frameCounter = 0;
      const frameDuration = nFFTIn / samplingFrequencyHz;
      logStatus(`frameDuration = ${frameDuration}`);
      offlineAudioContext.suspend(frameDuration).then(async () => {
        analyser.getFloatFrequencyData(freqData);
        // TODO(cais): Get rid of outputArrays.
        const outputArray = outputArrays[outputArrays.length - 1];
        outputArray.set(freqData.subarray(0, nFFTOut), frameCounter * nFFTOut);

        while (true) {
          frameCounter++;
          offlineAudioContext.resume();
          try {
            await offlineAudioContext.suspend(
                (frameCounter + 1) * frameDuration);
          } catch (err) {
            // suspend() call failed. Retry file.
            break;
          }

          analyser.getFloatFrequencyData(freqData);
          if (freqData[0] === -Infinity && freqData[1] === -Infinity) {
            // recordingConversionSucceeded = true;
            recordingCounter++;
            logStatus('Success!');
            break;
          }
          // TODO(cais): Simplify.
          const outputArray = outputArrays[outputArrays.length - 1];
          outputArray.set(
              freqData.subarray(0, nFFTOut), frameCounter * nFFTOut);
        }

        numFrames = frameCounter - 1;
        resolve();
      });

      logStatus(`Calling startRendering: ${offlineAudioContext.startRendering}`);
      offlineAudioContext.startRendering().catch(err => {
        logStatus('ERROR: Failed to render offline audio context:', err);
      });
    };
    // TODO(cais): Use recordingCounter.
    logStatus(`Calling readAssArrayBuffer`);
    reader.readAsArrayBuffer(fileInput.files[0]);
  });
}

async function doConversion() {
  if (fileInput.files.length > 0) {
    outputArrays = [];
    numRecordings = fileInput.files.length;
    recordingCounter = 0;
    logStatus(`Calling startNewRecording: numRecordings = ${numRecordings}`);
    await startNewRecording();
    logStatus(`Done startNewRecording()`);
  } else {
    logStatus('ERROR: Select one or more files first.');
  }
}
