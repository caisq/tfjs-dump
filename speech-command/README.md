# Using the tfjs-layers speech-command pipeline

## 1. Convert the .wav files from the speech-command dataset

As a preparatory step, download and extract the speech command dataset.

The first step does the following things:
1. converts the .wav files into .dat files that are more easily ingestable in
   the browser. In the same step, splits the data into a training split and a
   testing split.

This step discards a small fraction of recording that are not approximately
1.0 second long.

For example, suppose you have downloaded and extracted the raw speech command
dataset at 'path/to/speech_command_data'. Use the following command:

```sh
python prep_wavs.py \
    --words down,eight,five,four,go,left,nine,no,one,right,seven,six,stop,three,two,up,yes,zero \
    --unknown_words bed,bird,cat,dog,happy,house,marvin,sheila,wow \
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

The command above includes 18 words in the vocabulary. In addition, it lumps
the data from the 9 words into the `_unknown_` category. Finally, it extracts
snippets of background noise and use them for the `_background_noise_`
category.

The files from the `train` split directory can be uploaded into the browser
for conversion in the next conversion step.

## 2. Run the .dat files through the browser FFT, using puppeteer

This step runs the outputs of Step 1 through the WebAudio FFT in the headless
Chrome browser, by using the
[puppeteer](https://github.com/GoogleChrome/puppeteer) library. It is an
automated process and required no manual labor in a webpage.

```sh
yarn
node puppeteer-convert.js \
   path/to/converted/data \
   path/to/combined/data
```

The output directory (`path/to/combined/data`) in this example, contains
the `test` and `train` subdirectories, just like in  the input directory.
However, the .dat files under each subdirectory are combined into a single
.dat file. This is why we called the output folder "combined". The combined
data files contain the FFT resluts of the audio samples. They will be used
in the model-training step below.

## 3. Train model.

### 3.1. Using Keras (Python)

Usage example:

To train the model for the 18-word datast (which also includes `_background_noise_`
and `_unknown_`):

```sh
python model.py \
    --include_words down,eight,five,four,go,left,nine,no,one,right,seven,six,stop,three,two,up,yes,zero \
    path/to/combined/data 232
```

To train the model for the 4-word dataset consisting of the four directional
words (in addition to `_background_noise_` and `_unknown_`):

```sh
python model.py \
    --include_words down,left,right,up \
    path/to/combined/data 232
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
