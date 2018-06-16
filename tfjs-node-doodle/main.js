const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');

(async function() {
  const model = tf.sequential();
  model.add(tf.layers.dense({units: 10, inputShape: [5], activation: 'relu'}));
  model.add(tf.layers.dense({units: 4, activation: 'softmax'}));

  const xs = tf.ones([2, 5]);
  model.predict(xs).print();

  const saveLocation = 'file:///tmp/tfjs-node-model-1';

  const saveResult = await model.save(saveLocation);
  console.log(saveResult);

  const model2 = await tf.loadModel(saveLocation + '/model.json');
  model2.predict(xs).print();
})();
