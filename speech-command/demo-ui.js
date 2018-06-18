const statusDisplay = document.getElementById('status-display');

function logToStatusDisplay(message) {
  const date = new Date();
  statusDisplay.value += `[${date.toISOString()}] ` + message + '\n';
  statusDisplay.scrollTop = statusDisplay.scrollHeight;
}

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

function plotSpectrum(canvas, freqData, runOptions) {
  let instanceMax = -Infinity;
  for (const val of freqData) {
    if (val > instanceMax) {
      instanceMax = val;
    }
  }
  const yOffset = 0.25 * canvas.width;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle =
    instanceMax > runOptions.magnitudeThreshold ? '#00AA00' : '#AAAAAA';
  ctx.lineWidth = 1;
  ctx.beginPath();

  ctx.moveTo(0, -freqData[0] + yOffset);
  for (let i = 1; i < runOptions.modelFFTLength; ++i) {
    ctx.lineTo(i, -freqData[i] + yOffset);
  }
  ctx.stroke();

  // Draw the threshold.
  ctx.beginPath();
  ctx.moveTo(0, -runOptions.magnitudeThreshold + yOffset);
  ctx.lineTo(
    runOptions.modelFFTLength - 1, -runOptions.magnitudeThreshold + yOffset);
  ctx.stroke();
}

