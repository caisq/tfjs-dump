# Using the tfjs-layers speech-command pipeline

## 1. Convert the .wav files from the speech-command dataset

As a preparatory step, download and extract the speech command dataset.

The first step does the following things:
1. converts the .wav files into .dat files that are more easily ingestable in
   the browser
2. splits the data into a training split and a testing split.
3. Discards a small fraction of recording that are not approximately 1.0 second
   long.

For example, suppose you have downloaded and extracted the raw speech command
dataset at 'path/to/speech_command_data'. Use the following command:

```sh
python prep_wav.py \
    --words zero,one,two,three,four,five,six,seven,eight,nine,left,right,up,down,go,stop \
    --test_split 0.15 \
    --include_noise \
    path/to/speech_command_data \
    path/to/converted/data
```

Under the output path (i.e., `path/to/converted/data/` in this example),
there will be two subfolders, called `train` and `test`, which hold the
training and testing splits, respectively. Under each of `train` and `test`,
there are subfolders with names matching the words (e.g., `zero`, `one`,
etc.) In each of those subfolders, there will subfolders with names
such as `0` and `1`, which contain a number of
`.dat` files.

The files from the `train` split directory can be uploaded into the browser
for conversion in the next conversion step.

## 2. Run the .dat files through the browser FFT

Start your HTTP server:

```sh
yarn && yarn watch
```

Navigate to `http://localhost:8080`.

Click the "Choose Files" button to select the .dat files in one of the folders
generated with `prep_wav.py` in step 1. At the end of the conversion, you will
get a downloaded .dat file. This file contains the spectrograms from all the
files you selected.

## 3. Train model.

### 3.1. Using Keras (Python)

Usage example:

```sh
python model.py "${HOME}/ml-data/speech-command-browser" 1024 44100 5000
```

### 3.2. Using TensorFlow.js (Node.js)

TODO(cais): Add this.

### Running inference with a pre-trained model

Click the "Load pretrained model" button to load a pretrained Keras model as
a tf.Model. This assumes the path you entered in the Model URL input box is
valid. You may need to manually copy some files into this directory for this
to work.

### Inspecting the spectrograms from the browser

You can use `show_spectrogram.py` to inspect the spectrograms in the combined
.dat file. For example:

```sh
python show_spectrogram.py "${HOME}/Downloads/combined.dat"
```

## 3. Training Keras model using the browser-generated data files

TODO(cais): Write this.