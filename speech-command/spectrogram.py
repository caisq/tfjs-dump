from __future__ import division
from __future__ import print_function

import numpy as np
from scipy import fftpack


target_fs = 44100
n_fft = 1024
n_fft_out = 232


def make_window(length):
  # Based on https://github.com/WebKit/webkit/blob/89c28d471fae35f1788a0f857067896a10af8974/Source/WebCore/Modules/webaudio/RealtimeAnalyser.cpp
  alpha = 0.16
  a0 = 0.5 * (1.0 - alpha)
  a1 = 0.5
  a2 = 0.5 * alpha
  ts = np.arange(0, length, 1.0).astype(np.float32) / length
  return a0 - a1 * np.cos(2 * np.pi * ts) + a2 * np.cos(4 * np.pi * ts)


windows = dict()  # Mapping n_fft to window, for memoization.


def waveform_to_spectrogram(waveform, n_fft, n_fft_out):
  waveform_len = len(waveform)
  if n_fft not in windows:
    windows[n_fft] = make_window(2 * n_fft)
  window = windows[n_fft]

  n_seg = 0
  spectra = []
  while n_fft * (n_seg + 1) <= waveform_len:
    if n_seg == 0:
      x_seg = np.concatenate([
          np.zeros([n_fft], dtype=waveform.dtype),
          waveform[:n_fft]])
    else:
      x_seg = waveform[n_fft * (n_seg - 1) : n_fft * (n_seg + 1)]
    x_seg *= window
    spectrum = 20 * np.log10(
        np.abs(np.fft.fft(x_seg)).astype(np.float32) / n_fft)
    spectra.append(spectrum[:n_fft_out])
    n_seg += 1
  return np.stack(spectra)
