function plotSpectrum(canvas, spectrum) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i < spectrum.length; ++i) {
    ctx.lineTo(i, -spectrum[i] + 100);
  }
  ctx.stroke();
}

function plotSpectrogram(canvas, frequencyData, fftSize, fftDisplaySize) {
  // Get the maximum and minimum.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < frequencyData.length; ++i) {
    const x = frequencyData[i];
    if (x !== -Infinity) {
      if (x < min) {
        min = x;
      }
      if (x > max) {
        max = x;
      }
    }
  }
  if (min >= max) {
    return;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const numTimeSteps = frequencyData.length / fftSize;
  const pixelWidth = canvas.width / numTimeSteps;
  const pixelHeight = canvas.height / fftDisplaySize;
  for (let i = 0; i < numTimeSteps; ++i) {
    const x = pixelWidth * i;
    const spectrum = frequencyData.subarray(i * fftSize, (i + 1) * fftSize);
    if (spectrum[0] === -Infinity) {
      break;
    }
    for (let j = 0; j < fftDisplaySize; ++j) {
      const y = canvas.height - (j + 1) * pixelHeight;

      let colorValue = (spectrum[j] - min) / (max - min);
      colorValue = Math.pow(colorValue, 3);
      colorValue = Math.round(255 * colorValue);
      const fillStyle = `rgb(${colorValue},${255 - colorValue},${255 - colorValue})`;
      ctx.fillStyle = fillStyle;
      ctx.fillRect(x, y, pixelWidth, pixelHeight);
    }
  }
}