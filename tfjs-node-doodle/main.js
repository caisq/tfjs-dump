const tf = require('@tensorflow/tfjs');

require('@tensorflow/tfjs-node');

console.log(tf.version);

const model = tf.sequential();
model.add(tf.layers.dense({units: 10, inputShape: [5], activation: 'relu'}));
model.add(tf.layers.dense({units: 4, activation: 'softmax'}));

const xs = tf.zeros([2, 5]);
const ys = model.predict(xs);
ys.print();

const saveLocation = 'file:///tmp/tfjs-node-model-1';

model.save(saveLocation).then(saveResult => {
  console.log(saveResult);

  tf.loadModel(saveLocation + '/model.json').then(model => {
    model.predict(xs).print();
  });
});
