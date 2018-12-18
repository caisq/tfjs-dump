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

// const MAX_RECORDING_LENGTH_SEC = 1.1;  // TODO(cais): Allow longer.

const OfflineAudioContextConstructor =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;

let outputArrays = null;
let recordingCounter;
let numRecordings;
let frameSize;
let numFrames;

let parameters;
let completed;
let frameCounter;

function collectConversionResults() {
  let data = null;
  if (outputArrays[0] != null) {
    data = Array.from(outputArrays[0].slice(
        parameters.initFrameCount * frameSize, numFrames * frameSize));
  }
  return {
    data,
    numRecordings,
    completed,
    frameCounter,
    logText,
  };
}

// let param;
// function setParam(tParam) {
//   logStatus('In setParam():', JSON.stringify(tParam));
//   param = tParam;
// }

function queryRecordingCounter() {
  return recordingCounter;
}

let logText = '';
function logStatus(text) {
  logText += text + '\n';
}

async function startNewRecording(sampleFreqHz,
                                 totalLengthSec,
                                 lengthSec,
                                 initFrameCount) {
  if (initFrameCount == null) {
    initFrameCount = 0;
  }
  logStatus(
      `startNewRecording(): ` +
      `sampleFreqHz = ${sampleFreqHz}, lengthSec = ${lengthSec}`);

  return new Promise((resolve, reject) => {
    // const sampleFreqHz = 44100;  // TODO(cais): Remove.
    const nFFTIn = 1024;
    const nFFTOut = 232;  // TODO(cais): DO NOT HARDCODE.
    frameSize = nFFTOut;

    let offlineAudioContext;
    try {
      offlineAudioContext = new OfflineAudioContextConstructor(
          1, Math.floor(sampleFreqHz * totalLengthSec * 2), sampleFreqHz);
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
      const PROCESSING_SCALE_FACTOR = 0.1;
      setTimeout(
          detectFreeze,
          Math.round(lengthSec * PROCESSING_SCALE_FACTOR * 1e3));

      frameCounter = initFrameCount;
      const frameDurationSec = nFFTIn / sampleFreqHz;
      logStatus(`frameDuration = ${frameDurationSec}`);
      offlineAudioContext.suspend((frameCounter + 1) * frameDurationSec).then(async () => {
        analyser.getFloatFrequencyData(freqData);
        // TODO(cais): Get rid of outputArrays.
        const outputArray = outputArrays[outputArrays.length - 1];
        outputArray.set(freqData.subarray(0, nFFTOut), frameCounter * nFFTOut);

        while (true) {
          if ((frameCounter - initFrameCount) * frameDurationSec > lengthSec) {
            completed = true;
            break;
          }

          frameCounter++;          
          const suspendTimeSec = (frameCounter + 1) * frameDurationSec;
          offlineAudioContext.resume();
          try {
            // logStatus(`Scheduling suspend() at ${suspendTimeSec}`);  // DEBUG
            await offlineAudioContext.suspend(suspendTimeSec);
          } catch (err) {
            // suspend() call failed. Retry file.
            logStatus('!!suspend() call failed: ' + err.message);  // DEBUG
            break;
          }

          analyser.getFloatFrequencyData(freqData);
          if (freqData[0] === -Infinity && freqData[1] === -Infinity) {
            // recordingConversionSucceeded = true;
            recordingCounter++;
            logStatus('Breaking on -Infinity');  // DEBUG
            break;
          }
          // TODO(cais): Simplify.
          const outputArray = outputArrays[outputArrays.length - 1];
          outputArray.set(
              freqData.subarray(0, nFFTOut), frameCounter * nFFTOut);
        }

        numFrames = frameCounter - 1;
        logStatus(`Calling resolve(): numFrames = ${numFrames}`);  // DEBUG
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

async function doConversion(param) {
  parameters = param;
  if (parameters.initFrameCount == null) {
    parameters.initFrameCount = 0;
  }
  if (fileInput.files.length > 0) {
    outputArrays = [];
    numRecordings = fileInput.files.length;
    recordingCounter = 0;
    logStatus(`Calling startNewRecording: numRecordings = ${numRecordings}`);
    await startNewRecording(
        param.sampleFreqHz, param.totalLengthSec, param.lengthSec,
        param.initFrameCount);
    logStatus(`Done startNewRecording()`);
  } else {
    logStatus('ERROR: Select one or more files first.');
  }
}
