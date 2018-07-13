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
  return model


def train_model(root_dir, debug=False):
  # model = create_model([43, 360, 1], 4)
  # root_dir = '/usr/local/google/home/cais/ml-data/speech-command-browser'
  xs, ys = data.load_data(os.path.expanduser(root_dir))

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
  parser.add_argument('data_root', type=str,
                      help='Root directory for data.')
  parser.add_argument('--tf_debug', action='store_true',
                      help='Use TensroFlow Debugger')
  parsed = parser.parse_args()

  train_model(parsed.data_root, debug=parsed.tf_debug)
