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

const mainCanvas = document.getElementById('main-canvas');

const datFileInput = document.getElementById('dat-file-input');
const startDatFileButton = document.getElementById('start-dat-file');
const datProgress = document.getElementById('dat-progress');
const showSpectrogram = document.getElementById('show-spectrogram');

let numRecordings = -1;
let recordingCounter = 0;
let numFrames = -1;

const samplingFrequency = 44100;
// 1.1 seconds gives us some comfortable wiggle room. Most of the recordings are
// about 1 second long.
const maxRecordingLengthSeconds = 1.1;

let nFFT = 1024;
let outputArrays = null;

/**
 * Trigger downloading of output arrays concatenated as a single binary file.
 *
 * @param {Float32Array[]} outputArrays
 */
function triggerCombinedDatFileDownload(outputArrays) {
  plotSpectrogramsForOutputArrays(outputArrays);

  const anchor = document.createElement('a');
  anchor.download = 'combined.dat';
  anchor.href = URL.createObjectURL(new Blob(
      outputArrays, {type: 'application/octet-stream'}));
  anchor.click();
}

function plotSpectrogramsForOutputArrays(outputArrays) {
  const groupSpectrogramsDiv = document.getElementById('group-spectrograms');
  if (!groupSpectrogramsDiv) {
    return;
  }
  for (const outputArray of outputArrays) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('height', 120);
    canvas.setAttribute('width', 160);
    groupSpectrogramsDiv.appendChild(canvas);
    plotSpectrogram(canvas, outputArray, nFFT, 256);
  }
}

/**
 * Create an audio buffer filled with a given value.
 *
 * In addition, create an new Float32Array to store the spectrogram data
 * for the audio buffer and push it into `outputArrays`.
 *
 * @param {AudioContext} audioContext The AudioContext instance in which the
 *   buffer will be created.
 * @param {Float32array} xs Values to fill in the buffer.
 * @returns The created buffer with the values filled.
 */
function createBufferWithValuesAndOutputArray(audioContext, xs) {
  const bufferLen = xs.length;
  const buffer = audioContext.createBuffer(
      1, bufferLen, audioContext.sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < bufferLen; ++i) {
    channelData[i] = xs[i];
  }
  numFrames = Math.floor(buffer.length / nFFT) + 5;
  const arrayLength = nFFT * (numFrames + 1);
  outputArrays.push(createAllMinusInfinityFloat32Array(arrayLength));
  return buffer;
}

/**
 * Create an all-Negative Infinity Float32Array.
 *
 * @param {number} arrayLength Length of the array to create.
 * @return The created Float32Array.
 */
function createAllMinusInfinityFloat32Array(arrayLength) {
  const outputArray = new Float32Array(arrayLength);
  for (let i = 0; i < arrayLength; ++i) {
    outputArray[i] = -Infinity;
  }
  return outputArray;
}

/**
 * Pop the last element out from `outputArrays`.
 *
 * Used during the handling of a frozen conversion.
 */
function popLastElementFromOutputArrays() {
  outputArrays.pop(outputArrays.length - 1);
}

// The `setTimeout` task handle for the task that detects frozen conversions.
let detectFreezeTask;

function startNewRecording() {
  if (numRecordings > 0 && recordingCounter >= numRecordings) {
    console.log('Downloading combined data file...');
    triggerCombinedDatFileDownload(outputArrays);
    return;
  }

  const offlineAudioContext = new OfflineAudioContext(
      1, samplingFrequency * maxRecordingLengthSeconds * 2, samplingFrequency);
  const reader = new FileReader();
  reader.onloadend = async () => {
    const dat = new Float32Array(reader.result);
    const source = offlineAudioContext.createBufferSource();
    source.buffer = createBufferWithValuesAndOutputArray(offlineAudioContext, dat);

    const analyser = offlineAudioContext.createAnalyser();
    analyser.fftSize = nFFT * 2;
    analyser.smoothingTimeConstant = 0.0;
    const freqData = new Float32Array(analyser.frequencyBinCount);

    source.connect(analyser);
    analyser.connect(offlineAudioContext.destination);
    source.start();

    function detectFreeze() {
      console.warn(
          `Detected frozen conversion! ` +
          `Trying to start recording #${recordingCounter} over...`);
      popLastElementFromOutputArrays();
      setTimeout(startNewRecording, 5);
    }
    detectFreezeTask = setTimeout(detectFreeze, maxRecordingLengthSeconds * 1e3);

    let recordingConversionSucceeded = false;
    let frameCounter = 0;
    const frameDuration = nFFT / samplingFrequency;
    offlineAudioContext.suspend(frameDuration).then(async () => {
      analyser.getFloatFrequencyData(freqData);
      const outputArray = outputArrays[outputArrays.length - 1];
      outputArray.set(freqData, frameCounter * analyser.frequencyBinCount);

      while (true) {
        frameCounter++;
        offlineAudioContext.resume();
        try {
          await offlineAudioContext.suspend((frameCounter + 1) * frameDuration);
        } catch (err) {
          console.log(
              `suspend() call failed: ${err.message}. ` +
              `Retrying file #${recordingCounter}: ` +
              datFileInput.files[recordingCounter].name);
          break;
        }

        analyser.getFloatFrequencyData(freqData);
        if (freqData[0] === -Infinity && freqData[1] === -Infinity) {
          recordingConversionSucceeded = true;
          break;
        }
        const outputArray = outputArrays[outputArrays.length - 1];
        outputArray.set(freqData, frameCounter * analyser.frequencyBinCount);
      }

      if (recordingConversionSucceeded) {
        recordingCounter++;
        datProgress.textContent = `Converting #${recordingCounter}`;
        if (showSpectrogram.checked) {
          plotSpectrogram(mainCanvas, outputArray, nFFT, 256);
        }
        setTimeout(startNewRecording, 5);
      } else {
        outputArrays.pop();
        source.stop();
        setTimeout(startNewRecording, 5);
      }

      if (detectFreezeTask != null) {
        clearTimeout(detectFreezeTask);
        detectFreezeTask = null;
      }
    });
    offlineAudioContext.startRendering().catch(err => {
      console.log('Failed to render offline audio context:', err);
    });
  };
  reader.readAsArrayBuffer(datFileInput.files[recordingCounter]);
}

startDatFileButton.addEventListener('click', event => {
  if (datFileInput.files.length > 0) {
    outputArrays = [];
    numRecordings = datFileInput.files.length;
    recordingCounter = 0;
    startNewRecording();
  } else {
    alert('Select one or more files first.');
  }
});
