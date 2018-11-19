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
 * Create an audio buffer filled with a given value.
 *
 * In addition, create an new Float32Array to store the spectrogram data
 * for the audio buffer and push it into `outputArrays`.
 *
 * @param {AudioContext} audioContext The AudioContext instance in which the
 *   buffer will be created.
 * @param {Float32array} xs Values to fill in the buffer.
 * @param {number} nFFTIn Number of FFT points per frame in the input (from
 *   OfflineAudioContext).
 * @returns The created buffer with the values filled.
 */
function createBufferWithValuesAndOutputArray(
    audioContext, xs, nFFTIn, nFFTOut, outputArrays) {
  const bufferLen = xs.length;
  const buffer = audioContext.createBuffer(
      1, bufferLen, audioContext.sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < bufferLen; ++i) {
    channelData[i] = xs[i];
  }
  // `3` here provides some safety room in case rounding error causes one
  // or two extra frames.
  // TODO(cais): Restore? Decide. DO NOT SUBMIT.
  numFrames = Math.floor(buffer.length / nFFTIn) + 3;
  const arrayLength = nFFTOut * (numFrames + 1);
  outputArrays.push(createAllMinusInfinityFloat32Array(arrayLength));
  return buffer;
}
