"""
Usage example:

```sh
python model.py "${HOME}/ml-data/speech-command-browser" 1024 44100 5000
```
"""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import os

import keras
import tensorflow as tf
from tensorflow.python import debug as tf_debug

import data


def create_model(input_shape, num_classes):
  model = keras.Sequential()
  model.add(keras.layers.Conv2D(
      8, [2, 8], activation='relu', input_shape=input_shape))
  model.add(keras.layers.MaxPool2D([2, 2], strides=[2, 2]))
  model.add(keras.layers.Conv2D(32, [2, 4], activation='relu'))
  model.add(keras.layers.MaxPool2D([2, 2], strides=[2, 2]))
  model.add(keras.layers.Conv2D(32, [2, 4], activation='relu'))
  model.add(keras.layers.MaxPool2D([2, 2], strides=[2, 2]))
  model.add(keras.layers.Conv2D(32, [2, 4], activation='relu'))
  model.add(keras.layers.MaxPool2D([2, 2], strides=[1, 2]))
  model.add(keras.layers.Flatten())
  model.add(keras.layers.Dense(2000, activation='relu'))
  model.add(keras.layers.Dropout(0.5))
  model.add(keras.layers.Dense(num_classes, activation='softmax'))

  model.compile(
      loss='categorical_crossentropy',
      optimizer=tf.train.GradientDescentOptimizer(0.01),
      metrics=['accuracy'])
  model.summary()

  # Equivalent TensorFlow.js code:
  #
  # ```javascript
  # const model = tf.sequential();
  # model.add(tf.layers.conv2d({
  #   filters: 8,
  #   kernelSize: [2, 8],
  #   activation: 'relu',
  #   inputShape: inputShape
  # }));
  # model.add(tf.layers.maxPooling2d({
  #   poolSize: [2, 2],
  #   strides: [2, 2]
  # }));
  # model.add(tf.layers.conv2d({
  #   filters: 32,
  #   kernelSize: [2, 4],
  #   activation: 'relu'
  # }));
  # model.add(tf.layers.maxPooling2d({
  #   poolSize: [2, 2],
  #   strides: [2, 2]
  # }));
  # model.add(tf.layers.conv2d({
  #   filters: 32,
  #   kernelSize: [2, 4],
  #   activation: 'relu'
  # }));
  # model.add(tf.layers.maxPooling2d({
  #   poolSize: [2, 2],
  #   strides: [2, 2]
  # }));
  # model.add(tf.layers.conv2d({
  #   filters: 32,
  #   kernelSize: [2, 4],
  #   activation: 'relu'
  # }));
  # model.add(tf.layers.maxPooling2d({
  #   poolSize: [2, 2],
  #   strides: [1, 2]
  # }));
  # model.add(tf.layers.flatten({}));
  # model.add(tf.layers.dense({
  #   units: 2000,
  #   activation: 'relu'
  # }));
  # model.add(tf.layers.dropout({
  #   rate: 0.5
  # }));
  # model.add(tf.layers.dense({
  #   units: numClasses,
  #   activation: 'softmax'
  # }));
  #
  # model.compile({
  #   loss: 'categoricalCrossentropy',
  #   optimizer: tf.train.sgd(0.01),
  #   metrics: ['accuracy']
  # });
  # model.summary();
  # ```

  return model


def train_model(root_dir,
                n_fft,
                sampling_frequency_hz,
                max_frequency_hz, debug=False):
  xs, ys = data.load_data(
      os.path.expanduser(root_dir),
      n_fft, sampling_frequency_hz, max_frequency_hz)

  input_shape = xs.shape[1:]
  num_classes = ys.shape[-1]
  print('input_shape = %s' % (input_shape,))
  print('num_classes = %s' % num_classes)

  if debug:
    keras.backend.set_session(
        tf_debug.LocalCLIDebugWrapperSession(tf.Session()))

  model = create_model(input_shape, num_classes)

  model.fit(xs,
            ys,
            batch_size=64,
            epochs=100,
            shuffle=True,
            validation_split=0.1)

  model.save('speech_command_browser.h5')



if __name__ == '__main__':
  parser = argparse.ArgumentParser('Train model for browser speech commands.')
  parser.add_argument(
      'data_root', type=str, help='Root directory for data.')
  parser.add_argument(
      'n_fft', type=int,
      help='Number of FFT points. By Nyquist theorem, this corresponds to '
      'half of the sampling frequency.')
  parser.add_argument(
      'sampling_frequency_hz', type=float,
      help='Sampling frequency in the data files, in Hz.')
  parser.add_argument(
      'max_frequency_hz', type=float,
      help='Maximum frequency to use in the spectrograms, in Hz.')
  parser.add_argument(
      '--tf_debug', action='store_true',
      help='Use TensroFlow Debugger CLI.')
  parsed = parser.parse_args()

  train_model(
      parsed.data_root,
      parsed.n_fft, parsed.sampling_frequency_hz, parsed.max_frequency_hz,
      debug=parsed.tf_debug)
