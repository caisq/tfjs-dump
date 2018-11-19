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
const convertButton = document.getElementById('convert');

const MAX_RECORDING_LENGTH_SEC = 1.1;

const OfflineAudioContextConstructor =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;

// TODO(cais): Remove.
let logText = '';
function pageInternalFunction() {
  return {data: '24', logText};
}

function logStatus(text) {
  logText += text + '\n';
}

let outputArrays = null;

async function startNewRecording() {
  return new Promise((resolve, reject) => {
    logStatus('In startNewRecording');  // DEBUG
    const samplingFrequencyHz = 44100;
    const nFFTIn = 1024;
    const nFFTOut = 232;  // TODO(cais): DO NOT HARDCODE. DO NOT SUBMIT.
    logStatus(
        `samplingFrequencyHz = ${samplingFrequencyHz}; ` +
        `nFFTIn = ${nFFTIn}; nFFTOut = ${nFFTOut}`);
    // if (recordingCounter === 0) {
    //   console.log(`samplingFrequencyHz = ${samplingFrequencyHz}`);
    //   console.log(`nFFTIn = ${nFFTIn}`);
    //   console.log(`nFFTOut = ${nFFTOut}`);
    // }

    // if (numRecordings > 0 && recordingCounter >= numRecordings) {
    //   datProgress.textContent = 'Rendering spectrograms...';
    //   setTimeout(() => {
    //     plotSpectrogramsForOutputArrays(outputArrays, nFFTOut);
    //     datProgress.textContent =
    //         'Select recordings to discard, scroll to the bottom and click
    //         download.';
    //   }, 20);
    //   return;
    // }

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
      logStatus(`dat.length = ${dat.length}`);  // DEBUG
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

      // function detectFreeze() {
      //   console.warn(
      //       `Detected frozen conversion! ` +
      //       `Trying to start recording #${recordingCounter} over...`);
      //   popLastElementFromOutputArrays();
      //   setTimeout(startNewRecording, 1);
      // }
      // detectFreezeTask = setTimeout(detectFreeze, maxRecordingLengthSeconds *
      // 1e3);

      setTimeout(() => logStatus('Boo!'), 2000);

      let recordingConversionSucceeded = false;
      let frameCounter = 0;
      const frameDuration = nFFTIn / samplingFrequencyHz;
      logStatus(`frameDuration = ${frameDuration}`);
      logStatus(`offlineAudioContext.suspend = ${offlineAudioContext.suspend}`);  // DEBUG
      offlineAudioContext.suspend(frameDuration).then(async () => {
        logStatus('In suspend callback');  // DEBUG
        analyser.getFloatFrequencyData(freqData);
        const outputArray = outputArrays[outputArrays.length - 1];
        logStatus(`frameCounter = ${frameCounter}`);  // DEBUG
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
            recordingConversionSucceeded = true;
            logStatus('Success!');
            break;
          }
          // TODO(cais): Simplify.
          const outputArray = outputArrays[outputArrays.length - 1];
          logStatus(`frameCounter = ${frameCounter}`);  // DEBUG
          outputArray.set(
              freqData.subarray(0, nFFTOut), frameCounter * nFFTOut);
        }

        resolve();
        // if (recordingConversionSucceeded) {
        //   recordingCounter++;
        //   datProgress.textContent = `Converting #${recordingCounter}`;
        //   setTimeout(startNewRecording, 1);
        // } else {
        //   outputArrays.pop();
        //   source.stop();
        //   setTimeout(startNewRecording, 1);
        // }

        // if (detectFreezeTask != null) {
        //   clearTimeout(detectFreezeTask);
        //   detectFreezeTask = null;
        // }
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

convertButton.addEventListener('click', async event => {
  convertButton.disabled = true;
  logStatus('In convertButton callback');
  if (fileInput.files.length > 0) {
    outputArrays = [];
    // numRecordings = datFileInput.files.length;
    // recordingCounter = 0;
    await startNewRecording();
    logStatus(`Done startNewRecording()`);
  } else {
    logStatus('ERROR: Select one or more files first.');
  }
});
