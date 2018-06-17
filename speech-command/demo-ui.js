function setUpThresholdSlider(runOptions) {
  const thresholdSlider = document.getElementById('magnitude-threshold');
  thresholdSlider.setAttribute('min', runOptions.magnitudeThresholdMin);
  thresholdSlider.setAttribute('max', runOptions.magnitudeThresholdMax);

  const magnitudeThresholdSpan =
      document.getElementById('magnitude-threshold-span');
  thresholdSlider.value = runOptions.magnitudeThreshold;
  magnitudeThresholdSpan.textContent = runOptions.magnitudeThreshold;
  thresholdSlider.addEventListener('click', () => {
    runOptions.magnitudeThreshold = thresholdSlider.value;
    magnitudeThresholdSpan.textContent = runOptions.magnitudeThreshold;
  });

  const magnitudeThresholdInc =
      document.getElementById('magnitude-threshold-increase');
  const magnitudeThresholdDec =
      document.getElementById('magnitude-threshold-decrease');
  magnitudeThresholdInc.addEventListener('click', () => {
    if (runOptions.magnitudeThreshold + 1 > runOptions.magnitudeThresholdMax) {
      return;
    }
    runOptions.magnitudeThreshold++;
    thresholdSlider.value = runOptions.magnitudeThreshold;
    magnitudeThresholdSpan.textContent = runOptions.magnitudeThreshold;
  });
  magnitudeThresholdDec.addEventListener('click', () => {
    if (runOptions.magnitudeThreshold - 1 < runOptions.magnitudeThresholdMin) {
      return;
    }
    runOptions.magnitudeThreshold--;
    thresholdSlider.value = runOptions.magnitudeThreshold;
    magnitudeThresholdSpan.textContent = runOptions.magnitudeThreshold;
  });
}

function setUpPredictEveryMillisSlider(runOptions) {
  const predictEveryMillisSlider = document.getElementById('predict-every-ms');
  predictEveryMillisSlider.setAttribute('min', runOptions.predictEveryMillisMin);
  predictEveryMillisSlider.setAttribute('max', runOptions.predictEveryMillisMax);
  predictEveryMillisSlider.setAttribute('step', runOptions.predictEveryMillisStep);
  predictEveryMillisSlider.value = runOptions.predictEveryMillis;

  const predictEveryMillisSpan = document.getElementById('predict-every-ms-span');
  predictEveryMillisSpan.textContent = runOptions.predictEveryMillis;
  predictEveryMillisSlider.addEventListener('click', () => {
    runOptions.predictEveryMillis = predictEveryMillisSlider.value;
    runOptions.predictEveryFrames =
      Math.round(runOptions.predictEveryMillis / runOptions.frameMillis);
    predictEveryMillisSpan.textContent = runOptions.predictEveryMillis;
  });

  const predictEveryMillisDec =
      document.getElementById('predict-every-ms-decrease');
  const predictEveryMillisInc =
      document.getElementById('predict-every-ms-increase');
  predictEveryMillisDec.addEventListener('click', () => {
    if (runOptions.predictEveryMillis - runOptions.predictEveryMillisStep <
        runOptions.predictEveryMillisMin) {
      return;
    }
    runOptions.predictEveryMillis -= runOptions.predictEveryMillisStep;
    runOptions.predictEveryFrames =
      Math.round(runOptions.predictEveryMillis / runOptions.frameMillis);
    predictEveryMillisSlider.value = runOptions.predictEveryMillis;
    predictEveryMillisSpan.textContent = runOptions.predictEveryMillis;
  });
  predictEveryMillisInc.addEventListener('click', () => {
    if (runOptions.predictEveryMillis + runOptions.predictEveryMillisStep >
        runOptions.predictEveryMillisMax) {
      return;
    }
    runOptions.predictEveryMillis += runOptions.predictEveryMillisStep;
    runOptions.predictEveryFrames =
      Math.round(runOptions.predictEveryMillis / runOptions.frameMillis);
    predictEveryMillisSlider.value = runOptions.predictEveryMillis;
    predictEveryMillisSpan.textContent = runOptions.predictEveryMillis;
  });

}