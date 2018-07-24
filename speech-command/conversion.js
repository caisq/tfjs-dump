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

let numRecordings = -1;
let recordingCounter = 0;
let numFrames = -1;

// 1.1 seconds gives us some comfortable wiggle room. Most of the recordings are
// about 1 second long.
const maxRecordingLengthSeconds = 1.1;

let outputArrays = null;

/**
 * Trigger downloading of output arrays concatenated as a single binary file.
 *
 * @param {Float32Array[]} outputArrays
 * @param {number[]} discardIndices Indices of the elements of `outputArrays`
 *   to discard.
 */
function triggerCombinedDatFileDownload(outputArrays, discardIndices) {
  if (discardIndices != null) {
    discardIndices.sort((a, b) => a - b);
    console.log('discardIndices:', discardIndices);
    for (let i = discardIndices.length - 1; i >= 0; --i) {
      const index = discardIndices[i];
      outputArrays.splice(index, 1);
      console.log(`Discarding output array at index ${index}`);
    }
  }

  const anchor = document.createElement('a');
  anchor.download = 'combined.dat';
  anchor.href = URL.createObjectURL(new Blob(
      outputArrays, {type: 'application/octet-stream'}));
  anchor.click();
}

/**
 * Plot the spectrograms and let user decide which ones (if any) to discard.
 *
 * There is a button at the bottom which will trigger downloading of all the
 * data when clicked.
 *
 * @param {Float32Array[]} outputArrays
 * @param {number} nFFT
 */
function plotSpectrogramsForOutputArrays(outputArrays, nFFT) {
  const groupSpectrogramsDiv = document.getElementById('group-spectrograms');
  if (!groupSpectrogramsDiv) {
    return;
  }

  const discardIndices = [];
  /**
   * Callback for the recording-discarding checkbox.
   */
  function discardCallback(recordingIndex, event) {
    const checkbox = event.srcElement;
    if (checkbox.checked) {
      if (discardIndices.indexOf(recordingIndex) === -1) {
        discardIndices.push(recordingIndex);
      }
    } else {
      if (discardIndices.indexOf(recordingIndex) !== -1) {
        discardIndices.splice(discardIndices.indexOf(recordingIndex), 1);
      }
    }
    console.log(`Discarding ${discardIndices}`);
  }

  for (let i = 0; i < outputArrays.length; ++i) {
    const outputArray = outputArrays[i];
    const recordingDiv = document.createElement('div');
    recordingDiv.classList.add('recording');
    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.addEventListener('click', discardCallback.bind(undefined, i));
    recordingDiv.appendChild(checkbox);

    const label = document.createElement('span');
    label.classList.add('discard-label');
    const fileNameNoExt = datFileInput.files[i].name.replace('.dat',  '');
    label.textContent = `Discard ${fileNameNoExt}`;
    recordingDiv.appendChild(label);

    const canvas = document.createElement('canvas');
    canvas.setAttribute('height', 120);
    canvas.setAttribute('width', 160);
    recordingDiv.appendChild(canvas);
    groupSpectrogramsDiv.appendChild(recordingDiv);
    plotSpectrogram(canvas, outputArray, nFFT, 256);
  }

  const downloadButton = document.createElement('button');
  downloadButton.textContent = 'Download All Except Discarded';
  downloadButton.classList.add('download-button');
  downloadButton.addEventListener('click',
      () => triggerCombinedDatFileDownload(outputArrays, discardIndices));
      groupSpectrogramsDiv.appendChild(downloadButton);
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
 * @param {number} nFFT Number of FFT points per frame.
 * @returns The created buffer with the values filled.
 */
function createBufferWithValuesAndOutputArray(audioContext, xs, nFFT) {
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
  const samplingFrequencyHz =
      Number.parseFloat(document.getElementById('sampling-frequency-hz').value);
  const nFFT = Number.parseInt(document.getElementById('nfft-in').value);
  if (recordingCounter === 0) {
    console.log(`samplingFrequencyHz = ${samplingFrequencyHz}`);
    console.log(`nFFT = ${nFFT}`);
  }

  if (numRecordings > 0 && recordingCounter >= numRecordings) {
    console.log('Downloading combined data file...');
    datProgress.textContent = `Rendering spectrograms...`;
    plotSpectrogramsForOutputArrays(outputArrays, nFFT);
    return;
  }

  const offlineAudioContext = new OfflineAudioContext(
      1, samplingFrequencyHz * maxRecordingLengthSeconds * 2, samplingFrequencyHz);
  const reader = new FileReader();
  reader.onloadend = async () => {
    const dat = new Float32Array(reader.result);
    const source = offlineAudioContext.createBufferSource();
    source.buffer = createBufferWithValuesAndOutputArray(offlineAudioContext, dat, nFFT);

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
    const frameDuration = nFFT / samplingFrequencyHz;
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
  startDatFileButton.disabled = true;
  if (datFileInput.files.length > 0) {
    outputArrays = [];
    numRecordings = datFileInput.files.length;
    recordingCounter = 0;
    startNewRecording();
  } else {
    alert('Select one or more files first.');
  }
});
